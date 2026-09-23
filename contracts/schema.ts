/**
 * Anubandh — the frozen contract.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  THIS FILE IS THE CONTRACT. Prose in the PRD defers to it.           │
 * │  Frontend (Claude Code) and backend (Antigravity) both compile       │
 * │  against these schemas. Neither side changes them alone.             │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Six payloads the UI renders. `document` is one of them: the split view and
 * Plain Language highlight char offsets inside our normalized canonical text,
 * so freezing the other five and calling the seam mitigated leaves the UI with
 * nothing to highlight against.
 *
 *   document     normalized_text, offset_map, page_offsets, sha256
 *   graph        nodes + edges
 *   flags[]      basis, severity, statute refs, applicability
 *   coverage     extracted / located / verified / entailed / dropped
 *   job          stage, status, deadline  (F4 polling)
 *   timeline[N]  precomputed per-month consequence array  (X4)
 *
 * The Gemini `responseSchema` is GENERATED from these, never hand-written
 * twice. Two hand-maintained schemas that must agree is how a dead card at
 * hour 30 happens.
 */

import { z } from 'zod';

/** Bumped whenever a graph shape changes. A reader that sees a mismatch marks
 *  the graph stale and forces re-extraction — it never tries to render it. */
export const SCHEMA_VERSION = 1;

/* ─────────────────────────── provenance ─────────────────────────── */

/**
 * The model emits `quoted_text` ONLY. Offsets are computed by LOCATE against
 * the normalized canonical text. Language models do not produce trustworthy
 * character positions, and a design that assumes they do has no grounding
 * guarantee at all.
 */
export const Provenance = z.object({
  /** Null for DOCX: pagination is a Word rendering property; mammoth has none. */
  page: z.number().int().nonnegative().nullable(),
  /** A clause can straddle pages; one column would lose that. */
  page_end: z.number().int().nonnegative().nullable(),
  /** Paragraph index — the DOCX fallback when `page` is null. */
  paragraph: z.number().int().nonnegative().nullable(),
  char_start: z.number().int().nonnegative(),
  char_end: z.number().int().nonnegative(),
  /** 8–20 words. The minimal DISTINCTIVE span, never the whole clause: long
   *  quotes fail exact matching far more often than short ones. */
  quoted_text: z.string().min(1),
  located_by: z.enum(['exact', 'fuzzy']),
  /** How many candidate positions matched. 2 is the dangerous case: it passes
   *  VERIFY and ENTAIL while pointing at the wrong clause. Reported alongside
   *  the fuzzy share; a rising number means the minimal-span rule is over-tuned. */
  located_ambiguity: z.number().int().min(1),
  /** Did a Flash pass confirm this span actually supports the node's fields?
   *  Verbatim matching proves the quote EXISTS, not that it means what we say. */
  entailed: z.boolean(),
});
export type Provenance = z.infer<typeof Provenance>;

/**
 * Every mockup leads with "Clause 12.2". That label needs the same discipline
 * as every other rendered string, or it is the one thing on screen that is not
 * span-validated. The null case is the COMMON case: real Indian offer letters
 * number inconsistently ("9.2", "IX(b)", "Clause Nine", or nothing).
 */
export const ClauseRef = z.object({
  label: z.string().nullable(),
  provenance: Provenance.nullable(),
});
export type ClauseRef = z.infer<typeof ClauseRef>;

/**
 * s.27 gates on this. A restraint operating DURING employment is generally
 * enforceable; only POST-termination restraints are what s.27 voids. Firing on
 * the wrong one produces a confident, cited, legally false statement.
 *
 * `not_applicable` exists so a Party or Term node is not forced to claim
 * `unclear` — which would gate the resolver and pollute a metric targeted at 100%.
 */
export const TemporalScope = z.enum([
  'during_employment',
  'post_employment',
  'unclear',
  'not_applicable',
]);
export type TemporalScope = z.infer<typeof TemporalScope>;

/* ───────────────────────── condition predicates ───────────────────────── */

/**
 * CLOSED vocabulary. Free-text predicates mean four documents produce four
 * spellings of the same idea and the scrubber can evaluate none of them.
 *
 * `requires_user_fact` is the Codex finding: "asked to relocate", "terminated"
 * and "extended leave" are events in the USER'S LIFE. The document says what
 * happens IF they occur; it never says whether they have. The UI must ask
 * before computing, and label the result as assumption-based.
 */
