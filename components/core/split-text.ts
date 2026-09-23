/**
 * Splitting a string into what a reader would call a character.
 *
 * Shared by every per-character animation here, because getting it wrong is
 * silent and specific to the Hindi build: Array.from and String.prototype.split
 * both break on code points, which tears matras and viramas off the consonant
 * they belong to. वही comes apart into व, ह, ी and renders as broken glyphs, and
 * nobody reading the English page ever sees it.
 */

type SegmenterCtor = new (
  locales?: string | string[],
  options?: { granularity?: 'grapheme' | 'word' | 'sentence' },
) => { segment: (input: string) => Iterable<{ segment: string }> };

export function graphemes(value: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
  if (!Segmenter) return Array.from(value);
  return Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(value), (s) => s.segment);
}

/**
 * Words, so a line can only break between them.
 *
 * Every animated character is an inline-block, and without this a line is free
 * to break between any two of them — headings and status lines wrap mid-word on
 * a phone.
 */
export function words(value: string): string[] {
  return value.split(' ');
}
