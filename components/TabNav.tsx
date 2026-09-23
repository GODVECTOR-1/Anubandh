'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { useUi } from '@/components/LocaleProvider';

/**
 * Risk Radar is the page; these are sections within it.
 *
 * Stated once here rather than left to each screen, because the previous
 * arrangement had the Radar as the landing surface while being absent from the
 * tab list, which left the app's information architecture to a guess.
 */
const TABS = [
  { href: '/radar', key: 'radar' },
  { href: '/document', key: 'plain' },
  { href: '/timeline', key: 'timeline' },
  { href: '/ask', key: 'ask' },
  { href: '/prepare', key: 'prepare' },
] as const;

export function TabNav() {
  const pathname = usePathname();
  const t = useUi();

  return (
    <nav aria-label={t.nav.sections} className="glass border-b">
      {/* Scrolls rather than wrapping at 375px: five tabs on two lines pushes
          the content below the fold before the reader has seen anything. */}
      <ul className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 sm:px-6">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href} className="shrink-0">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'pop-sm inline-flex min-h-11 items-center border-b-2 px-3 text-sm',
                  active
                    ? 'border-accent font-medium text-ink'
                    : 'border-transparent text-ink-muted hover:border-rule-strong hover:text-ink',
                )}
              >
                {t.nav[tab.key]}
              </Link>
            </li>
          );
        })}

      </ul>
    </nav>
  );
}
