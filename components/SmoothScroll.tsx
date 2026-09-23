'use client';

import { useEffect } from 'react';

/**
 * Lenis smooth scrolling, landing page only.
 *
 * Smooth scroll is a scroll hijack, so it is fenced in on every side that
 * normally makes one a problem:
 *
 *   - It never initialises under prefers-reduced-motion, and it tears itself
 *     down if the user changes that setting while the page is open. Smooth
 *     scrolling is a documented vestibular trigger, so this is not optional.
 *   - It is mounted only on the landing route. The app itself keeps native
 *     scrolling, where a reader is comparing a clause against its source and
 *     momentum would fight them.
 *   - Anchor links are handled explicitly. Lenis leaves the browser's native
 *     hash jump in place otherwise, which lands you in the wrong spot because
 *     Lenis is mid-animation when the jump fires.
 *   - Keyboard scrolling (space, PageDown, arrows) is left to Lenis's own
 *     handling, which preserves focus rather than moving the viewport out from
 *     under it.
 */
export function SmoothScroll() {
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    let lenis: { raf: (t: number) => void; destroy: () => void; scrollTo: (t: HTMLElement | number, o?: object) => void } | null = null;
    let frame = 0;
    let cancelled = false;

    const onAnchorClick = (e: MouseEvent) => {
      if (!lenis) return;
      const anchor = (e.target as HTMLElement | null)?.closest('a[href^="#"]');
      if (!anchor) return;
      const id = anchor.getAttribute('href')?.slice(1);
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: -16 });
      // Move focus as well as the viewport: scrolling a keyboard user to a
      // heading they are not focused on leaves them lost on the next Tab.
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    };

    const start = async () => {
      if (query.matches || lenis) return;
      const { default: Lenis } = await import('lenis');
      if (cancelled || query.matches) return;
      // 0.6, not 0.9. Smooth scrolling that takes nearly a second to settle
      // reads as lag rather than as smoothness: the page keeps moving after
      // the wheel stops, which feels like the page is behind you. The easing
      // is a fast-out curve for the same reason.
      lenis = new Lenis({
        duration: 0.6,
        smoothWheel: true,
        easing: (t: number) => 1 - Math.pow(1 - t, 3),
      });
      const raf = (time: number) => {
        lenis?.raf(time);
        frame = requestAnimationFrame(raf);
      };
      frame = requestAnimationFrame(raf);
      document.addEventListener('click', onAnchorClick);
    };

    const stop = () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('click', onAnchorClick);
      lenis?.destroy();
      lenis = null;
    };

    const onPreferenceChange = () => (query.matches ? stop() : void start());

    void start();
    query.addEventListener('change', onPreferenceChange);

    return () => {
      cancelled = true;
      query.removeEventListener('change', onPreferenceChange);
      stop();
    };
  }, []);

  return null;
}
