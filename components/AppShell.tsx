import Link from 'next/link';
import { FileDown } from 'lucide-react';
import type { Coverage } from '@/contracts/schema';
import { CoverageStrip } from '@/components/CoverageStrip';
import { TabNav } from '@/components/TabNav';
import { getLocale } from '@/lib/locale';
import { UI } from '@/lib/ui-strings';
import { AppHeader } from '@/components/AppHeader';
import { AmbientGradient } from '@/components/AmbientGradient';
import { BorderTrail } from '@/components/core/border-trail';

/**
 * One shell for every view, so the coverage strip cannot quietly go missing
 * from a screen. It is non-dismissible and pinned above every tab; that is only
 * true if every tab renders it, and "remember to include it" is not a mechanism.
 */
export async function AppShell({
  coverage,
  children,
  showFooter = true,
}: {
  coverage: Coverage;
  children: React.ReactNode;
  showFooter?: boolean;
}) {
  const t = UI[await getLocale()];

  return (
    <>
      <AmbientGradient />
      <AppHeader />
      <CoverageStrip coverage={coverage} />
      <TabNav />
      <main id="main" className="flex-1">
        {children}
      </main>

      {/* The exit. A product that raises alarm needs a way to act on it in
          reach from every screen, not only from the one panel that offers it. */}
      {showFooter && (
        <footer className="glass sticky bottom-0 border-t">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
            <p className="text-xs text-ink-faint">
              {t.common.notLegalAdvice}
            </p>
            <Link
              href="/prepare"
              className="pop-sm relative inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md bg-accent px-3.5 text-xs font-medium text-paper"
            >
              {/* Light rather than the navy of the other trails: this one sits
                  on the dark button, where navy on near-black is invisible. */}
              <BorderTrail className="bg-linear-to-l from-transparent via-paper to-transparent" size={44} />
              <FileDown size={13} aria-hidden="true" />
              {t.common.prepareCta}
            </Link>
          </div>
        </footer>
      )}
    </>
  );
}
