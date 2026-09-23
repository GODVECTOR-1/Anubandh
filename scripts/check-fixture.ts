/**
 * Contract check. Runs in CI on every push.
 *
 * Two autonomous agents share one contract, and "neither side changes it alone"
 * is a convention, not an enforcement mechanism. This is the enforcement:
 * a backend-side schema change that breaks the frontend fails here in seconds
 * instead of at hour 30.
 *
 *   npm run check:fixture
 */

import { AnalysisPayload, checkCoverageInvariant, SCHEMA_VERSION } from '../contracts/schema';
import { priyaOfferLetter } from '../fixtures/priya-offer-letter';
import { segment, type Span } from '../lib/highlight';
import { partitionRows, availablePresets, rowChanges } from '../lib/timeline';
import { ask, seedQuestions } from '../lib/ask';
import { buildPacket } from '../lib/packet';
import { describeNode } from '../lib/describe';
import { clauseLabel } from '../lib/clause';
import { KIND_LABEL, LOCALES, SEVERITY_TEXT, STRINGS, predicateText } from '../lib/i18n';
import type { ConditionPredicate } from '../contracts/schema';
import { AskResponse } from '../contracts/schema';

let failed = 0;
const fail = (msg: string) => { console.error('  FAIL  ' + msg); failed++; };
const pass = (msg: string) => console.log('  ok    ' + msg);

console.log('\nContract check — fixture against contracts/schema.ts\n');

// 1. The fixture parses.
const parsed = AnalysisPayload.safeParse(priyaOfferLetter);
if (!parsed.success) {
  fail('fixture does not satisfy AnalysisPayload');
  for (const issue of parsed.error.issues.slice(0, 15)) {
    console.error(`        ${issue.path.join('.')}: ${issue.message}`);
  }
} else {
  pass('fixture satisfies AnalysisPayload');
}

const p = priyaOfferLetter;

// 2. Coverage invariant (§9.5). A header count that disagrees with the visible
//    cards is how the integrity thesis fails publicly, on an off-by-one.
const covErrs = checkCoverageInvariant(p.coverage);
covErrs.length ? covErrs.forEach(e => fail('coverage invariant: ' + e))
               : pass('coverage invariant holds');

// 3. Schema version pinned.
p.graph.schema_version === SCHEMA_VERSION
  ? pass(`schema_version pinned at ${SCHEMA_VERSION}`)
  : fail(`schema_version ${p.graph.schema_version} != ${SCHEMA_VERSION}`);

// 4. Referential integrity — no dangling edges. A dangling edge either
//    dereferences undefined or silently truncates the chain, and a truncated
//    chain means the money never appears while coverage stays green.
const ids = new Set(p.graph.nodes.map(n => n.id));
const dangling = p.graph.edges.filter(e => !ids.has(e.from_node) || !ids.has(e.to_node));
dangling.length ? dangling.forEach(e => fail(`dangling edge ${e.id}: ${e.from_node} → ${e.to_node}`))
                : pass('no dangling edges');

// 5. Every flag points at a real node.
const orphan = p.flags.filter(f => !ids.has(f.node_id));
orphan.length ? orphan.forEach(f => fail(`flag ${f.id} references missing node ${f.node_id}`))
              : pass('every flag resolves to a node');

// 6. Inferred edges carry no provenance; non-inferred edges must.
for (const e of p.graph.edges) {
  if (e.inferred && e.provenance) fail(`edge ${e.id} is inferred but carries provenance`);
  if (!e.inferred && !e.provenance) fail(`edge ${e.id} is not inferred but has no provenance`);
}
pass('edge provenance matches the inferred flag');

