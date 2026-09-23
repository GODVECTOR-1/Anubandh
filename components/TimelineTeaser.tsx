import Link from 'next/link';
import { MoveHorizontal } from 'lucide-react';
import type { Timeline } from '@/contracts/schema';
import { UI } from '@/lib/ui-strings';
import type { Locale } from '@/lib/i18n';

/**
 * The differentiator should not be reachable only by clicking tab 2.
 *
 * A static slice of the real precomputed array — no model call, no interaction
 * state, just month 0 of the heaviest row plus an invitation to drag.
 */
export function TimelineTeaser({ timeline, locale = 'en' }: { timeline: Timeline; locale?: Locale }) {
  const t = UI[locale].radar;
  // Empty is a real state: say what the document DOES contain rather than
  // rendering a dead feature with nothing in it.
  if (!timeline.has_temporal_obligations || timeline.rows.length === 0) {
    return (
      <section aria-labelledby="teaser" className="mt-9">
        <h2 id="teaser" className="text-lg font-semibold tracking-tight text-ink">
          {t.changesOverTime}
        </h2>
        <p className="mt-2 rounded-lg border border-dashed border-rule card px-4 py-3 text-sm text-ink-faint">
          {t.nothingTemporal}
        </p>
      </section>
    );
  }

  const top = [...timeline.rows].sort((a, b) => b.sort_key - a.sort_key)[0];
  const now = top.states.find((s) => s.month === 0) ?? top.states[0];
  const later = top.states.find((s) => s.month === timeline.months) ?? top.states[top.states.length - 1];

  return (
    <section aria-labelledby="teaser" className="mt-9">
      <h2 id="teaser" className="text-lg font-semibold tracking-tight text-ink">
        {t.changesOverTime}
      </h2>

      <Link
        href="/timeline"
        className="pop mt-3 block rounded-lg border border-rule card p-4 sm:p-5"
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">{top.label}</p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-ink-faint">{t.ifLeftToday}</p>
            <p className="mt-1 text-sm font-medium leading-snug text-ink">{now.text}</p>
          </div>
          <div className="sm:border-l sm:border-rule sm:pl-3">
            <p className="text-xs text-ink-faint">{t.atMonth(timeline.months)}</p>
            <p className="mt-1 text-sm font-medium leading-snug text-ink">{later.text}</p>
          </div>
        </div>

        {/* The track is decorative here — the real control lives on the Timeline
            view, where it is a proper ARIA slider with keyboard support. */}
        <div aria-hidden="true" className="mt-4 flex items-center gap-2">
          <div className="relative h-1.5 flex-1 rounded-full bg-surface-sunk">
            <span className="absolute inset-y-0 left-0 w-[3px] rounded-full bg-ink-faint" />
          </div>
          <MoveHorizontal size={14} className="text-ink-faint" />
        </div>

        <p className="mt-2 text-sm text-ink-muted">
          {t.dragToSee}
          {timeline.rows.some((r) => r.assumption) && t.someRowsAssume}.
        </p>
      </Link>
    </section>
  );
}
