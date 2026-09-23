import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { purgeExpired } from '@/lib/db';

/**
 * GET /api/cron/purge — the 24-hour promise, kept.
 *
 * The landing page says "Nothing you upload is kept beyond 24 hours." That is a
 * sentence this route makes true. If it stops running the sentence is false, so
 * a failing purge is a correctness bug, not a chore — hence the non-200 on
 * failure, which is what a cron monitor alerts on.
 *
 * Scheduled daily in vercel.json (which cannot hold comments, so the reason
 * lives here): Vercel Hobby allows one cron invocation per day and rejects an
 * hourly schedule at deploy. Daily still keeps the 24h promise — purge_after is
 * a timestamp, not a bucket, and every expired row goes on the next run.
 * Tighten to '0 * * * *' on Pro.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Compared in constant time and never with `===`. A public purge endpoint is a
 *  delete button for strangers, and a leaky comparison is a slower one. */
function authorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const header = request.headers.get('authorization') ?? '';
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : header;

  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const deleted = await purgeExpired();
    // A count, never a list. Naming what was deleted would put filenames in a
    // log line on the way out of the only route whose job is to remove them.
    return NextResponse.json({ deleted }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('purge failed:', (e as Error)?.message);
    return NextResponse.json({ error: 'purge_failed' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
