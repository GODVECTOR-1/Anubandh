import { CalendarClock, Download, LifeBuoy, Briefcase } from 'lucide-react';
import type { AnalysisPayload } from '@/contracts/schema';
import { buildPacket } from '@/lib/packet';
import { getLocale } from '@/lib/locale';
import { UI } from '@/lib/ui-strings';
import { BorderTrail } from '@/components/core/border-trail';
import { PageHeadingRoll } from '@/components/core/page-heading-roll';

/**
 * What the reader takes with them. This is the screen that closes the flow: a
 * product that raises an alarm and never lowers it is worse for the person
 * holding the document than one that never raised it.
 *
 * Everything here is already on screen somewhere else. Nothing is generated for
 * the packet alone — a page handed to a lawyer is the worst possible place for
 * a sentence nobody traced back to the document.
 */
export async function Prepare({ analysis }: { analysis: AnalysisPayload }) {
  const t = UI[await getLocale()];
  const packet = buildPacket(analysis);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        <PageHeadingRoll>{t.prepare.title}</PageHeadingRoll>
      </h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        {t.prepare.subtitle}
      </p>

      <a
        href="/api/prepare"
        className="pop-sm relative mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-paper"
      >
        <BorderTrail className="bg-linear-to-l from-transparent via-paper to-transparent" size={48} />
        <Download size={15} aria-hidden="true" />
        {t.prepare.download}
      </a>

      <section aria-labelledby="questions" className="mt-8">
        <h2 id="questions" className="text-lg font-semibold tracking-tight text-ink">
          {t.prepare.askThese}
        </h2>
        <ol className="mt-3 space-y-3">
          {packet.questions.map((q, i) => (
            <li key={i} className="pop rounded-lg border border-rule card p-4">
              <p className="text-sm font-medium leading-snug text-ink">
                {i + 1}. {q.question}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{q.because}</p>
              {q.quote && (
                <figure className="mt-2.5 border-l-2 border-rule-strong pl-3">
                  <figcaption className="text-xs uppercase tracking-wider text-ink-faint">
                    {q.clause}
                  </figcaption>
                  <blockquote className="doc-quote mt-1 text-[15px]">{q.quote}</blockquote>
                </figure>
              )}
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-8 grid gap-3.5 sm:grid-cols-2">
        <section className="pop rounded-lg border border-rule card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <CalendarClock size={15} aria-hidden="true" />
            {t.prepare.theClock}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            {packet.deadline ?? t.prepare.noDeadline}
          </p>
        </section>

        <section className="pop rounded-lg border border-rule card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Briefcase size={15} aria-hidden="true" />
            {t.prepare.whatToCarry}
          </h2>
          <ul className="mt-2 space-y-1.5">
            {packet.carry.map((c) => (
              <li key={c} className="text-xs leading-relaxed text-ink-muted">
                {c}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Reachable from here too, not only from an escalation the reader may
          never trigger. Free legal aid is the answer for most people holding a
          document like this, and it should not be hidden behind a keyword. */}
      <section className="mt-8 rounded-lg border border-rule card p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <LifeBuoy size={15} aria-hidden="true" />
          {t.prepare.lawyerOutOfReach}
        </h2>
        <ul className="mt-2.5 space-y-2">
          <li className="text-sm text-ink-muted">
            <span className="font-medium text-ink">NALSA</span> — toll-free 15100, free legal aid in
            every State and district.
          </li>
          <li className="text-sm text-ink-muted">
            <span className="font-medium text-ink">District Legal Services Authority</span> — free
            advice and representation, in every district in India.
          </li>
          <li className="text-sm text-ink-muted">
            <span className="font-medium text-ink">Tele-Law</span> — a free lawyer consultation
            through a Common Service Centre.
          </li>
        </ul>
      </section>

      <p className="mt-6 text-xs leading-relaxed text-ink-faint">{packet.coverageNote}</p>
      <p className="mt-2 text-xs leading-relaxed text-ink-faint">{packet.disclaimer}</p>
    </div>
  );
}
