import 'server-only';
import { createHash } from 'node:crypto';
import type { DocumentPayload } from '@/contracts/schema';
import { PipelineError } from '@/lib/pipeline-error';
import { MAX_BYTES, MIN_TEXT_CHARS, textChars } from '@/lib/limits';

/**
 * Stage 1, NORMALIZE. Bytes in, one canonical text out, plus a route back to
 * the page the reader is holding.
 *
 * Everything downstream cites into this text, so the map is the product: the
 * split view highlights char offsets in `normalized_text`, and "you can check
 * it yourself" is unfalsifiable without a way back to the original. The map is
 * built here because this is the only point where both coordinate systems
 * exist at once.
 */

/** 40 pages, decided before any extraction spend, like MAX_BYTES. Intake
 *  states both limits to the reader up front. */
export const MAX_PAGES = 40;

export type Normalized = {
  text: string;
  sourceKind: DocumentPayload['source_kind'];
  pageCount: number | null;
  pageOffsets: DocumentPayload['page_offsets'];
  offsetMap: DocumentPayload['offset_map'];
  sha256: string;
};

/* ───────────────────────── character normalisation ───────────────────────── */

const UNICODE_SPACE = /[   -   　]/;
const ZERO_WIDTH = /[​-‍⁠﻿]/;

/** Straight quotes and hyphens only. PDF extraction emits typographic forms and
 *  a language model almost always returns ASCII, so folding them here is what
 *  lets a quote match at all. Every substitution is one char for one char, so
 *  no offset moves and nothing has to be recorded for it. */
const FOLD: Record<string, string> = {
  '‘': "'", '’': "'", '‚': "'", '‛': "'",
  '“': '"', '”': '"', '„': '"', '‟': '"',
  '‐': '-', '‑': '-', '‒': '-', '–': '-', '—': '-', '−': '-',
  '\t': ' ',
};

/**
 * One pass, emitting an offset anchor every time raw and normalized stop moving
 * in step. A dense per-character map would be larger than the document; a
 * single anchor at zero (which is all the fixture needed) is a lie the moment
 * anything is dropped. Anchors at the divergences are both small and exact.
 */
export function normalizeText(raw: string): { text: string; offsetMap: DocumentPayload['offset_map'] } {
  let out = '';
  const offsetMap: DocumentPayload['offset_map'] = [{ raw: 0, normalized: 0 }];
  let delta = 0;

  const mark = (rawIndex: number) => {
    const d = rawIndex - out.length;
    if (d === delta) return;
    delta = d;
    offsetMap.push({ raw: rawIndex, normalized: out.length });
  };

  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];

    // Line endings, and at most one blank line between blocks.
    if (ch === '\r' || ch === '\n') {
      let breaks = 0;
      while (i < raw.length && (raw[i] === '\r' || raw[i] === '\n')) {
        if (raw[i] === '\r' && raw[i + 1] === '\n') i++;
        i++;
        breaks++;
      }
      out += '\n'.repeat(Math.min(breaks, 2));
      mark(i);
      continue;
    }

    if (ZERO_WIDTH.test(ch)) {
      i++;
      mark(i);
      continue;
    }

    // Runs of horizontal space collapse to one, and vanish entirely before a
    // line break. Ragged wrapping from a PDF is a layout artefact, not content.
    if (ch === ' ' || ch === '\t' || UNICODE_SPACE.test(ch)) {
      let j = i;
      while (j < raw.length && (raw[j] === ' ' || raw[j] === '\t' || UNICODE_SPACE.test(raw[j]))) j++;
      const atBreak = j >= raw.length || raw[j] === '\n' || raw[j] === '\r';
      if (!atBreak) out += ' ';
      i = j;
      mark(i);
      continue;
    }

    out += FOLD[ch] ?? ch;
    i++;
  }

  return { text: out.trim(), offsetMap };
}

/* ─────────────────────────────── extraction ─────────────────────────────── */

const isPdf = (b: Uint8Array) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b;

/** Sniffed from the bytes, not from the filename. A .txt that is really a PDF
 *  should be read as a PDF, and an extension is a claim the uploader makes. */
