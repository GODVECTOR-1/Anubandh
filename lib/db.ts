import 'server-only';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { AnalysisPayload as AnalysisPayloadSchema } from '@/contracts/schema';
import type { AnalysisPayload, ErrorCode, Job, JobStage } from '@/contracts/schema';

/**
 * Storage, keyed by the anonymous session.
 *
 * Every read and write runs inside a transaction that first pushes the caller's
 * session id into `app.session_id`. That setting is what the RLS policies in
 * supabase/migrations/0001_init.sql compare against, so ownership is enforced by
 * Postgres rather than by remembering to add `where session_id = ...` — the one
 * place a missed clause becomes another reader's contract on your screen.
 *
 * With no DATABASE_URL the same calls run against an in-process map, so the app,
 * the sample flow and the route gate all work on a machine with no Supabase
 * project attached.
 *
 * ponytail: the fallback store is per-process and lost on restart. It is for
 * local dev and the gates. Set DATABASE_URL for anything that must survive.
 */

export const HAS_DB = !!process.env.DATABASE_URL;

export type DocumentRow = {
  id: string;
  session_id: string;
  filename: string;
  byte_size: number;
  normalized: string | null;
  normalize_meta: unknown | null;
  /** An extraction already paid for, reused by a retry. Null until the first
   *  attempt gets one back. */
  extraction: unknown | null;
  created_at: string;
  purge_after: string;
};

export type JobRow = {
  id: string;
  document_id: string;
  session_id: string;
  stage: JobStage;
  status: Job['status'];
  deadline_at: string;
  error_code: ErrorCode | null;
  counts: Job['counts'];
  scenario: string | null;
  created_at: string;
};

/* ───────────────────────────── postgres ───────────────────────────── */

type Mem = {
  docs: Map<string, DocumentRow>;
  jobs: Map<string, JobRow>;
  analyses: Map<string, { session_id: string; payload: AnalysisPayload }>;
};
type G = typeof globalThis & { __anubandhPool?: Pool; __anubandhMem?: Mem };

/**
 * Fail fast and say what is wrong, rather than 500 after an eleven-second DNS
 * lookup. Both of these cost real debugging time on a first deploy:
 *
 *   - `[password]` — the brackets in Supabase's `[YOUR-PASSWORD]` placeholder
 *     are punctuation, not part of the password, and a `@` or `#` inside it has
 *     to be percent-encoded or the URI splits at the wrong character.
 *   - `db.<ref>.supabase.co` — the DIRECT host, which now resolves to IPv6
 *     only. Node reports that as ENOTFOUND, which reads like a typo.
 */
