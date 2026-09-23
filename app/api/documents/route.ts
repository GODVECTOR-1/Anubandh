import { NextResponse, type NextRequest } from 'next/server';
import { createDocument, createJob, putAnalysis } from '@/lib/db';
import { demoAnalysis, isScenario, HANGS, HANG_TTL_MS } from '@/lib/demo';
import { normalizeUpload } from '@/lib/normalize';
import { callerKey, rateLimit } from '@/lib/ratelimit';
import { codeOf } from '@/lib/pipeline-error';
import {
  SESSION_COOKIE, SESSION_COOKIE_OPTIONS, newSessionId,
  parseSessionCookie, serializeSessionCookie,
} from '@/lib/session';

/**
 * POST /api/documents — the upload. Returns { document_id, job_id }.
 *
 * NORMALIZE runs here, synchronously, because it is the only stage with no
 * model call in it and its output is what every later stage cites into. The
 * expensive stages run on the first poll instead: there is no background worker
 * on Vercel Hobby, and a POST that waits for extraction is a POST that times out
 * before the reader ever sees a job id.
 *
 * It is also where the session is minted, so a reader who has never been here
 * owns their document from the first byte.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

const JOB_TTL_MS = 90_000;

/**
 * Two limits, because two different things are being protected.
 *
 * FLOOD is the cheap guard, checked before the body is read, so a caller
 * cannot make the server buffer ten megabytes to be told no. It covers every
 * POST including the one-click samples, and it is loose enough that a reader
 * clicking through all three samples, or a gate run doing the same, never
 * meets it.
 *
 * DOCUMENTS is the one that protects the bill, and it is only reached once the
 * form says this is a real file rather than a sample. A sample serves a
 * pre-baked analysis and makes no model call at all, so charging it against
 * the model budget would cap the demo without capping any spend.
 */
const FLOOD_PER_HOUR = 60;
const DOCUMENTS_PER_HOUR = 12;

const tooMany = (retryAfter: number) =>
  NextResponse.json(
    { error: 'rate_limited' },
    { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(retryAfter) } },
  );

export async function POST(request: NextRequest) {
  const existing = parseSessionCookie(request.cookies.get(SESSION_COOKIE)?.value);
  const sessionId = existing ?? newSessionId();

  // Keyed on the network address rather than the session, because the session
  // is a cookie the caller controls and dropping it would otherwise buy a
  // fresh allowance.
  const caller = callerKey(request.headers);
  const flood = await rateLimit('post', caller, FLOOD_PER_HOUR, 3600);
  if (!flood.ok) return tooMany(flood.retryAfter);

  const send = (body: unknown, status = 200) => {
    const res = NextResponse.json(body, { status });
    // A cached job id is a progress bar that belongs to someone else.
    res.headers.set('Cache-Control', 'no-store');
    if (!existing) res.cookies.set({ name: SESSION_COOKIE, value: serializeSessionCookie(sessionId), ...SESSION_COOKIE_OPTIONS });
    return res;
  };

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return send({ error: 'oversize_document' }, 413);
  }

  const scenario = String(form.get('scenario') ?? '');
  const pasted = String(form.get('text') ?? '');
  const file = form.get('file');
  const label = String(form.get('filename') ?? '') || (file instanceof File ? file.name : 'Pasted text');

  try {
    /* The one-click samples and the failure screens. Same transport, same
       ownership, same lazy transitions — only the analysis is pre-baked. */
    if (scenario) {
      if (!isScenario(scenario)) return send({ error: 'internal' }, 400);
      // A hanging sample carries a short deadline so the lazy transition is
      // visible in a demo; a real job gets the full 90 seconds.
      const deadline = new Date(Date.now() + (HANGS.has(scenario) ? HANG_TTL_MS : JOB_TTL_MS));
      const documentId = await createDocument(sessionId, label, 0, null);
      const job = await createJob(sessionId, documentId, deadline, scenario);
      const payload = demoAnalysis(scenario, documentId, job.id, deadline.toISOString());
      if (payload) await putAnalysis(sessionId, documentId, payload);
      return send({ document_id: documentId, job_id: job.id });
    }

    // A real document from here on: this is the branch that reaches Gemini, so
    // this is where the spending limit belongs.
    const spend = await rateLimit('document', caller, DOCUMENTS_PER_HOUR, 3600);
    if (!spend.ok) return tooMany(spend.retryAfter);

    const bytes =
      file instanceof File
        ? new Uint8Array(await file.arrayBuffer())
        : new TextEncoder().encode(pasted);

    // The size cap lives in normalizeUpload, which is the first thing to touch
    // the bytes and the last chance before any extraction spend. Repeating it
    // here bought nothing — the file is already buffered by this line — and two
    // copies of a limit is how the two of them drift apart.
    const doc = await normalizeUpload(bytes, label, file instanceof File ? file.type : 'text/plain');

    const deadline = new Date(Date.now() + JOB_TTL_MS);
    const documentId = await createDocument(sessionId, label, bytes.byteLength, doc.text, {
      sourceKind: doc.sourceKind,
      pageCount: doc.pageCount,
      pageOffsets: doc.pageOffsets,
      offsetMap: doc.offsetMap,
      sha256: doc.sha256,
    });
    const job = await createJob(sessionId, documentId, deadline, null);

    return send({ document_id: documentId, job_id: job.id });
  } catch (e) {
    // Every failure the reader is entitled to see carries one of the contract's
    // own codes; anything else is ours and says so. No filename, no document
    // text, and no id in the log — §7.12.
    const code = codeOf(e);
    if (code === 'internal') console.error('upload failed:', (e as Error)?.message);
    const status = code === 'internal' ? 500 : code === 'oversize_document' ? 413 : 400;
    return send({ error: code }, status);
  }
}
