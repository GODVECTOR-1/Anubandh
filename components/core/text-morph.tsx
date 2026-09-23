'use client';

import { useId, useMemo, type CSSProperties, type ElementType } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Transition, type Variants } from 'motion/react';
import { cn } from '@/lib/cn';
import { graphemes } from '@/components/core/split-text';

/**
 * TextMorph, on the Motion-Primitives API.
 *
 * When the string changes, characters that appear in both strings slide to their
 * new positions rather than the whole line swapping out. Shared layoutIds do the
 * work: a character keeps its identity across the change, so "Reading your
 * document" turning into "Finding obligations" reads as the words rearranging.
 *
 * Differences from the copy-paste version:
 *
 *   graphemes   split by grapheme cluster, not code point, or the Hindi strings
 *               come apart at their matras. See split-text.ts.
 *   reduced     prefers-reduced-motion renders the plain string. Text sliding
 *               around underneath someone reading it is exactly the motion that
 *               setting exists to stop, and this particular line is a status
 *               message they are trying to read.
 *
 * The accessible copy is a visually hidden span, NOT upstream's aria-label.
 * Upstream puts aria-label on the wrapper, which is a plain span with no role,
 * and aria-label is not exposed on a generic element — so with every character
 * aria-hidden, the line has no accessible name at all. Dropped into a heading
 * that produces an empty heading, and because this is a transient state axe
 * never visits, nothing catches it.
 */

export type TextMorphProps = {
  children: string;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  variants?: Variants;
  transition?: Transition;
};

const DEFAULT_VARIANTS: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const DEFAULT_TRANSITION: Transition = {
  type: 'spring',
  stiffness: 280,
  damping: 18,
  mass: 0.3,
};

export function TextMorph({
  children,
  as: Component = 'span',
  className,
  style,
  variants,
  transition,
}: TextMorphProps) {
  const uniqueId = useId();
  const reduce = useReducedMotion();

  const characters = useMemo(() => {
    const counts: Record<string, number> = {};
    return graphemes(children).map((char) => {
      // Identity is "the nth occurrence of this character", which is what lets
      // a shared character keep its element across a change of string.
      const key = char.toLowerCase();
      counts[key] = (counts[key] ?? 0) + 1;
      return {
        id: uniqueId + '-' + key + counts[key],
        label: char === ' ' ? ' ' : char,
      };
    });
  }, [children, uniqueId]);

  if (reduce) {
    return (
      <Component className={className} style={style}>
        {children}
      </Component>
    );
  }

  return (
    <Component className={cn('inline-block', className)} style={style}>
      <AnimatePresence mode="popLayout" initial={false}>
        {characters.map((character) => (
          <motion.span
            key={character.id}
            layoutId={character.id}
            className="inline-block"
            aria-hidden="true"
            initial="initial"
            animate="animate"
            exit="exit"
            variants={variants ?? DEFAULT_VARIANTS}
            transition={transition ?? DEFAULT_TRANSITION}
          >
            {character.label}
          </motion.span>
        ))}
      </AnimatePresence>
      {/* The real text, for anything that reads rather than looks. */}
      <span className="sr-only">{children}</span>
    </Component>
  );
}