function checkConnectionString(url: string): void {
  const creds = url.slice(url.indexOf('://') + 3, url.lastIndexOf('@'));
  const password = creds.slice(creds.indexOf(':') + 1);

  if (/^\[.*\]$/.test(password)) {
    throw new Error(
      'DATABASE_URL still has the square brackets around the password. They are part of ' +
      "Supabase's [YOUR-PASSWORD] placeholder, not part of your password — delete them. " +
      'Percent-encode any @ as %40, # as %23, / as %2F.',
    );
  }
  if (/[@#/?]/.test(password.replace(/%[0-9a-f]{2}/gi, ''))) {
    throw new Error(
      'DATABASE_URL has an unencoded @ # / or ? inside the password, so the URI splits at ' +
      'the wrong character. Percent-encode it: @ is %40, # is %23, / is %2F, ? is %3F.',
    );
  }
  if (/@db\.[a-z0-9]+\.supabase\.co/.test(url)) {
    throw new Error(
      'DATABASE_URL points at the DIRECT Supabase host (db.<ref>.supabase.co), which resolves ' +
      'to IPv6 only and fails as ENOTFOUND from most networks. Use the connection POOLER URI ' +
      'instead: Dashboard > Project Settings > Database > Connection string > URI, with ' +
      'connection pooling on. It looks like postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres',
    );
  }
}

async function pool(): Promise<Pool> {
  const g = globalThis as G;
  if (!g.__anubandhPool) {
    checkConnectionString(process.env.DATABASE_URL!);

    // Loud, once per process, and only where it matters. A weakness recorded
    // in a comment is a weakness nobody is going to find; one that prints on
    // every production boot is one somebody eventually fixes.
    if (!process.env.DATABASE_CA && process.env.NODE_ENV === 'production') {
      console.warn(
        'DATABASE_CA is not set: the database connection is encrypted but NOT authenticated. ' +
        'Anything in the network path can present its own certificate. ' +
        'Supabase dashboard → Settings → Database → SSL Configuration.',
      );
    }
    const { Pool: PgPool } = await import('pg');
    g.__anubandhPool = new PgPool({
      connectionString: process.env.DATABASE_URL,
      max: 3, // serverless: many instances, few sockets each
      // Without this, an unreachable database hangs the upload for as long as
      // the OS resolver takes and then 500s — eleven seconds of a progress bar
      // that was never going to finish.
      connectionTimeoutMillis: 8_000,
      // TLS is on either way; what DATABASE_CA buys is knowing WHO is on the
      // other end.
      //
      // Measured, not assumed: connecting with rejectUnauthorized true and
      // Node's built-in roots fails with SELF_SIGNED_CERT_IN_CHAIN, because
      // Supabase's pooler presents its own chain. So a pinned CA is genuinely
      // required rather than a nicety, and without one the connection is
      // encrypted but unauthenticated — anything that can sit in the path can
      // present its own certificate and read every document that crosses it.
      //
      // Download it from the Supabase dashboard (Settings → Database → SSL
      // Configuration) and put the PEM in DATABASE_CA. It is deliberately not
      // vendored into this repo: a CA certificate fetched from the internet
      // and committed by someone who could not verify it is its own supply
      // chain problem.
      ssl: process.env.DATABASE_CA
        ? { ca: process.env.DATABASE_CA, rejectUnauthorized: true }
        : { rejectUnauthorized: false },
    });
  }
  return g.__anubandhPool;
}

/**
 * One transaction, session id set for its lifetime only. `set_config(..., true)`
 * is transaction-local on purpose: a pooled connection handed to the next
 * request must not still be carrying the last reader's identity.
 */
/**
 * Failures of ESTABLISHING a connection, where nothing has been sent yet.
 *
 * Only these are retried, because only these are safe to retry: a query that
 * failed halfway through a transaction may or may not have committed, and
 * running it again is how a document gets written twice. A connection that was
 * never made has done nothing at all.
 *
 * All fast-failing. A pooled-connection TIMEOUT is deliberately not here: it
 * has already waited connectionTimeoutMillis, and doing that three times over
 * turns one slow second into a 24-second upload.
 *
 * Seen for real on this project, not imagined: `getaddrinfo ENOTFOUND` on the
 * Supabase pooler from the development machine, succeeding on the next try.
 * Before this, that one blip during an upload showed "Something broke on our
 * side", and during a poll it left a document stranded, never read.
 */
export function isTransientConnectError(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && ['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE'].includes(code)) {
    return true;
  }
  // The pooler hanging up during the handshake, before any statement ran.
  return /Connection terminated unexpectedly/i.test(String((e as Error | null)?.message ?? ''));
}

const CONNECT_ATTEMPTS = 3;

async function connect(): Promise<PoolClient> {
  const p = await pool();
  for (let attempt = 1; ; attempt++) {
    try {
      return await p.connect();
    } catch (e) {
      if (attempt >= CONNECT_ATTEMPTS || !isTransientConnectError(e)) throw e;
      // Short, because DNS and a pooler restart recover in well under a second
      // or not at all within the lifetime of this request.
      await new Promise((r) => setTimeout(r, 200 * attempt));
    }
  }
}

