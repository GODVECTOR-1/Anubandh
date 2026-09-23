/**
 * Schema enum → visible treatment. ONE table.
 *
 * The accessibility rule is "never colour alone: rule + icon + text label".
 * A rule stated in prose is a rule every component has to remember. Here the
 * label is a required field of the only mapping that exists, so a component
 * CANNOT render a severity without also having its words — the failure mode is
 * a type error, not a quietly inaccessible card.
 */

import {
  AlertTriangle, HelpCircle, Info, Scale, Scan,
  type LucideIcon,
} from 'lucide-react';
import type { Severity, FlagBasis, Coverage } from '@/contracts/schema';

export type SeverityPresentation = {
  /** Visible text. Not optional, and not an abbreviation. */
  label: string;
  /** What the tier means, for the Radar legend and the chip's title. */
  meaning: string;
  icon: LucideIcon;
  /** Filled for act, outline for ask, dot for know — a shape difference that
   *  survives greyscale, monochrome printing and most colour-vision deficiency. */
  iconFill: boolean;
  text: string;
  rule: string;
  bg: string;
  /** Radar group order and within-group fallback ordering. */
  weight: number;
};

export const SEVERITY: Record<Severity, SeverityPresentation> = {
  act_on_this: {
    label: 'Act on this',
    meaning: 'Money, or a right you lose',
    icon: AlertTriangle,
    iconFill: true,
    text: 'text-act',
    rule: 'bg-act',
    bg: 'bg-act-bg',
    weight: 3,
  },
  ask_about_this: {
    label: 'Ask about this',
    meaning: 'One-sided, or law may apply',
    icon: HelpCircle,
    iconFill: false,
    text: 'text-ask',
    rule: 'bg-ask',
    bg: 'bg-ask-bg',
    weight: 2,
  },
  know_about_this: {
    label: 'Know about this',
    meaning: 'Worth reading, not alarming',
    icon: Info,
    iconFill: false,
    text: 'text-know',
    rule: 'bg-know',
    bg: 'bg-know-bg',
    weight: 1,
  },
};

export type BasisPresentation = {
  tag: string;
  /** Group heading on the Radar. The two bases live in SEPARATE sections:
   *  in one ranked column, vertical position is credibility, and an uncited
   *  flag must never borrow a cited one's. */
  groupTitle: string;
  groupBlurb: string;
  icon: LucideIcon;
  text: string;
  border: string;
};

export const BASIS: Record<FlagBasis, BasisPresentation> = {
  statutory: {
    tag: 'Cited to law',
    groupTitle: 'Grounded in law',
    groupBlurb:
      'Each of these names the section it relies on, and separates what the section says from what courts have read into it.',
    icon: Scale,
    text: 'text-statutory',
    border: 'border-statutory/30',
  },
  asymmetry: {
    tag: 'Structural, not cited',
    groupTitle: 'One-sided terms',
    groupBlurb:
      'No statute is cited here. These are computed from the shape of the clause itself — one party holds a power the other does not.',
    icon: Scan,
    text: 'text-asymmetry',
    border: 'border-asymmetry/30',
  },
};

/** Two states, not a hidden numeric scale. A confidence number the user cannot
 *  act on adds anxiety without adding information. */
export const CONFIDENCE = {
  verified: { label: 'Verified', hint: 'We found these exact words in your document.' },
  worth_checking: {
    label: 'Worth checking',
    hint: 'We matched this loosely, or more than one clause could be the source. Read it yourself before relying on it.',
  },
} as const;

export const DROP_REASON: Record<Coverage['dropped_nodes'][number]['reason'], string> = {
  span_not_found: 'We could not find these words in your document',
  ambiguous: 'More than one clause matched, so we could not say which',
  entail_failed: 'The quoted words did not actually support the reading',
  dangling_edge: 'This linked to something we had already dropped',
  render: 'This failed to display, and is still counted in your total',
};

/** Coverage strip weights. Non-dismissible in all three — that is what turns
 *  the Gate-1 relaxation branch from a wish into a switch. */
export const COVERAGE_MODE: Record<
  Coverage['mode'],
  { text: string; bg: string; border: string; announce: 'polite' | 'assertive' }
> = {
  normal:     { text: 'text-ink-muted', bg: 'bg-surface',      border: 'border-rule',          announce: 'polite' },
  cautionary: { text: 'text-caution',   bg: 'bg-caution-bg',   border: 'border-caution/40',    announce: 'polite' },
  reduced:    { text: 'text-reduced',   bg: 'bg-reduced-bg',   border: 'border-reduced/40',    announce: 'assertive' },
};
