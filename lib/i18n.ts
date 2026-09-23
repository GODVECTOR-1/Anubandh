/**
 * Hindi on Plain Language.
 *
 * The plan puts the toggle on this surface specifically because this surface is
 * TEMPLATED. Kind labels, clause references and the condition vocabulary are a
 * closed set, so they translate deterministically rather than by asking a model
 * to re-say something in another language.
 *
 * Two categories of text are NEVER translated, and both are load-bearing:
 *
 *   1. Quoted spans. They are the document's own words, and the whole product
 *      is the claim that you can check them against your own copy. A translated
 *      quote is not a quote.
 *   2. Money as written. "Rs. 2,00,000/-" renders verbatim in either language,
 *      because the amount is the document's, not ours.
 *
 * A third category is not translated YET: free text the model supplied
 * (`restrained`, `action`, `trigger`). Narration is a model call, so Hindi
 * narration is the same call with a different locale and belongs to the
 * backend. Until it lands those fragments render as extracted, and the view
 * says so rather than quietly mixing two languages without explanation.
 */

import type { ConditionPredicate, NodeKind, Severity } from '@/contracts/schema';

export const LOCALES = ['en', 'hi'] as const;
export type Locale = (typeof LOCALES)[number];

export const isLocale = (v: string | undefined): v is Locale =>
  v === 'en' || v === 'hi';

export const LOCALE_NAME: Record<Locale, string> = {
  en: 'English',
  hi: 'हिन्दी',
};

type Strings = {
  title: string;
  subtitle: (n: number) => string;
  inYourDocument: string;
  readFullText: string;
  sourcePaneLabel: string;
  factNote: string;
  looseMatchNote: string;
  clausePrefix: string;
  unnumbered: string;
  pagePrefix: string;
  pagesPrefix: string;
  languageLabel: string;
  notTranslated: string;
};

export const STRINGS: Record<Locale, Strings> = {
  en: {
    title: 'Clause by clause',
    subtitle: (n) =>
      n + ' things we found, each one next to the words it came from. Select either side.',
    inYourDocument: 'in your document',
    readFullText: 'Read the full text we extracted',
    sourcePaneLabel:
      'This is the text we extracted from your file. Highlighted phrases are the ones we relied on.',
    factNote: 'Only applies if this happened to you — the document does not say whether it did.',
    looseMatchNote: 'Matched loosely. Read this one against your own copy.',
    clausePrefix: 'Clause',
    unnumbered: 'Unnumbered clause',
    pagePrefix: 'p.',
    pagesPrefix: 'pp.',
    languageLabel: 'Language',
    notTranslated: '',
  },
  hi: {
    title: 'शर्त दर शर्त',
    subtitle: (n) =>
      'हमें ' + n + ' बातें मिलीं। हर एक के साथ वही शब्द हैं जिनसे वह निकली है। किसी भी तरफ़ से चुनें।',
    inYourDocument: 'आपके दस्तावेज़ में',
    readFullText: 'हमने जो पूरा पाठ निकाला, वह पढ़ें',
    sourcePaneLabel:
      'यह वह पाठ है जो हमने आपकी फ़ाइल से निकाला है। जिन वाक्यांशों पर हमने भरोसा किया, वे चिह्नित हैं।',
    factNote:
      'यह तभी लागू होगा जब आपके साथ ऐसा हुआ हो। दस्तावेज़ यह नहीं बताता कि ऐसा हुआ या नहीं।',
    looseMatchNote: 'इसका मिलान पक्का नहीं है। इसे अपनी प्रति से मिलाकर पढ़ें।',
    clausePrefix: 'शर्त',
    unnumbered: 'बिना नंबर की शर्त',
    pagePrefix: 'पृ.',
    pagesPrefix: 'पृ.',
    languageLabel: 'भाषा',
    notTranslated:
      'आपके दस्तावेज़ के अपने शब्द कभी अनुवाद नहीं किए जाते — वे जैसे हैं वैसे ही दिखते हैं, ताकि आप उन्हें अपनी प्रति से मिला सकें। कुछ वाक्यांश अभी अंग्रेज़ी में हैं।',
  },
};

