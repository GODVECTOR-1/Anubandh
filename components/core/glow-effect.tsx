'use client';

import type { CSSProperties } from 'react';
import { motion, useReducedMotion, type Transition } from 'motion/react';
import { cn } from '@/lib/cn';

/**
 * GlowEffect, on the Motion-Primitives API.
 *
 * A soft animated gradient that sits behind a card and bleeds out past its
 * edges. Purely decorative, so aria-hidden and pointer-events-none.
 *
 * COLOUR IS NOT FREE HERE. The library's example glows blue, purple, red and
 * orange, and in this product red means act_on_this and gold means
 * ask_about_this — the whole severity scale is built on them. A red-to-orange
 * glow around the upload card would tell a person their document is alarming
 * before it has been read. The defaults are therefore the two provenance
 * colours, statutory navy and asymmetry, which carry no severity meaning.
 *
 * Under prefers-reduced-motion the gradient renders once and holds. The glow is
 * decoration, so the alternative to moving it is showing it still, not removing
 * it — the card keeps the same weight either way.
 */

export type GlowEffectProps = {
  className?: string;
  style?: CSSProperties;
  colors?: string[];
  mode?: 'rotate' | 'colorShift' | 'pulse' | 'static';
  blur?: 'soft' | 'medium' | 'strong' | 'none';
  transition?: Transition;
  scale?: number;
  duration?: number;
};

const BLUR: Record<NonNullable<GlowEffectProps['blur']>, string> = {
  none: '',
  soft: 'blur-md',
  medium: 'blur-xl',
  strong: 'blur-3xl',
};

const DEFAULT_COLORS = [
  'var(--accent)',
  'var(--emerald)',
  'var(--accent)',
  'var(--asymmetry)',
];

export function GlowEffect({
  className,
  style,
  colors = DEFAULT_COLORS,
  mode = 'colorShift',
  blur = 'medium',
  transition,
  scale = 1,
  duration = 5,
}: GlowEffectProps) {
  const reduce = useReducedMotion();
  const base: Transition =
    mode === 'rotate'
      ? { repeat: Infinity, duration, ease: 'easeInOut', repeatType: 'mirror' }
      : { repeat: Infinity, duration, ease: 'linear' };

  const still = `conic-gradient(from 0deg at 50% 50%, ${colors.join(', ')})`;

  // The gradient itself never animates.
  //
  // Animating background-image cannot be composited: the browser repaints the
  // whole element every frame, and this one is blurred, so it repaints AND
  // re-blurs it every frame. Spinning the element instead is cheap but shows
  // its square corners sweeping past as a hard diagonal band. So the paint is
  // static and only scale and opacity move — both composited, and neither can
  // bring an edge into view.
  const animation =
    mode === 'rotate'
      ? { scale: [1, 1.08, 1], opacity: [0.82, 1, 0.82] }
      : mode === 'pulse'
        ? { background: [still, still], scale: [1, 1.05, 1], opacity: [0.7, 1, 0.7] }
        : mode === 'static'
          ? { background: still }
          : {
              // colorShift: each colour hands over to the next one round.
              background: colors.map(
                (color, i) =>
                  `conic-gradient(from 0deg at 50% 50%, ${color} 0%, ${
                    colors[(i + 1) % colors.length]
                  } 50%, ${color} 100%)`,
              ),
            };

  const shared = cn(
    'pointer-events-none absolute inset-0 h-full w-full transform-gpu',
    BLUR[blur],
    className,
  );

  if (reduce) {
    return (
      <div
        aria-hidden="true"
        className={shared}
        style={{ ...style, background: still, transform: `scale(${scale})` }}
      />
    );
  }

  return (
    <motion.div
      aria-hidden="true"
      className={shared}
      style={{
        ...style,
        background: mode === 'rotate' ? still : undefined,
        transform: `scale(${scale})`,
        willChange: 'transform',
      }}
      animate={animation}
      transition={transition ?? base}
    />
  );
}
