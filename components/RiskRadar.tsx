import type { AnalysisPayload, Flag, FlagBasis } from '@/contracts/schema';
import { SEVERITY } from '@/lib/presentation';
import { FlagCard } from '@/components/FlagCard';
import { CardBoundary } from '@/components/CardBoundary';
import { CardStub } from '@/components/CardStub';
import { TimelineTeaser } from '@/components/TimelineTeaser';
import { WhatYouCanDoNow } from '@/components/WhatYouCanDoNow';
import { SeverityMark } from '@/components/SeverityMark';
import { getLocale } from '@/lib/locale';
import { UI } from '@/lib/ui-strings';
import { PageHeadingRoll } from '@/components/core/page-heading-roll';
import { SEVERITY_TEXT } from '@/lib/i18n';

/**
 * Risk Radar IS the page. The other views are sections within it.
 *
 * Two labelled groups, never one interleaved list: in a single ranked column,
 * vertical position is credibility, and a flag with no citation must not be
 * able to borrow a cited one's. Grouping makes that discipline structural
 * instead of typographic.
 */
export async function RiskRadar({ analysis }: { analysis: AnalysisPayload }) {
  const locale = await getLocale();
  const t = UI[locale].radar;
  const { flags, graph, coverage, timeline } = analysis;
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  // Money at stake, descending — that is the question the reader actually has.
  // Severity breaks ties, because two clauses with no number still rank.
  const sorted = (basis: FlagBasis) =>
    flags
      .filter((f) => f.basis === basis)
      .sort((a, b) => {
        const money = (f: Flag) => nodeById.get(f.node_id)?.money?.amount_value ?? -1;
        return money(b) - money(a) || SEVERITY[b.severity].weight - SEVERITY[a.severity].weight;
      });

  const groups: FlagBasis[] = ['statutory', 'asymmetry'];
  const total = flags.length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          <PageHeadingRoll>{t.title(total)}</PageHeadingRoll>
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          {t.subtitle(coverage.verified)}
        </p>

        {/* Stated once, here. Repeated verbatim on eight cards it becomes
            wallpaper by the third and stops being read at all. */}
        <p className="mt-4 rounded-md border border-rule card px-3.5 py-2.5 text-xs leading-relaxed text-ink-muted">
          {t.disclaimer}
        </p>

        {/* The severity legend. The scale is named, so name it where it is used. */}
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          {(Object.keys(SEVERITY) as Array<keyof typeof SEVERITY>).map((k) => (
            <li key={k} className="flex items-center gap-2">
              <SeverityMark severity={k} locale={locale} />
              <span className="text-xs text-ink-faint">{SEVERITY_TEXT[locale][k].meaning}</span>
            </li>
          ))}
        </ul>
      </header>

      {groups.map((basis) => {
        const list = sorted(basis);
        return (
          <section key={basis} aria-labelledby={`group-${basis}`} className="mt-9">
            <h2 id={`group-${basis}`} className="text-lg font-semibold tracking-tight text-ink">
              {basis === 'statutory' ? t.groundedTitle : t.onesidedTitle}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">
              {basis === 'statutory' ? t.groundedBlurb : t.onesidedBlurb}
            </p>

            {list.length === 0 ? (
              // An empty group is a real result and says so. A section that
              // simply vanishes reads as "nothing here", which is a claim.
              <p className="mt-3 rounded-lg border border-dashed border-rule card px-4 py-3 text-sm text-ink-faint">
                {basis === 'statutory' ? t.emptyStatutory : t.emptyAsymmetry}
              </p>
            ) : (
              <div className="mt-3.5 space-y-3.5">
                {list.map((flag) => {
                  const node = nodeById.get(flag.node_id);
                  // A flag whose node is missing gets the SAME visible stub as a
                  // render crash. Dropping it would make the header count lie.
                  if (!node) return <CardStub key={flag.id} label={flag.id} locale={locale} />;
                  return (
                    <CardBoundary key={flag.id} label={flag.id}>
                      <FlagCard flag={flag} node={node} locale={locale} />
                    </CardBoundary>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      <TimelineTeaser timeline={timeline} locale={locale} />
      <WhatYouCanDoNow analysis={analysis} locale={locale} />
    </div>
  );
}
