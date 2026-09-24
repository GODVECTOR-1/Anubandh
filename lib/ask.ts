import type { AnalysisPayload, AskCitation, AskResponse, GraphNode } from '@/contracts/schema';
import { describeNode } from '@/lib/describe';
import { clauseLabel } from '@/lib/clause';

/**
 * Ask, and the only classifier there is. /api/ask runs it on the server and
 * the Ask screen runs the same function in the browser first. It makes no
 * model call: every answer is assembled from spans that were already verified.
 *
 * It is deliberately written to the same `AskResponse` contract, because the
 * advice boundary is not a rendering concern. A backend that answers "should I
 * sign" as asked would sail straight past a frontend that only knows how to
 * draw answers, so the outcome enum lives in the contract and both sides are
 * measured against it.
 *
 * The server's answer is the one that counts: the route enforces the contract's
 * invariants on top (information cites, advice hands off, no verdict language).
 * What the browser copy adds is an instant local ESCALATE, which is worth
 * having: someone typing "I have a court date on Friday" should not wait on a
 * network round trip to see a legal-aid number.
 */

/* ───────────────────────── escalation ───────────────────────── */

/**
 * Whole words, plural allowed. Matched as substrings, "fir" (a First
 * Information Report) was found in firm, first, fired and confirm, and
 * "warrant" in warranty, so "Can they fire me?" was told to call legal aid
 * before reading on. "should i" likewise caught "should it".
 *
 * Literals, not a pattern assembled at runtime: it is fixed at build time so
 * no input can reach it, and every alternative is a plain phrase, so there is
 * nothing for a crafted question to backtrack over.
 */
const ESCALATES =
  /\b(arrest|arrested|police|fir|summons|court date|hearing|bailable|warrant|minor|under 18|underage|today|tomorrow|24 hours|48 hours|72 hours)s?\b/;

const CONTACTS = [
  { name: 'NALSA (National Legal Services Authority)', detail: 'Toll-free 15100 — free legal aid, every State and district' },
  { name: 'Your District Legal Services Authority', detail: 'Free representation and advice, in every district in India' },
  { name: 'Tele-Law', detail: 'Free lawyer consultation through a Common Service Centre' },
];

/* ───────────────────────── advice ───────────────────────── */

/** Same rule as ESCALATES: whole words, a fixed literal. */
const ADVISES =
  /\b(should i|shall i|must i|do i have to|will i win|can i win|will they|can they enforce|is this enforceable|is it enforceable|am i safe|what are my chances|will i lose|should we|advise me|what would you do|is it legal|can they sue|will i be sued)s?\b/;

/* ───────────────────────── retrieval ───────────────────────── */

const STOP = new Set([
  'what', 'does', 'do', 'is', 'are', 'the', 'a', 'an', 'my', 'me', 'i', 'to',
  'of', 'in', 'on', 'for', 'and', 'or', 'if', 'this', 'that', 'it', 'can',
  'will', 'would', 'about', 'happens', 'happen', 'how', 'much', 'when', 'mean',
  'means', 'say', 'says', 'am', 'be', 'have', 'has', 'with', 'from', 'at',
]);

const terms = (q: string): string[] =>
  q
    .toLowerCase()
    .replace(/[^a-z0-9\s.]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));

/**
 * What the question is about, matched to fields extraction already filled in.
 *
 * Word matching alone scored the service bond at ZERO for "How much do I owe if
 * I leave early?", a question this screen suggests BECAUSE of the bond (see
 * seedQuestions). The bond says "pay", "payable" and "resignation", never
 * "owe", "leave" or "early", so it was dropped and the non-compete, whose
 * plain-language line happens to say "after you leave", answered a question
 * about money instead.
 *
 * The predicates are the ones seedQuestions uses to write those questions, so
 * a suggested question always reaches the clause it was written from. They
 * also hold whichever words a contract chose: a Money node is a Money node
 * whether it says "pay", "remit" or "forfeit". Worth two word matches, so the
 * clause a question is about outranks one sharing a stray word with it, and
 * words still order clauses of the same kind.
 */
const INTENTS: Array<{ asks: RegExp; fits: (n: GraphNode) => boolean }> = [
  // Not "much": "How much notice do I give?" is about notice, not money.
  { asks: /\b(owe|owes|owed|pay|paid|payable|payment|cost|costs|amount|money|fee|fees|penalty|bond|refund|repay)\b/, fits: (n) => !!n.money },
  { asks: /\b(compet|rival)/, fits: (n) => n.kind === 'Restraint' },
  { asks: /\b(certificate|relieving|experience)\b/, fits: (n) => n.kind === 'Right' },
];
const INTENT_WEIGHT = 2;

