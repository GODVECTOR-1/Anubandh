import 'server-only';
import {
  AnalysisPayload,
  checkCoverageInvariant,
  SCHEMA_VERSION,
  type ConditionPredicate,
  type Coverage,
  type Flag,
  type GraphEdge,
  type GraphNode,
  type Job,
  type Provenance,
  type Timeline,
  type TimelineRow,
} from '@/contracts/schema';
import { describeNode, KIND_LABEL } from '@/lib/describe';
import { extract, flag as proposeFlags, ExtractedItem } from '@/lib/gemini';
import { pageAt, paragraphAt, type Normalized } from '@/lib/normalize';
import { PipelineError } from '@/lib/pipeline-error';
import { entail, sectionMenu } from '@/lib/statutes';
import type { z } from 'zod';

/**
 * The provenance pipeline: reading → extracting → verifying → checking_law.
 *
 * The accounting at the bottom of this file is an INVARIANT, not a report:
 *
 *   extracted = located + dropped.span_not_found + dropped.ambiguous
 *   located   = verified                       // by construction, see below
 *   verified  = entailed + dropped.entail_failed
 *   entailed  = rendered + dropped.render
 *
 * `located === verified` is structural, not aspirational. A located span is one
 * that was FOUND in the document by the same code that records its offsets —
 * there is no point at which something is located but unverified, because the
 * locating IS the verification. Nothing later reconciles the two.
 */

/** One extracted obligation, as the model returned it. Exported because a
 *  caller that caches an extraction between attempts has to name its type. */
export type Item = z.infer<typeof ExtractedItem>;
type DropReason = Coverage['dropped_nodes'][number]['reason'];

/* ─────────────────────────────── LOCATE ─────────────────────────────── */

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Every position in `haystack` where `needle` occurs, treating any run of
 * whitespace as equivalent to any other.
 *
 * That tolerance is not fuzzy matching and it is not a repair. PDF extraction
 * wraps a clause across lines wherever the column happened to end, so the
 * document's own text contains line breaks no model would ever reproduce. Every
 * non-whitespace character still has to match, in order, with nothing inserted,
 * dropped or corrected. A near-miss — a different word, a tidied abbreviation,
 * a number that reads better — finds nothing and the item is dropped, which is
 * precisely the failure mode this pipeline exists to prevent.
 */
function occurrences(haystack: string, needle: string): Array<{ start: number; end: number }> {
  const trimmed = needle.trim();
  if (trimmed.length < 8) return [];
  const pattern = trimmed.split(/\s+/).map(esc).join('\\s+');
  const re = new RegExp(pattern, 'g');
  const out: Array<{ start: number; end: number }> = [];
  for (const m of haystack.matchAll(re)) {
    out.push({ start: m.index, end: m.index + m[0].length });
    if (out.length > 16) break; // a phrase this repetitive cannot be disambiguated anyway
  }
  return out;
}

/**
 * Pick one occurrence when there are several.
 *
 * The document's own clause numbering is the only disambiguator we accept: if
 * the model said this came from clause 9.2, the occurrence that follows the
 * literal "9.2" is the one it meant. Anything else — nearest to the top, longest
 * context, highest model confidence — is a guess dressed as a rule, and a
 * citation pointing at the wrong clause is worse than no citation at all.
 */
function disambiguate(
  text: string,
  hits: Array<{ start: number; end: number }>,
  clauseLabel: string,
): { start: number; end: number } | null {
  if (hits.length === 1) return hits[0];
  const label = clauseLabel.trim();
  if (!label) return null;

  const anchor = text.indexOf(label);
  if (anchor < 0) return null;

  const within = hits.filter((h) => h.start >= anchor && h.start - anchor < 1200);
  return within.length === 1 ? within[0] : null;
}

/* ─────────────────────────────── ENTAIL ─────────────────────────────── */

const WORD_NUMBER: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, eighteen: 18,
  twenty: 20, thirty: 30, forty: 40, sixty: 60, ninety: 90,
  'twenty-four': 24, 'thirty-six': 36,
};

