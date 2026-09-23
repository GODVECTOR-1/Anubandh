import type { AnalysisPayload } from '@/contracts/schema';
import { clauseLabel } from '@/lib/clause';
import { describeNode } from '@/lib/describe';

/**
 * The packet a reader takes to a lawyer.
 *
 * Every field here reuses something that already exists: the questions were
 * generated for the flag cards, the deadline is a node already in the graph,
 * the quotes are spans already verified. Zero new data, and nothing invented
 * for the packet alone — a document handed to a lawyer is the worst possible
 * place for a sentence nobody traced.
 *
 * Shared by the screen and the PDF route so the two can never drift.
 */

export type PacketQuestion = {
  question: string;
  /** Why this question, in the reader's terms. */
  because: string;
  clause: string;
  quote: string;
};

export type Packet = {
  title: string;
  generatedOn: string;
  summary: string;
  questions: PacketQuestion[];
  deadline: string | null;
  carry: string[];
  coverageNote: string;
  disclaimer: string;
};

export function buildPacket(analysis: AnalysisPayload): Packet {
  const nodeById = new Map(analysis.graph.nodes.map((n) => [n.id, n]));

  const questions: PacketQuestion[] = analysis.flags.map((f) => {
    const n = nodeById.get(f.node_id);
    return {
      question: f.what_to_ask,
      because: f.consequence,
      clause: n ? clauseLabel(n) : 'In your document',
      quote: n ? n.provenance.quoted_text : '',
    };
  });

  // Top up to five from obligations that were not flagged. A lawyer meeting is
  // short, and five questions is what fits on one page and in twenty minutes.
  if (questions.length < 5) {
    for (const n of analysis.graph.nodes) {
      if (questions.length >= 5) break;
      if (analysis.flags.some((f) => f.node_id === n.id)) continue;
      if (n.kind !== 'TerminationPath' && n.kind !== 'Obligation' && n.kind !== 'Restraint') continue;
      // A question in this packet gets SAID OUT LOUD to a lawyer. When the
      // clause is unnumbered, clauseLabel returns our internal locator, and
      // 'what does p.1 paragraph 9 mean' is not a sentence anyone says. Fall
      // back to the clause's own opening words, which are speakable and are
      // already verified against the document.
      // A fixed word count cuts mid-phrase: eight words of this clause ends at
      // 'to any Company', which reads like the sentence broke. Short quotes go
      // in whole; only genuinely long ones are trimmed, and they say so.
      const words = n.provenance.quoted_text.split(/\s+/);
      const opener = words.length <= 12 ? words.join(' ') : words.slice(0, 10).join(' ') + '...';
      questions.push({
        question: n.clause_ref.label
          ? 'Can you explain what Clause ' + n.clause_ref.label + ' means for me in practice?'
          : 'Can you explain the clause that says "' + opener + '"?',
        because: describeNode(n),
        clause: clauseLabel(n),
        quote: n.provenance.quoted_text,
      });
    }
  }

  const deadlineNode = analysis.graph.nodes
    .filter((n) => n.deadline && n.deadline.days !== null)
    .sort((a, b) => (a.deadline!.days ?? 0) - (b.deadline!.days ?? 0))[0];

  const money = analysis.graph.nodes.find((n) => n.money)?.money?.amount_text ?? null;

  return {
    title: 'Questions for a lawyer',
    generatedOn: new Date().toISOString().slice(0, 10),
    summary:
      'This is a reading of one document. It lists what the document says, the words each point came from, and the questions worth asking. It is not legal advice and it does not predict any outcome.' +
      (money ? ' The largest amount named in the document is ' + money + '.' : ''),
    questions: questions.slice(0, 5),
    deadline: deadlineNode
      ? deadlineNode.deadline!.days + ' days before ' + deadlineNode.deadline!.gates +
        ' (' + clauseLabel(deadlineNode) + ')'
      : null,
    carry: [
      'The original signed document, and any annexures it refers to',
      'Any offer letter, appointment letter or amendment you also received',
      'Dated emails or messages about the terms in question',
      'Your joining date, and the date of anything you have already been asked to sign',
    ],
    coverageNote:
      'We traced ' +
      analysis.coverage.rendered +
      ' of ' +
      analysis.coverage.extracted +
      ' obligations back to words in the document. ' +
      (analysis.coverage.extracted - analysis.coverage.rendered) +
      ' could not be confirmed and are not included here.',
    disclaimer:
      'Prepared by Anubandh. Anubandh states what a document says and what a statute provides. It does not advise on your situation, represent you, or predict what a court would do. Practising law in India is reserved to enrolled advocates under the Advocates Act, 1961.',
  };
}
