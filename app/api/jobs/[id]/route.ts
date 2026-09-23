import { NextResponse } from 'next/server';
import type { Job, JobStage } from '@/contracts/schema';
import { claimJob, getDocument, getJob, putAnalysis, saveExtraction, updateJob, type JobRow } from '@/lib/db';
import { failureFor, HANGS, isScenario, pace } from '@/lib/demo';
import type { Normalized } from '@/lib/normalize';
import { codeOf } from '@/lib/pipeline-error';
import { shouldRequeue } from '@/lib/job-retry';
import { runPipeline, type Item } from '@/lib/pipeline';
import { readSession } from '@/lib/session';

/**
 * GET /api/jobs/:id — the poll.
 *
 * Two things happen lazily on this read, both because Vercel Hobby has no
 * background worker to sweep anything:
 *
 *   1. TIMEOUT. `timed_out` exists because a hang is not an error — without it
 *      the client polls `running` forever. If `now() > deadline_at` on a queued
 *      or running job, this is where it becomes `timed_out`. There is no
 *      sweeper; adding one would be a misreading of the hosting constraint.
 *
 *   2. THE PIPELINE ITSELF. The expensive stages run inside whichever poll
 *      claims the job first. The claim is atomic, so overlapping polls do not
 *      each start their own extraction against the same document.
 */
export const runtime = 'nodejs';
/** Vercel Hobby caps a serverless function at 60 seconds. Asking for 90 does
 *  not get 90, it gets a function killed at 60 with the job still `running` —
 *  so the number here is the real ceiling and the pipeline is given less. */
export const maxDuration = 60;

/** The slice of THIS request the pipeline may use, leaving room to write the
 *  result before the platform kills us. The job's own deadline still applies;
 *  whichever is nearer wins. */
const REQUEST_BUDGET_MS = 50_000;

const TERMINAL = new Set<Job['status']>(['done', 'failed', 'cancelled', 'timed_out']);

const toUpdate = (j: JobRow): Job => ({
  id: j.id,
  document_id: j.document_id,
  stage: j.stage,
  status: j.status,
  deadline_at: j.deadline_at,
  error_code: j.error_code,
  counts: j.counts,
});

const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** 404 for "missing" and for "not yours", byte-identical. A 403 confirms the id
 *  exists, which turns an id into an oracle you can enumerate. */
const notFound = () => reply({ error: 'not_found' }, 404);

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await readSession();

  const job = await getJob(session, id);
  if (!job) return notFound();

  if (TERMINAL.has(job.status)) return reply(toUpdate(job));

  if (Date.now() > Date.parse(job.deadline_at)) {
    const out = await updateJob(session!, id, { status: 'timed_out', error_code: 'upstream_timeout' });
    return reply(toUpdate(out ?? { ...job, status: 'timed_out', error_code: 'upstream_timeout' }));
  }

  if (job.scenario) return reply(toUpdate(await tickDemo(session!, job)));

  if (job.status === 'queued' && (await claimJob(session!, id))) {
    return reply(toUpdate(await runReal(session!, job)));
  }

  // Someone else's poll is running the pipeline. Report what is on the row.
  return reply(toUpdate(job));
}

/* ───────────────────────────── the demo clock ───────────────────────────── */

/** A sample's stage is a function of elapsed time, not of work done. The dwell
 *  matches lib/mock-job.ts so the sample and a real run feel like one product. */
async function tickDemo(session: string, job: JobRow): Promise<JobRow> {
  const elapsed = Date.now() - Date.parse(job.created_at);
  const scenario = job.scenario!;
  if (!isScenario(scenario)) return job;

  const failure = failureFor(scenario);
  if (failure && elapsed >= failure.at) {
    const status = failure.code === 'upstream_timeout' ? 'timed_out' : 'failed';
    const at = pace(Math.min(elapsed, failure.at)).stage;
    return (await updateJob(session, job.id, { status, stage: at, error_code: failure.code })) ?? job;
  }

  const { stage, done: finished } = pace(elapsed);
  // A hang never completes. The deadline check at the top of GET is what ends
  // it, which is the whole point of the scenario.
  const done = finished && !HANGS.has(scenario);
  // Counts do not exist until extraction returns. A zero before then is a
  // number the reader will believe.
  const counts: Job['counts'] =
    stage === 'verifying' ? { found: 41, verified: 22 } : stage === 'checking_law' ? { found: 41, verified: 38 } : null;

  return (
    (await updateJob(session, job.id, {
      stage,
      status: done ? 'done' : 'running',
      counts: done ? { found: 41, verified: 38 } : counts,
    })) ?? job
  );
}

