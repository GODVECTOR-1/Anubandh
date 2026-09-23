# Backend — what is built, and what running it for real changed

Companion to `BACKEND-SPEC.md`. That document says what to build; this one says
what got built, and what only showed up once it ran against a real Supabase
project and a real Gemini key.

---

## Running it

```bash
npm run migrate          # apply supabase/migrations/*.sql — do this FIRST
npm run dev
npm run check:all        # budget needs a prod server: npm run build && npx next start -p 3100
```

All eight gates pass, `check:backend` at 38 assertions with no skips. With no
`DATABASE_URL` the app falls back to an in-process store, so a clean checkout
works with no accounts attached.

Measured on a real PDF, end to end: **33 seconds**, 5 obligations extracted, 5
located, 0 dropped, 3 flags, every span slicing back to its own quote.

---

## Environment

| Variable | Why |
|---|---|
| `DATABASE_URL` | Supabase Postgres — the **pooler** URI, see below |
| `SESSION_SECRET` | signs the session cookie, 32+ random bytes; production refuses to start without it |
| `GEMINI_API_KEY` | the three model calls |
| `GEMINI_MODEL` | optional, comma-separated fallback list, best first |
| `CRON_SECRET` | protects `/api/cron/purge` |
| `DATABASE_CA` | optional, authenticates the Postgres TLS certificate |

### The connection string

Use the **connection pooler** URI, not the direct host. Three things bite here,
and all three cost real debugging time, so `lib/db.ts` now refuses each one with
a message naming the fix rather than letting it fail as a DNS error:

- `db.<ref>.supabase.co` resolves to **IPv6 only**. Node reports that as
  `ENOTFOUND`, which reads like a typo in the hostname.
- The square brackets in `[YOUR-PASSWORD]` are placeholder punctuation, not part
  of the password.
- A `@`, `#`, `/` or `?` inside the password has to be percent-encoded, or the
  URI splits at the wrong character.

---

## The one serious defect this found

**Row level security was not being enforced at all.** Every session could read
every other session's document.

`0001` enabled RLS, and used `force row level security` specifically so the
table owner would not be exempt. That is still not enough. Supabase hands out
its connection as the `postgres` role, and that role carries **`rolbypassrls`**,
which skips every policy regardless of `FORCE`. The policies were present,
correct, and never consulted.

It survived the first round of testing because the check that should have caught
it ran against tables holding no other session's rows, where "this session sees
nothing" is true whether or not the policy fires. It failed the moment real
uploads existed. The gate now mints a **random** session id for that assertion,
because the fixed sentinel it used before was also the id the gate writes its
own rows under — so it had been asking whether a session could see its own rows,
and answering yes.

`0002_app_role.sql` fixes it: a role that cannot bypass, which `lib/db.ts`
switches into with `set local role` at the top of every transaction.
Transaction-scoped, so a pooled connection cannot carry it to the next request.
If that role is missing the app refuses to run rather than quietly serving every
reader everyone else's contract.

The purge needed rethinking as a consequence. Postgres applies SELECT policies
to the rows a `DELETE ... WHERE` examines, so the restricted role could no
longer see expired rows in order to delete them — the delete removed nothing and
reported success. Widening SELECT would make every document readable by anyone
for the last hours of its life, so the elevation went to the one operation that
needs it: a `security definer` function taking no arguments that can only ever
delete rows already past their retention window.

---

## What running Gemini for real changed

The model boundary needed four fixes, none of which were visible without a key:

- **A pinned model stopped being served.** `gemini-2.5-flash` returns 404 "no
  longer available to new users" for a new API key, while still appearing in
  that key's own model listing. Nothing about the failure pointed at the cause.
- **Quota and capacity are both per model.** One model answers 429 "quota
  exhausted" or 503 "high demand" while the next serves the same prompt in eight
  seconds. So a transient failure now moves to the **next** model rather than
  asking the same one again. Retrying a model with no quota left is just
  waiting.
- **Gemini 3 spends output budget on thinking before writing any answer**, and
  that spend counts against `maxOutputTokens`. A one-line classification came
  back `MAX_TOKENS` with an empty body. Thinking is now off — copying a quote
  out of a document is not a reasoning task — and models that reject the setting
  are detected and retried without it.
- **The three calls each believed they owned the whole budget.** Extraction
  consumed everything left and starved the flag pass, losing a document that had
  already been read successfully. The job's deadline is now threaded into every
  attempt and split three ways.

`maxDuration` is 60, which is Vercel Hobby's real ceiling; asking for 90 does not
get 90, it gets a function killed at 60 with the job still `running`. The cron
is daily for the same reason: Hobby allows one invocation per day. Daily still
keeps the promise, because `purge_after` is a timestamp rather than a bucket.

---

## Two decisions worth knowing before changing anything

**Whitespace is the only tolerance in span matching.** This is the measurement
that justifies it: on a live extraction, **six of six quotes differed from the
document by whitespace only**. A strict character-for-character match would have
dropped all six. PDF extraction wraps a clause wherever the column ended, and no
model reproduces that. Every other character must still match, in order, with
nothing inserted, dropped or corrected — a near-miss finds nothing and is
counted as `span_not_found`. Widening this past whitespace removes the grounding
guarantee, which is the product.

**The stored quote is our slice, never the model's string.** They differ wherever
a line wrapped, and the split view slices `normalized_text` by the recorded
offsets — so a quote that is merely equivalent would highlight the right words
and read back the wrong ones.

---

## Still unmeasured

The drop rate is 0% on the documents tested so far, which are short and cleanly
typeset. §11 names this as the highest-risk assumption in the design, and a
scanned or badly-typeset contract is where it will show. `check:backend` prints
the drop rate on every run; watch it.
