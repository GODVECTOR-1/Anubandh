import type { Locale } from '@/lib/i18n';

/**
 * Every string the interface says in its own voice, in both languages.
 *
 * What is absent from this file is the point of it. None of these exist here:
 *
 *   - statutory text and judicial gloss — quoted law. Paraphrasing a section
 *     into Hindi would be this product stating law it cannot cite, which is the
 *     exact error class it has already had to correct twice.
 *   - quoted spans from the reader's document.
 *   - amounts, clause numbers, dates.
 *   - model-written prose (a flag's consequence, its "what to ask", a timeline
 *     row's wording). Narration is a model call; Hindi narration is the same
 *     call with a different locale, and it belongs to the backend.
 *
 * Anything the interface says for itself is here. Anything quoted, extracted or
 * generated is not, and renders as it arrived.
 */

type Ui = {
  common: {
    notLegalAdvice: string;
    prepareCta: string;
    newDocument: string;
    homeLabel: string;
    openSample: string;
    languageLabel: string;
    mixedLanguageNote: string;
    skipToContent: string;
  };
  nav: { sections: string; radar: string; plain: string; timeline: string; ask: string; prepare: string };
  coverage: {
    /** Slots, not concatenation: the two languages order these differently. */
    verifiedTemplate: string;
    notShown: (n: number) => string;
    seeWhy: string;
    cautionary: string;
    reduced: string;
    couldNotConfirm: string;
    couldNotConfirmBody: string;
    allTraced: string;
    ariaLabel: string;
  };
  radar: {
    title: (n: number) => string;
    subtitle: (n: number) => string;
    disclaimer: string;
    groundedTitle: string;
    groundedBlurb: string;
    onesidedTitle: string;
    onesidedBlurb: string;
    emptyStatutory: string;
    emptyAsymmetry: string;
    basisStatutory: string;
    basisAsymmetry: string;
    whatDocSays: string;
    howCourtsRead: string;
    whyStoodOut: string;
    noStatuteCited: string;
    whatToAsk: string;
    seeInDocument: string;
    changesOverTime: string;
    nothingTemporal: string;
    ifLeftToday: string;
    atMonth: (n: number) => string;
    dragToSee: string;
    someRowsAssume: string;
    doNowTitle: string;
    askTheseTitle: string;
    knowClockTitle: string;
    noDeadline: string;
    talkToSomeoneTitle: string;
    legalAidBody: string;
    cardStubTitle: string;
    cardStubBody: string;
  };
  timeline: {
    title: string;
    subtitle: string;
    leaveHere: string;
    month: (n: number) => string;
    dayOne: string;
    noJoiningDate: string;
    hasHappened: string;
    hasHappenedBody: string;
    itHappened: string;
    exploring: string;
    cancel: string;
    showingAssuming: (a: string) => string;
    noLongerApplies: string;
    onlyAppliesPick: (a: string) => string;
    onlyApplies: (a: string) => string;
    doesNotChange: string;
    moreThatChange: (n: number) => string;
    showFewer: string;
    footnote: string;
    emptyTitle: string;
    emptyBody: string;
    presetResign: string;
    presetBond: string;
    presetTerminated: string;
    presetRelocate: string;
    presetLeave: string;
    presetCompeting: string;
  };
  ask: {
    title: string;
    subtitle: string;
    inputLabel: string;
    placeholder: string;
    submit: string;
    tryOne: string;
    youAsked: string;
    talkFirst: string;
    continueToAnalysis: string;
    notApplicable: string;
    contactsLater: string;
    getQuestionList: string;
    notExtracted: string;
    readFullText: string;
    advocatesAct: string;
    inYourDocument: string;
    thinking: string;
  };
  prepare: {
    title: string;
    subtitle: string;
    download: string;
    askThese: string;
    theClock: string;
    whatToCarry: string;
    lawyerOutOfReach: string;
    noDeadline: string;
  };
  intake: {
    title: string;
    subtitle: string;
    dropHere: string;
    limits: string;
    chooseFile: string;
    pasteInstead: string;
    pasteLabel: string;
    pasteMin: (have: number, need: number) => string;
    readThis: string;
    backToUpload: string;
    orTryOurs: string;
    retention: string;
    stopThis: string;
    tryAgain: string;
    differentFile: string;
    back: string;
    openSampleInstead: string;
    done: string;
    openingResults: string;
    foundVerifiedTemplate: string;
  };
  landing: {
    eyebrow: string;
    headline1: string;
    headline2: string;
    lede: string;
    ctaSample: string;
    ctaOwn: string;
    ctaHow: string;
    heroNote: string;
    sameClauseTitle: string;
    sameClauseBody: string;
    whatYouWereSent: string;
    whatYouGetBack: string;
    sampleCoverage: string;
    howTitle: string;
    howBody: string;
    stage1: string; stage1Body: string;
    stage2: string; stage2Body: string;
    stage3: string; stage3Body: string;
    stage4: string; stage4Body: string;
    limitsTitle: string;
    limitsBody: string;
    limit1: string; limit2: string; limit3: string; limit4: string;
    closingTitle: string;
    closingBody: string;
    footerNote: string;
    footerAid: string;
  };
};