// 7. THE LEGAL GATE. s.27 fires only on post_employment. A during-employment
//    restraint flagged under s.27 is a confident, cited, legally false
//    statement — the error this project has now made twice.
for (const f of p.flags) {
  for (const r of f.statute_refs) {
    if (r.section !== 's.27') continue;
    const node = p.graph.nodes.find(n => n.id === f.node_id);
    if (node?.temporal_scope !== 'post_employment') {
      fail(`s.27 fired on node ${f.node_id} with temporal_scope=${node?.temporal_scope} (must be post_employment)`);
    }
  }
}
const duringNodes = p.graph.nodes.filter(n => n.temporal_scope === 'during_employment').map(n => n.id);
const wrongly = p.flags.filter(f => duringNodes.includes(f.node_id) && f.statute_refs.some(r => r.section === 's.27'));
wrongly.length ? wrongly.forEach(f => fail(`during-employment restraint flagged under s.27: ${f.id}`))
               : pass('s.27 gate: fires only on post_employment');

// 8. Banned strings in user-facing copy. The demo script and flag templates are
//    where a verdict gets spoken aloud in front of judges.
const BANNED = [/\bis void\b/i, /\bare void\b/i, /\bunenforceable\b/i, /the document is silent/i];
const copy: Array<[string, string]> = [];
for (const f of p.flags) {
  copy.push([`flag ${f.id} consequence`, f.consequence]);
  copy.push([`flag ${f.id} what_to_ask`, f.what_to_ask]);
  if (f.reason) copy.push([`flag ${f.id} reason`, f.reason]);
}
for (const row of p.timeline.rows) {
  for (const s of row.states) copy.push([`timeline ${row.node_id} m${s.month}`, s.text]);
}
// Statutory `text` fields are exempt: they are verbatim quotation of the section.
let banned = 0;
for (const [where, text] of copy) {
  for (const re of BANNED) {
    if (re.test(text)) { fail(`banned phrase ${re} in ${where}: "${text}"`); banned++; }
  }
}
banned === 0 && pass('no banned verdict language in user-facing copy');

// 9. Asymmetry flags carry no citation; statutory flags must.
for (const f of p.flags) {
  if (f.basis === 'asymmetry' && f.statute_refs.length > 0) fail(`asymmetry flag ${f.id} carries a statute ref`);
  if (f.basis === 'statutory' && f.statute_refs.length === 0) fail(`statutory flag ${f.id} carries no statute ref`);
  if (f.basis === 'asymmetry' && !f.reason) fail(`asymmetry flag ${f.id} has no computed reason`);
}
pass('flag basis matches citation presence');

// 10. "What to ask" is mandatory on every card, not just the statutory ones.
p.flags.every(f => f.what_to_ask.trim().length > 0)
  ? pass('every flag carries "what to ask"')
  : fail('a flag is missing "what to ask"');

// 11. The four required fixture states exist, or the UI cannot be built
//     against them before the backend lands.
const states: Array<[string, boolean]> = [
  ['dropped node',        p.coverage.dropped_nodes.length > 0],
  ['null clause_ref',     p.graph.nodes.some(n => n.clause_ref.label === null)],
  ['low-confidence flag', p.flags.some(f => f.confidence === 'worth_checking')],
  ['fact-requiring row',  p.timeline.rows.some(r => r.assumption !== null)],
];
for (const [name, ok] of states) ok ? pass(`fixture state present: ${name}`) : fail(`fixture state MISSING: ${name}`);

// 12. Money renders verbatim; derived value is sorting-only.
for (const n of p.graph.nodes) {
  if (!n.money) continue;
  if (!n.money.amount_text.trim()) fail(`money node ${n.id} has empty amount_text`);
}
pass('money nodes carry verbatim amount_text');

// 13. The coverage strip prints "N not shown" from the COUNTS and lists the
//     reasons from dropped_nodes. The numeric invariant never checked that the
//     two agree, so a fixture could satisfy it while the header said 4 and the
//     panel showed 3 — the off-by-one the whole invariant exists to prevent,
//     reproduced one level up. Caught by looking at the rendered page.
const droppedTotal = Object.values(p.coverage.dropped).reduce((a, b) => a + b, 0);
const notShown = p.coverage.extracted - p.coverage.rendered;
if (droppedTotal !== notShown)
  fail(`dropped counts sum to ${droppedTotal} but extracted-rendered is ${notShown}`);
if (p.coverage.dropped_nodes.length !== droppedTotal)
  fail(`dropped_nodes lists ${p.coverage.dropped_nodes.length} items but the counts say ${droppedTotal}`);
