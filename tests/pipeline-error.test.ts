import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PipelineError, codeOf } from '@/lib/pipeline-error';

/**
 * Small, and worth testing anyway: this decides what a reader is told when
 * something goes wrong.
 *
 * Every code here has its own copy and its own recovery action, and `internal`
 * is the only one that says "this is our fault, not your document". Widening
 * that mapping by accident would start blaming readers for our bugs, or —
 * worse in the other direction — blame ourselves for a document we genuinely
 * cannot read, and send them to try again forever.
 */

test('a PipelineError reports its own code', () => {
  assert.equal(codeOf(new PipelineError('not_legal_document')), 'not_legal_document');
  assert.equal(codeOf(new PipelineError('rate_limited')), 'rate_limited');
});

test('the message is optional and defaults to the code', () => {
  assert.equal(new PipelineError('encrypted_document').message, 'encrypted_document');
  assert.equal(new PipelineError('internal', 'pdf open failed').message, 'pdf open failed');
  assert.equal(new PipelineError('internal', 'pdf open failed').code, 'internal');
});

test('it is a real Error, so a catch that rethrows keeps a stack', () => {
  const e = new PipelineError('ocr_quality');
  assert.ok(e instanceof Error);
  assert.equal(e.name, 'PipelineError');
  assert.ok(typeof e.stack === 'string' && e.stack.length > 0);
});

test('anything else is OURS, and says so', () => {
  // The important direction: an unexpected throw must not be dressed up as a
  // verdict about the reader's document.
  for (const thrown of [
    new Error('connection reset'),
    new TypeError('undefined is not a function'),
    'a bare string',
    null,
    undefined,
    { code: 'not_legal_document' }, // shaped like one, but not one
    42,
  ]) {
    assert.equal(codeOf(thrown), 'internal', 'mapped ' + String(thrown) + ' to something other than internal');
  }
});
