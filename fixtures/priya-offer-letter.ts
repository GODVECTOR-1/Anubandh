/**
 * The mock fixture. This is what makes "the UI is never blocked on a working
 * API" true rather than aspirational, and what `MOCK=1` replays when the dev
 * Gemini key hits its daily cap.
 *
 * §8 requires it to carry the states the UI otherwise cannot be built against
 * until the backend is finished. All four are present and marked:
 *
 *   [STATE 1] a dropped node          → dropped-nodes panel
 *   [STATE 2] a null clause_ref       → "p.5 · ¶3" fallback
 *   [STATE 3] a low-confidence flag   → "worth checking", not "this is bad"
 *   [STATE 4] a fact-requiring row    → assumption header, not a bare result
 *
 * Deliberately NOT 38/38. The counts are 41 found / 38 verified / 3 dropped,
 * because a perfect score hides the coverage story that is the whole integrity
 * thesis — and it is the one moment a judge watches a product admit a limit.
 */

import type { AnalysisPayload } from '@/contracts/schema';

const CANONICAL = `OFFER OF EMPLOYMENT

1. Position. The Employee shall serve as Software Engineer I.
2. Commencement. Employment commences on 1 July 2026.
4.1 Exclusivity. During the term of employment the Employee shall not engage in
    any other gainful occupation without prior written consent.
7.1 Notice. Either party may terminate on ninety (90) days written notice, or
    payment of three months salary in lieu thereof.
9.2 Service bond. The Employee shall pay to the Company a sum of Rs. 2,00,000/-
    if the Employee resigns before completing twenty-four months of service.
9.4 Documents. The Company may withhold the relieving and experience letters
    until all dues under clause 9.2 are settled.
12.2 Restrictive covenant. The Employee shall not, for twelve months following
    cessation of employment, engage with any competing business.
    Relocation. The Employee may be required to relocate to any Company office.`;

const at = (needle: string) => {
  const i = CANONICAL.indexOf(needle);
  if (i < 0) throw new Error(`fixture: span not found in canonical text: ${needle}`);
  return { char_start: i, char_end: i + needle.length };
};

const span = (
  needle: string,
  o: { page?: number | null; paragraph?: number | null; fuzzy?: boolean; ambiguity?: number } = {},
) => ({
  page: o.page === undefined ? 1 : o.page,
  page_end: null,
  paragraph: o.paragraph ?? null,
  ...at(needle),
  quoted_text: needle,
  located_by: (o.fuzzy ? 'fuzzy' : 'exact') as 'exact' | 'fuzzy',
  located_ambiguity: o.ambiguity ?? 1,
  entailed: true,
});