/**
 * Does the span actually support what the node claims about it?
 *
 * Deterministic rather than a second model pass. The contract's MoneyFields
 * comment worries that ENTAIL cannot catch a transcription error, because the
 * span does contain the number and the mistake is in the reading — checking the
 * digits against the span closes exactly that gap, and does it without another
 * call that could itself be wrong.
 */
function supports(item: Item, span: string): boolean {
  const digitsIn = (s: string) => (s.match(/\d/g) ?? []).join('');

  if (item.amount_text.trim()) {
    const claimed = digitsIn(item.amount_text);
    if (claimed && !digitsIn(span).includes(claimed)) return false;
  }

  for (const n of [item.duration_months, item.notice_days, item.deadline_days]) {
    if (!n) continue;
    const asDigits = String(n);
    const asWord = Object.keys(WORD_NUMBER).find((w) => WORD_NUMBER[w] === n);
    const hit = span.includes(asDigits) || (asWord && new RegExp('\\b' + asWord + '\\b', 'i').test(span));
    if (!hit) return false;
  }
  return true;
}

/* ──────────────────────────── node assembly ──────────────────────────── */

/** Indian grouping: 2,00,000 is two lakh. Stripping separators and parsing is
 *  correct for both groupings; a thousands-grouping assumption is not. Null on
 *  any doubt — the verbatim `amount_text` is what renders either way. */
function amountValue(text: string): number | null {
  const m = text.replace(/[,\s]/g, '').match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  const v = Number(m[0]);
  return Number.isFinite(v) ? v : null;
}

function predicateFor(item: Item, span: string): ConditionPredicate | null {
  const hay = (span + ' ' + item.trigger + ' ' + item.summary).toLowerCase();

  const beforeMonths = hay.match(/before\s+(?:completing\s+)?(?:(\d{1,3})|([a-z-]+))\s*(?:\(\d+\)\s*)?months?/);
  if (beforeMonths) {
    const n = beforeMonths[1] ? Number(beforeMonths[1]) : WORD_NUMBER[beforeMonths[2]] ?? 0;
    if (n > 0) return { kind: 'resigns_before_month', month: n, requires_user_fact: false };
  }
  if (item.notice_days > 0) return { kind: 'notice_given', days: item.notice_days, requires_user_fact: false };
  if (/relocat/.test(hay)) return { kind: 'relocation_refused', requires_user_fact: true };
  if (/compet/.test(hay)) return { kind: 'competing_employment', requires_user_fact: true };
  if (/terminat/.test(hay) && /cause|misconduct/.test(hay)) return { kind: 'terminated_for_cause', requires_user_fact: true };
  if (item.kind === 'Condition') return { kind: 'unclassified', verbatim: span, requires_user_fact: false };
  return null;
}

function toNode(item: Item, provenance: Provenance, clauseProvenance: Provenance | null, span: string): GraphNode {
  const money = item.amount_text.trim()
    ? {
        amount_text: item.amount_text.trim(),
        amount_value: amountValue(item.amount_text),
        currency: 'INR',
        payer: item.payer.trim() || null,
        capped: null,
      }
    : null;

  const deadline =
    item.deadline_days > 0 || item.gates.trim()
      ? {
          days: item.deadline_days > 0 ? item.deadline_days : null,
          absolute_date: null,
          gates: item.gates.trim() || item.summary,
          on_miss: null,
        }
      : null;

  // Only keys lib/describe.ts actually reads, and only when they carry content.
  // An empty string in `action` renders as "You may be required to ." — a blank
  // where the document's own words should be.
  const fields: Record<string, unknown> = { summary: item.summary };
  if (item.trigger.trim()) fields.trigger = item.trigger.trim();
  if (item.restrained.trim()) fields.restrained = item.restrained.trim();
  if (item.duration_months > 0) fields.duration_months = item.duration_months;
  if (item.action.trim()) fields.action = item.action.trim();
  if (item.holder.trim()) fields.holder = item.holder.trim();
  if (item.notice_days > 0) fields.notice_days = item.notice_days;
  if (item.in_lieu.trim()) fields.in_lieu = item.in_lieu.trim();

  return {
    id: item.id,
    kind: item.kind,
    temporal_scope: item.temporal_scope,
    fields,
    predicate: predicateFor(item, span),
    money,
    deadline,
    clause_ref: { label: item.clause_label.trim() || null, provenance: clauseProvenance },
    provenance,
    // A span located among several candidates is shown as worth checking, not
    // as verified. The count is in the provenance either way.
    confidence: provenance.located_ambiguity === 1 ? 'verified' : 'worth_checking',
  };
}