/* ────────────────────────────── the real run ────────────────────────────── */

async function runReal(session: string, job: JobRow): Promise<JobRow> {
  const doc = await getDocument(session, job.document_id);
  if (!doc?.normalized) {
    return (await updateJob(session, job.id, { status: 'failed', error_code: 'internal' })) ?? job;
  }

  // The job may have been created a minute ago, but this REQUEST started now
  // and has its own ceiling. The pipeline gets whichever runs out first.
  const effectiveDeadline = new Date(
    Math.min(Date.parse(job.deadline_at), Date.now() + REQUEST_BUDGET_MS),
  ).toISOString();

  const meta = (doc.normalize_meta ?? {}) as Partial<Normalized>;
  const normalized: Normalized = {
    text: doc.normalized,
    sourceKind: meta.sourceKind ?? 'paste',
    pageCount: meta.pageCount ?? null,
    pageOffsets: meta.pageOffsets ?? [{ page: 1, start: 0, end: doc.normalized.length }],
    offsetMap: meta.offsetMap ?? [{ raw: 0, normalized: 0 }],
    sha256: meta.sha256 ?? '0'.repeat(64),
  };

  try {
    const { payload } = await runPipeline({
      doc: normalized,
      documentId: job.document_id,
      jobId: job.id,
      deadlineAt: effectiveDeadline,
      state: null,
      // On a retry this is already populated, so the expensive call is skipped
      // entirely. The row is immutable once normalised, so the extraction it
      // produced is still exactly right.
      cachedItems: (doc.extraction as Item[] | null) ?? null,
      // Stored the moment it arrives, BEFORE the stages that might still fail.
      // Storing it after a successful run would cache only the runs that never
      // needed a cache.
      // Failing to cache is not failing the job. This is an optimisation for
      // an attempt that may never happen, so a storage problem here — an
      // unapplied migration being the obvious one — must not throw away an
      // extraction that succeeded.
      onExtracted: async (items) => {
        try {
          await saveExtraction(session, job.document_id, items);
        } catch {
          console.error('could not cache the extraction; a retry would redo it');
        }
      },
      // Progress is written to the row as it happens, so a concurrent poll sees
      // the real stage rather than a spinner that has not moved.
      onStage: async (stage: JobStage, counts) => {
        await updateJob(session, job.id, { stage, status: 'running', counts });
      },
    });

    await putAnalysis(session, job.document_id, payload);
    return (
      // error_code is cleared because a retry that succeeded is not a job that
      // failed — the marker set above has done its work and should not outlive
      // it on a finished row.
      (await updateJob(session, job.id, {
        stage: 'checking_law',
        status: 'done',
        counts: payload.job.counts,
        error_code: null,
      })) ?? job
    );
  } catch (e) {
    const code = codeOf(e);
    if (code === 'internal') console.error('pipeline failed:', (e as Error)?.message);

    // A flaky upstream is not a failed document. This request only ever held
    // REQUEST_BUDGET_MS of the job's ninety seconds, so a 503 — or a call that
    // overran the stage budget it was measured against — still leaves time to
    // try again. Hand the job back to `queued` and the next poll re-claims it.
    //
    // Marking it terminal here is what made the first upload fail and the
    // reader's second attempt succeed: the work was recoverable, the verdict
    // was not. Measured, on a cold process: a trivial Gemini call took 4.6s to
    // 13.8s and two of four returned 503, against a 12s classify budget.
    //
    // Exactly one automatic retry, and `error_code` on a re-queued row is the
    // marker that says it has been spent — a second strike falls through to
    // terminal below. Bounding it by the job deadline alone was not enough: a
    // real outage then span claim/fail/re-queue for the full ninety seconds,
    // paying for a model call each time, to show the same screen in the end.
    // One retry covers the cold call this exists for and fails fast otherwise.
    if (shouldRequeue({ code, priorErrorCode: job.error_code, deadlineAt: job.deadline_at, now: Date.now() })) {
      return (await updateJob(session, job.id, { status: 'queued', error_code: code })) ?? job;
    }

    return (
      (await updateJob(session, job.id, {
        status: code === 'upstream_timeout' ? 'timed_out' : 'failed',
        error_code: code,
      })) ?? job
    );
  }
}