// And each listed reason must be one the counts actually claim.
const byReason = new Map<string, number>();
for (const d of p.coverage.dropped_nodes) byReason.set(d.reason, (byReason.get(d.reason) ?? 0) + 1);
for (const [reason, n] of byReason) {
  const claimed = (p.coverage.dropped as Record<string, number>)[reason];
  if (claimed !== n) fail(`dropped_nodes has ${n} "${reason}" but dropped.${reason} is ${claimed}`);
}
droppedTotal === notShown && p.coverage.dropped_nodes.length === droppedTotal
  && pass('dropped counts, dropped_nodes and the header agree');

// 14. Provenance offsets point at the words they claim to. This is the whole
//     grounding thesis reduced to one equality: if the slice does not equal the
//     quote, the split view highlights the wrong sentence while every count
//     stays green.
const canonical = p.document.normalized_text;
let offsetErrs = 0;
const checkSpan = (what: string, pr: { char_start: number; char_end: number; quoted_text: string }) => {
  const slice = canonical.slice(pr.char_start, pr.char_end);
  if (slice !== pr.quoted_text) {
    fail(`${what}: text[${pr.char_start}..${pr.char_end}] is "${slice.slice(0, 40)}" but quoted_text is "${pr.quoted_text.slice(0, 40)}"`);
    offsetErrs++;
  }
};
for (const n of p.graph.nodes) {
  checkSpan(`node ${n.id} provenance`, n.provenance);
  if (n.clause_ref.provenance) checkSpan(`node ${n.id} clause_ref`, n.clause_ref.provenance);
}
for (const e of p.graph.edges) if (e.provenance) checkSpan(`edge ${e.id} provenance`, e.provenance);
offsetErrs === 0 && pass('every provenance offset slices to its own quoted_text');

// 15. The segmentation invariant. Spans overlap in this very fixture, so the
//     renderer must emit each character exactly once no matter how they nest.
const allSpans: Span[] = p.graph.nodes.map((n) => ({
  id: n.id, start: n.provenance.char_start, end: n.provenance.char_end,
}));
const segs = segment(canonical, allSpans);
const rebuilt = segs.map((x) => x.text).join('');
rebuilt === canonical
  ? pass(`segmentation round-trips ${canonical.length} chars into ${segs.length} segments`)
  : fail(`segmentation lost or duplicated text: rebuilt ${rebuilt.length} chars from ${canonical.length}`);

// Overlap is not hypothetical here — assert the fixture still contains a case,
// so a future fixture edit cannot quietly remove the only test of it.
const overlapping = segs.filter((x) => x.ids.length > 1);
overlapping.length > 0
  ? pass(`overlapping spans exercised (${overlapping.length} segment(s) covered by 2+ nodes)`)
  : fail('no overlapping spans in the fixture — the segmentation edge case is untested');

// Adversarial spans must not be able to break the one view that proves we did
// not invent the text.
const hostile = segment('abcdef', [
  { id: 'neg', start: -5, end: 2 },
  { id: 'past', start: 4, end: 999 },
  { id: 'inverted', start: 5, end: 1 },
  { id: 'empty', start: 3, end: 3 },
]);
hostile.map((x) => x.text).join('') === 'abcdef'
  ? pass('out-of-range, inverted and empty spans are survived')
  : fail('hostile spans corrupted the segmentation');

// 16. Timeline rows resolve, and cover every month the scrubber can reach.
//     A row short by one month makes the handle's last position read a
//     neighbour's state, which is a wrong answer that looks like a right one.
const nodeIds = new Set(p.graph.nodes.map((n) => n.id));
let tlErrs = 0;
for (const row of p.timeline.rows) {
  if (!nodeIds.has(row.node_id)) { fail('timeline row ' + row.label + ' points at missing node ' + row.node_id); tlErrs++; }
  const months = new Set(row.states.map((st) => st.month));
  if (months.size !== row.states.length) { fail('timeline row ' + row.label + ' has duplicate months'); tlErrs++; }
  for (let m = 0; m <= p.timeline.months; m++) {
    if (!months.has(m)) { fail('timeline row ' + row.label + ' has no state for month ' + m); tlErrs++; break; }
  }
}
tlErrs === 0 && pass('every timeline row resolves and covers every month');

