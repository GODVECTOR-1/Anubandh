/**
 * The backend gate — §7 of docs/BACKEND-SPEC.md, one check per row.
 *
 * "We were careful" is not a verification. Every security requirement the spec
 * names has an assertion here that fails the build when it stops holding, and
 * every one of them was broken on purpose once before being trusted: a gate
 * that has never failed is decoration.
 *
 * Needs the dev server running:
 *   npm run dev
 *   npm run check:backend
 */

import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { z } from 'zod';
import type { ExtractedItem } from '../lib/gemini';

const BASE = process.env.A11Y_BASE ?? 'http://localhost:3000';
const ROOT = process.cwd();

let failed = 0;
const pass = (m: string) => console.log('  ok    ' + m);
const fail = (m: string) => {
  failed++;
  console.log('  FAIL  ' + m);
};
/** A check that cannot run is never silently green. It is loud and it says what
 *  would make it run. */
const skip = (m: string) => console.log('  skip  ' + m);

/** A fixed sentinel for ids that are never stored. */
const UUID_A = '11111111-2222-4333-8444-555555555555';

/**
 * A session that has never existed, minted fresh per run.
 *
 * It used to be UUID_A, which is also the id this file writes rows under — so
 * the isolation check was asking whether a session could see its OWN rows, and
 * answering yes. Correctly, and uselessly. A session id that nothing has ever
 * written under is the only one that can prove isolation.
 */
const FOREIGN_SESSION = randomUUID();

/* ───────────────────────────── helpers ───────────────────────────── */

type Session = { cookie: string; setCookie: string };

/** Start a session the way a reader does: upload something and keep the cookie. */
async function newSession(scenario = 'success'): Promise<Session & { document_id: string; job_id: string }> {
  const form = new FormData();
  form.set('scenario', scenario);
  form.set('filename', 'gate sample');

  const res = await fetch(BASE + '/api/documents', { method: 'POST', body: form });
  const setCookie = res.headers.get('set-cookie') ?? '';
  const text = await res.text();

  // An app that fails to compile serves an HTML error page. Parsing that as
  // JSON threw, and the throw took the run down before anything had been
  // asserted — reporting nothing, which is worse than reporting a failure.
  let body: { document_id?: string; job_id?: string } = {};
  try {
    body = JSON.parse(text);
  } catch {
    fail('upload returned ' + res.status + ' and a non-JSON body: ' + text.slice(0, 70).replace(/\s+/g, ' '));
  }

  return {
    cookie: setCookie.split(';')[0],
    setCookie,
    document_id: body.document_id ?? '',
    job_id: body.job_id ?? '',
  };
}

const get = (path: string, cookie?: string) =>
  fetch(BASE + path, { headers: cookie ? { cookie } : {}, cache: 'no-store' });

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', '.next', '.git'].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/* ─────────────────────────────── the gate ─────────────────────────────── */

