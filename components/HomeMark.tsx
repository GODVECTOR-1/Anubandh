'use client';

import { motion, useReducedMotion } from 'motion/react';

/**
 * The wordmark, which is also the way home.
 *
 * Animated on arrival and on hover, and NOT continuously. This sits in a sticky
 * header on every screen in the app; a logo that moves forever is the one piece
 * of motion a person cannot scroll away from, and it would be competing for
 * attention with a document that actually matters. Arrival and response are the
 * two moments where motion says something.
 *
 * The Devanagari is aria-hidden: it is the same word as the Latin beside it, and
 * a screen reader announcing "Anubandh anubandh" is noise. The link's own label
 * comes from the caller.
 */
export function HomeMark() {
  const reduce = useReducedMotion();

  return (
    <motion.span
      // The press is CSS, not whileTap. Motion gives any element with a press
      // gesture tabindex="0" so the keyboard can reach it, which inside this
      // link made a second, dead tab stop on every page: Enter on it played
      // the tap and went nowhere. `scale` is its own property, so it composes
      // with the translate Motion writes to `transform`.
      className="group inline-flex items-baseline gap-2 transition-[scale] duration-150 motion-safe:active:scale-[0.97]"
      // No entrance under reduced motion: initial={false} makes it render in
      // its final position rather than animating from anywhere.
      initial={reduce ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      whileHover={reduce ? undefined : { y: -2 }}
    >
      <span className="text-lg font-semibold tracking-tight text-ink sm:text-xl">Anubandh</span>
      {/* Colour, not opacity. opacity-80 on --ink-faint drops it under 4.5:1 —
          the token has almost no headroom to spend — and axe failed it on all
          fourteen route/theme combinations. --ink-faint to --ink-muted is the
          same emphasis and both ends clear AA.

          Plain CSS rather than a motion variant: the global reduced-motion rule
          already collapses transitions, so this needs no second code path. */}
      <span
        lang="hi"
        aria-hidden="true"
        className="text-sm text-ink-faint transition-colors duration-200 group-hover:text-ink-muted sm:text-base"
      >
        अनुबंध
      </span>
    </motion.span>
  );
}
