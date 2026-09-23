import { NextResponse } from 'next/server';
import { getJob, updateJob } from '@/lib/db';
import { readSession } from '@/lib/session';

/**
 * POST /api/jobs/:id/cancel
 *
 * The intake screen ships a cancel button, and a button that sets a flag
 * nothing reads is not a cancel button. Cancelling is terminal: the next poll
 * sees `cancelled` and stops, rather than the pipeline quietly finishing and
 * dropping the reader into results they asked not to see.
 */
export const runtime = 'nodejs';

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await readSession();

  const job = await getJob(session, id);
  // 404 for "missing" and for "not yours" alike — see app/api/jobs/[id]/route.ts.
  if (!job) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });

  const done = job.status === 'done' || job.status === 'failed' || job.status === 'timed_out';
  const out = done ? job : (await updateJob(session!, id, { status: 'cancelled' })) ?? job;

  return NextResponse.json(
    {
      id: out.id,
      document_id: out.document_id,
      stage: out.stage,
      status: out.status,
      deadline_at: out.deadline_at,
      error_code: out.error_code,
      counts: out.counts,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
