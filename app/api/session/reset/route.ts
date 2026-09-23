import { NextResponse } from 'next/server';
import { purgeSession } from '@/lib/db';
import { readSession, SESSION_COOKIE } from '@/lib/session';

/**
 * POST /api/session/reset — a reload undoes the upload.
 *
 * Fired by ResetOnReload on every hard page reload. Deletes whatever this
 * session owns and drops the cookie, so the next render has no session to
 * find and every screen falls back to its own empty state. A no-op, not an
 * error, when there was no session to begin with — and a failed purge still
 * clears the cookie, because a stuck session is worse than an unpurged row
 * the 24h cron will take anyway.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await readSession();
  if (session) {
    try {
      await purgeSession(session);
    } catch {
      console.error('session reset failed');
    }
  }
  const res = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
