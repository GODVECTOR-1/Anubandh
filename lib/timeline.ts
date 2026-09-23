import type { Graph, Timeline, TimelineRow } from '@/contracts/schema';
import type { Locale } from '@/lib/i18n';
import { UI } from '@/lib/ui-strings';

/**
 * Timeline logic, kept out of the component so it can be tested without a DOM.
 *
 * Everything here runs ONCE, on load. Dragging is an array index lookup: the
 * per-month consequences are already computed, which is what keeps "zero model
 * calls during interaction" true and the drag instant.
 */

/** A row earns a place in the scrubber only by CHANGING somewhere. */
export function rowChanges(row: TimelineRow): boolean {
  if (row.states.length < 2) return false;
  const first = row.states[0];
  return row.states.some((s) => s.text !== first.text || s.active !== first.active);
}

export type RowPartition = {
  /** Top 5 changing rows. Membership is fixed for the whole drag. */
  changing: TimelineRow[];
  /** Changing rows beyond the cap, revealed by "+N more". */
  overflow: TimelineRow[];
  /**
   * Rows that never change. The plan's rule says these are not Timeline rows,
   * and its own mockup shows the non-compete as one. Both are right: 38 static
   * rows destroy the drag, but silently dropping a 12-month restraint hides the
   * consequence the reader most needs. So they are shown, separately and
   * labelled, instead of being mixed into the grid or thrown away.
   */
  fixed: TimelineRow[];
};

const CAP = 5;

export function partitionRows(timeline: Timeline): RowPartition {
  // Money first (largest), then Restraint, then Right — sort_key carries that
  // ordering from extraction. Computed once and held constant: rows never
  // appear or disappear mid-drag, only their cells change.
  const ordered = [...timeline.rows].sort((a, b) => b.sort_key - a.sort_key);
  const changing = ordered.filter(rowChanges);
  const fixed = ordered.filter((r) => !rowChanges(r));
  return {
    changing: changing.slice(0, CAP),
    overflow: changing.slice(CAP),
    fixed,
  };
}

export function stateAt(row: TimelineRow, month: number) {
  return row.states.find((s) => s.month === month) ?? row.states[row.states.length - 1];
}

/* ───────────────────────────── presets ───────────────────────────── */

export type Preset = {
  id: string;
  label: string;
  /** Document-grounded presets are computed. Fact-requiring ones assert an
   *  event in the user's life that the document does not record. */
  kind: 'document_grounded' | 'fact_requiring';
  /** Rendered as a header on the result, never as a footnote. Translated. */
  assumption: string | null;
  /**
   * The UNTRANSLATED assumption, used to match a preset against a timeline
   * row's own `assumption`. Display text and match key must stay separate:
   * translating the string the comparison runs on would silently stop every
   * fact-requiring row from ever being un-gated, in Hindi only.
   */
  matchKey: string | null;
  /** Where this preset puts the handle, when it moves it. */
  month?: number;
};

/**
 * Six presets exist. A fact-requiring one is offered ONLY when the document
 * contains a clause modelling that event — offering it otherwise implies the
 * document addresses something it does not, which is the same failure as an
 * uncited flag wearing a citation's clothes.
 */
export function availablePresets(graph: Graph, timeline: Timeline, locale: Locale = 'en'): Preset[] {
  const t = UI[locale].timeline;
  const kinds = new Set(graph.nodes.map((n) => n.predicate?.kind).filter(Boolean) as string[]);
  const out: Preset[] = [];

  // The handle IS the input for this one. It exists as a preset so the default
  // mode is nameable, and so leaving an assumption is one tap.
  out.push({ id: 'resign', label: t.presetResign, kind: 'document_grounded', assumption: null, matchKey: null });

  const bondNode = graph.nodes.find((n) => n.predicate?.kind === 'resigns_before_month');
  if (bondNode && bondNode.predicate?.kind === 'resigns_before_month') {
    out.push({
      id: 'bond_complete',
      label: t.presetBond,
      kind: 'document_grounded',
      assumption: null,
      matchKey: null,
      month: Math.min(bondNode.predicate.month, timeline.months),
    });
  }

  // matchKey is the fixture's own English wording and never changes; label and
  // assumption are what the reader sees.
  const factual: Array<[string, string, string, string]> = [
    ['terminated_by_employer', t.presetTerminated, 'assuming your employer ends your employment', 'assuming your employer ends your employment'],
    ['relocation_refused',     t.presetRelocate,   'assuming you are asked to relocate and decline', 'assuming you are asked to relocate and decline'],
    ['leave_exceeds',          t.presetLeave,      'assuming your leave runs past the limit in the clause', 'assuming your leave runs past the limit in the clause'],
    ['competing_employment',   t.presetCompeting,  'assuming you take work with a competitor', 'assuming you take work with a competitor'],
  ];
  for (const [kind, label, assumption, matchKey] of factual) {
    if (kinds.has(kind)) out.push({ id: kind, label, kind: 'fact_requiring', assumption, matchKey });
  }

  return out;
}

/* ───────────────────────────── dates ───────────────────────────── */

/**
 * Month 0 is `service_start`. When the document does not carry a joining date
 * the Timeline says so rather than inventing one, so the axis falls back to
 * month numbers alone.
 */
export function monthLabel(serviceStart: string | null, month: number): string {
  if (!serviceStart) return `Month ${month}`;
  const d = new Date(serviceStart);
  if (Number.isNaN(d.getTime())) return `Month ${month}`;
  d.setMonth(d.getMonth() + month);
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}
