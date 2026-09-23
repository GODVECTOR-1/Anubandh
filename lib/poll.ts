/**
 * What a failed status poll means for the job it was asking about.
 *
 * The client used to treat ANY non-OK poll as a dead job and show "Something
 * broke on our side". One transient 500 on a status read — a DNS blip to the
 * database, a pooler restart, three pooled connections briefly all busy, a dev
 * server recompiling — ended a job that was perfectly healthy. Worse, it ended
 * it before any poll had claimed it, so the document sat in the database in
 * `queued` forever, never read, while the screen said nothing had been kept.
 *
 * A network error was already treated as transient ("a dropped poll is not a
 * failed job"). A 5xx is the same kind of event reported one layer up, and now
 * gets the same treatment. Any later poll can also claim a queued job and run
 * it, so simply asking again is a complete recovery rather than a hopeful one.
 */

/** Long enough to ride out a database or pooler blip; short enough that a
 *  genuinely unreachable server is reported well inside the job's own
 *  90-second deadline rather than after it. */
export const POLL_GIVE_UP_MS = 30_000;

/** At most this many polls in flight at once. The first poll can run the whole
 *  pipeline inside its request, so one long request plus one status read is
 *  the normal shape; more than that is the interval stacking requests on a
 *  server that is already slow, which is how three pooled connections run out. */
export const MAX_POLLS_IN_FLIGHT = 2;

export type PollVerdict = 'retry' | 'gone' | 'unreachable';

/**
 * @param status HTTP status of the failed poll, or 0 for a network error.
 * @param sinceLastGoodMs Time since the last poll that DID answer — or since
 *   the job was created, if none has yet.
 */
export function pollVerdict(status: number, sinceLastGoodMs: number): PollVerdict {
  // Definitive. The job is not this session's, or it no longer exists — a
  // reload in another tab purges the session. Asking again cannot change it.
  if (status === 404) return 'gone';
  // Everything else is a condition of the server at one moment. It gets a
  // bounded window rather than no window and rather than an unbounded one.
  if (sinceLastGoodMs >= POLL_GIVE_UP_MS) return 'unreachable';
  return 'retry';
}
