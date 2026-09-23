'use client';

import { useRef } from 'react';
import { motion, useInView, useReducedMotion, type Transition } from 'motion/react';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';

/**
 * BorderTrail, on the Motion-Primitives API.
 *
 * A lit blob rides the element's border using CSS offset-path, and a two-layer
 * mask composited with `intersect` clips it to the border ring alone: one layer
 * is transparent and clipped to the padding box, the other is opaque and clipped
 * to the border box, so only the ring between them survives. That is why the
 * host needs no visible border of its own and why the trail never washes over
 * the content.
 *
 * Two things were added on the way in, because the library's copy-paste version
 * has neither and this project gates on both:
 *
 *   - prefers-reduced-motion returns null. An infinitely looping light that
 *     circles a button forever is precisely what that setting is for, and
 *     slowing it down is not an answer. Callers must therefore not depend on
 *     onAnimationComplete for correctness: under reduced motion it never fires,
 *     so anything that must end needs its own state, not this callback.
 *   - aria-hidden. It is decoration on a control that already has a name;
 *     without it a screen reader meets an unlabelled element inside the button.
 *
 * The host element must be positioned (`relative`) and should carry its own
 * `rounded-*`, which the trail inherits so the path follows the real corner.
 *
 * Both elements are spans, not divs, and that is deliberate. This gets dropped
 * inside <button> and <a>, where a div is not valid content; position:absolute
 * blockifies a span anyway, so nothing renders differently. It still cannot go
 * directly inside <ul>/<ol>, which may only contain <li> — wrap the list.
 */

type BorderTrailProps = {
  className?: string;
  /** Diameter of the blob, and the corner radius of its path. */
  size?: number;
  transition?: Transition;
  onAnimationComplete?: () => void;
  style?: CSSProperties;
};

const BASE_TRANSITION: Transition = {
  repeat: Infinity,
  duration: 5,
  ease: 'linear',
};

export function BorderTrail({
  className,
  size = 60,
  transition,
  onAnimationComplete,
  style,
}: BorderTrailProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  // offsetDistance is not a WAAPI-animatable property, so Motion drives this
  // on the main thread with requestAnimationFrame rather than handing it to
  // the compositor. Nine of them ticking every frame is real work, and work
  // done for a trail nobody can see is pure waste — so it stops off screen.
  const inView = useInView(ref, { margin: '96px' });

  if (reduce) return null;

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-[inherit] border border-transparent [mask-clip:padding-box,border-box] [mask-composite:intersect] [mask-image:linear-gradient(transparent,transparent),linear-gradient(#000,#000)]"
    >
      <motion.span
        className={cn('absolute aspect-square bg-ink-faint', className)}
        style={{
          width: size,
          offsetPath: `rect(0 auto auto 0 round ${size}px)`,
          ...style,
        }}
        animate={inView ? { offsetDistance: ['0%', '100%'] } : undefined}
        transition={transition ?? BASE_TRANSITION}
        onAnimationComplete={onAnimationComplete}
      />
    </span>
  );
}
