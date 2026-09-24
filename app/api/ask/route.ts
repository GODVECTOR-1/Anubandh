import { NextResponse } from 'next/server';
import { AskResponse } from '@/contracts/schema';
import { priyaOfferLetter } from '@/fixtures/priya-offer-letter';
import { getAnalysis, getCurrentAnalysis } from '@/lib/analysis';
import { ask } from '@/lib/ask';
import { callerKey, rateLimit } from '@/lib/ratelimit';

/**
 * POST /api/ask — the advice boundary, enforced where the client cannot reach it.
 *
 * Practising law in India is reserved to enrolled advocates (Advocates Act
 * 1961). Anubandh states what the document says and what a statute provides. It
 * does not advise, predict an outcome, or represent anyone. That is a rule about
 * what this route may return, not a line of UI copy — a boundary the client
 * enforces is a boundary anyone can step over with curl.
 *
 * THE MODEL DOES NOT CHOOSE THE OUTCOME. Classification is deterministic code
 * over the question and over spans we already verified. A model asked "are you
 * giving legal advice?" will say no.
 *
 * The answer body is assembled from node descriptions that already passed
 * LOCATE and ENTAIL, so every sentence is grounded by construction. Generating
 * prose here instead would put unverified text on the most quotable surface in
 * the product, which is the one thing the pipeline exists to prevent.
 */
export const runtime = 'nodejs';

/** Verdict language, banned in anything this route emits. The same list the
 *  fixture gate applies to shipped copy — a generated sentence gets no wider
 *  latitude than a written one. */
const VERDICT = [/\bis void\b/i, /\bare void\b/i, /\bunenforceable\b/i, /the document is silent/i];

/** A question is one Gemini call against an analysis we already paid for, so
 *  the cap is looser than the upload cap and exists for the same reason. */
const ASKS_PER_HOUR = 40;

export async function POST(request: Request) {
  const verdict = await rateLimit('ask', callerKey(request.headers), ASKS_PER_HOUR, 3600);
  if (!verdict.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(verdict.retryAfter) } },
    );
  }

  let body: { question?: unknown; document_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return reply({ error: 'bad_request' }, 400);
  }

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) return reply({ error: 'bad_request' }, 400);
  if (question.length > 2000) return reply({ error: 'bad_request' }, 400);

  // The sample is not in the database. It is what every page renders when
  // there is no session — the landing page links straight to it — so the Ask
  // screen shows the sample, offers questions about it, and sends its id. Looked
  // up in the database, that id matched nothing and every question was told
  // "There is no document open" while the sample sat on the same screen.
  //
  // Resolved by id rather than by falling back: an id this server does not
  // recognise still gets no_coverage, because answering a question about the
  // reader's own document from a different document would be worse than no
  // answer at all.
  const analysis =
    body.document_id === priyaOfferLetter.document.id
      ? priyaOfferLetter
      : typeof body.document_id === 'string' && body.document_id
        ? await getAnalysis(body.document_id)
        : await getCurrentAnalysis();

  // No analysis is not an error, and it is certainly not a reason to answer
  // from general knowledge. It is `no_coverage`: we have nothing verified.
  if (!analysis) {
    return reply(
      AskResponse.parse({
        question,
        outcome: 'no_coverage',
        answer: 'There is no document open, so there is nothing I have verified to answer from.',
        citations: [],
        handoff: null,
        escalation: null,
      }),
    );
  }

  const response = ask(analysis, question);

  // Two invariants the contract states and this route makes true, whatever the
  // classifier decided:
  //
  //   INFORMATION cites, or it is not information. An uncited answer is
  //   indistinguishable from a guess, which is the exact failure to avoid.
  //
  //   ADVICE hands off. Reframe first, handoff second — leading with the
  //   refusal teaches the reader that the product dodges, and they stop asking.
  const guarded =
    response.outcome === 'information' && response.citations.length === 0
      ? { ...response, outcome: 'no_coverage' as const }
      : response;

  if (guarded.outcome === 'advice' && !guarded.handoff) {
    return reply({ error: 'internal' }, 500);
  }

  for (const re of VERDICT) {
    if (re.test(guarded.answer) || (guarded.handoff && re.test(guarded.handoff))) {
      console.error('verdict language blocked in ask response');
      return reply({ error: 'internal' }, 500);
    }
  }

  const parsed = AskResponse.safeParse(guarded);
  if (!parsed.success) return reply({ error: 'internal' }, 500);
  return reply(parsed.data);
}

const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
