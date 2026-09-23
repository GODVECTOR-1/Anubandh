'use client';

import { useEffect } from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/cn';

/**
 * The drifting mesh gradient behind the page.
 *
 * Drawn in CSS — see .anb-gradient. Both gradient files supplied so far were
 * really rasters in a wrapper; this one holds a real CSS gradient plus a grain
 * tile, so it costs no request at all and stays crisp at any size.
 *
 * THE MOTION IS TRANSFORM ONLY. That is the whole performance story: transform
 * animates on the compositor and never touches the main thread, so this drifts
 * for free while the page scrolls. Animating the gradient itself — background,
 * filter, or opacity keyframes — is what makes a backdrop like this cost frames,
 * and this page has already paid that bill once.
 *
 * Under prefers-reduced-motion it holds still rather than disappearing: the
 * gradient is the page's background, and removing it would change the design
 * rather than calm it.
 */

export function AmbientGradient({
  className,
  /** 'fixed' sits behind a whole route; 'section' fills its nearest positioned
   *  ancestor, which is how the landing page starts it partway down. */
  placement = 'fixed',
}: {
  className?: string;
  placement?: 'fixed' | 'section';
}) {
  const reduce = useReducedMotion();

  // Only for a fixed placement. A section placement paints part of the page,
  // so handing it the whole canvas leaves everything outside it bare.
  //
  // The root element's background IS the page canvas, and the canvas is
  // painted beneath every negative-z layer — so no backdrop can ever sit
  // above it. While one is mounted the root goes transparent and this layer
  // paints --paper itself, which also means the page never flashes white if
  // the image fails.
  useEffect(() => {
    if (placement !== 'fixed') return;
    const root = document.documentElement;
    root.setAttribute('data-ambient', '');
    return () => root.removeAttribute('data-ambient');
  }, [placement]);

  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none -z-20 overflow-hidden',
        // A section placement sits inside a page that already has a
        // background; painting paper of its own would hide what is behind it.
        placement === 'fixed' && 'bg-paper',
        placement === 'fixed' ? 'fixed inset-0' : 'absolute inset-0',
        className,
      )}
    >
      {/* Oversized so the drift never exposes an edge. */}
      <div className={cn('anb-gradient absolute -inset-[18%]', !reduce && 'anb-drift')} />
      {/* Held back where the words are. See .anb-veil. */}
      <div
        className={cn(
          'absolute inset-0',
          placement === 'section' ? 'anb-veil-soft' : 'anb-veil',
        )}
      />
    </div>
  );
}