export const ConditionPredicate = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('resigns_before_month'), month: z.number().int().positive(), requires_user_fact: z.literal(false) }),
  z.object({ kind: z.literal('bond_period_complete'), requires_user_fact: z.literal(false) }),
  z.object({ kind: z.literal('notice_given'), days: z.number().int().nonnegative(), requires_user_fact: z.literal(false) }),
  z.object({ kind: z.literal('terminated_by_employer'), requires_user_fact: z.literal(true) }),
  z.object({ kind: z.literal('terminated_for_cause'), requires_user_fact: z.literal(true) }),
  z.object({ kind: z.literal('relocation_refused'), requires_user_fact: z.literal(true) }),
  z.object({ kind: z.literal('competing_employment'), requires_user_fact: z.literal(true) }),
  z.object({ kind: z.literal('leave_exceeds'), days: z.number().int().positive(), requires_user_fact: z.literal(true) }),
  /** Retains verbatim text, excluded from Timeline, counted in coverage, still
   *  shown in Plain Language. Silence is better than a guessed predicate. */
  z.object({ kind: z.literal('unclassified'), verbatim: z.string(), requires_user_fact: z.literal(false) }),
]);
export type ConditionPredicate = z.infer<typeof ConditionPredicate>;

/* ─────────────────────────────── nodes ─────────────────────────────── */

export const NodeKind = z.enum([
  'Party', 'Obligation', 'Restraint', 'Right',
  'Condition', 'Term', 'Money', 'Deadline', 'TerminationPath',
]);
export type NodeKind = z.infer<typeof NodeKind>;

/** Deadlines are canonical in DAYS. Documents speak in days and hours ("within
 *  30 days", "72h"); the scrubber is month-indexed. Sub-month deadlines render
 *  as text on the row rather than as a position. */
const DeadlineFields = z.object({
  days: z.number().int().nullable(),
  absolute_date: z.string().nullable(),
  gates: z.string(),
  on_miss: z.string().nullable(),
});

/**
 * `amount_text` is verbatim from the span and is WHAT RENDERS.
 * `amount_value` is derived and used only for sorting and comparison.
 *
 * Indian documents write ₹2,00,000 / Rs. 2,00,000/- / INR 200000 / "Rupees Two
 * Lakhs Only", and lakh-crore grouping breaks thousands-grouping assumptions
 * (1,00,00,000 is one crore). ENTAIL cannot catch a transcription error — the
 * span DOES contain the number; the error is in the reading. On parse failure
 * `amount_value` is null, the node sorts last, and the text renders unchanged.
 * Never a guessed number.
 */
const MoneyFields = z.object({
  amount_text: z.string().min(1),
  amount_value: z.number().nullable(),
  currency: z.string().default('INR'),
  payer: z.string().nullable(),
  capped: z.boolean().nullable(),
});

export const GraphNode = z.object({
  id: z.string().min(1),
  kind: NodeKind,
  temporal_scope: TemporalScope,
  /** Kind-specific payload. Discriminated at the application layer; kept open
   *  here so the Gemini responseSchema stays inside its supported subset —
   *  a 9-way nested union is the shape that most often fails to translate. */
  fields: z.record(z.string(), z.unknown()),
  predicate: ConditionPredicate.nullable(),
  money: MoneyFields.nullable(),
  deadline: DeadlineFields.nullable(),
  clause_ref: ClauseRef,
  provenance: Provenance,
  confidence: z.enum(['verified', 'worth_checking']),
});
export type GraphNode = z.infer<typeof GraphNode>;

/* ─────────────────────────────── edges ─────────────────────────────── */

export const EdgeRelation = z.enum([
  'triggers', 'gated_by', 'defined_by', 'references',
  'survives_termination', 'penalty_for', 'conflicts_with',
]);
export type EdgeRelation = z.infer<typeof EdgeRelation>;

/**
 * Edges run the SAME pipeline as nodes. Timeline IS edge traversal, and the
 * demo says "graph traversal over verified spans" — so an unvalidated edge puts
 * an unverified link in the middle of the product's central claim.
 *
 * `inferred: true` marks an edge with no textual support (pure structural
 * inference). Timeline steps derived from inferred edges render distinctly.
 */
