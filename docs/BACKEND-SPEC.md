# Anubandh backend — executable spec

Audience: two coding agents working in this repo. **Antigravity** (in-IDE) and
**Codex** (CLI). Written to be pasted in as instructions. Everything here is
grounded in code that exists at commit `Baseline: Anubandh frontend, green on
every gate`; file paths and type names are real, not illustrative.

---

## 0. Read this before touching anything

**`contracts/schema.ts` is frozen.** It is the single artifact both sides compile
against. Do not add fields, relax a type, or "temporarily" widen a union. If you
believe the contract is wrong, stop and say so — changing it changes both halves
of the app at once, and the frontend is already shipped against it.

**The gates are the definition of done.** `npm run check:all`. Do not hand work
back with a red gate and a note explaining why it is fine. The gates were
written because each one caught something real; two of them exist specifically
to catch backend mistakes:

| Gate | Catches |
|---|---|
| `npm run check:secrets` | a key reaching the client bundle, an env file committed, a credential pasted into source |
| `npm run check:routes` | a route that 500s, a console error on hydration, a request that 404s, a broken upload flow |
| `npm run check:fixture` | a `Coverage` object whose numbers do not add up (see §3) |

**The product's promise is provenance, not summarisation.** Every quoted span
shown as fact has been verified to occur in the user's own document. A model
that is confidently wrong is the failure this product exists to prevent. When
the pipeline cannot verify something, the contract has a place to say so —
use it. Never widen a claim to fill a gap.

**The advice boundary is law, not tone.** Practising law in India is reserved to
enrolled advocates (Advocates Act 1961). Anubandh states what the document says
and what a statute provides. It does not advise, predict outcomes, or represent
anyone. This is enforced server-side (§6), not by UI copy.

---

## 1. Decisions already made

Do not re-litigate these. They were decided with the repo owner.

| Decision | Value | Consequence |
|---|---|---|
| Ownership | **Anonymous session cookie** | No login screen. A signed httpOnly cookie carries an opaque session id; every row is keyed to it; RLS enforces it |
| Hosting | **Vercel** | No long-running worker. Jobs transition lazily on read (the contract already says this — `Job.status` doc comment) |
| Supabase | **project exists** | Write migrations against it; do not provision |
| Gemini | **key in hand** | Server-only env var; focus on prompt design, not account setup |
| Schema version | `SCHEMA_VERSION = 1` | Bump only with an explicit migration story |

---

## 2. The seam

Every page currently reads the fixture directly:

```
app/radar/page.tsx        app/document/page.tsx     app/timeline/page.tsx
app/ask/page.tsx          app/prepare/page.tsx      app/states/page.tsx
app/api/prepare/route.ts
```

each doing some form of:

```ts
import { priyaOfferLetter } from '@/fixtures/priya-offer-letter';
const analysis = priyaOfferLetter;
```

**Replace that one line, nothing else.** Introduce a single server-side loader:

```ts
// lib/analysis.ts
import type { AnalysisPayload } from '@/contracts/schema';

/** Loads a stored analysis the caller owns, or null. Null means 404 to the
 *  caller — never 403, see §5. */
export async function getAnalysis(documentId: string): Promise<AnalysisPayload | null>;

/** The document the reader is currently looking at, from the session. */
export async function getCurrentAnalysis(): Promise<AnalysisPayload | null>;
```

Rules for this step:

- The rendered contract does not change. `RiskRadar`, `SplitView`, `Scrubber`,
  `Ask`, `Prepare` all keep taking `analysis: AnalysisPayload`. If a component
  signature changes, you have gone too far.
- `app/states/page.tsx` **keeps the fixture**. It is the component-state gallery
  and must render without a database.
- `fixtures/priya-offer-letter.ts` stays in the repo. It is the input to
  `check:fixture` and the sample document the landing page promises.
- When no analysis exists for the session, pages render their real empty state.
  They already have one; do not invent a new one.

---

## 3. The provenance pipeline

This is the heart of the product. It is four stages, and they are already named
in `JobStage`: `reading → extracting → verifying → checking_law`.

### The accounting is an invariant, not a report

`contracts/schema.ts` exports `checkCoverageInvariant()`. Your pipeline output
must satisfy it exactly:

```
extracted = located + dropped.span_not_found + dropped.ambiguous
located   = verified                       // verification is 100% by construction
verified  = entailed + dropped.entail_failed
entailed  = rendered + dropped.render
```

