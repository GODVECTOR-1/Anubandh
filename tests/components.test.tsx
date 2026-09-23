import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { SeverityMark, SeverityRule } from '@/components/SeverityMark';
import { ProvenanceChip } from '@/components/ProvenanceChip';
import type { Provenance } from '@/contracts/schema';
import { SEVERITY_TEXT } from '@/lib/i18n';
import type { Severity } from '@/contracts/schema';

/**
 * Rendering tests for the surfaces that make a CLAIM to the reader.
 *
 * On react-dom/server rather than a testing library: these components take
 * props and return markup, with no hooks and no context, so the rendered
 * string is the whole of their behaviour. Rendering it needs nothing that is
 * not already a dependency. Anything that genuinely needs a DOM — dragging the
 * scrubber, opening the accordion, the live region on Ask — is covered in
 * check-a11y against a real browser, where it means something.
 *
 * The thing under test is not that these look right. It is that the severity
 * of a clause can never reach a reader as colour alone, which is an
 * accessibility guarantee the product states out loud.
 */

const ALL: Severity[] = ['act_on_this', 'ask_about_this', 'know_about_this'];
const strip = (html: string) => html.replace(/<[^>]*>/g, '');

test('every severity renders its words, not just its colour', () => {
  for (const severity of ALL) {
    const text = strip(renderToStaticMarkup(<SeverityMark severity={severity} />));
    assert.equal(
      text.includes(SEVERITY_TEXT.en[severity].label),
      true,
      severity + ' rendered without its label: ' + JSON.stringify(text),
    );
  }
});

test('every severity also renders an icon, so it is three channels and not two', () => {
  // Rule + icon + words. The colour is the third channel, never the only one.
  for (const severity of ALL) {
    const html = renderToStaticMarkup(<SeverityMark severity={severity} />);
    assert.match(html, /<svg/, severity + ' rendered no icon');
    assert.match(html, /aria-hidden="true"/, severity + ' icon is not hidden from the accessibility tree');
  }
});

test('the three severities are distinguishable by text alone', () => {
  // If two tiers ever collapsed to the same words, a screen reader user would
  // have no way to tell them apart at all.
  const labels = ALL.map((s) => strip(renderToStaticMarkup(<SeverityMark severity={s} />)).trim());
  assert.equal(new Set(labels).size, 3, 'two severities render the same text: ' + labels.join(' | '));
});

test('Hindi renders Hindi, and marks the language for a screen reader', () => {
  for (const severity of ALL) {
    const html = renderToStaticMarkup(<SeverityMark severity={severity} locale="hi" />);
    assert.ok(
      strip(html).includes(SEVERITY_TEXT.hi[severity].label),
      severity + ' did not render its Hindi label',
    );
    // Without lang="hi" a screen reader pronounces Devanagari with an English
    // voice, which is unintelligible rather than merely wrong.
    assert.match(html, /lang="hi"/, severity + ' is missing lang="hi"');
  }
});

test('the meaning is exposed, not only the label', () => {
  const html = renderToStaticMarkup(<SeverityMark severity="act_on_this" />);
  assert.ok(html.includes(SEVERITY_TEXT.en.act_on_this.meaning), 'the tier renders no explanation of itself');
});

test('the severity rule is decorative and says so', () => {
  // It is a coloured bar with no text. If it ever stopped being aria-hidden it
  // would announce as an empty element on every card.
  for (const severity of ALL) {
    const html = renderToStaticMarkup(<SeverityRule severity={severity} />);
    assert.match(html, /aria-hidden="true"/, severity + ' rule is exposed to the accessibility tree');
    assert.equal(strip(html), '', severity + ' rule rendered text, so it is no longer decorative');
  }
});

test('a caller cannot turn the words off', () => {
  // The component documents that there is no showLabel prop and never will be,
  // because the moment one exists colour becomes the only channel on some
  // surface nobody re-audits. Passing the props a caller might reach for must
  // not suppress the label.
  const sneaky = { severity: 'act_on_this', showLabel: false, labelHidden: true, iconOnly: true } as unknown as {
    severity: Severity;
  };
  const text = strip(renderToStaticMarkup(<SeverityMark {...sneaky} />));
  assert.ok(text.includes(SEVERITY_TEXT.en.act_on_this.label), 'the label was suppressed by a prop');
});

/* ───────────────────── provenance: the receipt itself ───────────────────── */

const PROV: Provenance = {
  page: 3,
  page_end: 3,
  paragraph: null,
  char_start: 1200,
  char_end: 1284,
  quoted_text: 'shall pay to the Company a sum of Rs. 2,00,000/-',
  located_by: 'exact',
  located_ambiguity: 1,
  entailed: true,
};

test('a verified match and a loose one do not read the same', () => {
  // The entire product rests on this distinction. If "worth checking" ever
  // rendered as "Verified", the app would be making a claim it has not earned
  // on the surface readers are told to trust.
  const verified = strip(renderToStaticMarkup(<ProvenanceChip provenance={PROV} temporalScope="post_employment" confidence="verified" />));
  const loose = strip(renderToStaticMarkup(<ProvenanceChip provenance={{ ...PROV, located_by: 'fuzzy' }} temporalScope="post_employment" confidence="worth_checking" />));

  assert.ok(verified.includes('Verified'), 'a verified match did not say so');
  assert.ok(loose.includes('Worth checking'), 'a loose match did not say so');
  assert.ok(!loose.includes('Verified'), 'a loose match claimed to be verified');
});

test('the page is cited, because it is the reader’s index into their own copy', () => {
  const html = strip(renderToStaticMarkup(<ProvenanceChip provenance={PROV} temporalScope="during_employment" confidence="verified" />));
  assert.ok(html.includes('p.3'), 'no page citation rendered: ' + html.slice(0, 80));
});

test('more than one possible source is disclosed, not hidden', () => {
  // The dangerous case: it passes verification and entailment while pointing
  // at the wrong clause. Silence here is the product being confidently wrong.
  const html = strip(renderToStaticMarkup(
    <ProvenanceChip provenance={{ ...PROV, located_ambiguity: 2 }} temporalScope="post_employment" confidence="worth_checking" />,
  ));
  assert.ok(html.includes('2 possible sources'), 'an ambiguous match did not disclose its ambiguity');
});

test('a single source does not announce an ambiguity it does not have', () => {
  const html = strip(renderToStaticMarkup(<ProvenanceChip provenance={PROV} temporalScope="post_employment" confidence="verified" />));
  assert.ok(!html.includes('possible sources'), 'an unambiguous match reported possible sources');
});

test('the exact offsets are shown, so the claim is checkable', () => {
  const html = strip(renderToStaticMarkup(<ProvenanceChip provenance={PROV} temporalScope="unclear" confidence="verified" />));
  assert.ok(html.includes('1200') && html.includes('1284'), 'the character range was not rendered');
});

test('it expands with platform semantics rather than a state hook', () => {
  // <details> gives keyboard operation, focus handling and the expanded
  // announcement for free, and cannot fall out of sync with its own aria
  // attributes the way a boolean in state can.
  const html = renderToStaticMarkup(<ProvenanceChip provenance={PROV} temporalScope="post_employment" confidence="verified" />);
  assert.match(html, /<details/);
  assert.match(html, /<summary/);
});

test('the advice boundary is stated on the card, not only in the footer', () => {
  const html = strip(renderToStaticMarkup(<ProvenanceChip provenance={PROV} temporalScope="post_employment" confidence="verified" />));
  assert.ok(html.includes('not legal advice'), 'the compliance line is missing from the provenance card');
});
