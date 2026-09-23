'use client';

import { useEffect } from 'react';

/**
 * Undoes the upload the moment the page is reloaded — RELOADED, not navigated.
 *
 * The session cookie makes an analysis survive across requests, which is
 * right for moving between /radar, /document, /timeline and back. It is
 * wrong for an F5: the reader asked for a fresh page, and the old document
 * quietly reappearing is the "why is my last contract still here" bug.
 *
 * The Navigation Timing API is the native way to tell a reload apart from a
 * normal navigation. Client-side routing between routes never re-fires this;
 * only an actual full-page reload does.
 */
export function ResetOnReload() {
  useEffect(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type !== 'reload') return;

    fetch('/api/session/reset', { method: 'POST' }).finally(() => {
      if (location.pathname !== '/') location.replace('/');
    });
  }, []);

  return null;
}