const en: Ui = {
  common: {
    notLegalAdvice: 'Information about your document, not legal advice.',
    prepareCta: 'Prepare questions for a lawyer',
    newDocument: 'New document',
    homeLabel: 'Anubandh — back to the home page',
    openSample: 'Open the sample',
    languageLabel: 'Language',
    mixedLanguageNote:
      'Your document’s own words are never translated — they appear exactly as written, so you can check them against your copy. Some wording is still in English.',
    skipToContent: 'Skip to content',
  },
  nav: { sections: 'Sections', radar: 'Risk Radar', plain: 'Plain Language', timeline: 'Timeline', ask: 'Ask', prepare: 'Prepare' },
  coverage: {
    verifiedTemplate: '{shown} of {total} obligations verified',
    notShown: (n) => n + ' not shown',
    seeWhy: 'see why',
    cautionary:
      'We located a lower share of this document than usual. Everything below is still traced to words we found in your file, but treat the picture as incomplete.',
    reduced:
      'Legal citations are switched off for this document. We located too little of it to say with confidence which clause a section of law would apply to, and a citation pointed at the wrong clause is worse than no citation.',
    couldNotConfirm: 'What we could not confirm',
    couldNotConfirmBody:
      'We could not confirm this text appears in your document, so we are not treating it as something your document says.',
    allTraced: 'Everything we extracted was traced back to your document.',
    ariaLabel: 'How much of your document we could verify',
  },
  radar: {
    title: (n) => n + (n === 1 ? ' thing' : ' things') + ' worth asking about',
    subtitle: (n) => 'out of ' + n + ' obligations we traced back to the words in your document.',
    disclaimer:
      'Anubandh explains what your document says and points at sections of law that may be relevant. It does not tell you what will happen, and it is not legal advice. For advice on your situation, talk to a lawyer.',
    groundedTitle: 'Grounded in law',
    groundedBlurb:
      'Each of these names the section it relies on, and separates what the section says from what courts have read into it.',
    onesidedTitle: 'One-sided terms',
    onesidedBlurb:
      'No statute is cited here. These are computed from the shape of the clause itself — one party holds a power the other does not.',
    emptyStatutory: 'No section of law matched a clause we could locate in this document.',
    emptyAsymmetry: 'We did not find a clause that gives one party a power the other does not have.',
    basisStatutory: 'Cited to law',
    basisAsymmetry: 'Structural, not cited',
    whatDocSays: 'What your document says',
    howCourtsRead: 'How courts have read it',
    whyStoodOut: 'Why this stood out',
    noStatuteCited:
      'No section of law is cited for this. It comes from the shape of the clause, not from a statute.',
    whatToAsk: 'What to ask',
    seeInDocument: 'See this in your document',
    changesOverTime: 'What changes over time',
    nothingTemporal:
      'Nothing in this document depends on how long you stay. There is no bond, no notice period tied to a date, and no restriction that expires.',
    ifLeftToday: 'If you left today',
    atMonth: (n) => 'At month ' + n,
    dragToSee: 'Drag to see what happens if you leave early',
    someRowsAssume: ' — some rows depend on facts only you know',
    doNowTitle: 'What you can do now',
    askTheseTitle: 'Ask these before you sign',
    knowClockTitle: 'Know the clock',
    noDeadline:
      'We did not find a dated deadline in this document. That is worth confirming rather than assuming.',
    talkToSomeoneTitle: 'Talk to someone',
    legalAidBody:
      'Free legal aid is available in every district in India through the District Legal Services Authority. Anubandh is a reading aid, not a substitute for advice.',
    cardStubTitle: 'We could not display this item.',
    cardStubBody:
      'It is still counted in the total above, so the number you see is not missing anything.',
  },
  timeline: {
    title: 'What changes if you leave',
    subtitle: 'Drag the handle to a month. Everything below is read from your document, not predicted.',
    leaveHere: 'I leave here',
    month: (n) => 'Month ' + n,
    dayOne: 'Day one',
    noJoiningDate: 'Joining date not in the document',
    hasHappened: 'Has this happened, or are you exploring?',
    hasHappenedBody:
      'Your document says what follows if it does. It does not say whether it has, so either way we will label the result as an assumption.',
    itHappened: 'This has happened',
    exploring: 'I am exploring',
    cancel: 'Cancel',
    showingAssuming: (a) => 'Showing results ' + a + '.',
    noLongerApplies: 'no longer applies',
    onlyAppliesPick: (a) => 'Only applies ' + a + '. Pick that scenario above to include it.',
    onlyApplies: (a) => 'Only applies ' + a + '.',
    doesNotChange: 'Does not change with when you leave',
    moreThatChange: (n) => '+' + n + ' more that change',
    showFewer: 'Show fewer',
    footnote:
      'This shows what your document says follows from a leaving date. It is not a prediction of what a court would do, and it is not legal advice.',
    emptyTitle: 'Nothing here depends on timing',
    emptyBody:
      'This document has no bond, no notice period tied to a date, and no restriction that expires. There is nothing for a timeline to show.',
    presetResign: 'I resign here',
    presetBond: 'I finish the bond period',
    presetTerminated: 'I am terminated by the employer',
    presetRelocate: 'I am asked to relocate',
    presetLeave: 'I take extended leave',
    presetCompeting: 'I take a competing offer',
  },
  ask: {
    title: 'Ask about your document',
    subtitle: 'Answers come from the clauses we verified, and each one shows the words it came from.',
    inputLabel: 'Your question about this document',
    placeholder: 'What happens if I leave before two years?',
    submit: 'Ask',
    tryOne: 'Try one of these',
    youAsked: 'You asked',
    talkFirst: 'Talk to a person first',
    continueToAnalysis: 'Continue to the analysis',
    notApplicable: 'This does not apply to me',
    contactsLater: 'Legal aid contacts are still available on the Prepare tab if you want them later.',
    getQuestionList: 'Get the question list',
    notExtracted: 'Not in what we extracted',
    readFullText: 'Read the full text we extracted',
    advocatesAct:
      'Anubandh states what your document says and what a statute provides. It does not advise on your situation, predict an outcome, or represent you. Practising law in India is reserved to enrolled advocates under the Advocates Act, 1961.',
    inYourDocument: 'In your document',
    // Says what the wait BUYS. A person reading a document that worries them
    // does not need a cheerful spinner, they need to know the answer is being
    // traced to real words rather than guessed at.
    thinking: 'Taking a moment to find the exact words.',
  },
  prepare: {
    title: 'Take this to a lawyer',
    subtitle: 'One page: the questions worth asking, the words behind each one, and what to bring.',
    download: 'Download the one-page PDF',
    askThese: 'Ask these',
    theClock: 'The clock',
    whatToCarry: 'What to carry',
    lawyerOutOfReach: 'If a lawyer is out of reach',
    noDeadline:
      'We did not find a dated deadline in this document. That is worth confirming rather than assuming.',
  },
  intake: {
    title: 'Read a document',
    subtitle:
      'An offer letter, an employment contract, or anything you have been asked to sign. No account needed.',
    dropHere: 'Drop a file here',
    limits: 'PDF, Word, or a photo · up to 40 pages, 10 MB',
    chooseFile: 'Choose a file',
    pasteInstead: 'Paste text instead',
    pasteLabel: 'Paste the text of your document',
    pasteMin: (have, need) =>
      'We need at least ' + need + ' characters, not counting spaces, to find an agreement in it. So far: ' + have + '.',
    readThis: 'Read this',
    backToUpload: 'Back to upload',
    orTryOurs: 'Or try one of ours',
    retention:
      'Your document and its analysis are deleted after 24 hours. Nothing is used to train anything. You can delete it sooner at any point.',
    stopThis: 'Stop this',
    tryAgain: 'Try again',
    differentFile: 'Use a different file',
    back: 'Back',
    openSampleInstead: 'Open the sample instead',
    done: 'Done',
    openingResults: 'Opening your results.',
    foundVerifiedTemplate: '{found} obligations found · {verified} verified so far',
  },
  landing: {
    eyebrow: 'For anyone signing something in India',
    headline1: 'Read your contract',
    headline2: 'with the receipts.',
    lede:
      'Anubandh reads an offer letter or contract and tells you what you are agreeing to. Every single point is traced back to the exact words it came from, so you never have to take our word for it.',
    ctaSample: 'Read a sample offer letter',
    ctaOwn: 'Read your own document',
    ctaHow: 'How it works',
    heroNote:
      'Information about your document, not legal advice. Nothing you upload is kept beyond 24 hours.',
    sameClauseTitle: 'The same clause, twice',
    sameClauseBody:
      'On the left is what a service bond looks like in a real offer letter. On the right is what Anubandh does with it. Nothing on the right is generated prose: it is the clause restated, with the words it came from attached.',
    whatYouWereSent: 'What you were sent',
    whatYouGetBack: 'What you get back',
    sampleCoverage:
      'In this sample document: 37 of 41 obligations traced back to words we found. The other 4 are listed, with the reason each one was dropped.',
    howTitle: 'Why you can check us',
    howBody:
      'Most tools ask you to trust a summary. This one is built so you do not have to. Four stages run on every document, and anything that fails one of them is not shown to you as fact.',
    stage1: 'Normalize',
    stage1Body:
      'We rebuild your file as plain text and keep a map back to the original page, so you can always check what we read.',
    stage2: 'Locate',
    stage2Body:
      'The model quotes a phrase. We find that phrase ourselves, character by character. Models do not get to report their own positions.',
    stage3: 'Verify',
    stage3Body:
      'Matching proves the words exist. A second pass checks the words actually support the reading we built on them.',
    stage4: 'Check against law',
    stage4Body:
      'Where a section applies, we quote the section itself, and keep what courts have read into it clearly separate.',
    limitsTitle: 'What it will not do',
    limitsBody:
      'A tool that reads legal documents should be clear about where it stops. Practising law in India is reserved to enrolled advocates under the Advocates Act, 1961, and none of this is a substitute for one.',
    limit1: 'It will not tell you whether to sign. That decision is yours.',
    limit2: 'It will not predict what a court would do, or whether a clause would hold up.',
    limit3: 'It will not show you anything it could not find in your own document.',
    limit4: 'It is not a lawyer, and it is not legal advice.',
    closingTitle: 'See it on a real offer letter',
    closingBody:
      'A sample employment letter is loaded and ready, with a service bond, a non-compete and a withheld experience certificate. Nothing to upload.',
    footerNote: 'Anubandh · information about your document, not legal advice',
    footerAid: 'Free legal aid: NALSA, toll-free 15100',
  },
};

