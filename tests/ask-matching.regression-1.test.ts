// Regression: ISSUE-002 — "How much do I owe if I leave early?" cited the non-compete, not the bond
// Found by /qa on 2026-09-24
// Report: .gstack/qa-reports/qa-report-localhost-2026-09-24.md
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ask } from '@/lib/ask';
import { priyaOfferLetter } from '@/fixtures/priya-offer-letter';

/**
 * Each question the Ask screen suggests is written from one flagged clause, so
 * its first citation has to be that clause. Anything else is an answer about a
 * different clause that still looks like an answer.
 */

const first = (q: string) => ask(priyaOfferLetter, q).citations[0]?.node_id;

test('each suggested question cites the clause it was written from, first', () => {
  for (const [q, node] of [
    ['How much do I owe if I leave early?', 'n_bond_money'],
    ['Can I join a competitor after I leave?', 'n_postterm_restraint'],
    ['What happens to my experience certificate?', 'n_certificate_withheld'],
  ]) {
    assert.equal(first(q), node, q);
  }
});

test('"how much" alone does not turn a question into one about money', () => {
  assert.equal(first('How much notice do I give?'), 'n_notice');
});
