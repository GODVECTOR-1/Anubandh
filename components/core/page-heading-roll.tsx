'use client';

import { TextRoll } from '@/components/core/text-roll';

/**
 * The roll used by the five in-app page headings (Risk Radar, Plain Language,
 * Timeline, Ask, Prepare).
 *
 * A component rather than a shared props object, and that is not a style
 * preference. getEnterDelay and getExitDelay are functions, and three of those
 * five headings live in server components; spreading a preset containing
 * functions across that boundary throws "Functions cannot be passed directly to
 * Client Components" and takes the whole route down with it. Keeping the preset
 * inside a client component means the server side only ever passes a string.
 *
 * It also states the motion once. Five headings each carrying their own copy of
 * the same six props is how they end up subtly different.
 *
 * Distinct from the landing sections on purpose: those headings turn over in 3D,
 * these slide vertically. Two surfaces, two idioms, each used consistently.
 */
export function PageHeadingRoll({ children }: { children: string }) {
  return (
    <TextRoll
      variants={{
        enter: { initial: { y: 0 }, animate: { y: 40 } },
        exit: { initial: { y: -40 }, animate: { y: 0 } },
      }}
      duration={0.3}
      getEnterDelay={(i) => i * 0.05}
      getExitDelay={(i) => i * 0.05 + 0.05}
      transition={{ ease: [0.175, 0.885, 0.32, 1.1] }}
      // Not optional for this variant: it moves each character 40px, which is
      // far enough to carry it out of the line and over the subtitle beneath.
      clip
    >
      {children}
    </TextRoll>
  );
}