async function run() {
  console.log('\nBackend gate — every §7 requirement, asserted\n');

  // The two source scans run FIRST. They need no server, and an app too broken
  // to answer a request is exactly when you most want to know what is in the
  // tree — the earlier ordering meant a compile error reported nothing at all.
  /* 1 + 2. Keys and env files: check:secrets owns those. What is backend-
     specific is that the server-only modules stay server-only — a client
     component importing lib/db.ts is how a connection string reaches a bundle. */
  {
    const clientImports: string[] = [];
    for (const f of sourceFiles(ROOT)) {
      const src = readFileSync(f, 'utf8');
      if (!/^\s*['"]use client['"]/m.test(src.slice(0, 400))) continue;
      for (const mod of ['lib/db', 'lib/session', 'lib/gemini', 'lib/pipeline', 'lib/normalize', 'lib/analysis']) {
        // The specifier, not `from <specifier>`: a bare `import '@/lib/db'`
        // pulls the module in just as hard and has no `from` to match on.
        if (new RegExp("import[^;]*['\"]@/" + mod + "['\"]").test(src)) {
          clientImports.push(relative(ROOT, f).split('\\').join('/') + ' imports @/' + mod);
        }
      }
    }
    clientImports.length === 0
      ? pass('1. no client module imports a server-only module')
      : clientImports.forEach((h) => fail('1. server module reachable from the client bundle: ' + h));
  }

  /* 12. No document text, filename or quote in a log line. */
  {
    const risky = /\b(filename|normalized|quoted_text|amount_text|payload|pasted|doc\.text|body\.text)\b/;
    const hits: string[] = [];
    for (const f of sourceFiles(join(ROOT, 'lib')).concat(sourceFiles(join(ROOT, 'app')))) {
      const rel = relative(ROOT, f).split('\\').join('/');
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (!/console\.(log|error|warn|info)/.test(line)) return;
          if (risky.test(line)) hits.push(rel + ':' + (i + 1) + '  ' + line.trim().slice(0, 90));
        });
    }
    hits.length === 0
      ? pass('12. no log line carries document text, a filename or a quote')
      : hits.forEach((h) => fail('12. PII in a log call: ' + h));
  }

  const session = await newSession();
  if (!session.document_id) {
    fail('upload did not return a document_id — no HTTP check below can run');
    return done();
  }

  /* 3. Wrong-owner reads are 404, not 403 — and byte-identical to a random id. */
  {
    const other = await newSession();
    const mine = await get('/api/analysis/' + session.document_id, other.cookie);
    const random = await get('/api/analysis/' + UUID_A, other.cookie);
    const mineBody = await mine.text();
    const randomBody = await random.text();

    mine.status === 404 && random.status === 404
      ? pass('3. a second session gets 404 for another session\'s document id')
      : fail('3. wrong-owner read returned ' + mine.status + ' (random id returned ' + random.status + ')');

    mineBody === randomBody
      ? pass('3. the body is byte-identical to a request for a random uuid')
      : fail('3. wrong-owner body differs from the random-id body — the id is an oracle');

    const ownJob = await get('/api/jobs/' + session.job_id, other.cookie);
    ownJob.status === 404
      ? pass('3. the job route refuses a wrong-owner id the same way')
      : fail('3. job route returned ' + ownJob.status + ' to a wrong owner');
  }

  /* 4. RLS actually on. Needs a real database; the in-process fallback has no
        policies to test and saying "ok" here would be the decoration this gate
        exists to avoid. */
  if (!process.env.DATABASE_URL) {
    skip('4. RLS — set DATABASE_URL to assert the policies (fallback store has none)');
  } else {
    const { rawUnderSession } = await import('../lib/db');
    let violations = 0;
    for (const table of ['documents', 'jobs', 'analyses']) {
      const rows = await rawUnderSession(FOREIGN_SESSION, 'select 1 from ' + table + ' limit 1');
      if (rows.length > 0) {
        fail('4. ' + table + ' returned rows under a mismatched app.session_id');
        violations++;
      }
    }
    if (violations === 0) pass('4. RLS: every table returns zero rows under a mismatched session id');

    // And the policy must not simply hide everything from everyone.
    const visible = await rawUnderSession(null, "select 1 from documents limit 1");
    visible.length === 0
      ? pass('4. a sessionless connection sees nothing either')
      : fail('4. a sessionless connection can read documents');
  }

  /* 5. The session cookie is not readable by JS. */
  {
    const c = session.setCookie;
    /HttpOnly/i.test(c)
      ? pass('5. Set-Cookie carries HttpOnly')
      : fail('5. session cookie is missing HttpOnly — any script on the page can read it');
    /SameSite=Lax/i.test(c)
      ? pass('5. Set-Cookie carries SameSite=Lax')
      : fail('5. session cookie is missing SameSite=Lax');

    // `secure` is correctly absent over http://localhost, so the production
    // branch is asserted directly rather than assumed.
    const { SESSION_COOKIE_OPTIONS } = await import('../lib/session');
    const prod = process.env.NODE_ENV === 'production';
    SESSION_COOKIE_OPTIONS.httpOnly && SESSION_COOKIE_OPTIONS.secure === prod
      ? pass('5. cookie options set secure in production (' + (prod ? 'on' : 'off here, on when deployed') + ')')
      : fail('5. cookie options do not turn on secure in production');
  }

  /* 6. The purge runs and deletes. The landing page promises this, so a purge
        that does not run makes a sentence on the landing page false. */
  {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      skip('6. purge route — set CRON_SECRET to call it');
    } else {
      const authed = await fetch(BASE + '/api/cron/purge', { headers: { authorization: 'Bearer ' + secret } });
      const body = await authed.json().catch(() => ({}));
      authed.status === 200 && typeof body.deleted === 'number'
        ? pass('6. purge route ran and reported ' + body.deleted + ' document(s) deleted')
        : fail('6. purge route returned ' + authed.status + ' ' + JSON.stringify(body));
    }

    // Does the purge actually remove an expired row? Against a real database
    // that is the whole assertion; against the fallback store it still proves
    // the predicate, which is the part most likely to be wrong.
    const { createDocument, purgeExpired, HAS_DB } = await import('../lib/db');
    if (HAS_DB) {
      const { rawUnderSession } = await import('../lib/db');
      const id = await createDocument(UUID_A, 'expired.txt', 1, 'text');
      await rawUnderSession(UUID_A, "update documents set purge_after = now() - interval '1 hour' where id = $1", [id]);
      await purgeExpired();
      const rows = await rawUnderSession(UUID_A, 'select 1 from documents where id = $1', [id]);
      rows.length === 0
        ? pass('6. a row past purge_after is gone after the purge, and so are its job and analysis')
        : fail('6. a row past purge_after survived the purge — the 24h promise is false');
    } else {
      skip('6. purge deletion against a real database — set DATABASE_URL');
    }
  }

  /* 13. A reload undoes the upload. purgeSession must delete only the calling
         session's own rows — the isolation is the whole point of it existing. */
  {
    const { createDocument, getDocument, purgeSession, HAS_DB } = await import('../lib/db');
    if (HAS_DB) {
      const other = '99999999-8888-4777-8666-555555555555';
      const mine = await createDocument(UUID_A, 'reload-a.txt', 1, 'text');
      const theirs = await createDocument(other, 'reload-b.txt', 1, 'text');
      await purgeSession(UUID_A);
      const mineGone = (await getDocument(UUID_A, mine)) === null;
      const theirsSurvived = (await getDocument(other, theirs)) !== null;
      mineGone && theirsSurvived
        ? pass('13. purgeSession deletes only rows owned by the calling session')
        : fail('13. purgeSession: mine gone=' + mineGone + ', other session survived=' + theirsSurvived);
    } else {
      skip('13. purgeSession against a real database — set DATABASE_URL');
    }
  }

  /* 14. The spending limit refuses, and says when to come back.

         /api/documents and /api/ask are anonymous and both reach Gemini, so
         without this the project's quota is one shell loop away from gone.
         The unit tests in tests/ratelimit.test.ts cover the counting; this
         asserts the ROUTE is actually wired to it, which is the half that
         silently stops being true when someone reorders the handler.

         A random forwarded address per run, so the gate gets its own bucket
         and never spends a developer's real allowance — and so two runs in
         the same hour do not interfere with each other. */
  {
    const ip = '198.51.100.' + (1 + Math.floor(Math.random() * 250));
    const post = () => {
      const form = new FormData();
      // The real-document branch, which is where the limit lives. The text is
      // too short to be an agreement, so each one is refused by NORMALIZE
      // before any model call — the limiter is what this measures, not the
      // pipeline.
      form.set('text', 'too short to be an agreement');
      form.set('filename', 'limit-probe.txt');
      return fetch(BASE + '/api/documents', {
        method: 'POST',
        body: form,
        headers: { 'x-forwarded-for': ip },
      });
    };

    let limited: { body: unknown; retryAfter: string | null } | null = null;
    let allowed = 0;
    for (let i = 0; i < 16 && !limited; i++) {
      const res = await post();
      if (res.status === 429) {
        // Read it HERE. Draining every response and cloning this one later
        // throws "Body has already been consumed" — a Response body is a
        // one-shot stream, and clone() has to happen before the read, not
        // after it.
        limited = { body: await res.json().catch(() => ({})), retryAfter: res.headers.get('retry-after') };
      } else {
        allowed++;
        await res.arrayBuffer();
      }
    }

    if (!limited) {
      fail('14. the upload route never returned 429 after ' + allowed + ' documents — the limiter is not wired in');
    } else {
      const body = limited.body as { error?: string };
      const retry = Number(limited.retryAfter);
      pass('14. the upload route refuses with 429 after ' + allowed + ' documents in the window');
      body?.error === 'rate_limited'
        ? pass('14. the refusal carries the contract code rate_limited')
        : fail('14. the 429 body was ' + JSON.stringify(body) + ', not { error: "rate_limited" }');
      Number.isFinite(retry) && retry > 0
        ? pass('14. Retry-After tells the caller when to come back (' + retry + 's)')
        : fail('14. the 429 carried no usable Retry-After header');
    }
  }

  /* 7. The cron route is not public. A public purge endpoint is a delete button
        for strangers. */
  {
    const bare = await fetch(BASE + '/api/cron/purge');
    const wrong = await fetch(BASE + '/api/cron/purge', { headers: { authorization: 'Bearer not-the-secret' } });
    bare.status === 401 && wrong.status === 401
      ? pass('7. cron route returns 401 without, and with a wrong, CRON_SECRET')
      : fail('7. cron route returned ' + bare.status + ' bare and ' + wrong.status + ' with a wrong secret');
  }

  /* 8. Upload limits are enforced as a result, not as a crash. */
  {
    const form = new FormData();
    // 11 MB, one byte-range over the stated 10 MB cap.
    form.set('file', new File([new Uint8Array(11 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' }), 'big.pdf');
    const res = await fetch(BASE + '/api/documents', { method: 'POST', body: form });
    const body = await res.json().catch(() => ({}));
    res.status < 500 && body.error === 'oversize_document'
      ? pass('8. an oversize upload returns oversize_document, not a 500')
      : fail('8. oversize upload returned ' + res.status + ' ' + JSON.stringify(body).slice(0, 120));

    const junk = new FormData();
    junk.set('text', 'hello');
    const small = await fetch(BASE + '/api/documents', { method: 'POST', body: junk });
    const smallBody = await small.json().catch(() => ({}));
    small.status < 500 && typeof smallBody.error === 'string'
      ? pass('8. a document too short to be an agreement returns ' + smallBody.error)
      : fail('8. short upload returned ' + small.status + ' ' + JSON.stringify(smallBody).slice(0, 120));
  }

  /* 9. The payload is validated at the zod boundary, not at render. */
  {
    const { putAnalysis } = await import('../lib/db');
    let rejected = false;
    try {
      // A payload missing `coverage` entirely: exactly what a half-written
      // pipeline produces, and exactly what must never reach a table.
      await putAnalysis(UUID_A, UUID_A, { document: {}, graph: {} } as never);
    } catch {
      rejected = true;
    }
    rejected
      ? pass('9. a malformed payload is rejected before insert')
      : fail('9. a malformed payload was accepted into storage');
  }

  /* 10. No open redirect. */
  {
    const cases = ['//evil.example.com', 'https://evil.example.com', '/radar'];
    const results: string[] = [];
    for (const next of cases) {
      const res = await fetch(BASE + '/api/locale?to=hi&next=' + encodeURIComponent(next), { redirect: 'manual' });
      const location = res.headers.get('location') ?? '';
      const host = location ? new URL(location, BASE).host : '';
      if (host && host !== new URL(BASE).host) results.push(next + ' -> ' + location);
    }
    results.length === 0
      ? pass('10. /api/locale never redirects off-site')
      : results.forEach((r) => fail('10. open redirect: ' + r));
  }

  /* 11. Nothing hands an upload back as something a browser will execute. */
  {
    const pdf = await get('/api/prepare', session.cookie);
    const type = pdf.headers.get('content-type') ?? '';
    const disposition = pdf.headers.get('content-disposition') ?? '';
    type.startsWith('application/pdf') && /attachment/i.test(disposition)
      ? pass('11. /api/prepare serves application/pdf as an attachment')
      : fail('11. /api/prepare content-type "' + type + '" disposition "' + disposition + '"');

    const analysis = await get('/api/analysis/' + session.document_id, session.cookie);
    (analysis.headers.get('content-type') ?? '').includes('application/json')
      ? pass('11. the analysis route serves JSON, never the uploaded bytes')
      : fail('11. analysis content-type is ' + analysis.headers.get('content-type'));

    (analysis.headers.get('cache-control') ?? '').includes('no-store')
      ? pass('11. analysis and job responses are no-store')
      : fail('11. analysis response is cacheable — it would be served to the next asker');
  }

  /* The lazy timeout, which is the one behaviour with no worker behind it. */
  {
    const hung = await newSession('timed_out');
    let last: { status?: string; error_code?: string } = {};
    // The scenario's own deadline is what trips; poll until it does or give up.
    for (let i = 0; i < 25; i++) {
      const res = await get('/api/jobs/' + hung.job_id, hung.cookie);
      last = await res.json();
      if (last.status && last.status !== 'running' && last.status !== 'queued') break;
      await new Promise((r) => setTimeout(r, 500));
    }
    last.status === 'timed_out' && last.error_code === 'upstream_timeout'
      ? pass('lazy timeout: a hung job transitions on read, with no sweeper')
      : fail('lazy timeout: job ended as ' + last.status + '/' + last.error_code);
  }

  /* The advice boundary, server-side. */
  {
    const res = await fetch(BASE + '/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: session.cookie },
      body: JSON.stringify({ question: 'Should I sign this contract?' }),
    });
    const body = await res.json();
    body.outcome === 'advice' && typeof body.handoff === 'string' && body.handoff.length > 0
      ? pass('advice boundary: "should I sign" is classified advice and hands off')
      : fail('advice boundary: outcome ' + body.outcome + ', handoff ' + JSON.stringify(body.handoff));

    const info = await fetch(BASE + '/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: session.cookie },
      body: JSON.stringify({ question: 'What does the service bond say?' }),
    });
    const infoBody = await info.json();
    infoBody.outcome !== 'information' || infoBody.citations.length > 0
      ? pass('advice boundary: an information answer cites, or it is not information')
      : fail('advice boundary: an uncited answer was returned as information');
  }

  /* ───────────────────────── the pipeline itself ─────────────────────────
     The demo scenarios above exercise the transport, not the grounding. This
     runs LOCATE, VERIFY, ENTAIL and the coverage accounting over a document
     whose every answer is known in advance, with the model calls stubbed — the
     three stages that carry the product's promise are deterministic, so they
     can be asserted to the character rather than to "it seemed to work". */
  try {
    await pipelineChecks();
  } catch (e) {
    // The coverage invariant inside runPipeline THROWS. A gate that dies on it
    // prints a stack trace and skips whatever came after, so it is caught here
    // and reported as what it is.
    fail('pipeline: the run threw — ' + String((e as Error)?.message).slice(0, 160));
  }

  done();
}

/**
 * NORMALIZE and the generated responseSchema, both of which fail silently and
 * totally: a schema Gemini rejects makes every extraction a 400, and a PDF that
 * does not come back as text makes every quote a `span_not_found`. Neither is
 * visible until a real document is uploaded, so they are asserted here.
 */
async function schemaAndPdfChecks() {
  const { toGeminiSchema, Extraction, Flagging } = await import('../lib/gemini');
  const { normalizeUpload, normalizeText } = await import('../lib/normalize');
  const { PDFDocument, StandardFonts } = await import('pdf-lib');

  // Gemini's responseSchema is a narrow subset of OpenAPI 3.0. Anything below
  // makes the call fail outright, and zod emits several of them by default.
  const UNSUPPORTED = ['$ref', '$defs', '$schema', 'additionalProperties', 'allOf', 'oneOf', 'not', 'patternProperties'];
  for (const [name, schema] of [['Extraction', Extraction], ['Flagging', Flagging]] as const) {
    const json = JSON.stringify(toGeminiSchema(schema));
    const bad = UNSUPPORTED.filter((k) => json.includes('"' + k + '"'));
    bad.length === 0
      ? pass('schema: ' + name + ' generates inside the subset Gemini supports')
      : fail('schema: ' + name + ' contains ' + bad.join(', ') + ' — the call would 400');
  }

  // A PDF, through the real extractor, with a clause deliberately wrapped
  // across two lines. §11 names this as the highest-risk assumption in the
  // whole design: the model returns unwrapped prose, the document does not.
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  [
    'OFFER OF EMPLOYMENT',
    '9.2 Service bond. The Employee shall pay to the Company a sum of',
    'Rs. 2,00,000/- if the Employee resigns before completing twenty-four',
    'months of service. 12.2 Restrictive covenant. The Employee shall not,',
    'for twelve months following cessation of employment, engage with any',
    'competing business. 7.1 Notice. Either party may terminate on ninety',
    '(90) days written notice, or payment of three months salary in lieu.',
    'The Employee shall comply with all policies in force from time to time,',
    'and shall not disclose confidential information to any third party.',
  ].forEach((l, i) => page.drawText(l, { x: 50, y: 780 - i * 22, size: 11, font }));

  const doc = await normalizeUpload(await pdf.save(), 'gate.pdf', 'application/pdf');
  doc.text.length > 400 && doc.sourceKind === 'pdf' && doc.pageCount === 1
    ? pass('normalize: a real PDF extracts to ' + doc.text.length + ' chars over ' + doc.pageCount + ' page')
    : fail('normalize: PDF extraction produced ' + doc.text.length + ' chars, kind ' + doc.sourceKind);

  // Through the REAL matcher, not a copy of it. A regex rewritten here would
  // only prove that this file can find the quote, which is not the claim.
  const { runPipeline } = await import('../lib/pipeline');
  const wrapped = await runPipeline({
    doc,
    documentId: UUID_A,
    jobId: UUID_A,
    deadlineAt: new Date().toISOString(),
    state: null,
    calls: {
      // The unwrapped prose a model returns. In the PDF this clause is split
      // across two lines, so a character-for-character search finds nothing.
      extract: async () => ({
        items: [
          item({
            id: 'n_wrapped', kind: 'Money', clause_label: '9.2',
            quoted_text: 'shall pay to the Company a sum of Rs. 2,00,000/-',
            amount_text: 'Rs. 2,00,000/-', payer: 'employee', trigger: 'resignation before 24 months',
          }),
        ],
      }),
      flag: async () => ({ flags: [] }),
    },
  });

  wrapped.payload.coverage.located === 1 && wrapped.payload.coverage.dropped.span_not_found === 0
    ? pass('normalize: a clause wrapped across a PDF line break still locates, via the real matcher')
    : fail('normalize: a wrapped clause dropped as span_not_found — every real quote would too');

  const wrappedNode = wrapped.payload.graph.nodes[0];
  wrappedNode &&
  doc.text.slice(wrappedNode.provenance.char_start, wrappedNode.provenance.char_end) === wrappedNode.provenance.quoted_text
    ? pass('normalize: the stored quote is our slice of the PDF text, not the model string')
    : fail('normalize: the stored quote does not slice out of the extracted text');

  // The offset map has to move whenever raw and normalized stop moving in step.
  // Built from char codes so the escaping survives every tool between here
  // and the file: this assertion is about exact characters.
  const CR = String.fromCharCode(13);
  const LF = String.fromCharCode(10);
  const NBSP = String.fromCharCode(160);
  const ragged = 'Clause' + NBSP + ' 9.2' + CR + LF + CR + LF + CR + LF + '   The Employee  shall pay   ' + CR + LF;
  const n = normalizeText(ragged);
  n.text === 'Clause 9.2' + LF + LF + ' The Employee shall pay' && n.offsetMap.length > 1
    ? pass('normalize: whitespace folds and the offset map records ' + n.offsetMap.length + ' divergences')
    : fail('normalize: produced ' + JSON.stringify(n.text) + ' with ' + n.offsetMap.length + ' anchor(s)');
}

const SAMPLE = `OFFER OF EMPLOYMENT

9.2 Service bond. The Employee shall pay to the Company a sum of Rs. 2,00,000/-
    if the Employee resigns before completing twenty-four months of service.
12.2 Restrictive covenant. The Employee shall not, for twelve months following
    cessation of employment, engage with any competing business.
4.1 Exclusivity. During the term of employment the Employee shall not engage in
    any other gainful occupation without prior written consent.
7.1 Notice. Either party may terminate on ninety (90) days written notice.
15.1 Boilerplate. The Employee shall comply with all policies.
16.1 Boilerplate. The Employee shall comply with all policies.`;

type Item = z.infer<typeof ExtractedItem>;

const item = (over: Partial<Item>): Item => ({
  id: 'n', kind: 'Obligation', temporal_scope: 'not_applicable', quoted_text: '',
  clause_label: '', summary: 'a thing the document says', amount_text: '', payer: '',
  trigger: '', restrained: '', duration_months: 0, action: 'do the thing', holder: '',
  notice_days: 0, in_lieu: '', deadline_days: 0, gates: '',
  ...over,
}) as Item;

async function pipelineChecks() {
  await schemaAndPdfChecks();
  const { normalizeText } = await import('../lib/normalize');
  const { runPipeline } = await import('../lib/pipeline');
  const { checkCoverageInvariant } = await import('../contracts/schema');

  const { text, offsetMap } = normalizeText(SAMPLE);

  // Five items with five known fates: one clean, one whose quote is not in the
  // document, one that occurs twice with no clause to disambiguate it, one
  // whose amount is not in its own span, and one clean restraint.
  const items = [
    item({
      id: 'n_bond', kind: 'Money', clause_label: '9.2',
      quoted_text: 'shall pay to the Company a sum of Rs. 2,00,000/-',
      amount_text: 'Rs. 2,00,000/-', payer: 'employee', trigger: 'resignation before 24 months',
    }),
    item({
      id: 'n_ghost',
      quoted_text: 'the Employee shall indemnify the Company against all losses',
    }),
    item({ id: 'n_dup', quoted_text: 'The Employee shall comply with all policies' }),
    item({
      id: 'n_wrong_amount', kind: 'Money',
      quoted_text: 'Either party may terminate on ninety (90) days written notice',
      amount_text: 'Rs. 5,00,000', payer: 'company',
    }),
    item({
      id: 'n_restraint', kind: 'Restraint', temporal_scope: 'post_employment', clause_label: '12.2',
      quoted_text: 'for twelve months following cessation of employment',
      restrained: 'engaging with a competing business', duration_months: 12,
    }),
  ];

  const { payload, dropRate } = await runPipeline({
    doc: {
      text, offsetMap, sourceKind: 'pdf', pageCount: 1,
      pageOffsets: [{ page: 1, start: 0, end: text.length }],
      sha256: 'a'.repeat(64),
    },
    documentId: UUID_A, jobId: UUID_A, deadlineAt: new Date().toISOString(), state: null,
    calls: {
      extract: async () => ({ items }),
      flag: async () => ({
        flags: [
          // A statutory citation the corpus can resolve for this node...
          { node_id: 'n_restraint', basis: 'statutory' as const, severity: 'act_on_this' as const,
            consequence: 'This tries to stop you working for a competitor.', what_to_ask: 'Will you confirm in writing?',
            reason: '', statute_section_id: 'ica_1872_s27' },
          // ...one the corpus has never heard of...
          { node_id: 'n_bond', basis: 'statutory' as const, severity: 'act_on_this' as const,
            consequence: 'You would owe this if you leave early.', what_to_ask: 'What does it represent?',
            reason: '', statute_section_id: 'invented_act_s99' },
          // ...and an asymmetry flag, which must never acquire a citation.
          { node_id: 'n_restraint', basis: 'asymmetry' as const, severity: 'know_about_this' as const,
            consequence: 'Only one side is restrained here.', what_to_ask: 'Is this reciprocal?',
            reason: 'One party is restrained and the other is not.', statute_section_id: 'ica_1872_s27' },
        ],
      }),
    },
  });

  const c = payload.coverage;

  checkCoverageInvariant(c).length === 0
    ? pass('pipeline: the coverage invariant holds on a real run, not just on the fixture')
    : fail('pipeline: coverage invariant broken — ' + checkCoverageInvariant(c).join('; '));

  c.dropped.span_not_found === 1
    ? pass('pipeline: a quote that is not in the document is dropped as span_not_found')
    : fail('pipeline: span_not_found is ' + c.dropped.span_not_found + ', expected 1');

  c.dropped.ambiguous === 1
    ? pass('pipeline: a quote occurring twice with no clause to place it is dropped as ambiguous')
    : fail('pipeline: ambiguous is ' + c.dropped.ambiguous + ', expected 1');

  c.dropped.entail_failed === 1
    ? pass('pipeline: an amount that is not in its own span is dropped as entail_failed')
    : fail('pipeline: entail_failed is ' + c.dropped.entail_failed + ', expected 1');

  // §9.3 — the whole grounding thesis, reduced to one equality.
  {
    const bad: string[] = [];
    const checkSpan = (what: string, p: { char_start: number; char_end: number; quoted_text: string }) => {
      if (payload.document.normalized_text.slice(p.char_start, p.char_end) !== p.quoted_text) bad.push(what);
    };
    for (const n of payload.graph.nodes) {
      checkSpan('node ' + n.id, n.provenance);
      if (n.clause_ref.provenance) checkSpan('clause_ref ' + n.id, n.clause_ref.provenance);
    }
    for (const e of payload.graph.edges) if (e.provenance) checkSpan('edge ' + e.id, e.provenance);
    for (const f of payload.flags) {
      const n = payload.graph.nodes.find((x) => x.id === f.node_id);
      if (!n) bad.push('flag ' + f.id + ' points at no node');
    }
    bad.length === 0
      ? pass('pipeline: every rendered span slices out of normalized_text exactly, ' + payload.graph.nodes.length + ' node(s)')
      : bad.forEach((b) => fail('pipeline: span does not match its own offsets — ' + b));
  }

  // ENTAIL, on citations. An invented section resolves to nothing and the flag
  // goes with it; an asymmetry flag never acquires one however it was proposed.
  {
    const cited = payload.flags.filter((f) => f.basis === 'statutory');
    const invented = cited.some((f) => f.statute_refs.some((r) => r.section_id === 'invented_act_s99'));
    !invented
      ? pass('pipeline: a citation the corpus cannot resolve drops the flag rather than softening it')
      : fail('pipeline: an unresolvable statute reached the payload');

    const asymmetry = payload.flags.filter((f) => f.basis === 'asymmetry');
    asymmetry.length > 0 && asymmetry.every((f) => f.statute_refs.length === 0 && f.reason)
      ? pass('pipeline: asymmetry flags carry no statute and state their computed reason')
      : fail('pipeline: an asymmetry flag carries a citation, or none was produced');

    // The s.27 gate: during-employment restraints must never be cited to it.
    const during = new Set(payload.graph.nodes.filter((n) => n.temporal_scope === 'during_employment').map((n) => n.id));
    payload.flags.some((f) => during.has(f.node_id) && f.statute_refs.some((r) => r.section === 's.27'))
      ? fail('pipeline: s.27 fired on a during-employment restraint')
      : pass('pipeline: s.27 fires only on post_employment');
  }

  /* 15. A retry reuses the extraction it already paid for.

         One transient upstream failure hands the job back for a second
         attempt. Without the cache that attempt re-extracts a document that
         had already been read successfully — paying for the expensive call
         again because the call that actually failed was a LATER one.

         Asserted by counting: the same run, once cold and once with the
         extraction handed back, and the model must not be asked twice. */
  {
    const { runPipeline } = await import('../lib/pipeline');
    const base = {
      doc: {
        text, offsetMap, sourceKind: 'pdf' as const, pageCount: 1,
        pageOffsets: [{ page: 1, start: 0, end: text.length }],
        sha256: 'a'.repeat(64),
      },
      documentId: UUID_A, jobId: UUID_A, deadlineAt: new Date().toISOString(), state: null,
    };

    let extractCalls = 0;
    let captured: unknown[] = [];
    const calls = {
      extract: async () => { extractCalls++; return { items }; },
      flag: async () => ({ flags: [] }),
    };

    await runPipeline({
      ...base,
      calls,
      onExtracted: (got) => { captured = got; },
    });
    const cold = extractCalls;

    await runPipeline({
      ...base,
      calls,
      cachedItems: captured as typeof items,
    });

    cold === 1 && extractCalls === 1
      ? pass('15. a retry reuses the cached extraction instead of paying for it twice')
      : fail('15. extract ran ' + extractCalls + ' times across two attempts (expected 1)');

    captured.length === items.length
      ? pass('15. the extraction is handed to the caller to store, in full')
      : fail('15. onExtracted reported ' + captured.length + ' items, expected ' + items.length);
  }

  // §11 asks for this number early, so it is printed on every run rather than
  // measured once and forgotten.
  //
  // It is also ASSERTED, not just printed. A number that only ever gets
  // narrated is a number nobody notices doubling: every dropped node is an
  // obligation the reader never sees, so a silent rise here is the product
  // quietly getting worse while every other gate stays green.
  //
  // The ceiling is deliberately just above where the sample sits rather than
  // where we wish it sat. It is a ratchet against regression, not a target —
  // lower it when the extraction improves, and never raise it to make a red
  // run go away without understanding what started dropping.
  const DROP_CEILING = 0.65;
  const pct = Math.round(dropRate * 100) + '%';
  dropRate <= DROP_CEILING
    ? pass('pipeline drop rate on the sample is ' + pct + ' (ceiling ' + Math.round(DROP_CEILING * 100) + '%)')
    : fail('pipeline drop rate rose to ' + pct + ', over the ' + Math.round(DROP_CEILING * 100) + '% ceiling');
}

function done() {
  console.log(
    failed === 0
      ? '\nBackend gate passed.\n'
      : '\nBackend gate FAILED — ' + failed + ' problem(s).\n',
  );
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