// 17. The partition must not lose a row. Changing rows drive the scrubber and
//     fixed rows are shown separately; a row in neither is silently deleted.
const part = partitionRows(p.timeline);
const partitioned = part.changing.length + part.overflow.length + part.fixed.length;
partitioned === p.timeline.rows.length
  ? pass('row partition accounts for all ' + p.timeline.rows.length + ' rows')
  : fail('partition covers ' + partitioned + ' of ' + p.timeline.rows.length + ' rows');

// 18. A fact-requiring preset offered with no clause behind it implies the
//     document addresses an event it never mentions. Same failure as an
//     uncited flag wearing a citation's clothes.
const predicateKinds = new Set(p.graph.nodes.map((n) => n.predicate?.kind).filter(Boolean) as string[]);
const offered = availablePresets(p.graph, p.timeline);
const unfounded = offered.filter((x) => x.kind === 'fact_requiring' && !predicateKinds.has(x.id));
unfounded.length === 0
  ? pass('fact-requiring presets offered: ' + offered.filter((x) => x.kind === 'fact_requiring').length + ', all backed by a clause')
  : unfounded.forEach((x) => fail('preset ' + x.label + ' offered with no clause modelling it'));

// 19. Every assumption-bearing row must carry its assumption as text, so the
//     header can never render a result without saying what it assumed.
for (const row of p.timeline.rows) {
  if (row.assumption !== null && !row.assumption.trim()) fail('timeline row ' + row.label + ' has an empty assumption string');
}
pass('assumption-bearing rows carry their assumption text');

// The fixture must keep exercising BOTH partition branches, or the section for
// rows that do not change ships having never been rendered.
p.timeline.rows.some(rowChanges) && p.timeline.rows.some((r) => !rowChanges(r))
  ? pass('fixture exercises both changing and non-changing timeline rows')
  : fail('fixture no longer covers both timeline row kinds');

// 20. The advice boundary, as a test rather than a convention.
//     The brief's binding constraint is information and assistance, not a
//     replacement for professional advice, and the Advocates Act reserves
//     practice to enrolled advocates. If that line holds only because someone
//     remembered to render it, it does not hold.
const PROBES: Array<[string, string]> = [
  ['what does clause 12.2 mean', 'information'],
  ['how much is the bond', 'information'],
  ['should i sign this', 'advice'],
  ['can they enforce the non-compete', 'advice'],
  ['will i win if they sue me', 'advice'],
  ['i have a court date tomorrow', 'escalate'],
  ['the police came to my house', 'escalate'],
  ['what does it say about parking allowance', 'no_coverage'],
];
let askErrs = 0;
for (const [q, expected] of PROBES) {
  const r = ask(p, q);
  const parsed = AskResponse.safeParse(r);
  if (!parsed.success) { fail('ask response for "' + q + '" does not satisfy AskResponse'); askErrs++; continue; }
  if (r.outcome !== expected) { fail('ask routed "' + q + '" to ' + r.outcome + ', expected ' + expected); askErrs++; }

  // ADVICE must never be a bare refusal. Leading with the refusal teaches the
  // reader the product dodges, and they stop asking it anything.
  if (r.outcome === 'advice' && !r.handoff) { fail('advice answer for "' + q + '" has no handoff'); askErrs++; }
  if (r.outcome === 'advice' && !r.answer.trim()) { fail('advice answer for "' + q + '" is empty'); askErrs++; }

  // ESCALATE must always carry somewhere to call.
  if (r.outcome === 'escalate' && (!r.escalation || r.escalation.contacts.length === 0)) {
    fail('escalate answer for "' + q + '" has no contacts'); askErrs++;
  }

  // The interstitial offers Continue to the analysis. If the answer is empty,
  // that exit is a dead end for the reader it exists to protect.
  if (r.outcome === 'escalate' && !r.answer.trim()) {
    fail('escalate answer for "' + q + '" is empty, so Continue leads nowhere'); askErrs++;
  }

  // An uncited INFORMATION answer is indistinguishable from a guess.
  if (r.outcome === 'information' && r.citations.length === 0) {
    fail('information answer for "' + q + '" carries no citation'); askErrs++;
  }

  // Every citation must slice back to the document it claims to quote.
  for (const c of r.citations) {
    if (canonical.slice(c.char_start, c.char_end) !== c.quoted_text) {
      fail('ask citation for "' + q + '" does not slice to its quote'); askErrs++;
    }
  }

  // No verdict language anywhere in Ask. This is a surface where the reader is
  // deciding, which is exactly where the harm risk lands.
  const spoken = r.answer + ' ' + (r.handoff ?? '') + ' ' + (r.escalation?.reason ?? '');
  for (const re of BANNED) {
    if (re.test(spoken)) { fail('banned phrase ' + re + ' in ask answer for "' + q + '"'); askErrs++; }
  }
}
askErrs === 0 && pass('ask: ' + PROBES.length + ' probes route correctly and hold the advice boundary');

