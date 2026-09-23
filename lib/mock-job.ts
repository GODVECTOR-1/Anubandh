import type { ErrorCode, Job, JobStage } from '@/contracts/schema';

/**
 * The MOCK pipeline. This is what `MOCK=1` replays, and what the intake screen
 * is built against until Antigravity's routes exist.
 *
 * It emits real `Job` payloads on the real stage vocabulary, so swapping it for
 * polling `/api/jobs/:id` changes the transport and nothing else. Every failure
 * path the plan names is reachable here, because a screen that has only ever
 * been seen on its happy path is a screen nobody has seen.
 */

export type Scenario =
  | 'success'
  | 'no_flags'
  | 'low_coverage'
  | 'not_legal'
  | 'oversize'
  | 'encrypted'
  | 'refusal'
  | 'rate_limited'
  | 'timed_out'
  | 'truncated';

/**
 * Four user-visible stages, not the seven engineering ones. Stages of wildly
 * uneven length read as broken, and counts do not exist until extraction
 * returns — so each stage holds for at least its dwell before moving on.
 */
export const STAGE_ORDER: JobStage[] = ['reading', 'extracting', 'verifying', 'checking_law'];

export const STAGE_COPY: Record<JobStage, { label: string; detail: string }> = {
  reading: { label: 'Reading your document', detail: 'Rebuilding it as text we can point at' },
  extracting: { label: 'Finding obligations', detail: 'Pulling out what the document asks of you' },
  verifying: { label: 'Verifying every quote', detail: 'Checking each phrase really appears in your file' },
  checking_law: { label: 'Checking against law', detail: 'Only where a section actually applies' },
};

/** Every error the plan names, with the words the reader actually sees. */
export const ERROR_COPY: Record<
  ErrorCode,
  { title: string; body: string; action: 'retry' | 'reupload' | 'wait' | 'override' | 'none' }
> = {
  response_truncated: {
    title: 'This document was too dense to read in one pass',
    body: 'We tried again in sections and still could not read it reliably. Try re-uploading, or paste the text instead.',
    action: 'retry',
  },
  oversize_document: {
    title: 'This file is larger than we can read',
    body: 'We cap uploads at 40 pages and 10 MB so an analysis finishes while you are still waiting. Try the pages that matter.',
    action: 'reupload',
  },
  encrypted_document: {
    title: 'This PDF is password-protected',
    body: 'We cannot open it without the password, and we would rather not ask you for one. Remove the password and re-upload, or paste the text.',
    action: 'reupload',
  },
  not_legal_document: {
    title: 'This does not look like a legal document',
    body: 'We could not find the shape of an agreement in it: no parties, no obligations, no terms.',
    action: 'override',
  },
  model_refusal: {
    title: 'The model declined to process this document',
    body: 'That is unusual and we are showing you that it happened rather than an empty result. If the document contains something sensitive, that may be why.',
    action: 'retry',
  },
  rate_limited: {
    title: 'You have hit the limit for now',
    body: 'We cap how many documents each person can run per hour so the service stays up for everyone. Try again in about 12 minutes.',
    action: 'wait',
  },
  upstream_timeout: {
    title: 'This is taking longer than it should',
    body: 'We stopped at 90 seconds so you are not left waiting on a screen that may never finish.',
    action: 'retry',
  },
  ocr_quality: {
    title: 'We cannot read this photo clearly enough',
    body: 'Parts of the text are too blurred to quote back to you, and a quote we cannot verify is worse than none.',
    action: 'reupload',
  },
  schema_validation: {
    title: 'We could not read the result reliably',
    body: 'The analysis came back in a shape we do not trust, so we are not showing it to you as fact.',
    action: 'retry',
  },
  span_not_found: {
    title: 'We could not tie the analysis back to your document',
    body: 'Too little of what we found could be located in your own text to be worth showing.',
    action: 'retry',
  },
  ambiguous_span: {
    title: 'Too much of this document repeats itself',
    body: 'We could not tell which clause each finding came from, and a citation pointing at the wrong clause is worse than no citation.',
    action: 'retry',
  },
  citation_unresolved: {
    title: 'We could not confirm the law we were about to cite',
    body: 'Rather than cite a section we have not verified, we stopped.',
    action: 'retry',
  },
  applicability_unknown: {
    title: 'We need to know which State this applies in',
    body: 'Some of what we found depends on State law, and we will not guess which one governs you.',
    action: 'retry',
  },
  internal: {
    title: 'Something broke on our side',
    // It used to say "Nothing has been kept", which was only true when the
    // upload itself failed. When anything after it failed, the document had
    // already been stored — and the screen told the reader otherwise. The
    // purge makes this sentence true on every path, so it is the one we can
    // actually promise.
    body: 'This is our fault, not your document. Anything you sent is deleted within 24 hours.',
    action: 'retry',
  },
};

export type JobUpdate = Job & { message?: string };

