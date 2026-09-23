'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView, useMotionValue, useSpring, useReducedMotion } from 'motion/react';

/**
 * Magic UI's number ticker, in this project's terms.
 *
 * Animating a number is only honest when the number is genuinely arriving —
 * a coverage count that settles as the analysis lands, or the running totals
 * during extraction. It is not decoration for a figure that was always known.
 *
 * Two things matter more than the animation:
 *
 *   1. A screen reader must never hear the intermediate values. It gets the
 *      real number, once, from sr-only text; the animated digits are
 *      aria-hidden. Counting from 0 to 41 out loud is not a progress report.
 *   2. Under prefers-reduced-motion the final value renders immediately, with
 *      no spring at all. A number rolling under someone's eyes is exactly the
 *      motion that setting exists to stop.
 */
export function NumberTicker({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -12% 0px' });

  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { damping: 34, stiffness: 120 });
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (reduce) return;
    if (inView) motionValue.set(value);
  }, [inView, value, motionValue, reduce]);

  useEffect(() => {
    if (reduce) return;
    return spring.on('change', (v) => setShown(Math.round(v)));
  }, [spring, reduce]);

  return (
    <span ref={ref} className={className}>
      {/* Under reduced motion the final value is DERIVED rather than stored.
          It used to be pushed into state from an effect, which meant a render
          with 0 in it before the corrected one arrived — a cascading render
          the compiler flags, and a visible flash of the wrong number on the
          setting whose entire purpose is not to animate. */}
      <span aria-hidden="true" className="tabular-nums">
        {reduce ? value : shown}
      </span>
      <span className="sr-only">{value}</span>
    </span>
  );
}
