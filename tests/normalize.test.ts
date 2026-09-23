import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeText, mapper, pageAt, paragraphAt } from '@/lib/normalize';

/**
 * The offset map is the product's central claim.
 *
 * "Every point traced back to the exact words it came from" is only true if a
 * position in the normalised text can be turned back into a position in the
 * file the reader is holding. If this drifts, the app highlights the wrong
 * sentence while looking exactly as confident as before — the one failure the
 * whole design exists to prevent.
 *
 * check-fixture exercises this through a whole pipeline run. These go at the
 * function directly, where the awkward inputs can be written down.
 */

test('plain text is unchanged and maps one to one', () => {
  const raw = 'The Employee shall serve ninety days.';
  const { text, offsetMap } = normalizeText(raw);
  assert.equal(text, raw);
  const to = mapper(offsetMap, text.length);
  for (let i = 0; i < raw.length; i++) assert.equal(to(i), i);
});

test('typographic characters fold one-for-one, so no offset moves', () => {
  // Every substitution in FOLD is a single character for a single character
  // precisely so the map stays identity across them.
  const raw = 'the “Employee’s” fee — net‑30';
  const { text, offsetMap } = normalizeText(raw);
  assert.equal(text, 'the "Employee\'s" fee - net-30');
  assert.equal(text.length, raw.length);
  const to = mapper(offsetMap, text.length);
  assert.equal(to(4), 4);
  assert.equal(to(raw.length - 1), raw.length - 1);
});

test('a run of spaces collapses and the map records the divergence', () => {
  const raw = 'Rs.      2,00,000';
  const { text, offsetMap } = normalizeText(raw);
  assert.equal(text, 'Rs. 2,00,000');
  const to = mapper(offsetMap, text.length);
  // The amount begins at raw index 9 and normalised index 4; a map that did
  // not record the collapse would send the highlight five characters early.
  assert.equal(raw.slice(9, 16), '2,00,00');
  assert.equal(text.slice(to(9), to(9) + 7), '2,00,00');
});

test('every raw index maps back to the same text it named', () => {
  // The property that matters, stated as a property rather than as examples.
  const raw = 'Clause  9.2\r\n\r\n\r\nThe  Employee shall “pay”   Rs. 2,00,000/-\n\nwithin  30 days.';
  const { text, offsetMap } = normalizeText(raw);
  const to = mapper(offsetMap, text.length);
  for (const needle of ['9.2', 'Employee', '2,00,000', '30 days']) {
    const rawAt = raw.indexOf(needle);
    assert.notEqual(rawAt, -1);
    const normAt = to(rawAt);
    assert.equal(
      text.slice(normAt, normAt + needle.length),
      needle,
      `"${needle}" at raw ${rawAt} landed on "${text.slice(normAt, normAt + needle.length)}"`,
    );
  }
});

test('the map is monotonic and stays inside the text', () => {
  const raw = 'a  b\r\n\r\n\r\n\r\nc   ​d\te';
  const { text, offsetMap } = normalizeText(raw);
  const to = mapper(offsetMap, text.length);
  let last = -1;
  for (let i = 0; i <= raw.length + 10; i++) {
    const n = to(i);
    assert.ok(n >= 0 && n <= text.length, `index ${i} mapped outside the text`);
    assert.ok(n >= last, `index ${i} went backwards`);
    last = n;
  }
});

test('three or more line breaks become at most one blank line', () => {
  assert.equal(normalizeText('a\n\n\n\n\nb').text, 'a\n\nb');
  assert.equal(normalizeText('a\r\n\r\nb').text, 'a\n\nb');
  assert.equal(normalizeText('a\rb').text, 'a\nb');
});

test('zero-width characters are removed', () => {
  const { text } = normalizeText('sig​nature‍ here﻿');
  assert.equal(text, 'signature here');
});

test('trailing space before a break vanishes rather than becoming one space', () => {
  // Ragged wrapping out of a PDF is a layout artefact. Left in, a quote that
  // spans a line break stops matching the document it came from.
  assert.equal(normalizeText('the Employee   \nshall pay').text, 'the Employee\nshall pay');
});

test('empty and whitespace-only input do not throw', () => {
  for (const raw of ['', '   ', '\n\n\n', '​']) {
    const { text, offsetMap } = normalizeText(raw);
    assert.equal(text, '');
    assert.ok(offsetMap.length >= 1, 'the map must always have an origin anchor');
    assert.equal(mapper(offsetMap, 0)(5), 0);
  }
});

/* ───────────────────────── citing back to a page ───────────────────────── */

const PAGES = [
  { page: 1, start: 0, end: 100 },
  { page: 2, start: 100, end: 250 },
];

test('an offset resolves to the page it falls on', () => {
  assert.equal(pageAt(PAGES, 0), 1);
  assert.equal(pageAt(PAGES, 99), 1);
  assert.equal(pageAt(PAGES, 100), 2, 'a page boundary belongs to the page it starts');
  assert.equal(pageAt(PAGES, 249), 2);
});

test('an offset past the end reports the last page, never null', () => {
  assert.equal(pageAt(PAGES, 10_000), 2);
});

test('a source with no pages reports null rather than guessing page 1', () => {
  // DOCX has no pagination; claiming "page 1" would be a citation the reader
  // cannot check against anything.
  assert.equal(pageAt([], 5), null);
});

test('paragraph index counts blank lines before the offset', () => {
  const text = 'one\n\ntwo\n\nthree';
  assert.equal(paragraphAt(text, 0), 0);
  assert.equal(paragraphAt(text, text.indexOf('two')), 1);
  assert.equal(paragraphAt(text, text.indexOf('three')), 2);
});
