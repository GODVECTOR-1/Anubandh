'use client';

import { Fragment, useRef } from 'react';
import {
  motion,
  useInView,
  useReducedMotion,
  type TargetAndTransition,
  type Transition,
} from 'motion/react';
import { cn } from '@/lib/cn';
import { graphemes, words } from '@/components/core/split-text';

/**
 * TextRoll, on the Motion-Primitives API.
 *
 * Each character is stacked twice inside a perspective box: one copy rolls away
 * as the other rolls in, staggered along the string, so the line reads as a
 * split-flap board turning over. The upstream aria-hidden plus a visually
 * hidden copy of the whole string is kept — that is what stops a screen reader
 * spelling the heading out one letter at a time.
 *
 * Four things are different from the copy-paste version, and each is a bug that
 * version would have shipped here:
 *
 *   in view     it animates when scrolled to, not on mount. The heading this is
 *               used on sits below the fold, so an on-mount roll finishes
 *               before anyone can see it and the effect is simply absent.
 *   graphemes   the string is split by grapheme cluster, not by code point.
 *               The Hindi copy is Devanagari, where splitting by code point
 *               tears matras off their consonants: वही becomes व, ह, ी and
 *               renders as broken glyphs.
 *   words       characters are grouped into words. Every character is an
 *               inline-block, so without grouping a line can break between any
 *               two of them and the heading wraps mid-word on a phone.
 *   reduced     prefers-reduced-motion renders the plain string, with none of
 *               the machinery. A heading that flips itself over is exactly the
 *               motion that setting is asking us not to run.
 *
 * The second copy of each character is left in normal flow and the first is
 * absolutely positioned over it. Something has to establish the box: if both
 * are absolute, every character measures zero wide and the heading collapses.
 */

export type TextRollProps = {
  children: string;
  duration?: number;
  getEnterDelay?: (index: number) => number;
  getExitDelay?: (index: number) => number;
  className?: string;
  transition?: Transition;
  // TargetAndTransition, not Variants['initial'] as upstream types it. That
  // resolves to Variant, which also admits a TargetResolver function, and a
  // function is not valid in the initial/animate position — the library's own
  // type does not compile against its own props under strict mode.
  variants?: {
    enter: { initial: TargetAndTransition; animate: TargetAndTransition };
    exit: { initial: TargetAndTransition; animate: TargetAndTransition };
  };
  onAnimationComplete?: () => void;
  /**
   * Clip each character to its own box.
   *
   * Required by any variant that TRANSLATES rather than rotates: a y offset
   * of 40px carries the character clean out of the line and over whatever is
   * above or below it. Clipping per character rather than on the whole
   * heading is what makes it read as a roll — each glyph turning over in its
   * own little window.
   *
   * Off by default because it flattens the 3D context, which the rotateX
   * variant needs.
   */
  clip?: boolean;
};

const DEFAULT_VARIANTS: NonNullable<TextRollProps['variants']> = {
  enter: { initial: { rotateX: 0 }, animate: { rotateX: 90 } },
  exit: { initial: { rotateX: 90 }, animate: { rotateX: 0 } },
};

export function TextRoll({
  children,
  duration = 0.5,
  getEnterDelay = (i) => i * 0.1,
  getExitDelay = (i) => i * 0.1 + 0.2,
  className,
  transition = { ease: 'easeIn' },
  variants,
  onAnimationComplete,
  clip = false,
}: TextRollProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  // once: true — a heading that re-flips every time it scrolls back past is a
  // distraction, not a flourish.
  const inView = useInView(ref, { once: true, margin: '-12% 0px -12% 0px' });

  if (reduce) return <span className={className}>{children}</span>;

  const enter = variants?.enter ?? DEFAULT_VARIANTS.enter;
  const exit = variants?.exit ?? DEFAULT_VARIANTS.exit;

  const parts = words(children);
  const total = graphemes(children).length;
  let index = 0;

  return (
    <span ref={ref} className={className}>
      {parts.map((word, wordIndex) => (
        <Fragment key={wordIndex}>
          {/* nowrap inside a word, a real breakable space between words. */}
          <span className="inline-block whitespace-nowrap">
            {graphemes(word).map((char, charIndex) => {
              const i = index++;
              return (
                <span
                  key={charIndex}
                  aria-hidden="true"
                  className={cn(
                    'relative inline-block',
                    clip ? 'overflow-clip' : '[perspective:10000px] [transform-style:preserve-3d]',
                  )}
                >
                  <motion.span
                    className={cn(
                      'absolute left-0 top-0 inline-block [backface-visibility:hidden] [transform-origin:50%_25%]',
                    )}
                    initial={enter.initial}
                    animate={inView ? enter.animate : enter.initial}
                    transition={{ ...transition, duration, delay: getEnterDelay(i) }}
                  >
                    {char}
                  </motion.span>
                  {/* In flow: this copy is what gives the character its width. */}
                  <motion.span
                    className="inline-block [backface-visibility:hidden] [transform-origin:50%_100%]"
                    initial={exit.initial}
                    animate={inView ? exit.animate : exit.initial}
                    transition={{ ...transition, duration, delay: getExitDelay(i) }}
                    onAnimationComplete={i === total - 1 ? onAnimationComplete : undefined}
                  >
                    {char}
                  </motion.span>
                </span>
              );
            })}
          </span>
          {wordIndex < parts.length - 1 ? ' ' : null}
        </Fragment>
      ))}
      {/* The whole string, once, for anything that reads rather than looks. */}
      <span className="sr-only">{children}</span>
    </span>
  );
}
