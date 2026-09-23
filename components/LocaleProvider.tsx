'use client';

import { createContext, useContext } from 'react';
import type { Locale } from '@/lib/i18n';
import { UI } from '@/lib/ui-strings';

/**
 * The reader's language, for client components.
 *
 * Server components read the cookie directly; these cannot, and threading a
 * prop through every layer is how one leaf quietly stays English. The provider
 * is set once in the root layout from the same cookie, so both halves of the
 * tree always agree.
 */
const LocaleContext = createContext<Locale>('en');

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export const useLocale = () => useContext(LocaleContext);
export const useUi = () => UI[useContext(LocaleContext)];
