import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { priyaOfferLetter } from '@/fixtures/priya-offer-letter';
import { getAnalysis, getCurrentAnalysis } from '@/lib/analysis';
import { buildPacket } from '@/lib/packet';

/**
 * The Prepare packet, rendered server-side with pdf-lib.
 *
 * Server-side deliberately: a client-side renderer would ship the whole font
 * and layout stack to a phone for a document most readers generate once, and
 * this route has no model call in it at all — every string comes from the
 * analysis that already exists.
 *
 * Styling is the cut item here, never the rendering path. Prepare closes the
 * flow, so a plain but correct PDF sits below the never-cut line.
 */
export const runtime = 'nodejs';

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 56;
const INK = rgb(0.11, 0.1, 0.09);
const MUTED = rgb(0.34, 0.33, 0.31);
const FAINT = rgb(0.55, 0.53, 0.5);

/** Greedy wrap against real glyph widths. Splitting on a character count
 *  overflows the moment a line is mostly capitals. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? line + ' ' + word : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function GET(request: Request) {
  // `?id=` names a document; without one, the document this session is reading.
  // Both go through the same ownership check, so a packet can only ever be
  // generated from an analysis the caller owns. The sample is the last resort,
  // because /prepare is reachable from the landing page with no upload at all.
  const id = new URL(request.url).searchParams.get('id');
  const analysis =
    (id ? await getAnalysis(id) : await getCurrentAnalysis()) ?? priyaOfferLetter;
  const packet = buildPacket(analysis);

  const pdf = await PDFDocument.create();
  pdf.setTitle(packet.title);
  pdf.setCreator('Anubandh');

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  let page: PDFPage = pdf.addPage([A4.w, A4.h]);
  let y = A4.h - MARGIN;
  const width = A4.w - MARGIN * 2;

  const space = (n: number) => {
    y -= n;
    if (y < MARGIN + 40) {
      page = pdf.addPage([A4.w, A4.h]);
      y = A4.h - MARGIN;
    }
  };

  const write = (
    text: string,
    opts: { font?: PDFFont; size?: number; color?: typeof INK; indent?: number; gap?: number } = {},
  ) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? 10;
    const indent = opts.indent ?? 0;
    for (const line of wrap(text, font, size, width - indent)) {
      space(size + 4);
      page.drawText(line, { x: MARGIN + indent, y, size, font, color: opts.color ?? INK });
    }
    if (opts.gap) space(opts.gap);
  };

  write(packet.title, { font: bold, size: 18 });
  space(4);
  write('Prepared ' + packet.generatedOn, { size: 9, color: FAINT, gap: 10 });
  write(packet.summary, { size: 10, color: MUTED, gap: 14 });

  write('Ask these', { font: bold, size: 12, gap: 6 });
  packet.questions.forEach((q, i) => {
    write(i + 1 + '. ' + q.question, { font: bold, size: 10.5 });
    space(2);
    write('Why: ' + q.because, { size: 9.5, color: MUTED, indent: 14 });
    space(2);
    write(q.clause + ' — "' + q.quote + '"', { font: italic, size: 9, color: FAINT, indent: 14, gap: 10 });
  });

  if (packet.deadline) {
    space(6);
    write('The clock', { font: bold, size: 12, gap: 6 });
    write(packet.deadline, { size: 10, color: MUTED, gap: 12 });
  }

  write('What to carry', { font: bold, size: 12, gap: 6 });
  for (const item of packet.carry) {
    write('- ' + item, { size: 10, color: MUTED });
    space(2);
  }
  space(12);

  write(packet.coverageNote, { size: 9, color: FAINT, gap: 8 });
  write(packet.disclaimer, { size: 8.5, color: FAINT });

  const bytes = await pdf.save();

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="anubandh-questions-for-a-lawyer.pdf"',
      'Cache-Control': 'no-store',
    },
  });
}
