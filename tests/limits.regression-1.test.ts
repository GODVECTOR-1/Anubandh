// Regression: ISSUE-004 — short genuine text was told it had "no parties, no obligations, no terms"
// Found by /qa on 2026-09-24
// Report: .gstack/qa-reports/qa-report-localhost-2026-09-24.md
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUpload } from '@/lib/normalize';
import { codeOf } from '@/lib/pipeline-error';
import { MIN_TEXT_CHARS, textChars } from '@/lib/limits';

/**
 * The paste box enables "Read this" at textChars(text) >= MIN_TEXT_CHARS. The
 * server has to draw its line in exactly the same place, or text the box lets
 * through is refused with copy that blames the document.
 */

const text = (n: number) => new TextEncoder().encode('x '.repeat(n));

test('the server accepts exactly what the paste box lets through', async () => {
  assert.equal(textChars('x '.repeat(MIN_TEXT_CHARS)), MIN_TEXT_CHARS);
  await assert.rejects(normalizeUpload(text(MIN_TEXT_CHARS - 1), 'p', 'text/plain'), (e) => codeOf(e) === 'not_legal_document');
  await assert.doesNotReject(normalizeUpload(text(MIN_TEXT_CHARS), 'p', 'text/plain'));
});
