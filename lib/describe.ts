import type { ConditionPredicate, GraphNode, NodeKind } from '@/contracts/schema';
import { KIND_LABEL as LABELS, predicateText, type Locale } from '@/lib/i18n';

/**
 * A node, in words a person would use, in either language.
 *
 * `fields` is deliberately an open record in the contract — a nine-way nested
 * union is the shape most likely to fail translation into a model response
 * schema. That openness stops at this file: everything downstream reads a
 * string, and a missing or mistyped field degrades to the node's kind rather
 * than rendering "undefined" at the reader.
 *
 * In Hindi the SKELETON is translated and model-supplied fragments are kept as
 * extracted. Re-saying the model's words in another language here would be this
 * file inventing content, which is the one thing it must never do.
 */

const str = (f: Record<string, unknown>, k: string): string | null => {
  const v = f[k];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};
const num = (f: Record<string, unknown>, k: string): number | null => {
  const v = f[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/** The handful of party words that recur in Indian employment documents. Not a
 *  translation layer, just the words that would otherwise read as untranslated
 *  noise in the middle of a Hindi sentence. Anything else passes through. */
const PARTY_HI: Record<string, string> = {
  employee: 'कर्मचारी',
  employer: 'नियोक्ता',
  company: 'कंपनी',
  'either party': 'कोई भी पक्ष',
  'both parties': 'दोनों पक्ष',
};
const party = (v: string, locale: Locale) =>
  locale === 'hi' ? (PARTY_HI[v.toLowerCase()] ?? v) : v;

export const KIND_LABEL: Record<NodeKind, string> = LABELS.en;

export function describePredicate(p: ConditionPredicate, locale: Locale = 'en'): string {
  return predicateText(p, locale);
}

export function describeNode(n: GraphNode, locale: Locale = 'en'): string {
  const f = n.fields;
  const L = LABELS[locale];
  const hi = locale === 'hi';

  switch (n.kind) {
    case 'Money': {
      if (!n.money) break;
      // amount_text is verbatim in BOTH languages: it is the document's number.
      const who = n.money.payer ? party(n.money.payer, locale) : null;
      const when = str(f, 'trigger');
      if (hi) {
        return (
          n.money.amount_text +
          (who ? ', ' + who + ' द्वारा देय' : '') +
          (when ? ' — ' + when : '') +
          '।'
        );
      }
      return (
        n.money.amount_text +
        (who ? ' payable by the ' + who.toLowerCase() : '') +
        (when ? ', on ' + when : '') +
        '.'
      );
    }
    case 'Restraint': {
      const what = str(f, 'restrained');
      const months = num(f, 'duration_months');
      if (!what) break;
      if (hi) {
        const when =
          n.temporal_scope === 'post_employment'
            ? months
              ? 'नौकरी छोड़ने के बाद ' + months + ' महीने तक'
              : 'नौकरी छोड़ने के बाद'
            : n.temporal_scope === 'during_employment'
              ? 'नौकरी के दौरान'
              : '';
        return 'रोक: ' + what + (when ? ' — ' + when : '') + '।';
      }
      const when =
        n.temporal_scope === 'post_employment'
          ? months
            ? 'for ' + months + ' months after you leave'
            : 'after you leave'
          : n.temporal_scope === 'during_employment'
            ? 'while you are employed'
            : '';
      return 'Restricted: ' + what + (when ? ' — ' + when : '') + '.';
    }
    case 'Right': {
      const holder = str(f, 'holder');
      const who = holder ? party(holder, locale) : null;
      return hi
        ? (who ?? 'एक पक्ष') + ' के पास यहाँ एक अधिकार है, जो आपके पास नहीं है।'
        : (who ?? 'One party') + ' holds a power here that is not matched on your side.';
    }
    case 'Obligation': {
      const action = str(f, 'action');
      if (!action) break;
      return hi
        ? 'आपसे कहा जा सकता है: ' + action + '।'
        : 'You may be required to ' + action + '.';
    }
    case 'TerminationPath': {
      const days = num(f, 'notice_days');
      const lieu = str(f, 'in_lieu');
      const holder = str(f, 'holder');
      if (days === null) break;
      if (hi) {
        const who = holder ? party(holder, locale) : 'कोई भी पक्ष';
        return who + ' ' + days + ' दिन के नोटिस पर इसे ख़त्म कर सकता है' + (lieu ? ', या उसके बदले ' + lieu : '') + '।';
      }
      const who = holder ? holder[0].toUpperCase() + holder.slice(1) : 'Either party';
      return who + ' can end this with ' + days + ' days notice' + (lieu ? ', or ' + lieu + ' instead' : '') + '.';
    }
    case 'Condition':
      if (!n.predicate) break;
      return hi
        ? predicateText(n.predicate, 'hi') + ' तब लागू।'
        : 'Applies ' + predicateText(n.predicate, 'en') + '.';
    case 'Deadline': {
      if (!n.deadline) break;
      const d = n.deadline.days;
      if (hi) {
        return d === null
          ? n.deadline.gates + ' पर एक समय-सीमा लागू है।'
          : n.deadline.gates + ' से ' + d + ' दिन पहले।';
      }
      return d === null
        ? 'A deadline governs ' + n.deadline.gates + '.'
        : d + ' days before ' + n.deadline.gates + '.';
    }
  }

  // Never "undefined". A node we cannot phrase still names what it is, and its
  // quoted span is right beside it either way.
  return L[n.kind];
}

/** True when this node's meaning depends on a fact only the reader knows. */
export function needsUserFact(n: GraphNode): boolean {
  return n.predicate?.requires_user_fact === true;
}

/** True when the description carries wording the model supplied, which is not
 *  translated yet. Drives the one honest note on the Hindi view. */
export function hasModelProse(n: GraphNode): boolean {
  return ['restrained', 'action', 'trigger', 'in_lieu', 'discretion'].some(
    (k) => typeof n.fields[k] === 'string' && (n.fields[k] as string).trim().length > 0,
  );
}
