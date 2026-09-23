import type { Coverage } from '@/contracts/schema';
import { priyaOfferLetter } from '@/fixtures/priya-offer-letter';
import { CoverageStrip } from '@/components/CoverageStrip';
import { CardStub } from '@/components/CardStub';
import { SeverityMark } from '@/components/SeverityMark';
import { SEVERITY } from '@/lib/presentation';

/**
 * Every state the contract guarantees can occur, on one page.
 *
 * Two of the three coverage weights are branches the relaxation ladder commits
 * to in advance — which means they WILL ship, and without this page they ship
 * having never been looked at. The same goes for the card stub: it renders only
 * when something has already gone wrong, so it is the surface least likely to
 * be seen before a user sees it.
 *
 * Not linked from the app. Useful for the accessibility pass, and it is the
 * cheapest defence against a state that exists only in a type.
 */
export const metadata = { title: 'States — Anubandh' };

const base = priyaOfferLetter.coverage;

const cautionary: Coverage = {
  ...base,
  mode: 'cautionary',
  extracted: 41, located: 26, verified: 26, entailed: 25, rendered: 25,
  dropped: { span_not_found: 11, ambiguous: 4, entail_failed: 1, dangling_edge: 0, render: 0 },
  dropped_nodes: Array.from({ length: 16 }, (_, i) => ({
    reason: (i < 11 ? 'span_not_found' : i < 15 ? 'ambiguous' : 'entail_failed') as Coverage['dropped_nodes'][number]['reason'],
    unvalidated_quote: i === 0 ? 'the Employee shall indemnify the Company against all losses' : null,
  })),
};

const reduced: Coverage = {
  ...base,
  mode: 'reduced',
  extracted: 41, located: 14, verified: 14, entailed: 14, rendered: 14,
  dropped: { span_not_found: 21, ambiguous: 6, entail_failed: 0, dangling_edge: 0, render: 0 },
  dropped_nodes: Array.from({ length: 27 }, (_, i) => ({
    reason: (i < 21 ? 'span_not_found' : 'ambiguous') as Coverage['dropped_nodes'][number]['reason'],
    unvalidated_quote: null,
  })),
};

const empty: Coverage = {
  ...base,
  extracted: 38, located: 38, verified: 38, entailed: 38, rendered: 38,
  dropped: { span_not_found: 0, ambiguous: 0, entail_failed: 0, dangling_edge: 0, render: 0 },
  dropped_nodes: [],
};

function Case({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">{title}</h2>
      <p className="mt-1 text-xs text-ink-faint">{note}</p>
      <div className="mt-2.5 overflow-hidden rounded-lg border border-rule">{children}</div>
    </section>
  );
}

export default function StatesPage() {
  return (
    <main id="main" className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Component states</h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        Not linked from the app. Each block below is a state the system can reach in production.
      </p>

      <Case title="Coverage · normal" note="Location rate at or above 90%. Quiet, still not dismissible.">
        <CoverageStrip coverage={base} />
      </Case>

      <Case title="Coverage · cautionary" note="60–90%. Amber, pinned above every tab, no close button.">
        <CoverageStrip coverage={cautionary} />
      </Case>

      <Case
        title="Coverage · reduced"
        note="Below 60%. Statutory flags are visibly absent and the strip states the reason."
      >
        <CoverageStrip coverage={reduced} />
      </Case>

      <Case title="Coverage · nothing dropped" note="The genuinely-clean case still explains itself.">
        <CoverageStrip coverage={empty} />
      </Case>

      <Case title="Card stub" note="Shown when an item is counted in the header but cannot be displayed.">
        <div className="bg-paper p-4">
          <CardStub label="f_example" />
        </div>
      </Case>

      <Case title="Severity scale" note="Rule, icon and text label. Never colour alone.">
        <div className="space-y-2 bg-paper p-4">
          {(Object.keys(SEVERITY) as Array<keyof typeof SEVERITY>).map((k) => (
            <div key={k} className="flex items-center gap-3">
              <span aria-hidden="true" className={`h-5 w-[3px] rounded ${SEVERITY[k].rule}`} />
              <SeverityMark severity={k} />
              <span className="text-xs text-ink-faint">{SEVERITY[k].meaning}</span>
            </div>
          ))}
        </div>
      </Case>
    </main>
  );
}
