import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { normalizeUpload, MAX_PAGES } from '@/lib/normalize';
import { MAX_BYTES } from '@/lib/limits';
import { codeOf } from '@/lib/pipeline-error';
import { serializeSessionCookie, newSessionId } from '@/lib/session';

/**
 * The file paths a reader actually takes. The pure text functions are covered
 * in normalize.test.ts; these go through normalizeUpload the way the upload
 * route does, with real PDFs built in memory.
 */

const CLAUSE =
  'The Employee shall give ninety days written notice before resigning, and shall pay the Company the sum stated in clause 9.2.';

async function pdf(pageCount: number, text = CLAUSE): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([595, 842]);
    // Two lines, so each page carries enough text to count as a document.
    page.drawText(text.slice(0, 60), { x: 40, y: 780, size: 10, font });
    page.drawText(text.slice(60), { x: 40, y: 764, size: 10, font });
  }
  return doc.save();
}

const failsWith = (code: string) => (e: unknown) => codeOf(e) === code;

test('a text PDF is read page by page, and every page is mapped', async () => {
  const out = await normalizeUpload(await pdf(2), 'offer.pdf', 'application/pdf');
  assert.equal(out.sourceKind, 'pdf');
  assert.equal(out.pageCount, 2);
  assert.equal(out.pageOffsets.length, 2);
  assert.match(out.text, /ninety days written notice/);
  assert.ok(out.pageOffsets[1].start >= out.pageOffsets[0].end, 'pages overlap in the offset map');
});

test('a PDF is recognised by its bytes, whatever the filename claims', async () => {
  const out = await normalizeUpload(await pdf(2), 'notes.txt', 'text/plain');
  assert.equal(out.sourceKind, 'pdf');
});

test('a PDF over the page limit is refused before any extraction spend', async () => {
  await assert.rejects(normalizeUpload(await pdf(MAX_PAGES + 1), 'long.pdf', 'application/pdf'), failsWith('oversize_document'));
});

test('a corrupt PDF is an internal failure, not a password prompt', async () => {
  const bytes = new TextEncoder().encode('%PDF-1.7\n' + 'not really a pdf '.repeat(40));
  await assert.rejects(normalizeUpload(bytes, 'broken.pdf', 'application/pdf'), failsWith('internal'));
});

test('a photo is refused as unreadable rather than half transcribed', async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(64).fill(0)]);
  await assert.rejects(normalizeUpload(png, 'scan.png', 'image/png'), failsWith('ocr_quality'));
});

test('a file over the size cap is refused before it is parsed', async () => {
  await assert.rejects(normalizeUpload(new Uint8Array(MAX_BYTES + 1), 'big.pdf', 'application/pdf'), failsWith('oversize_document'));
});

test('production refuses to sign sessions without a real secret', () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = { node: env.NODE_ENV, secret: env.SESSION_SECRET };
  try {
    env.NODE_ENV = 'production';
    delete env.SESSION_SECRET;
    assert.throws(() => serializeSessionCookie(newSessionId()), /SESSION_SECRET is required/);
    env.SESSION_SECRET = 'too-short';
    assert.throws(() => serializeSessionCookie(newSessionId()), /SESSION_SECRET is required/);
    env.SESSION_SECRET = 'x'.repeat(32);
    assert.match(serializeSessionCookie(newSessionId()), /^[0-9a-f-]{36}\.[0-9a-f]{64}$/);
  } finally {
    env.NODE_ENV = saved.node;
    if (saved.secret === undefined) delete env.SESSION_SECRET;
    else env.SESSION_SECRET = saved.secret;
  }
});
