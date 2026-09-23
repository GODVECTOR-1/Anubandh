import Link from 'next/link';
import { Plus } from 'lucide-react';
import { LanguageToggle } from '@/components/LanguageToggle';
import { HomeMark } from '@/components/HomeMark';
import { BorderTrail } from '@/components/core/border-trail';
import { getLocale } from '@/lib/locale';
import { UI } from '@/lib/ui-strings';

/**
 * The app's top bar: the wordmark is the way home, and a new document is always
 * one tap away.
 *
 * Both were missing. Once the landing moved to `/`, every screen inside the app
 * was a one-way trip — the tabs move between sections of one analysis and none
 * of them leads back out. A logo that returns you to the start is the oldest
 * convention on the web, and its absence is the kind of thing nobody reports
 * because they assume they missed it.
 */
export async function AppHeader({ showNewDocument = true }: { showNewDocument?: boolean }) {
  const t = UI[await getLocale()];

  return (
    <header className="glass sticky top-0 z-30 border-b">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 sm:px-6">
        {/* pop-sm is gone: it animates transform on hover and so does HomeMark,
            and two owners of one transform fight each other. */}
        <Link
          href="/"
          aria-label={t.common.homeLabel}
          className="inline-flex min-h-11 items-center rounded-md px-2"
        >
          <HomeMark />
        </Link>

        <div className="flex items-center gap-2">
          <LanguageToggle />
          {showNewDocument && (
          <Link
            href="/upload"
            className="pop-sm rim relative inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-rule-strong px-3.5 text-sm font-medium text-ink"
          >
            {/* Navy, not paper: this one sits on a light surface, so the trail
                has to be darker than its host rather than lighter. */}
            <BorderTrail className="bg-linear-to-l from-transparent via-accent to-transparent" size={40} />
              <Plus size={14} aria-hidden="true" />
              {t.common.newDocument}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
