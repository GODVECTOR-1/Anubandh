'use client';

import { useEffect, useMemo, useRef } from 'react';
import { segment, type Span } from '@/lib/highlight';
import { cn } from '@/lib/cn';

/**
 * The document, as we reconstructed it, with every cited span reachable.
 *
 * Text nodes are created by React from plain strings. There is no innerHTML,
 * no dangerouslySetInnerHTML, and no path by which a clause containing markup
 * can become markup. That is not a style preference: the text came from a file
 * a stranger uploaded and the spans came from a language model.
 *
 * Deliberately NOT dressed up as paper. This pane shows OUR normalized
 * reconstruction, and a user noticing that we mangled something is a feature.
 * The better it imitates the original, the less anyone can tell.
 */
export function SourcePane({
  text,
  spans,
  selectedId,
  onSelect,
  labelFor,
  note,
  locale = 'en',
}: {
  text: string;
  spans: Span[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  labelFor: (id: string) => string;
  /** The pane's own caption, in the reader's language. */
  note?: string;
  locale?: string;
}) {
  const segments = useMemo(() => segment(text, spans), [text, spans]);
  const activeRef = useRef<HTMLSpanElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!selectedId || !activeRef.current) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    activeRef.current.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  }, [selectedId]);

  // The first segment the selection owns is the one the effect above scrolls
  // to. Computed here rather than by flipping a flag inside the map: a
  // variable reassigned during render holds a different value on a second
  // render pass, which is why the compiler refuses it — and React is free to
  // render twice. `find` states the same rule without the mutation.
  const firstActiveStart = selectedId
    ? segments.find((seg) => seg.ids.includes(selectedId))?.start
    : undefined;

  return (
    <div className="flex h-full flex-col rounded-lg border border-rule card">
      <p lang={locale} className="border-b border-rule px-4 py-2 text-xs text-ink-faint">
        {note ??
          "This is the text we extracted from your file. Highlighted phrases are the ones we relied on."}
      </p>

      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {/* lang="en" on purpose: this is the DOCUMENT, and it is never
            translated. Letting it inherit lang="hi" would tell a screen reader
            to read English contract text with a Hindi voice. */}
        <p lang="en" className="doc-quote whitespace-pre-wrap">
          {segments.map((seg) => {
            if (seg.ids.length === 0) {
              // A plain string child. React makes it a text node; it can never
              // be anything else.
              return <span key={seg.start}>{seg.text}</span>;
            }

            // When spans overlap, the selected one owns the segment so the
            // active highlight stays continuous across the overlap.
            const owner = selectedId && seg.ids.includes(selectedId) ? selectedId : seg.ids[0];
            const isActive = owner === selectedId;
            const takeRef = seg.start === firstActiveStart;

            return (
              <span
                key={seg.start}
                ref={takeRef ? activeRef : undefined}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(owner)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(owner);
                  }
                }}
                aria-label={`${seg.text.trim()} — jump to ${labelFor(owner)}`}
                aria-current={isActive ? 'true' : undefined}
                className={cn(
                  // A span, not a button. A button carries UA styling that
                  // blockifies it, and a highlight spanning a line break inside
                  // pre-wrap text then tears out of the paragraph. A span
                  // inherits white-space and flows; role + tabIndex + the key
                  // handler give back everything the button element provided.
                  'box-decoration-clone cursor-pointer rounded-[3px] transition-colors duration-150',
                  isActive
                    ? 'anb-hl anb-hl-on shadow-[inset_0_-2px_0_var(--ask)]'
                    : 'anb-hl hover:brightness-95',
                  // More than one node cites these exact words. Marked so a
                  // reader can tell a shared span from a single one.
                  seg.ids.length > 1 && 'underline decoration-dotted decoration-ink-faint underline-offset-[3px]',
                )}
              >
                {seg.text}
              </span>
            );
          })}
        </p>
      </div>
    </div>
  );
}