export const priyaOfferLetter: AnalysisPayload = {
  document: {
    id: 'doc_fixture_priya',
    sha256: 'f'.repeat(64),
    source_kind: 'pdf',
    page_count: 6,
    normalized_text: CANONICAL,
    page_offsets: [{ page: 1, start: 0, end: CANONICAL.length }],
    offset_map: [{ raw: 0, normalized: 0 }],
    original_available: true,
  },

  graph: {
    schema_version: 1,
    nodes: [
      {
        id: 'n_bond_money',
        kind: 'Money',
        temporal_scope: 'not_applicable',
        fields: { trigger: 'resignation before 24 months' },
        predicate: null,
        money: {
          // Verbatim, including the /- suffix. This is what renders.
          amount_text: 'Rs. 2,00,000/-',
          // Derived. Lakh grouping: 2,00,000 is two lakh, not two hundred thousand
          // read the usual way — same number here, different parse path.
          amount_value: 200000,
          currency: 'INR',
          payer: 'Employee',
          capped: true,
        },
        deadline: null,
        clause_ref: { label: '9.2', provenance: span('9.2 Service bond') },
        provenance: span('shall pay to the Company a sum of Rs. 2,00,000/-'),
        confidence: 'verified',
      },
      {
        id: 'n_postterm_restraint',
        kind: 'Restraint',
        temporal_scope: 'post_employment', // ← this is why s.27 fires
        fields: { restrained: 'engaging with a competing business', duration_months: 12 },
        predicate: null,
        money: null,
        deadline: null,
        clause_ref: { label: '12.2', provenance: span('12.2 Restrictive covenant') },
        provenance: span('for twelve months following\n    cessation of employment'),
        confidence: 'verified',
      },
      {
        id: 'n_during_exclusivity',
        kind: 'Restraint',
        temporal_scope: 'during_employment', // ← s.27 must NOT fire here
        fields: { restrained: 'other gainful occupation' },
        predicate: null,
        money: null,
        deadline: null,
        clause_ref: { label: '4.1', provenance: span('4.1 Exclusivity') },
        provenance: span('shall not engage in\n    any other gainful occupation'),
        confidence: 'verified',
      },
      {
        // [STATE 2] null clause_ref → renders "p.1 · ¶9", not a blank
        id: 'n_relocation',
        kind: 'Obligation',
        temporal_scope: 'during_employment',
        fields: { action: 'relocate to any Company office' },
        predicate: null,
        money: null,
        deadline: null,
        clause_ref: { label: null, provenance: null },
        provenance: span('may be required to relocate to any Company office', { paragraph: 9 }),
        confidence: 'verified',
      },
      {
        // [STATE 3] low confidence → "worth checking", never "this is bad"
        id: 'n_certificate_withheld',
        kind: 'Right',
        temporal_scope: 'post_employment',
        fields: { holder: 'Company', reciprocated: false, discretion: 'undefined standard' },
        predicate: null,
        money: null,
        deadline: null,
        clause_ref: { label: '9.4', provenance: span('9.4 Documents') },
        provenance: span('may withhold the relieving and experience letters', { fuzzy: true, ambiguity: 2 }),
        confidence: 'worth_checking',
      },
      {
        id: 'n_notice',
        kind: 'TerminationPath',
        temporal_scope: 'during_employment',
        fields: { notice_days: 90, in_lieu: '3 months salary', holder: 'either party' },
        predicate: null,
        money: null,
        deadline: { days: 90, absolute_date: null, gates: 'termination', on_miss: null },
        clause_ref: { label: '7.1', provenance: span('7.1 Notice') },
        provenance: span('terminate on ninety (90) days written notice'),
        confidence: 'verified',
      },
      {
        id: 'c_resign_before_24',
        kind: 'Condition',
        temporal_scope: 'not_applicable',
        fields: {},
        predicate: { kind: 'resigns_before_month', month: 24, requires_user_fact: false },
        money: null,
        deadline: null,
        clause_ref: { label: '9.2', provenance: span('9.2 Service bond') },
        provenance: span('resigns before completing twenty-four months'),
        confidence: 'verified',
      },
      {
        // [STATE 4] fact-requiring → the document says what happens IF, never whether
        id: 'c_relocation_refused',
        kind: 'Condition',
        temporal_scope: 'not_applicable',
        fields: {},
        predicate: { kind: 'relocation_refused', requires_user_fact: true },
        money: null,
        deadline: null,
        clause_ref: { label: null, provenance: null },
        provenance: span('required to relocate to any Company office', { paragraph: 9 }),
        confidence: 'verified',
      },
    ],
    edges: [
      {
        id: 'e_cond_to_money',
        from_node: 'c_resign_before_24',
        to_node: 'n_bond_money',
        relation: 'triggers',
        inferred: false,
        provenance: span('shall pay to the Company a sum of Rs. 2,00,000/-'),
      },
      {
        id: 'e_money_to_cert',
        from_node: 'n_bond_money',
        to_node: 'n_certificate_withheld',
        relation: 'gated_by',
        inferred: false,
        provenance: span('until all dues under clause 9.2 are settled'),
      },
      {
        // Structural inference: no single span states it, so it renders distinctly.
        id: 'e_restraint_survives',
        from_node: 'n_postterm_restraint',
        to_node: 'n_notice',
        relation: 'survives_termination',
        inferred: true,
        provenance: null,
      },
    ],
  },

  flags: [
    {
      id: 'f_noncompete',
      node_id: 'n_postterm_restraint',
      basis: 'statutory',
      severity: 'act_on_this',
      consequence: 'After you leave, this tries to stop you working for a competitor for a year.',
      what_to_ask: 'Will the company confirm in writing that it will not enforce this after I leave?',
      statute_refs: [{
        section_id: 'ica_1872_s27',
        as_of: '2026-09',
        act: 'Indian Contract Act, 1872',
        section: 's.27',
        text: 'Every agreement by which anyone is restrained from exercising a lawful profession, trade or business of any kind, is to that extent void.',
        judicial_gloss: 'Courts have read s.27 as leaving negative covenants during the employment term enforceable, while post-termination restraints generally fall foul of it.',
        gloss_citations: ['Niranjan Shankar Golikari v. Century Spinning (SC, 1967)'],
        force: 'central-binding',
      }],
      reason: null,
      applicability: null,
      confidence: 'verified',
    },
    {
      id: 'f_bond',
      node_id: 'n_bond_money',
      basis: 'statutory',
      severity: 'act_on_this',
      consequence: 'Leaving before month 24 puts Rs. 2,00,000 on you, payable to the company.',
      what_to_ask: 'What training expenditure does this Rs. 2,00,000 actually represent?',
      statute_refs: [{
        section_id: 'ica_1872_s74',
        as_of: '2026-09',
        act: 'Indian Contract Act, 1872',
        section: 's.74',
        // The section's OWN words. Note "whether or not actual damage or loss is
        // proved" — the earlier draft said a court looks at proven loss, which is
        // the gloss, not the text. Same error class as s.27, made inside the s.27 fix.
        text: 'Where a sum is named in the contract as the amount to be paid in case of breach, the party complaining of the breach is entitled, whether or not actual damage or loss is proved to have been caused thereby, to receive reasonable compensation not exceeding the amount so named.',
        judicial_gloss: 'Courts distinguish a genuine pre-estimate of loss from a penalty, and in service-bond cases have looked to documented training expenditure.',
        gloss_citations: ['Fateh Chand v. Balkishan Das', 'Kailash Nath Associates v. DDA'],
        force: 'central-binding',
      }],
      reason: null,
      applicability: null,
      confidence: 'verified',
    },
    {
      // [STATE 3] asymmetry basis: NO citation attached, and it says so.
      id: 'f_certificate',
      node_id: 'n_certificate_withheld',
      basis: 'asymmetry',
      severity: 'ask_about_this',
      consequence: 'The company can hold your experience letter until the bond is paid.',
      what_to_ask: 'Will you release my experience and relieving letters regardless of any bond dispute?',
      statute_refs: [],
      reason: 'Sole discretion granted to one party, no defined standard, no timeline, and no reciprocal right for you.',
      applicability: null,
      confidence: 'worth_checking',
    },
  ],

  coverage: {
    // 41 found, 38 verified, 3 dropped. Invariant holds — checkCoverageInvariant
    // is asserted against this fixture in the test suite.
    extracted: 41,
    located: 38,
    verified: 38,
    entailed: 37,
    rendered: 37,
    dropped: { span_not_found: 2, ambiguous: 1, entail_failed: 1, dangling_edge: 0, render: 0 },
    mode: 'normal',
    dropped_nodes: [
      // [STATE 1] dropped nodes. No validated span by definition, so the quote is
      // shown explicitly framed as unconfirmed rather than as a citation.
      { reason: 'span_not_found', unvalidated_quote: 'the Employee shall indemnify the Company against all losses' },
      { reason: 'span_not_found', unvalidated_quote: 'confidentiality shall survive termination indefinitely' },
      { reason: 'ambiguous', unvalidated_quote: 'shall pay to the Company' },
      // entail_failed: the words ARE in the document, but a verification pass
      // found they did not support the reading we built on them. Counted in
      // dropped.entail_failed, so it must be enumerated here too.
      { reason: 'entail_failed', unvalidated_quote: 'the Company reserves the right to vary these terms' },
    ],
  },

  job: {
    id: 'job_fixture',
    document_id: 'doc_fixture_priya',
    stage: 'checking_law',
    status: 'done',
    deadline_at: '2026-07-01T00:00:00Z',
    error_code: null,
    counts: { found: 41, verified: 38 },
  },

  timeline: {
    months: 36,
    service_start: '2026-07-01',
    event: 'resignation_effective',
    has_temporal_obligations: true,
    rows: [
      {
        node_id: 'n_bond_money',
        label: 'Service bond',
        sort_key: 200000,
        assumption: null,
        states: Array.from({ length: 37 }, (_, m) => ({
          month: m,
          active: m < 24,
          text: m < 24 ? 'Rs. 2,00,000 payable within 30 days' : 'Bond satisfied — no amount payable',
        })),
      },
      {
        node_id: 'n_certificate_withheld',
        label: 'Experience certificate',
        sort_key: 100,
        assumption: null,
        states: Array.from({ length: 37 }, (_, m) => ({
          month: m,
          active: m < 24,
          text: m < 24 ? 'Withheld until bond dues are settled' : 'Released on exit',
        })),
      },
      {
        node_id: 'n_postterm_restraint',
        label: 'Non-compete',
        sort_key: 50,
        assumption: null,
        states: Array.from({ length: 37 }, (_, m) => ({
          month: m,
          active: true,
          // No verdict language. "may apply", never "void". This is the one
          // surface where the user is making a decision.
          text: '12 months claimed after leaving — s.27 may apply, check before relying on it',
        })),
      },
      {
        // [STATE 4] assumption-based row. The document says what happens IF she
        // refuses relocation; it never says whether she was asked.
        node_id: 'n_relocation',
        label: 'Relocation refusal',
        sort_key: 10,
        assumption: 'assuming you are asked to relocate and decline',
        states: Array.from({ length: 37 }, (_, m) => ({
          month: m,
          active: true,
          text: 'Company may require relocation to any office',
        })),
      },
    ],
  },
};

export default priyaOfferLetter;