export const GraphEdge = z.object({
  id: z.string().min(1),
  from_node: z.string().min(1),
  to_node: z.string().min(1),
  relation: EdgeRelation,
  inferred: z.boolean(),
  /** Null only when `inferred` is true. */
  provenance: Provenance.nullable(),
});
export type GraphEdge = z.infer<typeof GraphEdge>;

export const Graph = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  nodes: z.array(GraphNode),
  edges: z.array(GraphEdge),
});
export type Graph = z.infer<typeof Graph>;

/* ───────────────────────────── document ───────────────────────────── */

/**
 * We highlight against OUR normalized text, not PDF coordinates. But "the user
 * can tell if we mangled it" is unfalsifiable without a route back to the
 * source — so NORMALIZE emits `offset_map`, built at the only point where both
 * coordinate systems exist.
 */
export const DocumentPayload = z.object({
  id: z.string().min(1),
  sha256: z.string().length(64),
  source_kind: z.enum(['pdf', 'docx', 'paste', 'ocr']),
  /** OCR documents force the coverage strip into cautionary mode regardless of
   *  location rate: OCR noise degrades "a span you can read yourself" into
   *  "a span you can read our misreading of". */
  page_count: z.number().int().nonnegative().nullable(),
  normalized_text: z.string(),
  page_offsets: z.array(z.object({ page: z.number().int(), start: z.number().int(), end: z.number().int() })),
  offset_map: z.array(z.object({ raw: z.number().int(), normalized: z.number().int() })),
  /** Original stays fetchable at the cited page for the 24h retention window
   *  and not one minute longer; after purge the affordance disappears rather
   *  than resurrecting the file. */
  original_available: z.boolean(),
});
export type DocumentPayload = z.infer<typeof DocumentPayload>;

/* ─────────────────────────────── flags ─────────────────────────────── */

/**
 * Two bases, labelled distinctly so an uncited flag can never borrow the
 * credibility of a cited one. Grouping them into separate sections makes that
 * discipline structural rather than typographic — in one ranked list, vertical
 * position IS credibility.
 */
export const FlagBasis = z.enum(['statutory', 'asymmetry']);
export type FlagBasis = z.infer<typeof FlagBasis>;

/** Named scale. "A restrained three-step scale" with the steps never enumerated
 *  left `severity` mapped to nothing. Never colour alone: rule + icon + label. */
export const Severity = z.enum(['act_on_this', 'ask_about_this', 'know_about_this']);
export type Severity = z.infer<typeof Severity>;

export const StatuteRef = z.object({
  section_id: z.string().min(1),
  /** Sections are append-only by (section_id, as_of): a refresh INSERTS a new
   *  version. Without this, a corpus refresh silently rewrites the text a
   *  historical flag points at. */
  as_of: z.string(),
  act: z.string(),
  section: z.string(),
  /** What the section's own words say. Earns a place here only by quoting it. */
  text: z.string(),
  /** Court-developed rule, labelled as case law, never as statute. Two of the
   *  three statutory claims in this product were originally gloss written as
   *  text — including inside the fix for the first one. */
  judicial_gloss: z.string().nullable(),
  gloss_citations: z.array(z.string()),
  force: z.enum(['central-binding', 'state-enacted', 'model-not-binding']),
});
export type StatuteRef = z.infer<typeof StatuteRef>;

export const Flag = z.object({
  id: z.string().min(1),
  node_id: z.string().min(1),
  basis: FlagBasis,
  severity: Severity,
  /** One-line plain-language consequence. This is what the user reads FIRST —
   *  ahead of provenance, ahead of temporal_scope. */
  consequence: z.string().min(1),
  /** Mandatory on EVERY card, not just the statutory ones. */
  what_to_ask: z.string().min(1),
  /** Empty for `asymmetry` flags. An uncited flag states its computed reason. */
  statute_refs: z.array(StatuteRef),
  reason: z.string().nullable(),
  /** Null when no state-dependent statute applies. The resolver REFUSES to fire
   *  when applicability is unresolved — it renders "confirm your state" instead. */
  applicability: z.string().nullable(),
  confidence: z.enum(['verified', 'worth_checking']),
});
export type Flag = z.infer<typeof Flag>;

/* ────────────────────────────── coverage ────────────────────────────── */

