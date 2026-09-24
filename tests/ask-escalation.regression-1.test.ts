// Regression: ISSUE-008 — ordinary questions tripped the "talk to a person" legal-aid interstitial
// Found by /qa on 2026-09-24
// Report: .gstack/qa-reports/qa-report-localhost-2026-09-24.md
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ask } from '@/lib/ask';
import { priyaOfferLetter } from '@/fixtures/priya-offer-letter';

/**
 * Escalation interrupts the reader with emergency contacts before anything
 * else. Matched as substrings, "fir" fired on firm, first, fire and confirm,
 * and "warrant" on warranty, all words a contract question uses every day.
 */

const outcome = (q: string) => ask(priyaOfferLetter, q).outcome;

test('everyday words that contain a trigger do not interrupt', () => {
  for (const q of [
    'Can they fire me?',
    'Can I work for a rival firm?',
    'What is my first obligation?',
    'Does the warranty cover this?',
    'Please confirm the notice period',
  ]) {
    assert.notEqual(outcome(q), 'escalate', q);
  }
});

test('the real triggers still interrupt, plurals included', () => {
  for (const q of [
    'The police filed an FIR against me',
    'There is a warrant out for me',
    'I have two hearings next week',
    'I have a court date tomorrow',
  ]) {
    assert.equal(outcome(q), 'escalate', q);
  }
});

test('advice phrases match whole words too', () => {
  assert.notEqual(outcome('What should it cost me to leave?'), 'advice');
  assert.equal(outcome('Should I sign this?'), 'advice');
});
