'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Languages } from 'lucide-react';
import { LOCALES, LOCALE_NAME } from '@/lib/i18n';
import { useLocale, useUi } from '@/components/LocaleProvider';
import { cn } from '@/lib/cn';

/**
 * Two plain links to a GET route that sets the cookie and sends you back to the
 * page you were on, query string and all.
 *
 * Links rather than a click handler: the language has to be known on the SERVER
 * before the first byte, or every page flashes English and the document's
 * `lang` is wrong for as long as hydration takes. It also means switching
 * language works with JavaScript off, which for an accessibility feature is
 * rather the point.
 *
 * A PLAIN <a>, deliberately, not next/link. Link performs a client-side
 * navigation: it called the route handler, the cookie changed, and then the
 * router served the destination from its own cache — the RSC payload already
 * rendered in the old language. The result was a toggle that flipped the
 * cookie and changed nothing on screen. A route handler is not a page and must
 * not be navigated to by the client router.
 */
export function LanguageToggle() {
  const locale = useLocale();
  const t = useUi();
  const pathname = usePathname();
  const params = useSearchParams();

  const query = params.toString();
  const returnTo = pathname + (query ? '?' + query : '');

  return (
    <div className="inline-flex shrink-0 items-center gap-1.5">
      <Languages size={14} aria-hidden="true" className="text-ink-faint" />
      <span className="sr-only" id="lang-label">
        {t.common.languageLabel}
      </span>
      <div role="group" aria-labelledby="lang-label" className="rim inline-flex overflow-hidden rounded-md border border-rule">
        {LOCALES.map((l) => (
          <a
            key={l}
            href={'/api/locale?to=' + l + '&next=' + encodeURIComponent(returnTo)}
            lang={l}
            hrefLang={l}
            aria-current={l === locale ? 'true' : undefined}
            className={cn(
              'pop-sm inline-flex min-h-11 items-center px-2.5 text-xs font-medium first:rounded-l-md last:rounded-r-md',
              l === locale ? 'bg-accent text-paper' : 'text-ink-muted hover:text-ink',
            )}
          >
            {LOCALE_NAME[l]}
          </a>
        ))}
      </div>
    </div>
  );
}