// 21. The empty state is seeded, or the surface reads as dead.
const seeds = seedQuestions(p);
seeds.length === 3 && seeds.every((x) => x.trim().length > 0)
  ? pass('ask empty state seeded with 3 questions')
  : fail('ask empty state has ' + seeds.length + ' seeded questions, expected 3');

// 22. The packet is handed to a lawyer. It is the worst possible place for a
//     sentence nobody traced, so every quote in it must slice from the
//     document and every question must actually be a question to ask.
const packet = buildPacket(p);
let packErrs = 0;
if (packet.questions.length < 1 || packet.questions.length > 5) {
  fail('packet has ' + packet.questions.length + ' questions, expected 1 to 5'); packErrs++;
}
const LOCATOR = /\u00b6|\bp\.\d/;
for (const q of packet.questions) {
  if (!q.question.trim()) { fail('packet question is empty'); packErrs++; }
  // These get said out loud to a lawyer. An internal locator in one means the
  // reader is asked to pronounce our paragraph numbering.
  if (LOCATOR.test(q.question)) {
    fail('packet question leaks an internal locator: ' + q.question); packErrs++;
  }
  if (q.quote && !canonical.includes(q.quote)) {
    fail('packet quote is not in the document: ' + q.quote.slice(0, 40)); packErrs++;
  }
}
for (const re of BANNED) {
  const all = packet.summary + ' ' + packet.disclaimer + ' ' + packet.questions.map((q) => q.question + ' ' + q.because).join(' ');
  if (re.test(all)) { fail('banned phrase ' + re + ' in the lawyer packet'); packErrs++; }
}
packErrs === 0 && pass('packet: ' + packet.questions.length + ' questions, every quote traced, no verdict language');

// 23. The Hindi surface. A translation layer in a legal tool has exactly one
//     rule that cannot bend: the document's own words are never translated.
const isDevanagari = (t: string) =>
  [...t].some((ch) => { const c = ch.codePointAt(0)!; return c >= 0x0900 && c <= 0x097f; });

let i18nErrs = 0;

// Every string exists in every locale. A missing key renders as blank, which
// on this surface looks like the analysis found nothing.
for (const loc of LOCALES) {
  const S = STRINGS[loc];
  for (const [k, v] of Object.entries(S)) {
    if (k === 'notTranslated' && loc === 'en') continue; // deliberately empty
    const val = typeof v === 'function' ? v(3) : v;
    if (typeof val !== 'string' || val.trim() === '') { fail('i18n: ' + loc + '.' + k + ' is empty'); i18nErrs++; }
  }
  for (const kind of Object.keys(KIND_LABEL.en)) {
    const label = KIND_LABEL[loc][kind as keyof typeof KIND_LABEL.en];
    if (!label || !label.trim()) { fail('i18n: ' + loc + ' has no label for ' + kind); i18nErrs++; }
  }
  // The severity scale must be complete in every locale, and actually
  // translated: an English risk label on a Hindi page is the one thing that
  // would read as a broken translation rather than a deliberate boundary.
  for (const sev of Object.keys(SEVERITY_TEXT.en) as Array<keyof typeof SEVERITY_TEXT.en>) {
    const t = SEVERITY_TEXT[loc][sev];
    if (!t || !t.label.trim() || !t.meaning.trim()) { fail('i18n: ' + loc + ' severity ' + sev + ' incomplete'); i18nErrs++; }
    if (loc === 'hi' && (!isDevanagari(t.label) || !isDevanagari(t.meaning))) {
      fail('i18n: severity ' + sev + ' is not translated into Hindi'); i18nErrs++;
    }
  }
}

