import type { AnalysisPayload, ErrorCode, JobStage } from '@/contracts/schema';
import { priyaOfferLetter } from '@/fixtures/priya-offer-letter';
import type { Scenario } from '@/lib/mock-job';

/**
 * The one-click samples, and every failure the UI must be able to draw.
 *
 * These run through the REAL transport: a real document row, a real job, the
 * real ownership check, the real lazy transitions. Only the analysis is
 * pre-baked. A sample that took a different code path would be a demo of code
 * nobody ships, and the failure screens in particular are the ones least likely
 * to be looked at before a user finds them.
 *
 * It is also how §9.4 holds — every `ErrorCode` stays reachable and renders its
 * own copy from `ERROR_COPY` with its own recovery action.
 */

/** Per-stage dwell, matching lib/mock-job.ts. Stages of wildly uneven length
 *  read as broken, so a demo job's stage is a function of elapsed time rather
 *  than of work actually done. */
const DWELL: Record<JobStage, number> = {
  reading: 1400,
  extracting: 2600,
  verifying: 2400,
  checking_law: 1600,
};

export const STAGES: JobStage[] = ['reading', 'extracting', 'verifying', 'checking_law'];
export const TOTAL_DWELL = STAGES.reduce((a, s) => a + DWELL[s], 0);

/** Which stage a demo job is in after `elapsed` ms, and whether it is finished. */
export function pace(elapsed: number): { stage: JobStage; done: boolean } {
  let t = 0;
  for (const stage of STAGES) {
    t += DWELL[stage];
    if (elapsed < t) return { stage, done: false };
  }
  return { stage: 'checking_law', done: true };
}

/** Failures that are known before any extraction spend fail early; the rest
 *  fail where they would really have failed. */
const FAILURES: Partial<Record<Scenario, { code: ErrorCode; at: number }>> = {
  oversize: { code: 'oversize_document', at: 600 },
  encrypted: { code: 'encrypted_document', at: 600 },
  rate_limited: { code: 'rate_limited', at: 400 },
  not_legal: { code: 'not_legal_document', at: 1400 },
  refusal: { code: 'model_refusal', at: 2400 },
  truncated: { code: 'response_truncated', at: 2900 },
};

/**
 * A HANG, not an error. `timed_out` is deliberately absent from the table
 * above: this scenario never finishes and never fails on its own, exactly like
 * a real upstream that has stopped answering. What ends it is `deadline_at`,
 * transitioned lazily on the job GET — so the demo exercises the real mechanism
 * rather than a branch written to imitate it.
 */
export const HANGS = new Set<Scenario>(['timed_out']);
export const HANG_TTL_MS = TOTAL_DWELL + 1200;

export const failureFor = (s: Scenario) => FAILURES[s] ?? null;

export const isScenario = (s: string): s is Scenario =>
  ['success', 'no_flags', 'low_coverage', 'not_legal', 'oversize', 'encrypted',
   'refusal', 'rate_limited', 'timed_out', 'truncated'].includes(s);

/**
 * The analysis a successful sample lands on, rebound to this session's ids so
 * nothing in the payload points at a document the reader does not own.
 */
export function demoAnalysis(
  scenario: Scenario,
  documentId: string,
  jobId: string,
  deadlineAt: string,
): AnalysisPayload | null {
  if (FAILURES[scenario]) return null;

  const base = priyaOfferLetter;
  const payload: AnalysisPayload = {
    ...base,
    document: { ...base.document, id: documentId },
    job: { ...base.job, id: jobId, document_id: documentId, deadline_at: deadlineAt },
  };

  // An empty radar is a real result, not a broken screen, and it is the only
  // way to see the "nothing unusual here" state before a user does.
  if (scenario === 'no_flags') return { ...payload, flags: [] };

  // A photographed letter: most of it located, the rest counted and shown
  // struck through. The invariant still has to balance, so the numbers here are
  // derived from one another rather than typed in.
  if (scenario === 'low_coverage') {
    const extracted = base.coverage.extracted;
    const located = 26;
    const entailFailed = 1;
    const spanNotFound = 11;
    const ambiguous = extracted - located - spanNotFound;
    return {
      ...payload,
      document: { ...payload.document, source_kind: 'ocr' },
      coverage: {
        ...base.coverage,
        located,
        verified: located,
        entailed: located - entailFailed,
        rendered: located - entailFailed,
        mode: 'cautionary',
        dropped: { span_not_found: spanNotFound, ambiguous, entail_failed: entailFailed, dangling_edge: 0, render: 0 },
        dropped_nodes: Array.from({ length: spanNotFound + ambiguous + entailFailed }, (_, i) => ({
          reason: (i < spanNotFound ? 'span_not_found' : i < spanNotFound + ambiguous ? 'ambiguous' : 'entail_failed') as
            'span_not_found' | 'ambiguous' | 'entail_failed',
          unvalidated_quote:
            i === 0 ? 'the Employee shall indemnify the Company against all losses' : null,
        })),
      },
    };
  }

  return payload;
}
