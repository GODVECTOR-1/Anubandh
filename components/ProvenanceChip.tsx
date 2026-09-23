import { ChevronDown, Check, Search } from 'lucide-react';
import type { Provenance, TemporalScope } from '@/contracts/schema';
import { CONFIDENCE } from '@/lib/presentation';
import { locationLabel } from '@/lib/clause';

/** The raw enum used to sit second-from-top on every card. It belongs here:
 *  available to anyone who wants it, in front of nobody who does not. */
const TEMPORAL: Record<TemporalScope, string> = {
  during_employment: 'Applies while you are employed',
  post_employment: 'Applies after you leave',
  unclear: 'The document does not make the timing clear',
  not_applicable: 'Timing does not apply to this item',
};

/**
 * "p.6 · verified" → expands to offsets, matching method and the compliance line.
 *
 * `<details>` rather than a state hook: keyboard operation, focus handling and
 * the expanded/collapsed announcement all come from the platform, and there is
 * no way for a re-render to leave it out of sync with its own aria attributes.
 */
export function ProvenanceChip({
  provenance,
  temporalScope,
  confidence,
}: {
  provenance: Provenance;
  temporalScope: TemporalScope;
  confidence: 'verified' | 'worth_checking';
}) {
  const c = CONFIDENCE[confidence];
  const where = locationLabel(provenance);

  return (
    <details className="group mt-3 border-t border-rule pt-2.5">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs text-ink-faint [&::-webkit-details-marker]:hidden">
        {confidence === 'verified'
          ? <Check size={13} aria-hidden="true" className="shrink-0" />
          : <Search size={13} aria-hidden="true" className="shrink-0" />}
        <span>
          {where ? `${where} \u00b7 ` : ''}
          {c.label}
        </span>
        <ChevronDown
          size={13}
          aria-hidden="true"
          className="shrink-0 transition-transform duration-150 group-open:rotate-180"
        />
        <span className="sr-only">Show how we located this</span>
      </summary>

      <div className="mt-2.5 space-y-2 text-xs leading-relaxed text-ink-faint">
        <p>{c.hint}</p>

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-ink-faint/80">Matched</dt>
          <dd className="font-mono">
            {provenance.located_by === 'exact' ? 'exact' : 'fuzzy'}
            {/* 2 is the dangerous case: it passes verification and entailment
                while pointing at the wrong clause. If it is >1 the user is told. */}
            {provenance.located_ambiguity > 1 && (
              <span className="text-ask"> · {provenance.located_ambiguity} possible sources</span>
            )}
          </dd>
          <dt className="text-ink-faint/80">Characters</dt>
          <dd className="font-mono">{provenance.char_start}–{provenance.char_end}</dd>
          <dt className="text-ink-faint/80">Timing</dt>
          <dd>{TEMPORAL[temporalScope]}</dd>
        </dl>

        {/* The full compliance line lives HERE, once per card and folded away.
            Printed verbatim on eight cards it is wallpaper by the third. */}
        <p className="border-t border-rule pt-2 text-ink-faint/80">
          This is information about what your document says, not legal advice. For advice on
          your situation, talk to a lawyer.
        </p>
      </div>
    </details>
  );
}