async function tx<T>(sessionId: string | null, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await connect();
  try {
    await client.query('begin');
    // Drop the bypass BEFORE anything is read. Supabase connects as `postgres`,
    // which holds rolbypassrls and therefore ignores every policy on every
    // table — FORCE row level security does not cover it. `set local` is
    // transaction-scoped, so a pooled connection handed to the next request
    // does not inherit it.
    //
    // One statement for both settings, not two: every round trip here is paid
    // on every read and write the app makes, and against a database on another
    // continent a round trip is hundreds of milliseconds. set_config('role', …)
    // is the function form of SET ROLE — the same membership check, the same
    // transaction scope with is_local = true — which is how PostgREST switches
    // roles per request for the same reason. The RLS gates in check-backend
    // are what prove it still takes effect.
    await client.query("select set_config('role', 'anubandh_app', true), set_config('app.session_id', $1, true)", [
      sessionId ?? '',
    ]);
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    if (/role "anubandh_app" does not exist/i.test(String((e as Error)?.message))) {
      // Loud, and deliberately not survivable. Carrying on as `postgres` would
      // mean serving every reader every other reader's contract.
      throw new Error(
        'The anubandh_app role is missing — apply supabase/migrations/0002_app_role.sql. ' +
        'Until it exists the app would run as a role that bypasses row level security.',
      );
    }
    throw e;
  } finally {
    client.release();
  }
}

/**
 * A transaction with no session identity, for infrastructure tables that no
 * session owns — currently only `rate_limits`.
 *
 * It still drops to anubandh_app, so this is not a way around row level
 * security: a caller using it against documents, jobs or analyses would match
 * no policy and see nothing, which is the correct outcome rather than a
 * loophole. The empty `app.session_id` is what makes that true.
 */
export const withClient = <T>(fn: (c: PoolClient) => Promise<T>): Promise<T> => tx(null, fn);

/* ────────────────────────── in-process fallback ────────────────────────── */

function mem(): Mem {
  const g = globalThis as G;
  g.__anubandhMem ??= { docs: new Map(), jobs: new Map(), analyses: new Map() };
  return g.__anubandhMem;
}

/** The fallback's stand-in for RLS. Same rule, same failure mode: a row whose
 *  session does not match is not visible, it is absent. */
function owned<T extends { session_id: string }>(row: T | undefined, sessionId: string | null): T | null {
  return row && sessionId && row.session_id === sessionId ? row : null;
}

/* ─────────────────────────────── documents ─────────────────────────────── */

export async function createDocument(
  sessionId: string,
  filename: string,
  byteSize: number,
  normalized: string | null,
  meta: unknown = null,
): Promise<string> {
  if (!HAS_DB) {
    const id = randomUUID();
    const now = Date.now();
    mem().docs.set(id, {
      id,
      session_id: sessionId,
      filename,
      byte_size: byteSize,
      normalized,
      extraction: null,
      normalize_meta: meta,
      created_at: new Date(now).toISOString(),
      purge_after: new Date(now + 24 * 3600_000).toISOString(),
    });
    return id;
  }
  return tx(sessionId, async (c) => {
    const r = await c.query(
      `insert into documents (session_id, filename, byte_size, normalized, normalize_meta)
       values ($1,$2,$3,$4,$5) returning id`,
      [sessionId, filename, byteSize, normalized, meta === null ? null : JSON.stringify(meta)],
    );
    return r.rows[0].id as string;
  });
}

export async function setNormalized(sessionId: string, documentId: string, text: string): Promise<void> {
  if (!HAS_DB) {
    const d = owned(mem().docs.get(documentId), sessionId);
    if (d) d.normalized = text;
    return;
  }
  await tx(sessionId, (c) =>
    c.query('update documents set normalized = $1 where id = $2', [text, documentId]),
  );
}

export async function getDocument(sessionId: string | null, id: string): Promise<DocumentRow | null> {
  if (!isUuid(id)) return null;
  if (!HAS_DB) return owned(mem().docs.get(id), sessionId);
  return tx(sessionId, async (c) => {
    const r = await c.query('select * from documents where id = $1', [id]);
    return (r.rows[0] as DocumentRow) ?? null;
  });
}

/**
 * Store an extraction against its document, so one transient failure does not
 * make the reader pay for the same model call twice.
 *
 * Scoped by session in the WHERE clause as well as by RLS. The two should
 * always agree, and writing both means a policy that is ever loosened does not
 * silently widen this.
 */
export async function saveExtraction(
  sessionId: string,
  documentId: string,
  items: unknown,
): Promise<void> {
  if (!HAS_DB) {
    const row = owned(mem().docs.get(documentId), sessionId);
    if (row) row.extraction = items;
    return;
  }
  await tx(sessionId, async (c) => {
    await c.query('update documents set extraction = $1 where id = $2 and session_id = $3', [
      JSON.stringify(items),
      documentId,
      sessionId,
    ]);
  });
}

