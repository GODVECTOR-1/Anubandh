'use client';

import { useReducedMotion } from 'motion/react';

/**
 * Aceternity's spotlight, rendered in paper and ink.
 *
 * The technique is theirs: a large, heavily-blurred ellipse drifting behind the
 * hero to suggest a light source off-frame. The palette is not. Aceternity's
 * own spotlight, and the aurora style that usually accompanies it, run on neon
 * cyan and magenta — the "AI gradient" look, and a documented text-contrast
 * risk. Dropping that behind a page about a Rs. 2,00,000 bond clause would undo
 * both the design language and the measured contrast.
 *
 * So: one ink-toned ellipse at very low opacity, drifting slowly, sitting
 * BEHIND content that has its own opaque surfaces. Nothing readable is composed
 * against it, which is what keeps the 50 measured contrast pairs valid.
 *
 * Landing hero only. Inside the app it would be one ambient layer too many,
 * and the Spline canvas already occupies that role.
 */
export function Spotlight() {
  const reduce = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 1000 600">
        <defs>
          <radialGradient id="anb-spot" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--ink)" stopOpacity="0.16" />
            <stop offset="55%" stopColor="var(--ink)" stopOpacity="0.05" />
            <stop offset="100%" stopColor="var(--ink)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="anb-spot-warm" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--ask)" stopOpacity="0.10" />
            <stop offset="100%" stopColor="var(--ask)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <ellipse cx="720" cy="170" rx="430" ry="260" fill="url(#anb-spot)">
          {!reduce && (
            <animate
              attributeName="cx"
              values="720;640;720"
              dur="22s"
              repeatCount="indefinite"
              calcMode="spline"
              keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"
              keyTimes="0;0.5;1"
            />
          )}
        </ellipse>

        <ellipse cx="250" cy="420" rx="360" ry="220" fill="url(#anb-spot-warm)">
          {!reduce && (
            <animate
              attributeName="cy"
              values="420;470;420"
              dur="28s"
              repeatCount="indefinite"
              calcMode="spline"
              keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"
              keyTimes="0;0.5;1"
            />
          )}
        </ellipse>
      </svg>
    </div>
  );
}
