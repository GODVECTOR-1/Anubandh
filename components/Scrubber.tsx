'use client';

import { useMemo, useState } from 'react';
import * as Slider from '@radix-ui/react-slider';
import { motion, useReducedMotion } from 'motion/react';
import { CircleHelp, Info } from 'lucide-react';
import type { AnalysisPayload } from '@/contracts/schema';
import { partitionRows, stateAt, availablePresets, monthLabel, type Preset } from '@/lib/timeline';
import { clauseLabel } from '@/lib/clause';
import { cn } from '@/lib/cn';
import { useUi, useLocale } from '@/components/LocaleProvider';

/**
 * The scrubber. Drag the handle; every row below recomputes.
 *
 * There is no model call here and there cannot be one: the per-month states
 * arrived precomputed, so a drag is an array index lookup. That is the whole
 * reason this is instant, and the reason it can never contradict the Radar.
 */
export function Scrubber({ analysis }: { analysis: AnalysisPayload }) {
  const { timeline, graph } = analysis;
  const t = useUi();
  const locale = useLocale();
  const reduce = useReducedMotion();

  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);
  const { changing, overflow, fixed } = useMemo(() => partitionRows(timeline), [timeline]);
  const presets = useMemo(() => availablePresets(graph, timeline, locale), [graph, timeline, locale]);

  const [month, setMonth] = useState(Math.min(8, timeline.months));
  const [active, setActive] = useState<Preset | null>(null);
  const [asking, setAsking] = useState<Preset | null>(null);
  const [showMore, setShowMore] = useState(false);

  // Months where something actually flips. Marking them turns a bare axis into
  // a map of where the document's own cliffs are.
  const boundaries = useMemo(() => {
    const out = new Set<number>();
    for (const row of changing) {
      for (let m = 1; m <= timeline.months; m++) {
        const prev = stateAt(row, m - 1);
        const cur = stateAt(row, m);
        if (prev.text !== cur.text || prev.active !== cur.active) out.add(m);
      }
    }
    return [...out].sort((a, b) => a - b);
  }, [changing, timeline.months]);

  // Empty is a real state. Rendering a dead control is worse than saying why.
  if (!timeline.has_temporal_obligations || timeline.rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-rule card p-5">
        <h2 className="text-base font-semibold text-ink">{t.timeline.emptyTitle}</h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          {t.timeline.emptyBody}
        </p>
      </div>
    );
  }

  const choose = (p: Preset) => {
    if (p.kind === 'fact_requiring') {
      setAsking(p);
      return;
    }
    setActive(p.assumption ? p : null);
    if (p.month !== undefined) setMonth(p.month);
  };

  const dateSuffix = timeline.service_start
    ? ', ' + monthLabel(timeline.service_start, month)
    : '';

  return (
    <div>
      {/* ── presets ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => {
          const on = active?.id === p.id || (p.id === 'resign' && active === null);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => choose(p)}
              aria-pressed={on}
              className={cn(
                'pop-sm inline-flex min-h-11 items-center rounded-full border px-4 text-xs font-medium',
                on
                  ? 'border-accent bg-accent text-paper'
                  : 'border-rule card text-ink-muted hover:border-rule-strong',
              )}
            >
              {p.label}
              {p.kind === 'fact_requiring' && (
                <CircleHelp size={11} aria-hidden="true" className="ml-1.5 inline align-[-1px]" />
              )}
            </button>
          );
        })}
      </div>

      {/* The document says what happens IF. It never says whether it has. */}
      {asking && (
        <div
          role="dialog"
          aria-label={asking.label}
          className="mt-3 rounded-lg border border-ask/40 bg-ask-bg p-4"
        >
          <p className="text-sm font-medium text-ink">{t.timeline.hasHappened}</p>
          <p className="mt-1 text-xs text-ink-muted">
            {t.timeline.hasHappenedBody}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setActive(asking);
                setAsking(null);
              }}
              className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-xs font-medium text-paper"
            >
              {t.timeline.itHappened}
            </button>
            <button
              type="button"
              onClick={() => {
                setActive(asking);
                setAsking(null);
              }}
              className="inline-flex min-h-11 items-center rounded-md border border-rule-strong px-4 text-xs font-medium text-ink"
            >
              {t.timeline.exploring}
            </button>
            <button
              type="button"
              onClick={() => setAsking(null)}
              className="inline-flex min-h-11 items-center rounded-md px-3 text-xs text-ink-muted hover:underline"
            >
              {t.timeline.cancel}
            </button>
          </div>
        </div>
      )}

      {/* ── the scrubber ────────────────────────────────────────── */}
      <div className="mt-6">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-ink">{t.timeline.leaveHere}</span>
          <span className="text-sm tabular-nums text-ink-muted">
            {t.timeline.month(month)}
            {timeline.service_start && (
              <span className="text-ink-faint"> · {monthLabel(timeline.service_start, month)}</span>
            )}
          </span>
        </div>

        <Slider.Root
          className="relative mt-3 flex h-11 w-full touch-pan-y select-none items-center"
          value={[month]}
          onValueChange={(v) => setMonth(v[0])}
          min={0}
          max={timeline.months}
          step={1}
        >
          <Slider.Track className="slider-track relative h-2 w-full grow rounded-full">
            <Slider.Range className="slider-range absolute h-full rounded-full" />
            {boundaries.map((b) => (
              <span
                key={b}
                aria-hidden="true"
                title={'Something changes at month ' + b}
                className="slider-tick absolute top-1/2 h-3.5 w-[2px] -translate-y-1/2 rounded"
                style={{ left: (b / timeline.months) * 100 + '%' }}
              />
            ))}
          </Slider.Track>
          {/* aria-label and aria-valuetext belong on the THUMB: Radix puts
              role=slider there, so anything set on Root never reaches a screen
              reader. Without valuetext it announces a bare 24 instead of the
              month and the date it lands on. */}
          <Slider.Thumb
            aria-label="Month you leave"
            aria-valuetext={'Month ' + month + dateSuffix}
            className="group flex h-11 w-11 items-center justify-center rounded-full outline-none"
          >
            {/* 20px handle, 44px target. The visible handle carries the rim,
                the depth and the growing ring; the 44px box stays invisible so
                the control does not look like a puck. */}
            <span className="slider-thumb block h-5 w-5 rounded-full group-hover:[transform:scale(1.08)] group-active:[transform:scale(1.02)] group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-focus" />
          </Slider.Thumb>
        </Slider.Root>

        <div className="mt-1.5 flex justify-between text-xs text-ink-faint">
          <span>{t.timeline.dayOne}</span>
          {timeline.service_start === null && <span>{t.timeline.noJoiningDate}</span>}
          <span>{t.timeline.month(timeline.months)}</span>
        </div>
      </div>

      {/* ── the assumption header, never a footnote ─────────────── */}
      {active?.assumption && (
        <p className="mt-5 rounded-md border border-ask/40 bg-ask-bg px-3.5 py-2.5 text-sm font-medium text-ask">
          {t.timeline.showingAssuming(active.assumption)}
        </p>
      )}

      {/* ── changing rows ───────────────────────────────────────── */}
      <ul className="mt-5 space-y-2.5">
        {[...changing, ...(showMore ? overflow : [])].map((row) => {
          const s = stateAt(row, month);
          const node = nodeById.get(row.node_id);
          const gated = row.assumption !== null && active?.matchKey !== row.assumption;
          return (
            <li
              key={row.node_id}
              className={cn(
                'pop rounded-lg border card p-3.5',
                s.active ? 'border-rule-strong' : 'border-rule opacity-70',
              )}
            >
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="text-sm font-medium text-ink">{row.label}</span>
                {node && (
                  <span
                    className={cn(
                      'text-xs text-ink-faint',
                      node.clause_ref.label && 'uppercase tracking-wider',
                    )}
                  >
                    {clauseLabel(node, locale)}
                  </span>
                )}
                {!s.active && (
                  <span className="ml-auto text-xs text-ink-faint">{t.timeline.noLongerApplies}</span>
                )}
              </div>

              <motion.p
                key={s.text}
                initial={reduce ? false : { opacity: 0, y: -3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 30 }}
                className="mt-1 text-sm leading-snug text-ink-muted"
              >
                {s.text}
              </motion.p>

              {gated && (
                <p className="mt-1.5 text-xs text-ask">
                  {t.timeline.onlyAppliesPick(row.assumption!)}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {overflow.length > 0 && (
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="mt-2.5 text-sm text-ink-muted underline decoration-dotted underline-offset-4"
        >
          {showMore ? t.timeline.showFewer : t.timeline.moreThatChange(overflow.length)}
        </button>
      )}

      {/* ── rows that do not depend on the handle ───────────────── */}
      {fixed.length > 0 && (
        <section className="mt-7">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-faint">
            <Info size={12} aria-hidden="true" />
            {t.timeline.doesNotChange}
          </h3>
          <ul className="mt-2.5 space-y-2">
            {fixed.map((row) => {
              const node = nodeById.get(row.node_id);
              const gated = row.assumption !== null && active?.matchKey !== row.assumption;
              return (
                <li key={row.node_id} className="pop rounded-lg border border-rule card p-3.5">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="text-sm font-medium text-ink">{row.label}</span>
                    {node && (
                      <span
                        className={cn(
                          'text-xs text-ink-faint',
                          node.clause_ref.label && 'uppercase tracking-wider',
                        )}
                      >
                        {clauseLabel(node, locale)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm leading-snug text-ink-muted">
                    {stateAt(row, month).text}
                  </p>
                  {gated && <p className="mt-1.5 text-xs text-ask">{t.timeline.onlyApplies(row.assumption!)}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="mt-6 text-xs leading-relaxed text-ink-faint">
        {t.timeline.footnote}
      </p>
    </div>
  );
}