Read that second line carefully. **`located === verified` is not an aspiration —
it is structural.** A located span is one that was found in the document; if it
could not be verified, it was never located. There is no state where something
is located but unverified. Design the pipeline so this is true by construction,
not by a later reconciliation pass.

`check:fixture` runs this assertion. A build fails rather than shipping a header
count that disagrees with the cards on screen.

### Stage by stage

**`reading` — NORMALIZE.** Take the upload (PDF/DOCX/TXT/image), produce plain
text plus a stable map back to the original page and paragraph. `Provenance` in
the contract is what this map serialises to. Everything downstream cites into
this normalised text, so the map is the product.

**`extracting` — LOCATE.** Ask Gemini for obligations. Every returned item must
carry the exact substring it came from. An item whose quote cannot be found in
the normalised text is dropped as `span_not_found`. An item whose quote occurs
more than once, with no way to disambiguate, is dropped as `ambiguous`. Both are
counted, and both may carry `unvalidated_quote` so the UI can show the reader
what was dropped, struck through, under "we could not confirm this text appears
in your document". **Do not repair a near-miss quote.** A fuzzy match that
"probably meant" a passage is precisely the failure mode this pipeline exists to
prevent.

**`verifying` — VERIFY.** Exact-substring check against the normalised text,
plus span offsets recorded. This is deterministic code, not a model call. If you
find yourself asking a model whether a quote appears in a document, stop.

**`checking_law` — ENTAIL.** For statutory flags only, resolve the cited section
and check that the section actually supports the claim. A flag whose citation
cannot be resolved is dropped as `entail_failed`. **Asymmetry flags never enter
this stage** — they are structural observations about the shape of a clause (one
party holds a power the other does not), they cite no statute, and they must
never be given one. `FlagBasis` exists to keep these apart; a shared ramp would
imply that cited means severe.

### Failure is a first-class output

Every `ErrorCode` in the contract is reachable from `lib/mock-job.ts` today and
the UI renders each one. Your pipeline must be able to produce all of them:

```
schema_validation  response_truncated  model_refusal      rate_limited
upstream_timeout   span_not_found      ambiguous_span     citation_unresolved
applicability_unknown  ocr_quality     encrypted_document oversize_document
not_legal_document internal
```

`ERROR_COPY` in `lib/mock-job.ts` is the existing user-facing copy for each and
which recovery action it offers — exactly four: `override`, `retry`, `reupload`,
`wait`. Match those semantics; the UI already branches on them in
`components/Intake.tsx`.

---

## 4. Job lifecycle

The frontend contract is `lib/mock-job.ts`:

```ts
export type JobUpdate = Job & { message?: string };
export function runMockJob(scenario, onUpdate): () => void;   // returns cancel
```

Swapping the mock for the real thing must change **transport only**. Keep the
stage vocabulary, keep the per-stage dwell feel, keep the cancel function.

### Routes

```
POST /api/documents            multipart upload   -> { document_id, job_id }
GET  /api/jobs/:id             poll               -> JobUpdate
POST /api/jobs/:id/cancel      cancel             -> JobUpdate (status: cancelled)
GET  /api/analysis/:id         the finished thing -> AnalysisPayload
GET  /api/prepare?id=          PDF                -> application/pdf
```

### Lazy timeout — read the contract comment

`Job` carries `deadline_at`, and its doc comment explains why:

> `timed_out` exists because X5/X7/X8 are HANGS, not errors — without it the
> client polls `running` forever. Transitioned LAZILY on the job GET
> (`now() > deadline_at`), because there is no background worker on Vercel Hobby
> to sweep it.

So `GET /api/jobs/:id` must, before returning, check `now() > deadline_at` on a
`queued`/`running` job and transition it to `timed_out` with
`error_code: 'upstream_timeout'`. There is no sweeper. If you add one, you have
misread the hosting constraint.

### Polling

Client polls `GET /api/jobs/:id`. Use `Cache-Control: no-store` on every job and
analysis response — a cached job status is a progress bar that lies.

---

## 5. Supabase: schema, RLS, ownership, purge

### Session identity

On first upload, mint an opaque session id (UUID v4), set it as a signed
httpOnly, `sameSite: lax`, `secure` cookie. Never readable by client JS. Every
row carries it.

### Schema

