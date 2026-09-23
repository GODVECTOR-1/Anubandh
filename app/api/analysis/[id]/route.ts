import { NextResponse } from 'next/server';
import { getAnalysis } from '@/lib/analysis';

/**
 * GET /api/analysis/:id — the finished thing.
 *
 * `no-store`, like every job response: an analysis cached at the edge would be
 * served to whoever asks for that id next, which is the one thing the whole
 * ownership design exists to prevent.
 */
export const runtime = 'nodejs';

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const analysis = await getAnalysis(id);

  // Identical body and status for "no such document" and "not yours". Anything
  // that told them apart — a different message, a different code, a measurably
  // different response time — turns an id into an oracle.
  if (!analysis) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json(analysis, { headers: { 'Cache-Control': 'no-store' } });
}