/* ───────────────────────────────── jobs ───────────────────────────────── */

export async function createJob(
  sessionId: string,
  documentId: string,
  deadlineAt: Date,
  scenario: string | null = null,
): Promise<JobRow> {
  if (!HAS_DB) {
    const row: JobRow = {
      id: randomUUID(),
      document_id: documentId,
      session_id: sessionId,
      stage: 'reading',
      status: 'queued',
      deadline_at: deadlineAt.toISOString(),
      error_code: null,
      counts: null,
      scenario,
      created_at: new Date().toISOString(),
    };
    mem().jobs.set(row.id, row);
    return row;
  }
  return tx(sessionId, async (c) => {
    const r = await c.query(
      `insert into jobs (document_id, session_id, stage, status, deadline_at, scenario)
       values ($1,$2,'reading','queued',$3,$4) returning *`,
      [documentId, sessionId, deadlineAt.toISOString(), scenario],
    );
    return toJobRow(r.rows[0]);
  });
}

/**
 * Move a job from `queued` to `running`, and report whether THIS caller is the
 * one that moved it.
 *
 * There is no background worker on Vercel, so the pipeline runs inside whichever
 * poll arrives first. The client polls every second: without an atomic claim,
 * three overlapping polls would each start their own extraction against the same
 * document and pay for it three times.
 */
export async function claimJob(sessionId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  if (!HAS_DB) {
    const row = owned(mem().jobs.get(id), sessionId);
    if (!row || row.status !== 'queued') return false;
    row.status = 'running';
    return true;
  }
  return tx(sessionId, async (c) => {
    const r = await c.query(
      "update jobs set status = 'running' where id = $1 and status = 'queued' returning id",
      [id],
    );
    return r.rowCount === 1;
  });
}

export async function getJob(sessionId: string | null, id: string): Promise<JobRow | null> {
  if (!isUuid(id)) return null;
  if (!HAS_DB) return owned(mem().jobs.get(id), sessionId);
  return tx(sessionId, async (c) => {
    const r = await c.query('select * from jobs where id = $1', [id]);
    return r.rows[0] ? toJobRow(r.rows[0]) : null;
  });
}

export async function updateJob(
  sessionId: string,
  id: string,
  patch: Partial<Pick<JobRow, 'stage' | 'status' | 'error_code' | 'counts'>>,
): Promise<JobRow | null> {
  if (!HAS_DB) {
    const row = owned(mem().jobs.get(id), sessionId);
    if (!row) return null;
    Object.assign(row, patch);
    return row;
  }
  const cols = Object.keys(patch);
  if (cols.length === 0) return getJob(sessionId, id);
  const sets = cols.map((c, i) => c + ' = $' + (i + 2)).join(', ');
  const vals = cols.map((c) => {
    const v = (patch as Record<string, unknown>)[c];
    return c === 'counts' && v !== null ? JSON.stringify(v) : v;
  });
  return tx(sessionId, async (c) => {
    const r = await c.query('update jobs set ' + sets + ' where id = $1 returning *', [id, ...vals]);
    return r.rows[0] ? toJobRow(r.rows[0]) : null;
  });
}

/* ─────────────────────────────── analyses ─────────────────────────────── */

/**
 * Validated HERE, at the boundary, not at the caller. An unvalidated payload in
 * the database is a frontend crash with extra steps, and a rule enforced by
 * every caller remembering to enforce it is a rule with one forgetful caller in
 * its future.
 */
export async function putAnalysis(
  sessionId: string,
  documentId: string,
  payload: AnalysisPayload,
): Promise<void> {
  const checked = AnalysisPayloadSchema.safeParse(payload);
  if (!checked.success) throw new Error('analysis payload failed validation before insert');
  payload = checked.data;

  if (!HAS_DB) {
    mem().analyses.set(documentId, { session_id: sessionId, payload });
    return;
  }
  await tx(sessionId, (c) =>
    c.query(
      `insert into analyses (document_id, session_id, payload, schema_version)
       values ($1,$2,$3,$4)
       on conflict (document_id) do update set payload = excluded.payload`,
      [documentId, sessionId, JSON.stringify(payload), payload.graph.schema_version],
    ),
  );
}

