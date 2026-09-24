/**
 * Limits the browser and the server both enforce, defined once. Two copies of
 * a limit is how they drift apart: the paste box let 40 characters through to
 * a server that wanted 200, and a genuine clause came back as "no parties, no
 * obligations, no terms".
 *
 * No 'server-only' here on purpose. Intake imports this.
 */

/** Decided BEFORE any extraction spend. Rejecting a large file after paying
 *  for a model call is the expensive way to say no. */
export const MAX_BYTES = 10 * 1024 * 1024;

/** Below this there is not enough text to find the shape of an agreement. */
export const MIN_TEXT_CHARS = 200;

/** Counted the way the minimum means it: whitespace is not text. */
export const textChars = (s: string) => s.replace(/\s/g, '').length;
