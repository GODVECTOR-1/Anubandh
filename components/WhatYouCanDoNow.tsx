import { MessageSquareQuote, CalendarClock, LifeBuoy } from 'lucide-react';
import type { AnalysisPayload } from '@/contracts/schema';
import { UI } from '@/lib/ui-strings';
import { BorderTrail } from '@/components/core/border-trail';
import type { Locale } from '@/lib/i18n';

/**
 * Terminal element on the Radar, and not optional.
 *
 * A product that raises alarm and never lowers it is worse for the reader than
 * one that never raised it. Three concrete moves, all reusing outputs that
 * already exist: the questions (generated for Prepare), the deadline (a node
 * that is already in the graph), legal aid (built for the escalation flow).
 * Zero new data.
 */
export function WhatYouCanDoNow({ analysis, locale = 'en' }: { analysis: AnalysisPayload; locale?: Locale }) {
  const t = UI[locale].radar;
  const questions = analysis.flags.map((f) => f.what_to_ask);

  // Soonest real deadline. Documents speak in days; the scrubber is month-indexed,
  // so sub-month deadlines render as text rather than as a position.
  const deadline = analysis.graph.nodes
    .filter((n) => n.deadline && n.deadline.days !== null)
    .sort((a, b) => (a.deadline!.days ?? 0) - (b.deadline!.days ?? 0))[0];

  return (
    <section aria-labelledby="do-now" className="mt-9">
      <h2 id="do-now" className="text-lg font-semibold tracking-tight text-ink">
        {t.doNowTitle}
      </h2>

      <div className="mt-3.5 grid gap-3.5 sm:grid-cols-3">
        <div className="pop relative rounded-lg border border-rule card p-4">
          <BorderTrail className="bg-linear-to-l from-transparent via-accent to-transparent" size={90} />
          <MessageSquareQuote size={16} aria-hidden="true" className="text-ink-muted" />
          <h3 className="mt-2 text-sm font-semibold text-ink">{t.askTheseTitle}</h3>
          <ul className="mt-2 space-y-1.5">
            {questions.slice(0, 3).map((q, i) => (
              <li key={i} className="text-xs leading-relaxed text-ink-muted">
                {q}
              </li>
            ))}
          </ul>
        </div>

        <div className="pop relative rounded-lg border border-rule card p-4">
          <BorderTrail className="bg-linear-to-l from-transparent via-accent to-transparent" size={90} />
          <CalendarClock size={16} aria-hidden="true" className="text-ink-muted" />
          <h3 className="mt-2 text-sm font-semibold text-ink">{t.knowClockTitle}</h3>
          {deadline ? (
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">
              <span className="font-medium text-ink">{deadline.deadline!.days} days</span> before{' '}
              {deadline.deadline!.gates}
              {deadline.deadline!.on_miss ? `. Miss it and ${deadline.deadline!.on_miss}` : '.'}
            </p>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">
              {t.noDeadline}
            </p>
          )}
        </div>

        <div className="pop relative rounded-lg border border-rule card p-4">
          <BorderTrail className="bg-linear-to-l from-transparent via-accent to-transparent" size={90} />
          <LifeBuoy size={16} aria-hidden="true" className="text-ink-muted" />
          <h3 className="mt-2 text-sm font-semibold text-ink">{t.talkToSomeoneTitle}</h3>
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">
            {t.legalAidBody}
          </p>
        </div>
      </div>
    </section>
  );
}
