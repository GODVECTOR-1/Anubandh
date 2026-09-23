import { cookies } from 'next/headers';
import { isLocale, type Locale } from '@/lib/i18n';

export const LOCALE_COOKIE = 'anubandh_locale';

/**
 * The reader's language, for server components.
 *
 * A cookie rather than a query parameter, now that the choice spans the whole
 * app: a parameter would have to be threaded onto every internal link, and the
 * first one anybody forgot would silently drop the reader back into English.
 * The cookie also lets the root layout set the document's `lang` before the
 * first paint, which is what a screen reader reads to pick a voice.
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const v = store.get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : 'en';
}