export const KIND_LABEL: Record<Locale, Record<NodeKind, string>> = {
  en: {
    Party: 'Who is involved',
    Obligation: 'Something you must do',
    Restraint: 'Something you may not do',
    Right: 'A power one side holds',
    Condition: 'A condition',
    Term: 'A defined term',
    Money: 'Money',
    Deadline: 'A deadline',
    TerminationPath: 'How this ends',
  },
  hi: {
    Party: 'कौन-कौन शामिल है',
    Obligation: 'जो आपको करना होगा',
    Restraint: 'जो आप नहीं कर सकते',
    Right: 'एक पक्ष का अधिकार',
    Condition: 'एक शर्त',
    Term: 'परिभाषित शब्द',
    Money: 'रकम',
    Deadline: 'समय-सीमा',
    TerminationPath: 'यह कैसे ख़त्म होता है',
  },
};

/** Closed vocabulary, so this translates completely and deterministically. */
export function predicateText(p: ConditionPredicate, locale: Locale): string {
  if (locale === 'en') {
    switch (p.kind) {
      case 'resigns_before_month':   return `if you resign before month ${p.month}`;
      case 'bond_period_complete':   return 'once the bond period is complete';
      case 'notice_given':           return `if ${p.days} days notice is given`;
      case 'terminated_by_employer': return 'if the company ends your employment';
      case 'terminated_for_cause':   return 'if you are dismissed for cause';
      case 'relocation_refused':     return 'if you are asked to relocate and decline';
      case 'competing_employment':   return 'if you take work with a competitor';
      case 'leave_exceeds':          return `if your leave runs past ${p.days} days`;
      case 'unclassified':           return p.verbatim;
    }
  }
  switch (p.kind) {
    case 'resigns_before_month':   return `अगर आप ${p.month} महीने पूरे होने से पहले इस्तीफ़ा देते हैं`;
    case 'bond_period_complete':   return 'बॉन्ड की अवधि पूरी हो जाने पर';
    case 'notice_given':           return `अगर ${p.days} दिन का नोटिस दिया जाए`;
    case 'terminated_by_employer': return 'अगर कंपनी आपकी नौकरी ख़त्म करे';
    case 'terminated_for_cause':   return 'अगर आपको किसी कारण बताकर निकाला जाए';
    case 'relocation_refused':     return 'अगर आपसे तबादले के लिए कहा जाए और आप मना करें';
    case 'competing_employment':   return 'अगर आप किसी प्रतिस्पर्धी कंपनी में काम लें';
    case 'leave_exceeds':          return `अगर आपकी छुट्टी ${p.days} दिन से ज़्यादा चले`;
    // Never translated: it is the document's own wording, kept because a
    // guessed predicate is worse than silence.
    case 'unclassified':           return p.verbatim;
  }
}

/**
 * The named severity scale. Closed enum, so it translates completely — and it
 * must, because a Hindi page with an English risk label is the one place a
 * reader would reasonably assume the translation had failed.
 *
 * Colour still never carries meaning alone: the icon and this label do.
 */
export const SEVERITY_TEXT: Record<Locale, Record<Severity, { label: string; meaning: string }>> = {
  en: {
    act_on_this:    { label: 'Act on this',    meaning: 'Money, or a right you lose' },
    ask_about_this: { label: 'Ask about this', meaning: 'One-sided, or law may apply' },
    know_about_this:{ label: 'Know about this',meaning: 'Worth reading, not alarming' },
  },
  hi: {
    act_on_this:    { label: 'इस पर कुछ करें',       meaning: 'पैसा, या कोई अधिकार जो आप खो सकते हैं' },
    ask_about_this: { label: 'इसके बारे में पूछें',   meaning: 'एकतरफ़ा, या कानून लागू हो सकता है' },
    know_about_this:{ label: 'यह जान लें',          meaning: 'पढ़ने लायक़, घबराने की बात नहीं' },
  },
};
