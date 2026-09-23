import type { GraphNode, Provenance } from '@/contracts/schema';
import { STRINGS, type Locale } from '@/lib/i18n';

/**
 * Every mockup leads with "Clause 12.2". The null case is the COMMON case:
 * real Indian offer letters number inconsistently, or not at all. Falling back
 * to a blank would put the one unlabelled thing on screen exactly where the
 * user looks first.
 */
export function clauseLabel(node: GraphNode, locale: Locale = 'en'): string {
  // The NUMBER is never translated: it is how the clause is identified in the
  // reader's own copy, and renumbering it in Hindi would make the label
  // useless for the one thing it exists to do.
  if (node.clause_ref.label) return STRINGS[locale].clausePrefix + ' ' + node.clause_ref.label;
  return locationLabel(node.provenance, locale) ?? STRINGS[locale].unnumbered;
}

/** "p.6", "p.1 · ¶9", or "¶9" for DOCX where pagination does not exist. */
export function locationLabel(p: Provenance, locale: Locale = 'en'): string | null {
  const S = STRINGS[locale];
  const parts: string[] = [];
  if (p.page !== null) {
    // The page NUMBER is the reader's index into their own copy and never
    // changes; only the prefix is translated.
    parts.push(
      p.page_end !== null && p.page_end !== p.page
        ? S.pagesPrefix + p.page + '–' + p.page_end
        : S.pagePrefix + p.page,
    );
  }
  if (p.paragraph !== null) parts.push(`\u00b6${p.paragraph}`);
  return parts.length ? parts.join(' \u00b7 ') : null;
}