/**
 * INVARIANT — asserted in a unit test that fails the build:
 *
 *   extracted = located  + dropped.span_not_found + dropped.ambiguous
 *   located   = verified                            (by construction)
 *   verified  = entailed + dropped.entail_failed
 *   entailed  = rendered + dropped.render           (X2 boundary failures)
 *
 * The integrity thesis is the whole pitch, and it fails publicly on an
 * off-by-one: header says 38, list shows 36.
 */
export const Coverage = z.object({
  extracted: z.number().int().nonnegative(),
  located: z.number().int().nonnegative(),
  verified: z.number().int().nonnegative(),
  entailed: z.number().int().nonnegative(),
  rendered: z.number().int().nonnegative(),
  dropped: z.object({
    span_not_found: z.number().int().nonnegative(),
    ambiguous: z.number().int().nonnegative(),
    entail_failed: z.number().int().nonnegative(),
    dangling_edge: z.number().int().nonnegative(),
    render: z.number().int().nonnegative(),
  }),
  /** Drives the three-weight coverage strip: normal / cautionary / reduced. */
  mode: z.enum(['normal', 'cautionary', 'reduced']),
  dropped_nodes: z.array(z.object({
    reason: z.enum(['span_not_found', 'ambiguous', 'entail_failed', 'dangling_edge', 'render']),
    /** Shown struck and greyed under "we could not confirm this text appears in
     *  your document". A dropped node has no validated span by definition, so
     *  this is the honest middle between a bare reason code and a false claim. */
    unvalidated_quote: z.string().nullable(),
  })),
});
export type Coverage = z.infer<typeof Coverage>;

/* ──────────────────────────────── job ──────────────────────────────── */

/** ONE error namespace, exported from here and mapped to user copy in one
 *  table. Three overlapping namespaces (PascalCase exceptions, snake_case
 *  counters, an untyped error_code column) is how copy drifts from behaviour. */
