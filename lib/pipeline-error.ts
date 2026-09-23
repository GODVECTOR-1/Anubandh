import type { ErrorCode } from '@/contracts/schema';

/**
 * A failure the reader is entitled to see, carrying one of the contract's own
 * error codes. Anything thrown that is NOT one of these is a bug on our side
 * and becomes `internal` — the distinction matters because every code here has
 * user-facing copy and a recovery action in lib/mock-job.ts, and `internal` is
 * the only one that says "this is our fault, not your document".
 */
export class PipelineError extends Error {
  constructor(readonly code: ErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'PipelineError';
  }
}

export const codeOf = (e: unknown): ErrorCode =>
  e instanceof PipelineError ? e.code : 'internal';
