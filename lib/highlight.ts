/**
 * Canonical text + spans -> a flat list of segments, ready to render as React
 * nodes.
 *
 * Never innerHTML. The text being highlighted came out of a file a stranger
 * uploaded, and the spans came out of a language model; injecting either into
 * the DOM as markup is the whole of X6. Returning data and letting React create
 * the nodes means the document's own text can never become markup, whatever it
 * contains.
 *
 * Spans OVERLAP in practice. In the reference fixture the condition node quotes
 * "required to relocate to any Company office" while the obligation node quotes
 * "may be required to relocate to any Company office", and the edge that links
 * the bond condition to the bond amount quotes exactly the same words as the
 * amount node. Naive slicing either double-renders that text or loses it.
 *
 * So: sweep every boundary, emit each character exactly once, and let a segment
 * carry the SET of spans covering it.
 *
 * INVARIANT, asserted in CI: segments.map(s => s.text).join('') === text.
 * Text is never lost and never duplicated, whatever the spans do.
 */

export type Span = {
  /** Node (or edge) this span belongs to. Several may cover one segment. */
  id: string;
  start: number;
  end: number;
};

export type Segment = {
  text: string;
  start: number;
  end: number;
  /** Every span covering this segment, in the order the spans were given. */
  ids: string[];
};

export function segment(text: string, spans: Span[]): Segment[] {
  // Clamp to the text and drop anything empty or inverted. A span that points
  // outside the document is a bug upstream, but it must not be able to crash
  // the one view whose job is to show the user we did not make the text up.
  const clean = spans
    .map((s) => ({ id: s.id, start: Math.max(0, Math.min(s.start, text.length)), end: Math.max(0, Math.min(s.end, text.length)) }))
    .filter((s) => s.end > s.start);

  if (clean.length === 0) {
    return text.length ? [{ text, start: 0, end: text.length, ids: [] }] : [];
  }

  const cuts = new Set<number>([0, text.length]);
  for (const s of clean) {
    cuts.add(s.start);
    cuts.add(s.end);
  }
  const points = [...cuts].sort((a, b) => a - b);

  const out: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    if (end <= start) continue;
    const ids = clean.filter((s) => s.start <= start && s.end >= end).map((s) => s.id);

    // Merge with the previous segment when the covering set is identical, so a
    // paragraph with no spans is one text node rather than one per boundary.
    const prev = out[out.length - 1];
    if (prev && sameIds(prev.ids, ids)) {
      prev.text += text.slice(start, end);
      prev.end = end;
    } else {
      out.push({ text: text.slice(start, end), start, end, ids });
    }
  }
  return out;
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
