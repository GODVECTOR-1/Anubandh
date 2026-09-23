'use client';

import type { Job } from '@/contracts/schema';
import type { JobUpdate, Scenario } from '@/lib/mock-job';

/**
 * The real pipeline, in the shape the intake screen was already built for.
 *
 * Transport only. Same stage vocabulary, same `JobUpdate` payloads, same cancel
 * function — the intake screen was built against this contract and keeps every
 * line of it. What changed is that the stages now describe work that happened.
 *
 * There is no background worker on Vercel, so the pipeline runs inside whichever
 * poll claims the job. That request can take half a minute, which is why a
 * separate status poll runs alongside it: without one the screen would sit on
 * "Reading your document" until everything was already finished.
 */

export type JobInput =
  | { kind: 'scenario'; scenario: Scenario; label: string }
  | { kind: 'file'; file: File }
  | { kind: 'text'; text: string; label: string };

const POLL_MS = 1000;
/** Past 25 seconds, change the MESSAGE, not the spinner. A spinner that has not
 *  changed in half a minute reads as a hang whether or not it is one. */
const PATIENCE_MS = 25_000;
const PATIENCE_COPY =
  'Still working. Long documents take longer, and we would rather be slow than wrong.';

const TERMINAL = new Set<Job['status']>(['done', 'failed', 'cancelled', 'timed_out']);

function formFor(input: JobInput): FormData {
  const form = new FormData();
  if (input.kind === 'scenario') {
    form.set('scenario', input.scenario);
    form.set('filename', input.label);
  } else if (input.kind === 'file') {
    form.set('file', input.file);
    form.set('filename', input.file.name);
  } else {
    form.set('text', input.text);
    form.set('filename', input.label);
  }
  return form;
}

export function runJob(input: JobInput, onUpdate: (job: JobUpdate) => void): () => void {
  let stopped = false;
  let jobId: string | null = null;
  let timer: number | null = null;
  const started = Date.now();
  const controller = new AbortController();

  const emit = (job: JobUpdate) => {
    if (stopped) return;
    const slow = !TERMINAL.has(job.status) && Date.now() - started > PATIENCE_MS;
    onUpdate(slow ? { ...job, message: job.message ?? PATIENCE_COPY } : job);
    if (TERMINAL.has(job.status)) stop();
  };

  /** A failure with no job behind it still has to reach the screen in the shape
   *  the screen renders, or the reader gets a spinner that never resolves. */
  const emitFailure = (code: JobUpdate['error_code']) =>
    emit({
      id: 'job_local',
      document_id: 'doc_local',
      stage: 'reading',
      status: 'failed',
      deadline_at: new Date(started + 90_000).toISOString(),
      error_code: code,
      counts: null,
    });

  const stop = () => {
    stopped = true;
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  };

  void (async () => {
    let created: { document_id: string; job_id: string };
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        body: formFor(input),
        signal: controller.signal,
      });
      const body = await res.json();
      if (!res.ok) return emitFailure(body?.error ?? 'internal');
      created = body;
    } catch {
      if (!stopped) emitFailure('internal');
      return;
    }
    if (stopped) return;
    jobId = created.job_id;

    const poll = async () => {
      if (stopped || !jobId) return;
      try {
        const res = await fetch('/api/jobs/' + jobId, { cache: 'no-store', signal: controller.signal });
        if (!res.ok) return emitFailure('internal');
        emit(await res.json());
      } catch {
        /* a dropped poll is not a failed job — the next one answers */
      }
    };

    // The driver claims the job and runs the pipeline inside its own request;
    // the interval reports progress while it does.
    void poll();
    timer = window.setInterval(poll, POLL_MS);
  })();

  return () => {
    if (stopped) return;
    const id = jobId;
    stop();
    controller.abort();
    // Tell the server too. A cancel that only stops the polling leaves the job
    // running and bills for an analysis nobody will read.
    if (id) void fetch('/api/jobs/' + id + '/cancel', { method: 'POST', keepalive: true }).catch(() => {});
    onUpdate({
      id: id ?? 'job_local',
      document_id: 'doc_local',
      stage: 'reading',
      status: 'cancelled',
      deadline_at: new Date(started + 90_000).toISOString(),
      error_code: null,
      counts: null,
    });
  };
}
