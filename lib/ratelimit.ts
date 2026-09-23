import 'server-only';
import { createHmac } from 'node:crypto';
import { HAS_DB, withClient } from '@/lib/db';

/**
 * A fixed-window limiter for the two routes that cost money.
 *
 * /api/documents and /api/ask are anonymous and both reach Gemini. Without
 * this, a short loop drains the project's quota and the owner's card, and the
 * service is down for everyone else — which for a submission is a worse
 * outage than any bug in it.
 *
 * KEYED ON THE NETWORK ADDRESS, NOT THE SESSION. The session id lives in a
 * cookie the caller controls; limiting per session politely asks an abuser to
 * keep their cookie. This keys on the forwarded address instead, so dropping
 * the cookie buys nothing.
 *
 * The address is never stored. `bucket` is an HMAC of it under SESSION_SECRET,
 * so the table holds no personal data and cannot be read back into a list of
 * who used the service. An IP address is personal data, and a product whose
 * whole promise is that nothing is kept for more than 24 hours should not
 * quietly start a permanent log of its visitors in order to protect itself.
 *
 * ponytail: fixed window, not sliding. A caller can spend the tail of one
 * window and the head of the next back to back, which is up to 2x the limit
 * across the boundary. That is fine for a spend cap and wrong for anything
 * that must be exact. Move to a sliding window only if the bill says so.
 */

export type RateVerdict = { ok: true } | { ok: false; retryAfter: number };

/** Per-process fallback, for `npm run dev` with no DATABASE_URL and for the
 *  gates. Per-instance and lost on restart, which is exactly why production
 *  needs the table: serverless has no shared memory to count in. */
type Bucket = { count: number; windowStart: number };
type G = typeof globalThis & { __anubandhRate?: Map<string, Bucket> };
const mem = (): Map<string, Bucket> => {
  const g = globalThis as G;
  g.__anubandhRate ??= new Map();
  return g.__anubandhRate;
};

/**
 * The caller's address, as the platform reports it.
 *
 * `x-forwarded-for` is a list appended to by each proxy, and only the entry
 * the EDGE added can be trusted — a client can send the header itself, so the
 * first entry is whatever they felt like claiming. On Vercel the rightmost is
 * the real peer, so that is the one taken.
 */
export function callerKey(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return headers.get('x-real-ip') ?? 'unknown';
}

/** One-way, and salted with a secret the client never sees, so the stored
 *  bucket cannot be brute-forced back to an address from the table alone. */
function hash(scope: string, key: string): string {
  const secret = process.env.SESSION_SECRET ?? 'dev-only-insecure';
  return scope + ':' + createHmac('sha256', secret).update(key).digest('hex').slice(0, 32);
}

/**
 * Count one hit. Returns whether the caller may proceed.
 *
 * FAILS OPEN. If the database is unreachable the request is allowed through:
 * a limiter that takes the whole service down when its own storage blinks has
 * converted a spending risk into an availability incident, which is a worse
 * trade. The spend is still bounded by the job deadline and by Gemini's own
 * quota.
 */
export async function rateLimit(
  scope: string,
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateVerdict> {
  const bucket = hash(scope, key);

  if (!HAS_DB) {
    const m = mem();
    const now = Date.now();
    const b = m.get(bucket);
    if (!b || now - b.windowStart >= windowSec * 1000) {
      m.set(bucket, { count: 1, windowStart: now });
      return { ok: true };
    }
    b.count += 1;
    if (b.count > limit) {
      return { ok: false, retryAfter: Math.ceil((b.windowStart + windowSec * 1000 - now) / 1000) };
    }
    return { ok: true };
  }

  try {
    return await withClient(async (c) => {
      // One statement, so two requests arriving together cannot both read a
      // count of 9 and both write 10. The row is locked by the upsert.
      const r = await c.query(
        `insert into rate_limits (bucket, count, window_start)
         values ($1, 1, now())
         on conflict (bucket) do update set
           count = case when rate_limits.window_start < now() - make_interval(secs => $2::double precision)
                        then 1 else rate_limits.count + 1 end,
           window_start = case when rate_limits.window_start < now() - make_interval(secs => $2::double precision)
                        then now() else rate_limits.window_start end
         returning count, extract(epoch from (window_start + make_interval(secs => $2::double precision) - now())) as retry_after`,
        [bucket, windowSec],
      );
      const row = r.rows[0] as { count: number; retry_after: string };
      if (Number(row.count) > limit) {
        return { ok: false, retryAfter: Math.max(1, Math.ceil(Number(row.retry_after))) };
      }
      return { ok: true };
    });
  } catch {
    // No identifier and no address in the log — the point of hashing the key
    // is undone by printing the thing it protects.
    console.error('rate limit check failed; allowing the request');
    return { ok: true };
  }
}
