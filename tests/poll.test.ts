import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/no-db';
import { pollVerdict, pollDelay, POLL_GIVE_UP_MS, POLL_HIDDEN_MS } from '@/lib/poll';
import { isTransientConnectError } from '@/lib/db';

/**
 * The two decisions behind "Something broke on our side" on a document that
 * was fine.
 *
 * The bug: one transient 500 on a status poll ended the job on the client, and
 * one DNS blip while connecting to the database failed the upload on the
 * server. Both are conditions of the network at one moment and neither is a
 * fact about the reader's document.
 */

/* ───────────────────────────── the client poll ───────────────────────────── */

test('a transient server error is retried, not reported as a dead job', () => {
  // The line that used to be `if (!res.ok) return emitFailure('internal')`.
  for (const status of [500, 502, 503, 504]) {
    assert.equal(pollVerdict(status, 1_000), 'retry', status + ' ended a healthy job');
  }
});

test('a network error is retried, as it always was', () => {
  assert.equal(pollVerdict(0, 1_000), 'retry');
});

test('404 is final, because asking again cannot change it', () => {
  // Not this session's job, or purged by a reload in another tab.
  assert.equal(pollVerdict(404, 0), 'gone');
  assert.equal(pollVerdict(404, POLL_GIVE_UP_MS * 2), 'gone');
});

test('retrying is bounded, so a dead server is still reported', () => {
  // Without a bound, "retry transient errors" becomes a spinner that never
  // resolves — the failure the error screen exists to prevent.
  assert.equal(pollVerdict(503, POLL_GIVE_UP_MS - 1), 'retry');
  assert.equal(pollVerdict(503, POLL_GIVE_UP_MS), 'unreachable');
  assert.equal(pollVerdict(0, POLL_GIVE_UP_MS + 5_000), 'unreachable');
});

test('the give-up window is inside the job’s own 90-second deadline', () => {
  // Reporting "unreachable" after the job would have timed out anyway would
  // make the bound pointless.
  assert.ok(POLL_GIVE_UP_MS < 90_000);
});

/* ─────────────────────────── the server connection ─────────────────────────── */

const err = (code: string, message = code) => Object.assign(new Error(message), { code });

test('connection failures that happen before anything is sent are retryable', () => {
  for (const code of ['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE']) {
    assert.equal(isTransientConnectError(err(code)), true, code + ' was not retried');
  }
  assert.equal(isTransientConnectError(new Error('Connection terminated unexpectedly')), true);
});

test('the exact error seen on this project is retryable', () => {
  // What `npm run migrate` printed from the development machine, verbatim in
  // shape, before succeeding on the next attempt.
  const seen = err('ENOTFOUND', 'getaddrinfo ENOTFOUND aws-0-ap-southeast-1.pooler.supabase.com');
  assert.equal(isTransientConnectError(seen), true);
});

test('query errors are NOT retried, because they may already have committed', () => {
  // A failed statement inside a transaction might have applied. Retrying it is
  // how a document gets written twice.
  for (const e of [
    err('23505', 'duplicate key value violates unique constraint'),
    err('42P01', 'relation "documents" does not exist'),
    err('42501', 'permission denied for table documents'),
    new Error('The anubandh_app role is missing'),
  ]) {
    assert.equal(isTransientConnectError(e), false, 'retried: ' + e.message);
  }
});

test('a pooled-connection timeout is not retried, because it has already waited', () => {
  // Three times connectionTimeoutMillis is a 24-second upload.
  assert.equal(isTransientConnectError(new Error('timeout exceeded when trying to connect')), false);
});

test('odd throwables do not crash the classifier', () => {
  for (const e of [null, undefined, 'a string', 42, {}, { code: 42 }]) {
    assert.equal(isTransientConnectError(e), false);
  }
});

/* ──────────────────────────── the poll schedule ──────────────────────────── */

test('the first seconds stay responsive, because early stages change quickly', () => {
  assert.equal(pollDelay(0, false), 1_000);
  assert.equal(pollDelay(9_999, false), 1_000);
});

test('the interval widens once the pipeline is into its long model call', () => {
  assert.equal(pollDelay(10_000, false), 2_000);
  assert.equal(pollDelay(29_999, false), 2_000);
  assert.equal(pollDelay(30_000, false), 3_000);
  assert.equal(pollDelay(89_000, false), 3_000);
});

test('it never widens past the point a stuck job would go unnoticed', () => {
  // The give-up window must still see several attempts at the widest interval,
  // or "retry transient failures" quietly becomes "one attempt, then give up".
  const widest = Math.max(pollDelay(89_000, false), POLL_HIDDEN_MS);
  assert.ok(POLL_GIVE_UP_MS / widest >= 5, 'fewer than five attempts fit inside the give-up window');
});

test('a hidden tab slows right down, whenever it is hidden', () => {
  for (const elapsed of [0, 5_000, 20_000, 60_000]) {
    assert.equal(pollDelay(elapsed, true), POLL_HIDDEN_MS);
  }
});

test('the schedule costs far fewer requests than one a second', () => {
  // A 45-second reading, polled on the schedule versus every second.
  let t = 0;
  let polls = 0;
  while (t < 45_000) {
    t += pollDelay(t, false);
    polls++;
  }
  assert.ok(polls <= 25, polls + ' polls for a 45-second reading');
  assert.ok(polls < 45 * 0.6, 'saved less than 40% of the requests');
});
