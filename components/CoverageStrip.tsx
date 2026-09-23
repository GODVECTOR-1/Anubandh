import { ChevronDown } from 'lucide-react';
import type { Coverage } from '@/contracts/schema';
import { COVERAGE_MODE, DROP_REASON } from '@/lib/presentation';
import { cn } from '@/lib/cn';
import { getLocale } from '@/lib/locale';
import { UI } from '@/lib/ui-strings';
import { interpolate } from '@/lib/interpolate';
import { NumberTicker } from '@/components/NumberTicker';

/**
 * One component, three weights. Partial extraction is not an edge case, it is
 * the NORMAL outcome, and the relaxation ladder commits in advance to two
 * further product configurations. This is the switch that makes that real.
 *
 * Non-dismissible in all three modes, and pinned above every tab. There is no
 * close button, because the number it carries is the one thing standing between
 * "we read your document" and "we read most of your document".
 */
export async function CoverageStrip({ coverage }: { coverage: Coverage }) {
  const t = UI[await getLocale()];
  const m = COVERAGE_MODE[coverage.mode];
  const notShown = coverage.extracted - coverage.rendered;

  return (
    <aside
      aria-label={t.coverage.ariaLabel}
      className={cn('border-b', coverage.mode === 'normal' ? 'glass' : m.bg, m.border)}
    >
      <div className="mx-auto max-w-5xl px-4 py-2.5 sm:px-6">
        <details className="group">
          <summary
            className={cn(
              'flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 text-sm [&::-webkit-details-marker]:hidden',
              m.text,
            )}
          >
            <span className="font-medium tabular-nums">
              {interpolate(t.coverage.verifiedTemplate, {
                shown: <NumberTicker value={coverage.rendered} />,
                total: <NumberTicker value={coverage.extracted} />,
              })}
            </span>
            {notShown > 0 && (
              <>
                <span aria-hidden="true" className="opacity-40">·</span>
                <span className="tabular-nums">{t.coverage.notShown(notShown)}</span>
              </>
            )}
            <span className="ml-auto inline-flex items-center gap-1 underline decoration-dotted underline-offset-4">
              {t.coverage.seeWhy}
              <ChevronDown size={13} aria-hidden="true" className="transition-transform duration-150 group-open:rotate-180" />
            </span>
          </summary>

          <div className="mt-3 space-y-3 border-t border-current/15 pt-3 text-sm leading-relaxed">
            {coverage.mode === 'cautionary' && (
              <p className={m.text}>
                {t.coverage.cautionary}
              </p>
            )}
            {coverage.mode === 'reduced' && (
              <p className={m.text}>
                <strong className="font-semibold">Legal citations are switched off for this document.</strong>{' '}
                We located too little of it to say with confidence which clause a section of law would
                apply to, and a citation pointed at the wrong clause is worse than no citation. You are
                seeing one-sided-term checks and plain-language reading only.
              </p>
            )}

            {coverage.dropped_nodes.length > 0 ? (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
                  {t.coverage.couldNotConfirm}
                </h2>
                <p className="mt-1 text-xs text-ink-faint">
                  {t.coverage.couldNotConfirmBody}
                </p>
                <ul className="mt-2.5 space-y-2.5">
                  {coverage.dropped_nodes.map((d, i) => (
                    <li key={i} className="border-l-2 border-rule-strong pl-3">
                      <p className="text-xs font-medium text-ink-muted">{DROP_REASON[d.reason]}</p>
                      {d.unvalidated_quote && (
                        // Sans, struck, greyed — never the document serif. The serif
                        // means "your document said this", and by definition it did not.
                        <p className="mt-1 text-xs italic text-ink-faint line-through decoration-ink-faint/50">
                          {d.unvalidated_quote}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">
                {t.coverage.allTraced}
              </p>
            )}
          </div>
        </details>
      </div>
    </aside>
  );
}
