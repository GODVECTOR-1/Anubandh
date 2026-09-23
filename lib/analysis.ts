import 'server-only';
import { cache } from 'react';
import type { AnalysisPayload } from '@/contracts/schema';
import { getAnalysisRow, latestAnalysis } from '@/lib/db';
import { readSession } from '@/lib/session';

/**
 * The seam. Every screen used to import the fixture directly; now they ask
 * here, and the rendered contract is unchanged — `RiskRadar`, `SplitView`,
 * `Scrubber`, `Ask` and `Prepare` all still take `analysis: AnalysisPayload`.
 *
 * `cache` so that one render asking twice is one query. Two pages of the same
 * request seeing two different analyses would be a very quiet bug.
 */

/** Loads a stored analysis the caller owns, or null. Null means 404 to the
 *  caller — never 403. A wrong-owner read and a nonexistent id are the same
 *  answer, because a 403 confirms the id exists and turns it into an oracle. */
export const getAnalysis = cache(async (documentId: string): Promise<AnalysisPayload | null> => {
  const session = await readSession();
  return guard(() => getAnalysisRow(session, documentId));
});

/** The document the reader is currently looking at, from the session. */
export const getCurrentAnalysis = cache(async (): Promise<AnalysisPayload | null> => {
  const session = await readSession();
  return guard(() => latestAnalysis(session));
});

/**
 * A database that is down renders the empty state, never an error page. The
 * reader's document is not recoverable either way, and a stack trace on the
 * radar is a worse answer than "nothing here yet".
 *
 * The failure is logged without the id, the filename or any document text:
 * §7.12 is a requirement, and a log line naming a document is the same leak as
 * a response body naming one.
 */
async function guard(fn: () => Promise<AnalysisPayload | null>): Promise<AnalysisPayload | null> {
  try {
    return await fn();
  } catch {
    console.error('analysis load failed');
    return null;
  }
}