/* ────────────────────────────── timeline ────────────────────────────── */

/** N = clamp(longest deadline or restraint duration, 12, 84). Derived from the
 *  document, never hardcoded: a five-year bond on a three-year scrubber
 *  silently hides its own worst case. */
function horizon(nodes: GraphNode[]): number {
  let longest = 12;
  for (const n of nodes) {
    const months = Number(n.fields.duration_months ?? 0);
    if (months > longest) longest = months;
    if (n.predicate?.kind === 'resigns_before_month' && n.predicate.month > longest) longest = n.predicate.month;
    if (n.deadline?.days) longest = Math.max(longest, Math.ceil(n.deadline.days / 30));
  }
  return Math.min(84, Math.max(12, Math.ceil(longest / 12) * 12));
}

/** Templated from structured fields, not generated per state. One narration per
 *  node cannot express two states, and per-(node, month) generation would be a
 *  model call during interaction — which the product promises it never makes. */
function timelineFor(nodes: GraphNode[]): Timeline {
  const months = horizon(nodes);
  const bondUntil = nodes.find((n) => n.predicate?.kind === 'resigns_before_month')?.predicate;
  const cliff = bondUntil?.kind === 'resigns_before_month' ? bondUntil.month : 0;

  const rows: TimelineRow[] = [];
  for (const n of nodes) {
    const label = n.clause_ref.label ? KIND_LABEL[n.kind] + ' ' + n.clause_ref.label : KIND_LABEL[n.kind];
    const before = describeNode(n);

    let active: (m: number) => boolean;
    let after: string;

    if (n.money && cliff > 0) {
      active = (m) => m < cliff;
      after = 'Satisfied after month ' + cliff + ' — no amount payable.';
    } else if (n.kind === 'Restraint' && n.temporal_scope === 'post_employment') {
      const d = Number(n.fields.duration_months ?? 0) || months;
      active = (m) => m < d;
      after = 'The stated period has run.';
    } else if (n.kind === 'Right' && cliff > 0) {
      active = (m) => m < cliff;
      after = 'No longer tied to the bond.';
    } else {
      continue; // nothing time-dependent to say; a static row is a dead row
    }

    rows.push({
      node_id: n.id,
      label,
      sort_key: n.money?.amount_value ?? (n.kind === 'Restraint' ? 50 : 10),
      assumption: n.predicate?.requires_user_fact
        ? 'assuming this happens to you — the document says what follows, not whether it has'
        : null,
      states: Array.from({ length: months + 1 }, (_, m) => ({
        month: m,
        active: active(m),
        text: active(m) ? before : after,
      })),
    });
  }

  rows.sort((a, b) => b.sort_key - a.sort_key);

  return {
    months,
    service_start: null, // the document rarely states it; the Timeline says so
    event: 'resignation_effective',
    // Empty is a real state: the scrubber hides itself and explains what the
    // document DOES contain, rather than rendering a dead control.
    has_temporal_obligations: rows.length > 0,
    rows,
  };
}

/* ────────────────────────────── the run ────────────────────────────── */

export type PipelineResult = { payload: AnalysisPayload; dropRate: number };