async function pages(bytes: Uint8Array, filename: string, mime: string): Promise<{ pages: string[]; kind: DocumentPayload['source_kind'] }> {
  if (isPdf(bytes)) {
    const { extractText, getDocumentProxy } = await import('unpdf');
    let doc;
    try {
      doc = await getDocumentProxy(bytes);
    } catch (e) {
      // pdf.js reports a password prompt as an exception rather than a result.
      // We would rather not ask the reader for a password, so this is terminal.
      const name = (e as { name?: string })?.name ?? '';
      if (/Password/i.test(name) || /password/i.test(String((e as Error)?.message)))
        throw new PipelineError('encrypted_document');
      throw new PipelineError('internal', 'pdf open failed: ' + String((e as Error)?.message));
    }
    if (doc.numPages > MAX_PAGES) throw new PipelineError('oversize_document');
    const { text } = await extractText(doc, { mergePages: false });
    return { pages: text, kind: 'pdf' };
  }

  if (isZip(bytes) || /\.docx$/i.test(filename)) {
    const mammoth = (await import('mammoth')).default ?? (await import('mammoth'));
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    // DOCX has no pagination — that is a Word rendering property, not a
    // property of the file. The contract carries null here for exactly this.
    return { pages: [value], kind: 'docx' };
  }

  if (/^image\//.test(mime)) {
    // An image has no text layer at all. Transcription is a model call, which
    // belongs to EXTRACT, and a transcript is not a document the reader can
    // check a quote against — so OCR is refused here rather than half-done.
    throw new PipelineError('ocr_quality');
  }

  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  // A binary that is not a PDF or a DOCX decodes to replacement characters.
  // Extracting obligations from mojibake is the confident-wrong failure.
  const junk = (text.match(/�/g) ?? []).length;
  if (junk > text.length / 100) throw new PipelineError('not_legal_document');
  return { pages: [text], kind: 'paste' };
}

export async function normalizeUpload(
  bytes: Uint8Array,
  filename: string,
  mime: string,
): Promise<Normalized> {
  if (bytes.byteLength > MAX_BYTES) throw new PipelineError('oversize_document');
  if (bytes.byteLength === 0) throw new PipelineError('not_legal_document');

  const { pages: raw, kind } = await pages(bytes, filename, mime);

  // Pages are joined with a blank line and their boundaries recorded, so a
  // clause straddling a page break is still one span with a real page_end.
  const joiner = '\n\n';
  let joined = '';
  const rawPageStarts: number[] = [];
  raw.forEach((p, i) => {
    rawPageStarts.push(joined.length);
    joined += (i > 0 ? joiner : '') + p;
  });

  const { text, offsetMap } = normalizeText(joined);

  const toNormalized = mapper(offsetMap, text.length);
  const pageOffsets = rawPageStarts.map((start, i) => ({
    page: i + 1,
    start: toNormalized(start),
    end: i + 1 < rawPageStarts.length ? toNormalized(rawPageStarts[i + 1]) : text.length,
  }));

  if (textChars(text) < MIN_TEXT_CHARS) throw new PipelineError('not_legal_document');

  return {
    text,
    sourceKind: kind,
    pageCount: kind === 'docx' ? null : raw.length,
    pageOffsets,
    offsetMap,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

/**
 * Raw offset to normalized offset, by the nearest anchor at or before it.
 *
 * Between two anchors the mapping is 1:1 and a linear step is exact. AT an
 * anchor it is not: an anchor is recorded precisely where the two texts stopped
 * moving in step, so the span it opens may have SHRUNK — four CRLFs collapsing
 * to one blank line, or a run of spaces to a single space. Stepping linearly
 * across one of those overshoots, and it overshoots by the whole amount that
 * was removed.
 *
 * That was not theoretical. A PDF page break is joined with a blank line and
 * pages routinely end in trailing whitespace, so `rawPageStarts[i]` usually
 * lands just after a collapsed run — which pushed the page boundary later than
 * it belongs and cited a clause near the break to the wrong page. "p.3 ·
 * Verified" against page 2 is worse than no page at all, because it is
 * checkable and wrong.
 *
 * The next anchor is the ceiling: everything between two anchors maps into the
 * normalized range they bracket, so clamping there is exact rather than a
 * guard. Found by the monotonicity property in tests/normalize.test.ts.
 */
export function mapper(offsetMap: DocumentPayload['offset_map'], max: number) {
  return (rawIndex: number): number => {
    let lo = 0;
    let hi = offsetMap.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (offsetMap[mid].raw <= rawIndex) lo = mid;
      else hi = mid - 1;
    }
    const a = offsetMap[lo];
    const next = offsetMap[lo + 1];
    const ceiling = next ? next.normalized : max;
    return Math.max(0, Math.min(max, ceiling, a.normalized + (rawIndex - a.raw)));
  };
}

/** Which page a normalized offset falls on. Null when the source had no pages
 *  to begin with, never a guessed 1. */
export function pageAt(pageOffsets: DocumentPayload['page_offsets'], at: number): number | null {
  for (const p of pageOffsets) if (at >= p.start && at < p.end) return p.page;
  return pageOffsets.length ? pageOffsets[pageOffsets.length - 1].page : null;
}

/** Paragraph index — the DOCX fallback when there is no page to cite. */
export const paragraphAt = (text: string, at: number): number =>
  (text.slice(0, at).match(/\n\n/g) ?? []).length;