export async function getAnalysisRow(
  sessionId: string | null,
  documentId: string,
): Promise<AnalysisPayload | null> {
  if (!isUuid(documentId)) return null;
  if (!HAS_DB) {
    const row = owned(mem().analyses.get(documentId), sessionId);
    return row ? row.payload : null;
  }
  return tx(sessionId, async (c) => {
    const r = await c.query('select payload from analyses where document_id = $1', [documentId]);
    return (r.rows[0]?.payload as AnalysisPayload) ?? null;
  });
}

/** Most recent analysis this session owns — what "the document you are looking
 *  at" resolves to when no id is in the URL. */
export async function latestAnalysis(sessionId: string | null): Promise<AnalysisPayload | null> {
  if (!sessionId) return null;
  if (!HAS_DB) {
    const docs = [...mem().docs.values()]
      .filter((d) => d.session_id === sessionId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    for (const d of docs) {
      const a = mem().analyses.get(d.id);
      if (a) return a.payload;
    }
    return null;
  }
  return tx(sessionId, async (c) => {
    const r = await c.query('select payload from analyses order by created_at desc limit 1');
    return (r.rows[0]?.payload as AnalysisPayload) ?? null;
  });
}

/* ──────────────────────────────── purge ──────────────────────────────── */

/** Runs as the definer, because a sessionless connection sees no rows under
 *  FORCE row level security and would delete nothing while reporting success. */
export async function purgeExpired(): Promise<number> {
  if (!HAS_DB) {
    const m = mem();
    const now = Date.now();
    let n = 0;
    for (const [id, d] of m.docs) {
      if (Date.parse(d.purge_after) >= now) continue;
      m.docs.delete(id);
      m.analyses.delete(id);
      for (const [jid, j] of m.jobs) if (j.document_id === id) m.jobs.delete(jid);
      n++;
    }
    return n;
  }
  return tx(null, async (c) => {
    const r = await c.query('select purge_expired() as n');
    return Number(r.rows[0].n);
  });
}

/** Deletes everything this session owns, right now rather than at the 24h
 *  mark — a reload asks for a fresh page, and the old document quietly coming
 *  back is the bug. No new policy needed: `session_owns_documents` already
 *  grants delete on own rows (a policy with no `for` applies to every
 *  command), jobs and analyses cascade. The explicit `where` mirrors RLS
 *  rather than relying on it alone — the two should always agree. */
export async function purgeSession(sessionId: string): Promise<number> {
  if (!HAS_DB) {
    const m = mem();
    let n = 0;
    for (const [id, d] of m.docs) {
      if (d.session_id !== sessionId) continue;
      m.docs.delete(id);
      m.analyses.delete(id);
      for (const [jid, j] of m.jobs) if (j.document_id === id) m.jobs.delete(jid);
      n++;
    }
    return n;
  }
  return tx(sessionId, async (c) => {
    const r = await c.query('delete from documents where session_id = $1', [sessionId]);
    return r.rowCount ?? 0;
  });
}

/* ──────────────────────────────── helpers ──────────────────────────────── */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID.test(s);

function toJobRow(r: Record<string, unknown>): JobRow {
  return {
    id: String(r.id),
    document_id: String(r.document_id),
    session_id: String(r.session_id),
    stage: r.stage as JobStage,
    status: r.status as Job['status'],
    deadline_at: new Date(r.deadline_at as string).toISOString(),
    error_code: (r.error_code as ErrorCode | null) ?? null,
    counts: (r.counts as Job['counts']) ?? null,
    scenario: (r.scenario as string | null) ?? null,
    created_at: new Date(r.created_at as string).toISOString(),
  };
}

/** Test seam for the backend gate. §7 has to prove the RLS policy itself fires,
 *  not that the helpers above happen to pass the right argument every time. */
export async function rawUnderSession<T = unknown>(
  sessionId: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (!HAS_DB) throw new Error('rawUnderSession requires DATABASE_URL');
  return tx(sessionId, async (c) => (await c.query(sql, params)).rows as T[]);
}