export async function runPipeline(opts: {
  /** Already normalised, by POST /api/documents. NORMALIZE is the one stage
   *  with no model call in it, and its offset map only exists at the moment the
   *  bytes are read — which is a different request from this one. */
  doc: Normalized;
  documentId: string;
  jobId: string;
  deadlineAt: string;
  state: string | null;
  onStage?: (stage: Job['stage'], counts: Job['counts']) => void | Promise<void>;
  /**
   * Extraction already paid for, on an earlier attempt at this same document.
   *
   * A transient upstream failure hands the job back for one retry, and without
   * this that retry starts from the top — re-extracting a document that had
   * already been read successfully, and paying for it again, because the call
   * that actually failed was the LATER one. Extraction is deterministic given
   * the same text and the text cannot change (documents are immutable once
   * normalised), so reusing it is exact rather than an approximation.
   */
  cachedItems?: Item[] | null;
  /** Called once, with a fresh extraction, so the caller can store it against
   *  the document before the stages that might still fail. */
  onExtracted?: (items: Item[]) => void | Promise<void>;
  /**
   * The three model calls, injectable.
   *
   * Not an abstraction for its own sake — it is the only way to assert the part
   * of this file that actually carries the product's promise. LOCATE, VERIFY,
   * ENTAIL and the coverage accounting are deterministic, so with a known
   * extraction in front of them they are testable to the character; behind a
   * live Gemini call they are testable to "it seemed to work". §11 also asks
   * for the drop rate to be measured early, and that needs a fixed input.
   */
  calls?: { extract: typeof extract; flag: typeof proposeFlags };
}): Promise<PipelineResult> {
  const { onStage, doc } = opts;
  const calls = opts.calls ?? { extract, flag: proposeFlags };
  // Every model attempt is measured against the job's own deadline, so the
  // pipeline can never spend longer than the job it belongs to.
  //
  // Split two ways rather than shared first-come-first-served. Extraction is
  // the expensive call and will happily consume everything left, which starved
  // the flag pass and lost a document that had already been read successfully.
  // Reserving the tail is cheaper than redoing the head.
  //
  // There used to be a third slice: a `classify` call asking whether this was a
  // legal document at all, capped at 12 seconds. It was removed, not retuned.
  // A measured Gemini call takes 5 to 14 seconds and returns 503 often enough
  // to matter, so 12 seconds could not fit one honest attempt, let alone the
  // retry that gemini.ts already knows how to make — which is how a cold first
  // upload failed and the reader's second attempt succeeded. Three model calls
  // never fitted in one 50-second request. The call was also redundant: an
  // extraction that finds nothing already throws `not_legal_document` below,
  // which is the same verdict by the same name, reached from evidence rather
  // than from a second opinion. The cost is that a CV is now rejected after an
  // extraction attempt instead of before one.
  const deadline = Date.parse(opts.deadlineAt);
  const extractBy = Math.min(deadline, deadline - 15_000);

  /* reading ─ closes out the stage NORMALIZE opened, which ran at upload */
  await onStage?.('reading', null);

  /* extracting ─ LOCATE */
  await onStage?.('extracting', null);
  // A retry that already has the extraction skips straight past the expensive
  // call. Reported as the same stage either way: from the reader's side the
  // work happened, it just happened a minute ago.
  let items: Item[];
  if (opts.cachedItems && opts.cachedItems.length > 0) {
    items = opts.cachedItems;
  } else {
    items = (await calls.extract(doc.text, extractBy)).items;
    await opts.onExtracted?.(items);
  }
  const extracted = items.length;
  if (extracted === 0) throw new PipelineError('not_legal_document');

  /* verifying ─ VERIFY. Deterministic code, not a model call. If you find
     yourself asking a model whether a quote appears in a document, stop. */
  await onStage?.('verifying', { found: extracted, verified: 0 });

  const dropped_nodes: Coverage['dropped_nodes'] = [];
  const drop = (reason: DropReason, unvalidated_quote: string | null) =>
    dropped_nodes.push({ reason, unvalidated_quote });

  const counts = { span_not_found: 0, ambiguous: 0, entail_failed: 0, render: 0 };
  const seen = new Set<string>();
  const located: Array<{ item: Item; node: GraphNode }> = [];

  for (const item of items) {
    if (!item.id || seen.has(item.id)) item.id = 'n_' + seen.size + '_' + (item.id || item.kind);
    seen.add(item.id);

    const hits = occurrences(doc.text, item.quoted_text);
    if (hits.length === 0) {
      counts.span_not_found++;
      drop('span_not_found', item.quoted_text);
      continue;
    }

    const hit = disambiguate(doc.text, hits, item.clause_label);
    if (!hit) {
      counts.ambiguous++;
      drop('ambiguous', item.quoted_text);
      continue;
    }

    // The stored quote is OUR slice, never the model's string. They differ
    // wherever the document wrapped a line, and the split view slices
    // normalized_text by these offsets — so a stored quote that is merely
    // equivalent would highlight correctly and read back wrong.
    const span = doc.text.slice(hit.start, hit.end);

    const provenance: Provenance = {
      page: pageAt(doc.pageOffsets, hit.start),
      page_end: pageAt(doc.pageOffsets, hit.end - 1),
      paragraph: paragraphAt(doc.text, hit.start),
      char_start: hit.start,
      char_end: hit.end,
      quoted_text: span,
      located_by: span === item.quoted_text.trim() ? 'exact' : 'fuzzy',
      located_ambiguity: hits.length,
      entailed: false, // set below; a span is not entailed until it is checked
    };

    /* checking_law ─ ENTAIL, node level */
    if (!supports(item, span)) {
      counts.entail_failed++;
      drop('entail_failed', item.quoted_text);
      continue;
    }
    provenance.entailed = true;

    const labelHits = item.clause_label.trim() ? occurrences(doc.text, item.clause_label.trim()) : [];
    const clauseProvenance =
      labelHits.length === 1
        ? {
            ...provenance,
            char_start: labelHits[0].start,
            char_end: labelHits[0].end,
            quoted_text: doc.text.slice(labelHits[0].start, labelHits[0].end),
            located_ambiguity: 1,
          }
        : null;

    located.push({ item, node: toNode(item, provenance, clauseProvenance, span) });
  }

  await onStage?.('checking_law', { found: extracted, verified: located.length });

  /* the render boundary — a node we cannot phrase is not shown as one */
  const nodes: GraphNode[] = [];
  for (const { node } of located) {
    if (describeNode(node) === KIND_LABEL[node.kind]) {
      counts.render++;
      drop('render', node.provenance.quoted_text);
      continue;
    }
    nodes.push(node);
  }

  /* checking_law ─ ENTAIL, citations */
  const flags = await buildFlags(nodes, opts.state, calls.flag, deadline);

  const ids = new Set(nodes.map((n) => n.id));
  const edges = buildEdges(nodes).filter((e) => ids.has(e.from_node) && ids.has(e.to_node));

  const locatedCount = located.length;
  const coverage: Coverage = {
    extracted,
    located: locatedCount + counts.entail_failed,
    verified: locatedCount + counts.entail_failed,
    entailed: locatedCount,
    rendered: nodes.length,
    dropped: {
      span_not_found: counts.span_not_found,
      ambiguous: counts.ambiguous,
      entail_failed: counts.entail_failed,
      dangling_edge: 0,
      render: counts.render,
    },
    mode: coverageMode(extracted, locatedCount, doc.sourceKind),
    dropped_nodes,
  };

  const payload: AnalysisPayload = {
    document: {
      id: opts.documentId,
      sha256: doc.sha256,
      source_kind: doc.sourceKind,
      page_count: doc.pageCount,
      normalized_text: doc.text,
      page_offsets: doc.pageOffsets,
      offset_map: doc.offsetMap,
      original_available: true,
    },
    graph: { schema_version: SCHEMA_VERSION, nodes, edges },
    flags,
    coverage,
    job: {
      id: opts.jobId,
      document_id: opts.documentId,
      stage: 'checking_law',
      status: 'done',
      deadline_at: opts.deadlineAt,
      error_code: null,
      counts: { found: extracted, verified: locatedCount },
    },
    timeline: timelineFor(nodes),
  };

  // The gate, applied to the real thing rather than only to the fixture. A
  // header that disagrees with the cards is the integrity thesis failing in
  // public on an off-by-one, so it fails here instead.
  const errs = checkCoverageInvariant(coverage);
  if (errs.length) throw new PipelineError('internal', 'coverage invariant: ' + errs.join('; '));

  // The payload is validated before it can reach the database. An unvalidated
  // payload in the database is a frontend crash with extra steps.
  const parsed = AnalysisPayload.safeParse(payload);
  if (!parsed.success) throw new PipelineError('schema_validation', parsed.error.message.slice(0, 300));

  return { payload: parsed.data, dropRate: extracted ? 1 - locatedCount / extracted : 0 };
}