// The closed predicate vocabulary really is translated — except the one case
// that carries the document's own wording, which must come through untouched.
const PREDICATES: ConditionPredicate[] = [
  { kind: 'resigns_before_month', month: 24, requires_user_fact: false },
  { kind: 'bond_period_complete', requires_user_fact: false },
  { kind: 'notice_given', days: 90, requires_user_fact: false },
  { kind: 'terminated_by_employer', requires_user_fact: true },
  { kind: 'terminated_for_cause', requires_user_fact: true },
  { kind: 'relocation_refused', requires_user_fact: true },
  { kind: 'competing_employment', requires_user_fact: true },
  { kind: 'leave_exceeds', days: 30, requires_user_fact: true },
  { kind: 'unclassified', verbatim: 'subject to such terms as the Company may notify', requires_user_fact: false },
];
for (const p of PREDICATES) {
  const en = predicateText(p, 'en');
  const hi = predicateText(p, 'hi');
  if (p.kind === 'unclassified') {
    if (hi !== p.verbatim || en !== p.verbatim) {
      fail('i18n: unclassified predicate was rewritten instead of kept verbatim'); i18nErrs++;
    }
  } else if (!isDevanagari(hi) || hi === en) {
    fail('i18n: predicate ' + p.kind + ' is not translated'); i18nErrs++;
  }
}

for (const n of p.graph.nodes) {
  const hi = describeNode(n, 'hi');
  const en = describeNode(n, 'en');

  // THE RULE. Money is the document's number; it renders identically in both.
  if (n.money) {
    if (!hi.includes(n.money.amount_text) || !en.includes(n.money.amount_text)) {
      fail('i18n: ' + n.id + ' does not render amount_text verbatim in both languages'); i18nErrs++;
    }
  }

  // A restatement may share wording with the clause — the English template for
  // an Obligation reconstructs it almost exactly, which is fine. What must
  // never happen is the description BEING the quote: then it is not a
  // restatement at all, and the two panes stop being independent evidence.
  for (const [loc, text] of [['en', en], ['hi', hi]] as const) {
    if (text.trim() === n.provenance.quoted_text.trim()) {
      fail('i18n: ' + n.id + ' description in ' + loc + ' is verbatim the quoted span'); i18nErrs++;
    }
  }

  // The clause NUMBER is an index into the reader's own copy. Renumbering it
  // in Hindi would make the label useless for the one thing it is for.
  if (n.clause_ref.label) {
    if (!clauseLabel(n, 'hi').includes(n.clause_ref.label) || !clauseLabel(n, 'en').includes(n.clause_ref.label)) {
      fail('i18n: clause number ' + n.clause_ref.label + ' does not survive both languages'); i18nErrs++;
    }
    if (!isDevanagari(clauseLabel(n, 'hi'))) { fail('i18n: clause label not translated for ' + n.id); i18nErrs++; }
  }

  // Something in the Hindi sentence must actually be Hindi.
  if (!isDevanagari(hi)) { fail('i18n: ' + n.id + ' has no Hindi in its Hindi description'); i18nErrs++; }
}
i18nErrs === 0 && pass('hindi: quotes, amounts and clause numbers survive translation untouched');

console.log(failed === 0 ? '\nContract check passed.\n' : `\nContract check FAILED — ${failed} problem(s).\n`);
process.exit(failed === 0 ? 0 : 1);
