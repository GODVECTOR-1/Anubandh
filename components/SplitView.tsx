'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import type { AnalysisPayload } from '@/contracts/schema';
import type { Span } from '@/lib/highlight';
import { SourcePane } from '@/components/SourcePane';
import { SeverityMark } from '@/components/SeverityMark';
import { describeNode, needsUserFact, hasModelProse } from '@/lib/describe';
import { KIND_LABEL, STRINGS, type Locale } from '@/lib/i18n';
import { clauseLabel } from '@/lib/clause';
import { cn } from '@/lib/cn';
import { PageHeadingRoll } from '@/components/core/page-heading-roll';

/**
 * Explanation and source, side by side, with the link between them visible in
 * both directions. This is the component Plain Language reuses — clause-by-
 * clause pairing is the same pane with a different left column, and it is the
 * only form that keeps the span-anchoring guarantee on screen.
 *
 * On a phone it becomes a stacked pair with the quote pinned above the
 * explanation, NOT a tab switch: seeing both at once is the entire point, and a
 * tab switch is precisely what destroys it.
 */
export function SplitView({
  analysis,
  initialSelected,
  locale = 'en',
}: {
  analysis: AnalysisPayload;
  initialSelected?: string | null;
  locale?: Locale;
}) {
  const { graph, flags, document: doc } = analysis;
  const S = STRINGS[locale];

  // Document order. A clause-by-clause view that jumps around the file is not
  // a reading of the document, it is a ranking of it.
  const nodes = useMemo(
    () => [...graph.nodes].sort((a, b) => a.provenance.char_start - b.provenance.char_start),
    [graph.nodes],
  );

  const valid = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const [selected, setSelected] = useState<string | null>(
    initialSelected && valid.has(initialSelected) ? initialSelected : nodes[0]?.id ?? null,
  );

  const spans: Span[] = useMemo(
    () => nodes.map((n) => ({ id: n.id, start: n.provenance.char_start, end: n.provenance.char_end })),
    [nodes],
  );

  const flagByNode = useMemo(() => {
    const m = new Map<string, (typeof flags)[number]>();
    for (const f of flags) if (!m.has(f.node_id)) m.set(f.node_id, f);
    return m;
  }, [flags]);

  const labelFor = useCallback(
    (id: string) => {
      const n = nodes.find((x) => x.id === id);
      return n ? clauseLabel(n, locale) : id;
    },
    [nodes, locale],
  );

  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const lastSelected = useRef(selected);

  useEffect(() => {
    if (!selected || selected === lastSelected.current) return;
    lastSelected.current = selected;
    const el = itemRefs.current.get(selected);
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [selected]);

  const selectedNode = nodes.find((n) => n.id === selected) ?? null;

  return (
    <div lang={locale} className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            <PageHeadingRoll>{S.title}</PageHeadingRoll>
          </h1>
          <p className="mt-1 text-sm text-ink-muted">{S.subtitle(nodes.length)}</p>
        </div>
      </div>

      {/* Said once, plainly: what is not translated, and why. Mixing two
          languages without explaining it is how a reader concludes the
          translation is broken rather than deliberate. */}
      {locale === 'hi' && nodes.some(hasModelProse) && (
        <p lang="hi" className="mt-3 rounded-md border border-rule card px-3.5 py-2.5 text-xs leading-relaxed text-ink-muted">
          {S.notTranslated}
        </p>
      )}

      {/* MOBILE: the quote rides above the list and stays there while it scrolls. */}
      {selectedNode && (
        <div className="glass sticky top-0 z-10 -mx-4 mt-4 border-y px-4 py-3 shadow-sm lg:hidden">
          <p className="text-xs uppercase tracking-wider text-ink-faint">
            {clauseLabel(selectedNode, locale)} — {S.inYourDocument}
          </p>
          <p lang="en" className="doc-quote mt-1.5 line-clamp-4">
            {selectedNode.provenance.quoted_text}
          </p>
        </div>
      )}

      <div className="mt-4 grid gap-5 lg:grid-cols-2 lg:items-start">
        <ol className="space-y-2.5">
          {nodes.map((n) => {
            const flag = flagByNode.get(n.id);
            const isActive = n.id === selected;
            return (
              <li key={n.id}>
                <button
                  ref={(el) => {
                    if (el) itemRefs.current.set(n.id, el);
                    else itemRefs.current.delete(n.id);
                  }}
                  type="button"
                  onClick={() => setSelected(n.id)}
                  aria-current={isActive ? 'true' : undefined}
                  className={cn(
                    'pop w-full rounded-lg border p-3.5 text-left',
                    isActive
                      ? 'border-rule-strong card'
                      : 'border-rule card hover:bg-card',
                  )}
                >
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span
                      className={cn(
                        'text-xs font-semibold tracking-wider text-ink-muted',
                        n.clause_ref.label && 'uppercase',
                      )}
                    >
                      {clauseLabel(n, locale)}
                    </span>
                    <span className="text-xs text-ink-faint">{KIND_LABEL[locale][n.kind]}</span>
                    {flag && <SeverityMark severity={flag.severity} locale={locale} className="ml-auto" />}
                  </div>

                  <p className="mt-1.5 text-sm leading-snug text-ink">{describeNode(n, locale)}</p>

                  {/* The document says what happens IF. It never says whether. */}
                  {needsUserFact(n) && (
                    <p className="mt-1.5 text-xs text-ask">{S.factNote}</p>
                  )}

                  {n.confidence === 'worth_checking' && (
                    <p className="mt-1.5 text-xs text-ink-faint">{S.looseMatchNote}</p>
                  )}
                </button>
              </li>
            );
          })}
        </ol>

        {/* DESKTOP: the document sits alongside and stays put while the list scrolls. */}
        <div className="hidden lg:block lg:sticky lg:top-4 lg:h-[calc(100vh-6rem)]">
          <SourcePane
            text={doc.normalized_text}
            spans={spans}
            selectedId={selected}
            onSelect={setSelected}
            labelFor={labelFor}
            note={S.sourcePaneLabel}
            locale={locale}
          />
        </div>
      </div>

      {/* On a phone the full text is one tap away rather than absent. */}
      <details className="mt-5 lg:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-rule card px-4 py-3 text-sm text-ink-muted [&::-webkit-details-marker]:hidden">
          <FileText size={14} aria-hidden="true" />
          {S.readFullText}
        </summary>
        <div className="mt-2.5 h-[60vh]">
          <SourcePane
            text={doc.normalized_text}
            spans={spans}
            selectedId={selected}
            onSelect={setSelected}
            labelFor={labelFor}
            note={S.sourcePaneLabel}
            locale={locale}
          />
        </div>
      </details>
    </div>
  );
}