export const ErrorCode = z.enum([
  'schema_validation', 'response_truncated', 'model_refusal',
  'rate_limited', 'upstream_timeout', 'span_not_found', 'ambiguous_span',
  'citation_unresolved', 'applicability_unknown', 'ocr_quality',
  'encrypted_document', 'oversize_document', 'not_legal_document', 'internal',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const JobStage = z.enum(['reading', 'extracting', 'verifying', 'checking_law']);
export type JobStage = z.infer<typeof JobStage>;

export const Job = z.object({
  id: z.string().min(1),
  document_id: z.string().min(1),
  stage: JobStage,
  /** `cancelled` exists because F5 ships a cancel button. `timed_out` exists
   *  because X5/X7/X8 are HANGS, not errors — without it the client polls
   *  `running` forever. Transitioned LAZILY on the job GET (now() > deadline_at),
   *  because there is no background worker on Vercel Hobby to sweep it. */
  status: z.enum(['queued', 'running', 'done', 'failed', 'cancelled', 'timed_out']),
  deadline_at: z.string(),
  error_code: ErrorCode.nullable(),
  counts: z.object({ found: z.number().int(), verified: z.number().int() }).nullable(),
});
export type Job = z.infer<typeof Job>;

/* ────────────────────────────── timeline ────────────────────────────── */

/**
 * Event model. A predicate grammar gives the scrubber something to evaluate;
 * it does not give it semantics. Edges are not business logic.
 */
export const TimelineEvent = z.enum([
  'resignation_submitted',
  'resignation_effective',   // ← the scrubber handle is THIS
  'termination_by_employer',
  'abandonment',
]);
export type TimelineEvent = z.infer<typeof TimelineEvent>;

export const TimelineRow = z.object({
  node_id: z.string().min(1),
  label: z.string().min(1),
  /** Money first (largest), then Restraint, then Right. Capped at 5 with
   *  "+N more" — but membership is computed ONCE and held constant across the
   *  whole drag. Only cell content changes; rows never appear or disappear. */
  sort_key: z.number(),
  /** Templated from structured fields, NOT generated per state. One narration
   *  per node cannot express two states, and per-(node,state) generation is an
   *  unbudgeted Flash pass that would break "zero model calls during interaction". */
  states: z.array(z.object({
    month: z.number().int().nonnegative(),
    active: z.boolean(),
    text: z.string(),
  })),
  /** True when this row only applies under a user-supplied assumption. */
  assumption: z.string().nullable(),
});
export type TimelineRow = z.infer<typeof TimelineRow>;

export const Timeline = z.object({
  /** N = clamp(longest Deadline or Restraint duration, 12, 84). Derived from
   *  the document, not hardcoded to 36. A five-year bond on a three-year
   *  scrubber silently hides its own worst case. */
  months: z.number().int().min(12).max(84),
  /** Month 0. From the document's joining date; if absent the user supplies it
   *  and the Timeline says so. */
  service_start: z.string().nullable(),
  event: TimelineEvent,
  rows: z.array(TimelineRow),
  /** Empty is a real state: hide the scrubber and explain what the document
   *  DOES contain, rather than rendering a dead feature. */
  has_temporal_obligations: z.boolean(),
});
export type Timeline = z.infer<typeof Timeline>;

/* ──────────────────────────────── ask ──────────────────────────────── */

/**
 * The advice boundary, as a type.
 *
 * The brief's binding constraint is information and assistance, NOT a
 * replacement for professional advice, and the Advocates Act 1961 reserves the
 * practice of law to enrolled advocates. The classifier is the mechanism that
 * holds that line, so its outcomes belong in the contract rather than in one
 * side's implementation: a backend that answers an ADVICE question as asked
 * would sail straight past a frontend that only knows how to render answers.
 */
export const AskOutcome = z.enum([
  'information',   // what does clause 12.2 mean, what does s.27 say
  'advice',        // should I sign, will I win, can they enforce this
  'escalate',      // arrest, summons, deadline under 72h, a minor involved
  'no_coverage',   // we did not extract anything that answers this
]);
export type AskOutcome = z.infer<typeof AskOutcome>;

/** A citation points at a span we already verified. It carries the offsets so
 *  the answer can open the split view at the exact words. */
export const AskCitation = z.object({
  node_id: z.string().min(1),
  clause_label: z.string().nullable(),
  quoted_text: z.string().min(1),
  char_start: z.number().int().nonnegative(),
  char_end: z.number().int().nonnegative(),
});
export type AskCitation = z.infer<typeof AskCitation>;

export const EscalationContact = z.object({
  name: z.string().min(1),
  detail: z.string().min(1),
});

export const AskResponse = z.object({
  question: z.string().min(1),
  outcome: AskOutcome,
  /** The body. On `escalate` this is still populated: contacts render BEFORE
   *  it, but the interstitial offers a way to continue, and continuing has to
   *  arrive at the reading rather than at a blank screen. */
  answer: z.string(),
  /** An uncited answer is indistinguishable from a guess, which is the exact
   *  failure this product exists to avoid. INFORMATION answers cite or they
   *  degrade to `no_coverage`. */
  citations: z.array(AskCitation),
  /** ADVICE: reframe first, handoff second. Leading with the refusal teaches
   *  the reader that the product dodges, and they stop asking. */
  handoff: z.string().nullable(),
  /** ESCALATE: rendered above everything, with an explicit way to continue. */
  escalation: z.object({
    reason: z.string().min(1),
    contacts: z.array(EscalationContact).min(1),
  }).nullable(),
});
export type AskResponse = z.infer<typeof AskResponse>;

/* ────────────────────────── the whole payload ────────────────────────── */

export const AnalysisPayload = z.object({
  document: DocumentPayload,
  graph: Graph,
  flags: z.array(Flag),
  coverage: Coverage,
  job: Job,
  timeline: Timeline,
});
export type AnalysisPayload = z.infer<typeof AnalysisPayload>;

/** Asserts the §9.5 coverage invariant. Called by the fixture test; a build
 *  fails rather than shipping a header count that disagrees with the cards. */
export function checkCoverageInvariant(c: Coverage): string[] {
  const errs: string[] = [];
  const { dropped: d } = c;
  if (c.extracted !== c.located + d.span_not_found + d.ambiguous)
    errs.push(`extracted(${c.extracted}) != located(${c.located}) + span_not_found(${d.span_not_found}) + ambiguous(${d.ambiguous})`);
  if (c.located !== c.verified)
    errs.push(`located(${c.located}) != verified(${c.verified}) — verification is 100% by construction`);
  if (c.verified !== c.entailed + d.entail_failed)
    errs.push(`verified(${c.verified}) != entailed(${c.entailed}) + entail_failed(${d.entail_failed})`);
  if (c.entailed !== c.rendered + d.render)
    errs.push(`entailed(${c.entailed}) != rendered(${c.rendered}) + render(${d.render})`);
  return errs;
}