/* ────────────────────────────── flags ────────────────────────────── */

async function buildFlags(
  nodes: GraphNode[],
  state: string | null,
  propose: typeof proposeFlags,
  deadline: number,
): Promise<Flag[]> {
  if (nodes.length === 0) return [];

  const proposals = await propose(
    nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      temporal_scope: n.temporal_scope,
      quoted_text: n.provenance.quoted_text,
      summary: String(n.fields.summary ?? ''),
    })),
    sectionMenu(),
    deadline,
  );

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: Flag[] = [];

  for (const p of proposals.flags) {
    const node = byId.get(p.node_id);
    if (!node) continue; // a flag on a node that never survived LOCATE

    if (p.basis === 'asymmetry') {
      // Never enters ENTAIL. A structural observation about the shape of a
      // clause cites no statute, and must never be given one.
      if (!p.reason.trim()) continue; // an uncited flag states its computed reason or it is not a flag
      out.push({
        id: 'f_' + node.id,
        node_id: node.id,
        basis: 'asymmetry',
        severity: p.severity,
        consequence: p.consequence,
        what_to_ask: p.what_to_ask,
        statute_refs: [],
        reason: p.reason,
        applicability: null,
        confidence: node.confidence,
      });
      continue;
    }

    const resolved = entail(p.statute_section_id, node, state);
    // Dropped, not softened. A statutory flag that cannot resolve its section
    // would otherwise render as a cited claim with nothing behind it.
    if (!resolved.ok) continue;

    out.push({
      id: 'f_' + node.id,
      node_id: node.id,
      basis: 'statutory',
      severity: p.severity,
      consequence: p.consequence,
      what_to_ask: p.what_to_ask,
      statute_refs: [resolved.ref],
      reason: null,
      applicability: resolved.applicability,
      confidence: node.confidence,
    });
  }

  return out;
}

