// Regression: ISSUE-007 — the Ask screen's fallback suggestion was answered as a request for advice
// Found by /qa on 2026-09-24
// Report: .gstack/qa-reports/qa-report-localhost-2026-09-24.md
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ask, seedQuestions } from '@/lib/ask';
import { priyaOfferLetter as sample } from '@/fixtures/priya-offer-letter';

/**
 * The sample has three kinds of flag, so it never shows the fallback question
 * that pads the list for most real uploads. Fewer flags bring it out.
 */
test('no question the screen suggests is one it then declines to answer', () => {
  const variants = [sample, { ...sample, flags: [] }, ...sample.flags.map((f) => ({ ...sample, flags: [f] }))];
  for (const analysis of variants) {
    for (const q of seedQuestions(analysis)) {
      assert.equal(ask(analysis, q).outcome, 'information', q);
    }
  }
});
