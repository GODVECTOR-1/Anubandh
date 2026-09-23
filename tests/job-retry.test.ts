import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldRequeue, MIN_RETRY_MS } from '@/lib/job-retry';
import type { ErrorCode } from '@/contracts/schema';

/**
 * The rule that decides whether a reader sees "try again" or never knows the
 * upstream hiccuped.
 *
 * It exists because a single 503 used to kill a whole job: the first upload
 * failed and the second worked, which is the bug report that produced this
 * code. The two failure modes to hold apart are retrying too little (the
 * original bug) and retrying forever (a real outage spinning up a bill).
 */

const NOW = 1_700_000_000_000;
const inMs = (ms: number) => new Date(NOW + ms).toISOString();

const decide = (o: Partial<Parameters<typeof shouldRequeue>[0]> = {}) =>
  shouldRequeue({
    code: 'upstream_timeout',
    priorErrorCode: null,
    deadlineAt: inMs(80_000),
    now: NOW,
    ...o,
  });

test('a transient failure with time left is retried', () => {
  assert.equal(decide({ code: 'upstream_timeout' }), true);
  assert.equal(decide({ code: 'rate_limited' }), true);
});

test('a verdict about the DOCUMENT is never retried', () => {
  // Retrying these would spend a model call to reach the same answer, and for
  // not_legal_document it would also tell the reader "try again" about a
  // decision that will not change.
  for (const code of [
    'not_legal_document', 'encrypted_document', 'oversize_document',
    'ocr_quality', 'internal', 'span_not_found',
  ] as ErrorCode[]) {
    assert.equal(decide({ code }), false, code + ' was retried');
  }
});

test('the second strike is terminal', () => {
  // error_code on a re-queued row is the marker that the one retry is spent.
  // Without this a real outage spins claim/fail/re-queue for the whole job.
  assert.equal(decide({ priorErrorCode: 'upstream_timeout' }), false);
  assert.equal(decide({ priorErrorCode: 'rate_limited' }), false);
});

test('a deadline too close to be useful is terminal', () => {
  // Handing the job back with seconds left just makes the next poll do the
  // same arithmetic and hand it back again.
  assert.equal(decide({ deadlineAt: inMs(MIN_RETRY_MS - 1) }), false);
  assert.equal(decide({ deadlineAt: inMs(MIN_RETRY_MS) }), false, 'exactly the floor must not retry');
  assert.equal(decide({ deadlineAt: inMs(MIN_RETRY_MS + 1) }), true);
});

test('a deadline already past is terminal', () => {
  assert.equal(decide({ deadlineAt: inMs(-1) }), false);
  assert.equal(decide({ deadlineAt: inMs(-100_000) }), false);
});

test('an unparseable deadline is terminal rather than infinite', () => {
  // Date.parse returns NaN, and every comparison with NaN is false. Relying on
  // that by accident is how "> MIN_RETRY_MS" silently becomes "never retry"
  // or, with the comparison flipped, "always retry".
  assert.equal(decide({ deadlineAt: 'not-a-date' }), false);
  assert.equal(decide({ deadlineAt: '' }), false);
});