function findCitations(analysis: AnalysisPayload, question: string, limit = 2): AskCitation[] {
  const t = terms(question);
  const wanted = INTENTS.filter((i) => i.asks.test(question.toLowerCase()));
  // "How much?" is all stop words and still clearly a question about money.
  if (t.length === 0 && wanted.length === 0) return [];

  // The clause HEADING is how people actually name a clause. "How much is the
  // bond" matched nothing until this was widened: the word bond appears only in
  // the heading span ("9.2 Service bond") and the timeline label, never in the
  // node's own quoted text or its templated description.
  const rowLabel = new Map(analysis.timeline.rows.map((r) => [r.node_id, r.label]));

  const scored = analysis.graph.nodes
    .map((n) => {
      const haystack = (
        n.provenance.quoted_text +
        ' ' +
        describeNode(n) +
        ' ' +
        (n.clause_ref.label ?? '') +
        ' ' +
        (n.clause_ref.provenance?.quoted_text ?? '') +
        ' ' +
        (rowLabel.get(n.id) ?? '') +
        ' ' +
        n.kind
      ).toLowerCase();
      const score =
        t.reduce((acc, term) => acc + (haystack.includes(term) ? 1 : 0), 0) +
        wanted.reduce((acc, i) => acc + (i.fits(n) ? INTENT_WEIGHT : 0), 0);
      return { n, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ n }) => ({
    node_id: n.id,
    clause_label: n.clause_ref.label,
    quoted_text: n.provenance.quoted_text,
    char_start: n.provenance.char_start,
    char_end: n.provenance.char_end,
  }));
}

/**
 * What we can say from what we verified, independent of how the question was
 * classified. Every branch uses it, including ESCALATE.
 */
function readDocument(
  analysis: AnalysisPayload,
  question: string,
): { answer: string; citations: AskCitation[] } {
  const citations = findCitations(analysis, question);

  // Nothing matched. Say what we did extract and how many we dropped. NEVER
  // "the document is silent" — we can only speak for what we verified, and that
  // phrase claims something about the document we never checked.
  if (citations.length === 0) {
    const dropped = analysis.coverage.extracted - analysis.coverage.rendered;
    return {
      citations: [],
      answer:
        'I do not see this in what we extracted. We verified ' +
        analysis.coverage.rendered +
        ' of ' +
        analysis.coverage.extracted +
        ' obligations in your document' +
        (dropped > 0 ? ', and there are ' + dropped + ' we could not confirm' : '') +
        '. It may be in your document in words we did not match, so it is worth reading the full text yourself.',
    };
  }

  const nodeById = new Map(analysis.graph.nodes.map((n) => [n.id, n]));
  return {
    citations,
    answer: citations
      .map((c) => {
        const n = nodeById.get(c.node_id)!;
        return clauseLabel(n) + ': ' + describeNode(n);
      })
      .join(' '),
  };
}

/* ───────────────────────── the router ───────────────────────── */

export function ask(analysis: AnalysisPayload, question: string): AskResponse {
  const q = question.toLowerCase().trim();
  const base = readDocument(analysis, question);

  // ESCALATE first. It interrupts, and it never depends on having found a
  // matching clause — someone with a court date on Friday needs a phone number
  // whether or not their document mentions one.
  //
  // It still carries the reading. The interstitial offers "Continue to the
  // analysis", and a false positive is the LIKELY path here, so continuing has
  // to arrive somewhere. An empty answer turns the exit into a dead end and
  // strands exactly the reader the exit exists for.
  if (ESCALATES.test(q)) {
    return {
      question,
      outcome: 'escalate',
      answer: base.answer,
      citations: base.citations,
      handoff: null,
      escalation: {
        reason:
          'Your question mentions something time-critical. If that is right, talk to a person before reading anything else here.',
        contacts: CONTACTS,
      },
    };
  }

  // ADVICE: reframe, then hand off. Never a bare refusal — leading with the
  // refusal teaches the reader that the product dodges, and they stop asking.
  if (ADVISES.test(q)) {
    const money = analysis.graph.nodes.find((n) => n.money)?.money?.amount_text;
    return {
      question,
      outcome: 'advice',
      answer:
        'I can tell you what your document says and what the law provides, and both are below. What I cannot tell you is what you should do, or what a court would decide.',
      citations: base.citations,
      handoff: money
        ? 'That decision is yours, and with ' +
          money +
          ' at stake it is worth twenty minutes with a lawyer. Prepare has the question list to take with you.'
        : 'That decision is yours. Prepare has a question list to take to a lawyer.',
      escalation: null,
    };
  }

  return {
    question,
    outcome: base.citations.length === 0 ? 'no_coverage' : 'information',
    answer: base.answer,
    citations: base.citations,
    handoff: null,
    escalation: null,
  };
}

/* ───────────────────────── empty state ───────────────────────── */

/**
 * Three tappable questions drawn from the document's own flags. A blank Q&A box
 * is the cheapest way to make a surface feel dead, and the reader already has
 * these questions — they just do not know the product will answer them.
 */
export function seedQuestions(analysis: AnalysisPayload): string[] {
  const nodeById = new Map(analysis.graph.nodes.map((n) => [n.id, n]));
  const out: string[] = [];

  for (const f of analysis.flags) {
    const n = nodeById.get(f.node_id);
    if (!n) continue;
    if (n.money) out.push('How much do I owe if I leave early?');
    else if (n.kind === 'Restraint') out.push('Can I join a competitor after I leave?');
    else if (n.kind === 'Right') out.push('What happens to my experience certificate?');
    if (out.length === 3) break;
  }

  // Worded to stay clear of ADVISES. It was "What notice do I have to
  // give?", and "do i have to" got the screen's own suggestion answered with
  // "What I cannot tell you is what you should do".
  if (out.length < 3) out.push('What is my notice period?');
  return [...new Set(out)].slice(0, 3);
}
