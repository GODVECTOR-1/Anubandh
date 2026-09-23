/**
 * Reading level, measured.
 *
 * The plan targets an 8th-grade reading level for plain-language output and
 * says "measured" — so this measures it. Flesch-Kincaid Grade Level over the
 * copy a reader actually has to understand.
 *
 * What is EXCLUDED, and why:
 *   - statutory `text` and `judicial_gloss` — verbatim law. Simplifying it
 *     would be the error this product exists to avoid.
 *   - `quoted_text` — the document's own words, never ours to rewrite.
 *   - the compliance disclaimer — legally load-bearing wording, reported
 *     separately so its cost is visible but it cannot mask a regression in
 *     the copy we do control.
 *
 *   npm run check:reading
 */

import { priyaOfferLetter as p } from '../fixtures/priya-offer-letter';
import { describeNode } from '../lib/describe';
import { ask } from '../lib/ask';
import { buildPacket } from '../lib/packet';

const TARGET = 8;

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '');
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

function grade(text: string): { fkgl: number; words: number; sentences: number } {
  const sentences = Math.max(1, (text.match(/[.!?]+(?:\s|$)/g) ?? []).length);
  const words = text.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
  if (words.length === 0) return { fkgl: 0, words: 0, sentences };
  const syl = words.reduce((a, w) => a + syllables(w), 0);
  const fkgl = 0.39 * (words.length / sentences) + 11.8 * (syl / words.length) - 15.59;
  return { fkgl, words: words.length, sentences };
}

/* ── the copy we control ── */

const samples: Array<[string, string]> = [];

for (const f of p.flags) {
  samples.push(['flag ' + f.id + ' consequence', f.consequence]);
  samples.push(['flag ' + f.id + ' what to ask', f.what_to_ask]);
  if (f.reason) samples.push(['flag ' + f.id + ' reason', f.reason]);
}
for (const n of p.graph.nodes) samples.push(['node ' + n.id, describeNode(n)]);
for (const row of p.timeline.rows) {
  const seen = new Set<string>();
  for (const s of row.states) {
    if (seen.has(s.text)) continue;
    seen.add(s.text);
    samples.push(['timeline ' + row.label, s.text]);
  }
}
for (const q of ['what does clause 12.2 mean', 'should i sign this', 'what about parking']) {
  const r = ask(p, q);
  if (r.answer) samples.push(['ask ' + r.outcome, r.answer]);
  if (r.handoff) samples.push(['ask handoff', r.handoff]);
}
const packet = buildPacket(p);
for (const q of packet.questions) {
  samples.push(['packet question', q.question]);
  samples.push(['packet because', q.because]);
}

/* ── measure ── */

console.log('\nReading level — Flesch-Kincaid, target grade ' + TARGET + ' or below\n');

const all = samples.map(([, t]) => t).join(' ');
const overall = grade(all);

const worst: Array<{ label: string; fkgl: number; text: string }> = [];
for (const [label, text] of samples) {
  const g = grade(text);
  if (g.words < 6) continue; // too short to score meaningfully
  worst.push({ label, fkgl: g.fkgl, text });
}
worst.sort((a, b) => b.fkgl - a.fkgl);

console.log(
  '  overall  grade ' +
    overall.fkgl.toFixed(1) +
    '  (' +
    overall.words +
    ' words, ' +
    overall.sentences +
    ' sentences, ' +
    samples.length +
    ' strings)',
);
console.log('\n  hardest strings:');
for (const w of worst.slice(0, 5)) {
  console.log('    grade ' + w.fkgl.toFixed(1).padStart(4) + '  ' + w.label + ': ' + w.text.slice(0, 74));
}

// Reported, never counted against the target: this wording is legally
// load-bearing and cannot be simplified without changing what it says.
const disclaimer = grade(packet.disclaimer);
console.log(
  '\n  excluded (legal boilerplate, reported for visibility):\n' +
    '    grade ' +
    disclaimer.fkgl.toFixed(1) +
    '  compliance disclaimer',
);

const ok = overall.fkgl <= TARGET;
console.log(
  ok
    ? '\nReading level passed: grade ' + overall.fkgl.toFixed(1) + ' is at or below ' + TARGET + '.\n'
    : '\nReading level FAILED: grade ' + overall.fkgl.toFixed(1) + ' is above ' + TARGET + '.\n',
);
process.exit(ok ? 0 : 1);
