import type { ErrorCode } from '@/contracts/schema';

/**
 * Whether a failed job gets one more go, or becomes the reader's problem.
 *
 * This lived inside the poll route's catch block, where it could only be
 * exercised by making a live Gemini call fail on cue. It is a decision over
 * four values and nothing else, so it belongs out here where the awkward cases
 * — the second strike, the deadline with four seconds left — can be stated
 * directly instead of arranged.
 */

/** The document is fine, the call was not. Both are conditions of the upstream
 *  at one moment, and neither is a verdict on what the reader uploaded. */
export const TRANSIENT = new Set<ErrorCode>(['upstream_timeout', 'rate_limited']);

/** Below this, handing the job back is theatre: the next poll would claim it,
 *  find too little time for a single attempt, and hand it back again. */
export const MIN_RETRY_MS = 15_000;

export function shouldRequeue(opts: {
  /** The code this attempt failed with. */
  code: ErrorCode;
  /** What was already on the row. Non-null means a retry has been spent —
   *  the marker exists so no migration was needed for an attempt counter. */
  priorErrorCode: ErrorCode | null;
  /** The JOB's deadline, not this request's slice of it. */
  deadlineAt: string;
  now: number;
}): boolean {
  if (!TRANSIENT.has(opts.code)) return false;
  // Second strike. A real outage would otherwise spin claim/fail/re-queue for
  // the whole ninety seconds, paying for a model call each time, to show the
  // same screen in the end.
  if (opts.priorErrorCode !== null) return false;
  const remaining = Date.parse(opts.deadlineAt) - opts.now;
  if (!Number.isFinite(remaining)) return false;
  return remaining > MIN_RETRY_MS;
}
