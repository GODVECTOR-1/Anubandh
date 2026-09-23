import type { GraphNode, StatuteRef } from '@/contracts/schema';

/**
 * Stage 4, ENTAIL — the statute corpus and the gate in front of it.
 *
 * A flag is only allowed to cite a section when that section actually bears on
 * the node it is attached to. The model proposes; this decides. A cited claim
 * the reader cannot check is the failure this product exists to prevent, and a
 * citation is the most credible thing on the card.
 *
 * ASYMMETRY FLAGS NEVER REACH HERE. They are structural observations about the
 * shape of a clause — one party holds a power the other does not — they cite no
 * statute and must never be given one. `FlagBasis` keeps them apart because a
 * shared ramp would imply that cited means severe.
 *
 * Sections are append-only by (section_id, as_of): a corpus refresh INSERTS a
 * new version rather than rewriting the text a historical flag points at.
 */

const AS_OF = '2026-09';

type Section = StatuteRef & {
  /** Plain description of when this applies, shown to the extractor so it does
   *  not propose a section for a clause the section has nothing to say about. */
  applies_to: string;
  /** The real gate. Returns false and the citation is dropped as entail_failed,
   *  however confident the model was. */
  gate: (node: GraphNode) => boolean;
  /** Non-null when the section is State law and we must know which State. */
  needs_state: boolean;
};

export const SECTIONS: Section[] = [
  {
    section_id: 'ica_1872_s27',
    as_of: AS_OF,
    act: 'Indian Contract Act, 1872',
    section: 's.27',
    text: 'Every agreement by which anyone is restrained from exercising a lawful profession, trade or business of any kind, is to that extent void.',
    judicial_gloss:
      'Courts have read s.27 as leaving negative covenants during the employment term enforceable, while post-termination restraints generally fall foul of it.',
    gloss_citations: ['Niranjan Shankar Golikari v. Century Spinning (SC, 1967)'],
    force: 'central-binding',
    applies_to: 'a restraint on working elsewhere AFTER employment ends',
    needs_state: false,
    // The whole point of TemporalScope. A restraint operating DURING employment
    // is generally enforceable; only a POST-termination one is what s.27 reaches.
    // Firing on the wrong one produces a confident, cited, legally false claim.
    gate: (n) => n.kind === 'Restraint' && n.temporal_scope === 'post_employment',
  },
  {
    section_id: 'ica_1872_s74',
    as_of: AS_OF,
    act: 'Indian Contract Act, 1872',
    section: 's.74',
    text: 'Where a sum is named in the contract as the amount to be paid in case of breach, the party complaining of the breach is entitled, whether or not actual damage or loss is proved to have been caused thereby, to receive reasonable compensation not exceeding the amount so named.',
    judicial_gloss:
      'Courts distinguish a genuine pre-estimate of loss from a penalty, and in service-bond cases have looked to documented training expenditure.',
    gloss_citations: ['Fateh Chand v. Balkishan Das', 'Kailash Nath Associates v. DDA'],
    force: 'central-binding',
    applies_to: 'a named sum payable on breach — a service bond, a penalty, liquidated damages',
    needs_state: false,
    gate: (n) => !!n.money && n.money.amount_text.trim().length > 0,
  },
  {
    section_id: 'pga_1972_s4',
    as_of: AS_OF,
    act: 'Payment of Gratuity Act, 1972',
    section: 's.4',
    text: 'Gratuity shall be payable to an employee on the termination of his employment after he has rendered continuous service for not less than five years.',
    judicial_gloss: null,
    gloss_citations: [],
    force: 'central-binding',
    applies_to: 'a clause about gratuity, or about what is payable on leaving after long service',
    needs_state: false,
    gate: (n) =>
      /gratuit/i.test(n.provenance.quoted_text) ||
      /gratuit/i.test(String((n.fields as { summary?: string }).summary ?? '')),
  },
  {
    section_id: 'se_act_notice',
    as_of: AS_OF,
    act: 'State Shops and Establishments Act',
    section: 'notice on termination',
    text: 'Most State Shops and Establishments Acts set a minimum notice period, or wages in lieu, before an employer may terminate an employee who has completed a qualifying period of service.',
    judicial_gloss: null,
    gloss_citations: [],
    // State-enacted, so the minimum differs by State and the resolver refuses
    // to fire until it knows which one governs the reader.
    force: 'state-enacted',
    applies_to: 'a notice period on termination, or payment in lieu of notice',
    needs_state: true,
    gate: (n) =>
      (n.kind === 'Deadline' || n.kind === 'TerminationPath') &&
      /notice|terminat/i.test(n.provenance.quoted_text),
  },
];

const BY_ID = new Map(SECTIONS.map((s) => [s.section_id, s]));

/** What CALL 3 is shown: ids and when each applies, never the gate itself. */
export const sectionMenu = () =>
  SECTIONS.map((s) => ({ section_id: s.section_id, act: s.act, section: s.section, applies_to: s.applies_to }));

export type Entailment =
  | { ok: true; ref: StatuteRef; applicability: string | null }
  | { ok: false };

/**
 * Resolve a proposed citation against the node it claims to describe.
 *
 * Two ways to fail, and both drop the flag rather than soften it: the id is not
 * in the corpus at all (the model invented one), or the section is real but has
 * nothing to say about this node (the gate refuses).
 */
export function entail(sectionId: string, node: GraphNode, state: string | null): Entailment {
  const s = BY_ID.get(sectionId);
  if (!s) return { ok: false };
  if (!s.gate(node)) return { ok: false };

  const { applies_to: _a, gate: _g, needs_state: _n, ...ref } = s;
  return {
    ok: true,
    ref,
    // The contract's own rule: refuse to fire on unresolved applicability and
    // say so, rather than pick the reader's State for them.
    applicability: s.needs_state
      ? state
        ? 'Applies in ' + state + ' — confirm the current State minimum.'
        : 'Depends on which State governs your employment. Confirm your State before relying on this.'
      : null,
  };
}
