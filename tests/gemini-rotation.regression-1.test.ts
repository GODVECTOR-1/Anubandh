// Regression: real uploads timed out during a Gemini demand spike (2026-09-24)
// while a model in the list was answering.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { extract } from '@/lib/gemini';

// Read at call time, so setting it here is enough. GEMINI_MODEL is unset under
// the test runner, so these exercise the default list.
process.env.GEMINI_API_KEY = 'test-key';

/**
 * No network: fetch is replaced with a script of responses, and each test reads
 * back which model every attempt asked.
 */
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const ok = () =>
  new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"items":[]}' }] } }] }));
const status = (code: number) => new Response('{}', { status: code });

function script(responses: Array<() => Response>) {
  const asked: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    asked.push(String(url).split('/models/')[1].split(':')[0]);
    return (responses.shift() ?? ok)();
  }) as typeof fetch;
  return asked;
}

test('a model that rejects thinkingConfig is asked again, not skipped', async () => {
  const asked = script([() => status(503), () => status(400), ok]);
  await extract('doc', Date.now() + 30_000);
  assert.equal(asked.length, 3);
  assert.equal(asked[2], asked[1], 'the retry without thinkingConfig went to a different model');
});

test('moving to a different model does not wait', async () => {
  const asked = script([() => status(503), () => status(503), () => status(503), ok]);
  const t = Date.now();
  await extract('doc', Date.now() + 30_000);
  assert.equal(new Set(asked).size, 4, 'each attempt should ask a new model');
  assert.ok(Date.now() - t < 500, 'backoff was spent between different models: ' + (Date.now() - t) + 'ms');
});

test('a retired model (404) moves on instead of failing the document', async () => {
  const asked = script([() => status(404), ok]);
  const out = await extract('doc', Date.now() + 30_000);
  assert.deepEqual(out.items, []);
  assert.equal(asked.length, 2);
});

test('when every model is busy it keeps trying until the deadline, then says so', async () => {
  const asked = script(Array.from({ length: 40 }, () => () => status(503)));
  await assert.rejects(extract('doc', Date.now() + 8_000), /upstream_timeout/);
  assert.ok(asked.length > 6, 'gave up after one pass with time left: ' + asked.length + ' attempts');
});