```sql
create table documents (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null,
  filename      text not null,
  byte_size     integer not null,
  normalized    text,                 -- the NORMALIZE output; spans cite into this
  created_at    timestamptz not null default now(),
  purge_after   timestamptz not null default now() + interval '24 hours'
);

create table jobs (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references documents(id) on delete cascade,
  session_id    uuid not null,
  stage         text not null check (stage in ('reading','extracting','verifying','checking_law')),
  status        text not null check (status in ('queued','running','done','failed','cancelled','timed_out')),
  deadline_at   timestamptz not null,
  error_code    text,
  counts        jsonb,
  created_at    timestamptz not null default now()
);

create table analyses (
  document_id   uuid primary key references documents(id) on delete cascade,
  session_id    uuid not null,
  payload       jsonb not null,       -- a full AnalysisPayload, schema-validated on write
  schema_version integer not null,
  created_at    timestamptz not null default now()
);

create index on documents (purge_after);
create index on jobs (document_id);
```

`analyses.payload` is validated with the zod `AnalysisPayload` **before** insert.
An unvalidated payload in the database is a frontend crash with extra steps.

### RLS

Enable on all three. The session id arrives as a request-scoped setting, not a
column the client can choose:

```sql
alter table documents enable row level security;
alter table jobs      enable row level security;
alter table analyses  enable row level security;

create policy session_owns_documents on documents
  using (session_id = current_setting('app.session_id', true)::uuid);
-- repeat for jobs and analyses
```

Set `app.session_id` per request from the signed cookie, server-side only.

### 404, never 403

A wrong-owner request must be indistinguishable from a nonexistent one. `403`
confirms the id exists, which turns an id into an oracle you can enumerate.

```ts
const row = await loadOwned(id, sessionId);
if (!row) notFound();          // 404 for both "missing" and "not yours"
```

No log line, error message, or response timing may distinguish the two cases.

### 24-hour purge

`vercel.json` cron, daily or hourly:

```json
{ "crons": [{ "path": "/api/cron/purge", "schedule": "0 * * * *" }] }
```

The route deletes `documents where purge_after < now()`; cascades clear jobs and
analyses. Protect it with `CRON_SECRET` compared in constant time — a public
purge endpoint is a delete button for strangers.

The landing page states "Nothing you upload is kept beyond 24 hours." That
sentence is a promise the cron keeps. If the cron does not run, the sentence is
false, so treat a failing purge as a correctness bug, not a chore.

---

## 6. Gemini and the advice boundary

### Keys

`GEMINI_API_KEY` server-side only. Never `NEXT_PUBLIC_`. `check:secrets`
enforces this and will fail the build. Do not add an exception.

### Prompt design

Three separate calls, not one mega-prompt. Each has a narrow job, a strict
output schema, and is validated with zod on return:

1. **Classify** — is this a legal document at all? Drives `not_legal_document`
   and the `cautionary` coverage mode.
2. **Extract** — obligations, each with its verbatim quote. The quote is the
   contract; everything else is commentary.
3. **Flag** — severity and basis for each extracted obligation.

A response that fails zod validation is `schema_validation`, not a retry loop
that eventually gets lucky. A truncated response is `response_truncated`. A
refusal is `model_refusal`. All three are in `ErrorCode` and all three render.

### The boundary, server-side

`lib/ask.ts` currently classifies locally into `AskOutcome`:

```
information | advice | escalate | no_coverage
```

Move this server-side. The rules, from `AskResponse` in the contract:

- **`information`** — states what the document says or what a statute provides.
  **Must cite.** An uncited answer is indistinguishable from a guess; if
  citations are empty it degrades to `no_coverage`. This is in the contract's
  own doc comment.
- **`advice`** — the reader asked what they *should do*. Reframe first, hand off
  second. `handoff` is populated. Leading with the refusal teaches the reader
  that the product dodges and they stop asking.
- **`escalate`** — distress or a situation needing a person now. `escalation`
  carries a reason and at least one contact, rendered **above** the answer. Note
  that `answer` is still populated on escalate: the interstitial offers a way to
  continue and continuing must arrive at the reading, not a blank screen.
- **`no_coverage`** — honest "not in what we extracted".

**The model does not choose the outcome.** Classification is deterministic code
over the model's output plus the question. A model asked "are you giving legal
advice?" will say no.

---

