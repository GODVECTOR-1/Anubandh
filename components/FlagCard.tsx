import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { Flag, GraphNode } from '@/contracts/schema';
import { BASIS } from '@/lib/presentation';
import { SeverityMark, SeverityRule } from '@/components/SeverityMark';
import { ProvenanceChip } from '@/components/ProvenanceChip';
import { cn } from '@/lib/cn';
import { clauseLabel } from '@/lib/clause';
import { UI } from '@/lib/ui-strings';
import type { Locale } from '@/lib/i18n';

const FORCE_NOTE: Record<string, string | null> = {
  'central-binding': null,
  'state-enacted': 'This is State law. Whether it applies to you depends on where you work.',
  // A model act binds nobody until a State enacts it. Presenting one as the
  // operative default is the single worst failure available to this product.
  'model-not-binding': 'This is a model law. It does not apply unless your State has enacted it.',
};

/**
 * Card order matters more than card styling here.
 *
 * The consequence line comes FIRST, in plain language. Earlier drafts led with
 * the clause's temporal scope — an internal enum — sitting above everything the
 * reader actually needs. She reads one line and decides whether to keep reading.
 */
export function FlagCard({ flag, node, locale = 'en' }: { flag: Flag; node: GraphNode; locale?: Locale }) {
  const t = UI[locale].radar;
  const basis = BASIS[flag.basis];
  const BasisIcon = basis.icon;

  return (
    <article className={cn(
        'card pop relative overflow-hidden rounded-lg border p-4 pl-5 sm:p-5 sm:pl-6',
        flag.severity === 'act_on_this' && 'pop-act',
        flag.severity === 'ask_about_this' && 'pop-ask',
      )}>
      <SeverityRule severity={flag.severity} />

      {/* clause label · basis tag · severity */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span
          className={cn(
            'text-xs font-semibold tracking-wider text-ink-muted',
            node.clause_ref.label && 'uppercase',
          )}
        >
          {clauseLabel(node, locale)}
        </span>
        <span className={`inline-flex items-center gap-1 text-xs ${basis.text}`}>
          <BasisIcon size={12} aria-hidden="true" />
          {flag.basis === 'statutory' ? t.basisStatutory : t.basisAsymmetry}
        </span>
        <SeverityMark severity={flag.severity} locale={locale} className="ml-auto" />
      </div>

      {/* What she reads first. */}
      <p className="mt-2.5 text-[15px] font-medium leading-snug text-ink sm:text-base">
        {flag.consequence}
      </p>

      {/* What the document says. Serif = the document's own words. */}
      <figure className="mt-3.5 border-l-2 border-rule-strong pl-3.5">
        <figcaption className="text-xs uppercase tracking-wider text-ink-faint">
          {t.whatDocSays}
        </figcaption>
        <blockquote className="doc-quote mt-1.5">
          {node.provenance.quoted_text}
        </blockquote>
      </figure>

      {/* What the law provides. Statute text and judicial gloss are separated,
          because two of the three statutory claims in this product started life
          as gloss written as if it were the section's own words. */}
      {flag.statute_refs.map((s) => (
        <div key={s.section_id} className="mt-3.5 rounded-md bg-surface-sunk/60 p-3">
          <p className="text-xs font-semibold text-statutory">
            {s.act}, {s.section}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{s.text}</p>

          {s.judicial_gloss && (
            <div className="mt-2.5 border-t border-rule pt-2.5">
              <p className="text-xs uppercase tracking-wider text-ink-faint">
                {t.howCourtsRead}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">{s.judicial_gloss}</p>
              {s.gloss_citations.length > 0 && (
                <p className="mt-1.5 text-xs italic text-ink-faint">{s.gloss_citations.join(' · ')}</p>
              )}
            </div>
          )}

          {FORCE_NOTE[s.force] && (
            <p className="mt-2 text-xs font-medium text-ask">{FORCE_NOTE[s.force]}</p>
          )}
        </div>
      ))}

      {/* An uncited flag states its computed reason, and says it is uncited. */}
      {flag.basis === 'asymmetry' && flag.reason && (
        <div className="mt-3.5 rounded-md bg-surface-sunk/60 p-3">
          <p className="text-xs font-semibold text-asymmetry">{t.whyStoodOut}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{flag.reason}</p>
          <p className="mt-2 text-xs text-ink-faint">
            {t.noStatuteCited}
          </p>
        </div>
      )}

      {flag.applicability && (
        <p className="mt-3 text-xs font-medium text-ask">{flag.applicability}</p>
      )}

      {/* MANDATORY on every card. The product that raises an alarm and never
          lowers it is worse for the reader than one that never raised it. */}
      <div className="mt-3.5 rounded-md border border-dashed border-rule-strong p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{t.whatToAsk}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink">{flag.what_to_ask}</p>
      </div>

      {/* The claim and the words behind it are one click apart. A citation the
          reader cannot open is a citation they have to take on trust, which is
          the thing this product exists not to ask of them. */}
      <Link
        href={{ pathname: '/document', query: { clause: node.id } }}
        className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-statutory hover:underline"
      >
        {t.seeInDocument}
        <ArrowRight size={14} aria-hidden="true" />
      </Link>

      <ProvenanceChip
        provenance={node.provenance}
        temporalScope={node.temporal_scope}
        confidence={flag.confidence}
      />
    </article>
  );
}