/* ────────────────────────────── edges ────────────────────────────── */

/**
 * Edges run the same pipeline as nodes, so only two kinds are emitted: one
 * grounded in a span both endpoints share, and one marked `inferred` with no
 * provenance at all. Timeline IS edge traversal, and the pitch is "graph
 * traversal over verified spans" — an invented edge puts an unverified link in
 * the middle of the product's central claim.
 */
function buildEdges(nodes: GraphNode[]): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const money = nodes.filter((n) => n.money);
  const conditions = nodes.filter((n) => n.predicate && n.kind === 'Condition');

  for (const m of money) {
    for (const c of conditions) {
      edges.push({
        id: 'e_' + m.id + '_' + c.id,
        from_node: m.id,
        to_node: c.id,
        relation: 'gated_by',
        inferred: false,
        provenance: m.provenance,
      });
    }
  }

  const termination = nodes.find((n) => n.kind === 'TerminationPath');
  if (termination) {
    for (const r of nodes.filter((n) => n.kind === 'Restraint' && n.temporal_scope === 'post_employment')) {
      edges.push({
        id: 'e_' + r.id + '_survives',
        from_node: r.id,
        to_node: termination.id,
        relation: 'survives_termination',
        inferred: true, // structural: no single span states it
        provenance: null,
      });
    }
  }

  return edges;
}

/* ───────────────────────────── coverage mode ───────────────────────────── */

/** OCR forces cautionary regardless of rate: noise degrades "a span you can
 *  read yourself" into "a span you can read our misreading of". */
function coverageMode(extracted: number, located: number, kind: string): Coverage['mode'] {
  if (kind === 'ocr') return 'cautionary';
  const rate = extracted ? located / extracted : 0;
  if (rate < 0.5) return 'reduced';
  if (rate < 0.8) return 'cautionary';
  return 'normal';
}