## 7. Security requirements, and how each is verified

Every row has a check. "We were careful" is not a verification.

| # | Requirement | Verified by |
|---|---|---|
| 1 | No key reaches the client bundle | `npm run check:secrets` (fails build) |
| 2 | No env file committed | `check:secrets` (git ls-files) |
| 3 | Wrong-owner reads are 404, not 403 | integration test: request another session's id, assert 404 and an identical body to a random uuid |
| 4 | RLS actually on | query each table with a mismatched `app.session_id`, assert zero rows |
| 5 | Session cookie not readable by JS | assert `httpOnly` and `secure` on the Set-Cookie header |
| 6 | Purge runs and deletes | insert a row with `purge_after` in the past, hit the cron route, assert gone |
| 7 | Cron route not public | call without `CRON_SECRET`, assert 401 |
| 8 | Upload limits enforced | oversize file returns `oversize_document`, not a 500 |
| 9 | Payload validated before insert | malformed payload rejected at the zod boundary, not at render |
| 10 | No open redirect | `/api/locale` already guards this; keep the guard when touching it |
| 11 | Uploads are not executable or served back raw | assert content-type on any download path |
| 12 | No PII in logs | grep the log calls you add for document text and filenames |

Add these as a `scripts/check-backend.ts` gate in the same style as the existing
ones: assert, print `ok`/`FAIL`, exit non-zero. **Then break each one on purpose
and confirm it fails.** A gate that has never failed is decoration — every
existing gate in this repo was falsified before being trusted.

---

## 8. Division of labour

Both agents work on branches off the baseline commit. Neither commits to
`master` directly.

**Antigravity (in-IDE, larger surface, more context):**
- §3 the provenance pipeline — normalisation, span location, verification,
  entailment
- §6 Gemini prompt design and the three-call structure
- The zod validation boundary on every model return

**Codex (CLI, tighter and more mechanical):**
- §5 Supabase migrations, RLS policies, the purge cron
- §4 the four API routes and lazy timeout transition
- §2 the seam — replacing seven fixture imports with `getAnalysis`
- §7 `scripts/check-backend.ts` and its falsification

**Ordering.** §5 before §4 before §3: routes need tables, the pipeline needs
somewhere to write. §2 last — the seam is only safe to cut once something real
is behind it.

**Before either hands back:**

```bash
npm run check:all
```

All green, or the work is not done. If a gate is wrong, say so and argue it —
do not edit the gate to pass.

---

## 9. Acceptance criteria

1. Upload a PDF; a job id returns; polling shows all four stages; an
   `AnalysisPayload` lands that passes `AnalysisPayload.parse()`.
2. `checkCoverageInvariant()` returns `[]` for every analysis the pipeline
   produces, not just the fixture.
3. Every quoted span rendered as fact occurs verbatim in `documents.normalized`.
   Prove it with a test that greps the payload's quotes against the stored text.
4. Every `ErrorCode` is reachable, and each renders the copy already in
   `ERROR_COPY` with its recovery action.
5. A second session requesting the first session's `document_id` gets 404 with a
   byte-identical body to a request for a random uuid.
6. A row past `purge_after` is gone after the cron runs; the document text is
   not recoverable from any table.
7. `npm run check:secrets` passes with real keys configured in `.env.local`.
8. `npm run check:routes` passes: 12/12, including the upload flow against the
   real backend.
9. `npm run check:all` green.
10. `/states` still renders with the database unreachable.

---

## 10. Out of scope

- Accounts, login, password reset, multi-device access. Anonymous session only.
- Any change to `contracts/schema.ts`.
- Any change to the frontend's rendered contract — component props stay as they
  are.
- Redesign of copy, colour, layout, or motion. The frontend is green on seven
  gates; do not "improve" it in passing.
- Hindi translation of model-generated prose. UI strings are already bilingual
  in `lib/ui-strings.ts`; generated prose is English-only for now and that is a
  deliberate, stated limitation.
- Background workers, queues, websockets. Vercel Hobby, lazy transitions, polling.

---

## 11. Known risk

The single highest-risk assumption in this spec is that Gemini will reliably
return verbatim quotes. It will not always. The pipeline is designed so that
this degrades into a counted, displayed `span_not_found` rather than a false
claim — that is the whole point of §3. **Measure the drop rate early.** If it is
high, the fix is prompt design and chunking, never loosening the verification.