const hi: Ui = {
  common: {
    notLegalAdvice: 'आपके दस्तावेज़ के बारे में जानकारी, कानूनी सलाह नहीं।',
    prepareCta: 'वकील के लिए सवाल तैयार करें',
    newDocument: 'नया दस्तावेज़',
    homeLabel: 'अनुबंध — मुख्य पृष्ठ पर वापस',
    openSample: 'नमूना देखें',
    languageLabel: 'भाषा',
    mixedLanguageNote:
      'आपके दस्तावेज़ के अपने शब्द कभी अनुवाद नहीं किए जाते — वे जैसे लिखे हैं वैसे ही दिखते हैं, ताकि आप उन्हें अपनी प्रति से मिला सकें। कुछ वाक्यांश अभी अंग्रेज़ी में हैं।',
    skipToContent: 'सामग्री पर जाएँ',
  },
  nav: {
    sections: 'अनुभाग',
    radar: 'जोखिम की सूची',
    plain: 'आसान भाषा',
    timeline: 'समय-रेखा',
    ask: 'पूछें',
    prepare: 'तैयारी',
  },
  coverage: {
    verifiedTemplate: '{total} में से {shown} बातें जाँची गईं',
    notShown: (n) => n + ' नहीं दिखाई गईं',
    seeWhy: 'क्यों, देखें',
    cautionary:
      'इस दस्तावेज़ का सामान्य से कम हिस्सा हम ढूँढ पाए। नीचे जो कुछ है वह अब भी आपकी फ़ाइल में मिले शब्दों से जुड़ा है, पर तस्वीर अधूरी मानें।',
    reduced:
      'इस दस्तावेज़ के लिए कानूनी हवाले बंद कर दिए गए हैं। हम इतना कम हिस्सा ढूँढ पाए कि यह कहना मुश्किल है कि कानून की कौन-सी धारा किस शर्त पर लागू होगी, और ग़लत शर्त पर लगा हवाला बिना हवाले से भी बुरा है।',
    couldNotConfirm: 'जिनकी पुष्टि नहीं हो सकी',
    couldNotConfirmBody:
      'हम पक्का नहीं कर सके कि यह पाठ आपके दस्तावेज़ में है, इसलिए हम इसे आपके दस्तावेज़ की बात नहीं मान रहे।',
    allTraced: 'हमने जो कुछ निकाला, सब आपके दस्तावेज़ तक जुड़ा।',
    ariaLabel: 'आपके दस्तावेज़ का कितना हिस्सा हम जाँच पाए',
  },
  radar: {
    title: (n) => n + ' बातें पूछने लायक़',
    subtitle: (n) => 'उन ' + n + ' बातों में से, जिन्हें हम आपके दस्तावेज़ के शब्दों तक जोड़ पाए।',
    disclaimer:
      'अनुबंध यह बताता है कि आपका दस्तावेज़ क्या कहता है और कानून की कौन-सी धाराएँ काम की हो सकती हैं। यह नहीं बताता कि आगे क्या होगा, और यह कानूनी सलाह नहीं है। अपनी स्थिति पर सलाह के लिए वकील से बात करें।',
    groundedTitle: 'कानून पर आधारित',
    groundedBlurb:
      'इनमें से हर एक उस धारा का नाम लेता है जिस पर वह टिकी है, और यह अलग रखता है कि धारा खुद क्या कहती है और अदालतों ने उसमें क्या पढ़ा है।',
    onesidedTitle: 'एकतरफ़ा शर्तें',
    onesidedBlurb:
      'यहाँ कोई कानूनी धारा नहीं दी गई। ये शर्त की अपनी बनावट से निकली हैं — एक पक्ष के पास वह ताक़त है जो दूसरे के पास नहीं।',
    emptyStatutory: 'इस दस्तावेज़ में हमें ऐसी कोई शर्त नहीं मिली जिस पर कानून की कोई धारा लागू होती हो।',
    emptyAsymmetry: 'हमें ऐसी कोई शर्त नहीं मिली जो एक पक्ष को वह ताक़त देती हो जो दूसरे के पास नहीं है।',
    basisStatutory: 'कानून का हवाला',
    basisAsymmetry: 'बनावट से, हवाले से नहीं',
    whatDocSays: 'आपका दस्तावेज़ क्या कहता है',
    howCourtsRead: 'अदालतों ने इसे कैसे पढ़ा है',
    whyStoodOut: 'यह क्यों खटका',
    noStatuteCited:
      'इसके लिए कानून की कोई धारा नहीं दी गई है। यह शर्त की बनावट से निकला है, किसी कानून से नहीं।',
    whatToAsk: 'क्या पूछें',
    seeInDocument: 'इसे अपने दस्तावेज़ में देखें',
    changesOverTime: 'समय के साथ क्या बदलता है',
    nothingTemporal:
      'इस दस्तावेज़ में कुछ भी इस पर निर्भर नहीं कि आप कितने समय रुकते हैं। न कोई बॉन्ड है, न तारीख़ से जुड़ा नोटिस, न कोई रोक जो खत्म होती हो।',
    ifLeftToday: 'अगर आप आज छोड़ें',
    atMonth: (n) => n + 'वें महीने पर',
    dragToSee: 'खिसकाकर देखें कि जल्दी छोड़ने पर क्या होता है',
    someRowsAssume: ' — कुछ पंक्तियाँ उन बातों पर टिकी हैं जो सिर्फ़ आप जानते हैं',
    doNowTitle: 'अभी आप क्या कर सकते हैं',
    askTheseTitle: 'हस्ताक्षर से पहले ये पूछें',
    knowClockTitle: 'समय का ध्यान रखें',
    noDeadline:
      'इस दस्तावेज़ में हमें तारीख़ वाली कोई समय-सीमा नहीं मिली। मान लेने के बजाय इसकी पुष्टि कर लें।',
    talkToSomeoneTitle: 'किसी से बात करें',
    legalAidBody:
      'भारत के हर ज़िले में ज़िला विधिक सेवा प्राधिकरण के ज़रिए मुफ़्त कानूनी मदद मिलती है। अनुबंध पढ़ने में मदद करता है, सलाह की जगह नहीं लेता।',
    cardStubTitle: 'हम यह चीज़ नहीं दिखा सके।',
    cardStubBody: 'यह ऊपर की गिनती में अब भी शामिल है, इसलिए दिखाई गई संख्या में कुछ छूटा नहीं है।',
  },
  timeline: {
    title: 'छोड़ने पर क्या बदलता है',
    subtitle:
      'हैंडल को किसी महीने तक खिसकाएँ। नीचे जो कुछ है वह आपके दस्तावेज़ से पढ़ा गया है, अनुमान नहीं।',
    leaveHere: 'मैं यहाँ छोड़ता/छोड़ती हूँ',
    month: (n) => 'महीना ' + n,
    dayOne: 'पहला दिन',
    noJoiningDate: 'दस्तावेज़ में जॉइनिंग की तारीख़ नहीं है',
    hasHappened: 'क्या ऐसा हो चुका है, या आप बस देख रहे हैं?',
    hasHappenedBody:
      'आपका दस्तावेज़ बताता है कि ऐसा होने पर क्या होगा। यह नहीं बताता कि हुआ या नहीं, इसलिए दोनों हाल में हम नतीजे को अनुमान बताकर ही दिखाएँगे।',
    itHappened: 'ऐसा हो चुका है',
    exploring: 'मैं बस देख रहा/रही हूँ',
    cancel: 'रहने दें',
    showingAssuming: (a) => 'नतीजे इस अनुमान पर: ' + a + '।',
    noLongerApplies: 'अब लागू नहीं',
    onlyAppliesPick: (a) => 'यह तभी लागू है: ' + a + '। इसे शामिल करने के लिए ऊपर वह हाल चुनें।',
    onlyApplies: (a) => 'यह तभी लागू है: ' + a + '।',
    doesNotChange: 'आप कब छोड़ते हैं, इससे यह नहीं बदलता',
    moreThatChange: (n) => n + ' और जो बदलती हैं',
    showFewer: 'कम दिखाएँ',
    footnote:
      'यह दिखाता है कि छोड़ने की तारीख़ से आपका दस्तावेज़ क्या नतीजा बताता है। यह अनुमान नहीं है कि अदालत क्या करेगी, और यह कानूनी सलाह नहीं है।',
    emptyTitle: 'यहाँ कुछ भी समय पर निर्भर नहीं',
    emptyBody:
      'इस दस्तावेज़ में न कोई बॉन्ड है, न तारीख़ से जुड़ा नोटिस, न कोई रोक जो खत्म होती हो। समय-रेखा में दिखाने को कुछ नहीं है।',
    presetResign: 'मैं यहाँ इस्तीफ़ा देता/देती हूँ',
    presetBond: 'मैं बॉन्ड की अवधि पूरी करता/करती हूँ',
    presetTerminated: 'कंपनी मुझे निकाल देती है',
    presetRelocate: 'मुझसे तबादले के लिए कहा जाता है',
    presetLeave: 'मैं लंबी छुट्टी लेता/लेती हूँ',
    presetCompeting: 'मैं प्रतिस्पर्धी कंपनी का प्रस्ताव लेता/लेती हूँ',
  },
  ask: {
    title: 'अपने दस्तावेज़ के बारे में पूछें',
    subtitle: 'जवाब उन्हीं शर्तों से आते हैं जिन्हें हमने जाँचा है, और हर जवाब वे शब्द दिखाता है जिनसे वह बना।',
    inputLabel: 'इस दस्तावेज़ के बारे में आपका सवाल',
    placeholder: 'अगर मैं दो साल से पहले छोड़ दूँ तो क्या होगा?',
    submit: 'पूछें',
    tryOne: 'इनमें से कोई आज़माएँ',
    youAsked: 'आपने पूछा',
    talkFirst: 'पहले किसी व्यक्ति से बात करें',
    continueToAnalysis: 'विश्लेषण पर आगे बढ़ें',
    notApplicable: 'यह मुझ पर लागू नहीं होता',
    contactsLater: 'कानूनी मदद के संपर्क तैयारी वाले पन्ने पर बाद में भी मिलेंगे।',
    getQuestionList: 'सवालों की सूची लें',
    notExtracted: 'जो हमने निकाला, उसमें यह नहीं है',
    readFullText: 'हमने जो पूरा पाठ निकाला, वह पढ़ें',
    advocatesAct:
      'अनुबंध यह बताता है कि आपका दस्तावेज़ क्या कहता है और कानून क्या कहता है। यह आपकी स्थिति पर सलाह नहीं देता, नतीजे का अनुमान नहीं लगाता, और आपका प्रतिनिधित्व नहीं करता। भारत में वकालत सिर्फ़ नामांकित अधिवक्ता ही कर सकते हैं (अधिवक्ता अधिनियम, 1961)।',
    inYourDocument: 'आपके दस्तावेज़ में',
    thinking: 'असली शब्द ढूँढ़ने में एक पल लग रहा है।',
  },
  prepare: {
    title: 'इसे वकील के पास ले जाएँ',
    subtitle: 'एक पन्ना: पूछने लायक़ सवाल, हर सवाल के पीछे के शब्द, और क्या साथ ले जाएँ।',
    download: 'एक पन्ने की PDF डाउनलोड करें',
    askThese: 'ये पूछें',
    theClock: 'समय',
    whatToCarry: 'क्या साथ ले जाएँ',
    lawyerOutOfReach: 'अगर वकील तक पहुँच न हो',
    noDeadline:
      'इस दस्तावेज़ में हमें तारीख़ वाली कोई समय-सीमा नहीं मिली। मान लेने के बजाय इसकी पुष्टि कर लें।',
  },
  intake: {
    title: 'कोई दस्तावेज़ पढ़ें',
    subtitle:
      'नौकरी का प्रस्ताव, रोज़गार अनुबंध, या कुछ भी जिस पर आपसे हस्ताक्षर करने को कहा गया हो। खाता बनाने की ज़रूरत नहीं।',
    dropHere: 'फ़ाइल यहाँ छोड़ें',
    limits: 'PDF, Word, या फ़ोटो · ज़्यादा से ज़्यादा 40 पन्ने, 10 MB',
    chooseFile: 'फ़ाइल चुनें',
    pasteInstead: 'इसके बजाय पाठ चिपकाएँ',
    pasteLabel: 'अपने दस्तावेज़ का पाठ यहाँ चिपकाएँ',
    pasteMin: (have, need) =>
      'अनुबंध पहचानने के लिए कम से कम ' + need + ' अक्षर चाहिए, खाली जगह को छोड़कर। अभी तक: ' + have + '।',
    readThis: 'इसे पढ़ें',
    backToUpload: 'अपलोड पर वापस',
    orTryOurs: 'या हमारा कोई नमूना देखें',
    retention:
      'आपका दस्तावेज़ और उसका विश्लेषण 24 घंटे बाद मिटा दिया जाता है। किसी चीज़ को सिखाने में इसका उपयोग नहीं होता। आप इसे पहले भी मिटा सकते हैं।',
    stopThis: 'रोकें',
    tryAgain: 'फिर कोशिश करें',
    differentFile: 'दूसरी फ़ाइल लें',
    back: 'वापस',
    openSampleInstead: 'इसके बजाय नमूना देखें',
    done: 'हो गया',
    openingResults: 'आपके नतीजे खोले जा रहे हैं।',
    foundVerifiedTemplate: '{found} बातें मिलीं · अब तक {verified} जाँची गईं',
  },
  landing: {
    eyebrow: 'भारत में कुछ भी हस्ताक्षर करने वालों के लिए',
    headline1: 'अपना अनुबंध पढ़ें,',
    headline2: 'सबूत के साथ।',
    lede:
      'अनुबंध आपके प्रस्ताव-पत्र या ठेके को पढ़ता है और बताता है कि आप किस बात पर राज़ी हो रहे हैं। हर बात उन्हीं शब्दों तक जुड़ी होती है जिनसे वह निकली है, ताकि आपको हम पर भरोसा न करना पड़े।',
    ctaSample: 'एक नमूना प्रस्ताव-पत्र पढ़ें',
    ctaOwn: 'अपना दस्तावेज़ पढ़ें',
    ctaHow: 'यह कैसे काम करता है',
    heroNote:
      'आपके दस्तावेज़ के बारे में जानकारी, कानूनी सलाह नहीं। आप जो भी भेजते हैं वह 24 घंटे से ज़्यादा नहीं रखा जाता।',
    sameClauseTitle: 'वही शर्त, दो बार',
    sameClauseBody:
      'बाईं तरफ़ है जैसा एक असली प्रस्ताव-पत्र में सेवा-बॉन्ड दिखता है। दाईं तरफ़ है जो अनुबंध उसके साथ करता है। दाईं तरफ़ कुछ भी गढ़ा हुआ नहीं है: यह वही शर्त दोबारा कही गई है, उन्हीं शब्दों के साथ जिनसे वह आई।',
    whatYouWereSent: 'आपको जो भेजा गया',
    whatYouGetBack: 'आपको जो वापस मिलता है',
    sampleCoverage:
      'इस नमूना दस्तावेज़ में: 41 में से 37 बातें उन शब्दों तक जुड़ीं जो हमें मिले। बाक़ी 4 सूची में हैं, हर एक के छूटने की वजह के साथ।',
    howTitle: 'आप हमें क्यों जाँच सकते हैं',
    howBody:
      'ज़्यादातर औज़ार आपसे सारांश पर भरोसा करने को कहते हैं। यह ऐसे बना है कि आपको भरोसा करना ही न पड़े। हर दस्तावेज़ पर चार चरण चलते हैं, और जो इनमें से किसी में फेल हो जाए वह आपको तथ्य की तरह नहीं दिखाया जाता।',
    stage1: 'साफ़ पाठ बनाना',
    stage1Body:
      'हम आपकी फ़ाइल को सादे पाठ में दोबारा बनाते हैं और मूल पन्ने तक का नक्शा रखते हैं, ताकि आप हमेशा जाँच सकें कि हमने क्या पढ़ा।',
    stage2: 'जगह ढूँढ़ना',
    stage2Body:
      'मॉडल कोई वाक्यांश बताता है। वह वाक्यांश हम खुद ढूँढ़ते हैं, अक्षर दर अक्षर। मॉडल को अपनी जगह खुद बताने का हक़ नहीं मिलता।',
    stage3: 'पुष्टि करना',
    stage3Body:
      'मिलान सिर्फ़ यह साबित करता है कि शब्द मौजूद हैं। दूसरा चरण जाँचता है कि वे शब्द सचमुच उस बात का आधार हैं जो हमने कही।',
    stage4: 'कानून से मिलाना',
    stage4Body:
      'जहाँ कोई धारा लागू होती है, हम उस धारा को उसी के शब्दों में देते हैं, और अदालतों ने उसमें जो पढ़ा है उसे साफ़ अलग रखते हैं।',
    limitsTitle: 'यह क्या नहीं करेगा',
    limitsBody:
      'कानूनी दस्तावेज़ पढ़ने वाले औज़ार को साफ़ बताना चाहिए कि वह कहाँ रुकता है। भारत में वकालत सिर्फ़ नामांकित अधिवक्ता कर सकते हैं (अधिवक्ता अधिनियम, 1961), और यह उसकी जगह नहीं लेता।',
    limit1: 'यह नहीं बताएगा कि हस्ताक्षर करें या नहीं। वह फ़ैसला आपका है।',
    limit2: 'यह अनुमान नहीं लगाएगा कि अदालत क्या करेगी, या कोई शर्त टिकेगी या नहीं।',
    limit3: 'यह आपको वह कुछ नहीं दिखाएगा जो उसे आपके दस्तावेज़ में न मिला हो।',
    limit4: 'यह वकील नहीं है, और यह कानूनी सलाह नहीं है।',
    closingTitle: 'इसे एक असली प्रस्ताव-पत्र पर देखें',
    closingBody:
      'एक नमूना रोज़गार पत्र तैयार रखा है — सेवा-बॉन्ड, प्रतिस्पर्धा पर रोक, और रोका गया अनुभव प्रमाणपत्र इसमें हैं। कुछ भेजने की ज़रूरत नहीं।',
    footerNote: 'अनुबंध · आपके दस्तावेज़ के बारे में जानकारी, कानूनी सलाह नहीं',
    footerAid: 'मुफ़्त कानूनी मदद: NALSA, टोल-फ़्री 15100',
  },
};

export const UI: Record<Locale, Ui> = { en, hi };
export type { Ui };
