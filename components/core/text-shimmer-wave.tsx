'use client';

import type { ElementType } from 'react';
import { motion, useReducedMotion, type Transition } from 'motion/react';
import { cn } from '@/lib/cn';
import { graphemes, words } from '@/components/core/split-text';

/**
 * TextShimmerWave, on the Motion-Primitives API.
 *
 * A light travels along the string while each character lifts, tilts and
 * brightens in turn. Used here for one thing only: the moment between asking a
 * question and getting an answer.
 *
 * Differences from the copy-paste version, each one a bug it would ship here:
 *
 *   reduced     prefers-reduced-motion renders the message as plain text. The
 *               message is the point; the wave is not. A person who has asked
 *               not to be moved still needs to know we are working.
 *   graphemes   split by grapheme cluster, not code point, or the Hindi message
 *               comes apart at its matras. See split-text.ts.
 *   words       characters grouped into words, or this wraps mid-word — and
 *               this string is a full sentence, so it wraps on every phone.
 *   read once   the characters are aria-hidden and the whole string is repeated
 *               in a visually hidden copy. Without that a screen reader spells
 *               a waiting message out one letter at a time, which is the
 *               opposite of reassuring.
 *   no remount  upstream calls motion.create(Component) inside the render body,
 *               which mints a new component type every render and remounts the
 *               whole string. The wrapper does not animate, so it is a plain
 *               element and only the characters are motion.
 *
 * Colours come from the palette by default rather than the library's zinc, and
 * are overridable through --base-color / --base-gradient-color as upstream.
 */

export type TextShimmerWaveProps = {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  zDistance?: number;
  xDistance?: number;
  yDistance?: number;
  spread?: number;
  scaleDistance?: number;
  rotateYDistance?: number;
  transition?: Transition;
};

export function TextShimmerWave({
  children,
  as: Component = 'span',
  className,
  duration = 1,
  zDistance = 10,
  xDistance = 2,
  yDistance = -2,
  spread = 1,
  scaleDistance = 1.1,
  rotateYDistance = 10,
  transition,
}: TextShimmerWaveProps) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <Component className={cn('text-ink-muted', className)}>{children}</Component>;
  }

  const total = graphemes(children).length;
  // Upstream computes this as (length * 0.05) - duration, which goes negative
  // on any string shorter than duration/0.05 characters and hands Motion a
  // negative repeatDelay.
  const repeatDelay = Math.max(0, total * 0.05 - duration);
  let index = 0;

  return (
    <Component
      className={cn(
        'relative inline-block [perspective:500px]',
        '[--base-color:var(--ink-faint)] [--base-gradient-color:var(--ink)]',
        className,
      )}
      style={{ color: 'var(--base-color)' }}
    >
      {words(children).map((word, wordIndex, all) => (
        <span key={wordIndex}>
          <span className="inline-block whitespace-nowrap" aria-hidden="true">
            {graphemes(word).map((char, charIndex) => {
              const delay = (index++ * duration * (1 / spread)) / total;
              return (
                <motion.span
                  key={charIndex}
                  className="inline-block whitespace-pre [transform-style:preserve-3d]"
                  initial={{ translateZ: 0 }}
                  animate={{
                    translateZ: [0, zDistance, 0],
                    translateX: [0, xDistance, 0],
                    translateY: [0, yDistance, 0],
                    scale: [1, scaleDistance, 1],
                    rotateY: [0, rotateYDistance, 0],
                    color: [
                      'var(--base-color)',
                      'var(--base-gradient-color)',
                      'var(--base-color)',
                    ],
                  }}
                  transition={{
                    duration,
                    repeat: Infinity,
                    repeatDelay,
                    delay,
                    ease: 'easeInOut',
                    ...transition,
                  }}
                >
                  {char}
                </motion.span>
              );
            })}
          </span>
          {wordIndex < all.length - 1 ? ' ' : null}
        </span>
      ))}
      <span className="sr-only">{children}</span>
    </Component>
  );
}
