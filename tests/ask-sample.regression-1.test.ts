// Regression: ISSUE-001 — Ask said "There is no document open" while showing the sample
// Found by /qa on 2026-09-24
// Report: .gstack/qa-reports/qa-report-localhost-2026-09-24.md
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/no-db';
import { POST } from '@/app/api/ask/route';
import { priyaOfferLetter } from '@/fixtures/priya-offer-letter';

/**
 * The landing page links straight to the sample, and the Ask screen sends the
 * sample's id with every question. That id is not in the database, so it used
 * to resolve to nothing and every question — including the three the screen
 * suggests — was answered "There is no document open".
 *
 * These call the route itself, the way the screen does. The sample path needs
 * no session and no request scope, which is exactly why it can be tested here.
 */

const ask = async (question: string) => {
  const res = await POST(
    new Request('http://localhost/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question, document_id: priyaOfferLetter.document.id }),
    }),
  );
  return { status: res.status, body: (await res.json()) as { outcome: string; answer: string; citations: unknown[]; handoff: string | null } };
};

test('a question about the sample is answered from the sample, with citations', async () => {
  const { status, body } = await ask('Can I join a competitor after I leave?');
  assert.equal(status, 200);
  assert.notEqual(body.outcome, 'no_coverage', 'answered "no document open" for the sample on screen');
  assert.equal(body.outcome, 'information');
  assert.ok(body.citations.length > 0, 'an information answer must cite');
  assert.doesNotMatch(body.answer, /no document open/i);
});

test('every question the Ask screen suggests gets a real answer on the sample', async () => {
  // The three the screen offers. Being told "no document open" by the app's
  // own suggestion is the precise failure this replaced.
  for (const q of [
    'Can I join a competitor after I leave?',
    'How much do I owe if I leave early?',
    'What happens to my experience certificate?',
  ]) {
    const { body } = await ask(q);
    assert.notEqual(body.outcome, 'no_coverage', q + ' -> no_coverage');
  }
});

test('the advice boundary still holds on the sample', async () => {
  // It used to be unreachable: the no-document reply came first.
  const { body } = await ask('Should I sign this contract?');
  assert.equal(body.outcome, 'advice');
  assert.ok(body.handoff && body.handoff.length > 0, 'advice must hand off to a lawyer');
});
