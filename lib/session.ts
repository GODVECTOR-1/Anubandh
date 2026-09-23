import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * Anonymous ownership. There is no account, no login, no password reset — just
 * an opaque id minted on first upload and carried in a signed httpOnly cookie.
 *
 * Signed rather than bare so the id cannot be swapped for someone else's by
 * editing the cookie. httpOnly so no script on the page, ours or injected, can
 * read it. The id is the ONLY thing standing between one reader's document and
 * another's, which is why the signature check is constant-time and why an
 * unverifiable cookie is discarded rather than repaired.
 */

export const SESSION_COOKIE = 'anubandh_sid';

/** Dev fallback keeps a restarted dev server from orphaning every open tab.
 *  Production refuses to start without a real one — a predictable signing key
 *  is the same as no signature at all. */
function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is required in production (32+ random bytes).');
  }
  return 'anubandh-dev';
}

const sign = (id: string) => createHmac('sha256', secret()).update(id).digest('hex');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns the id only if the signature verifies. Anything else is treated as
 *  no session at all, which downstream renders as an empty state — never as a
 *  guess at whose document this might be. */
export function parseSessionCookie(raw: string | undefined): string | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot < 1) return null;
  const id = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  if (!UUID.test(id)) return null;

  const expected = sign(id);
  if (mac.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return id.toLowerCase();
}

export const serializeSessionCookie = (id: string) => id + '.' + sign(id);

export const newSessionId = () => randomUUID();

/** Read-only. Server Components cannot set cookies, so a page that finds no
 *  session renders its empty state; minting happens on the upload route. */
export async function readSession(): Promise<string | null> {
  const jar = await cookies();
  return parseSessionCookie(jar.get(SESSION_COOKIE)?.value);
}

/** The attributes are the security property, so they live in one place rather
 *  than being retyped at each call site. `secure` is dropped outside production
 *  only because http://localhost would otherwise silently discard the cookie. */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 24,        // matches the 24h purge; a cookie outliving the row is a dead pointer
} as const;
