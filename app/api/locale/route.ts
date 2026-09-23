import { NextResponse, type NextRequest } from 'next/server';
import { isLocale } from '@/lib/i18n';
import { LOCALE_COOKIE } from '@/lib/locale';

/**
 * Sets the language and returns the reader to where they were.
 *
 * A plain link to a GET route, not a client handler, so switching language
 * works without JavaScript and the next render is server-side in the new
 * language rather than a flash of English.
 */
export async function GET(request: NextRequest) {
  const to = request.nextUrl.searchParams.get('to');
  const next = request.nextUrl.searchParams.get('next') ?? '/';

  // Only ever redirect to a path on this site. Taking `next` on trust would
  // make this an open redirect: a link that looks like ours and lands somewhere
  // else, which is the last thing a legal tool should offer.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';

  const res = NextResponse.redirect(new URL(safeNext, request.nextUrl.origin));
  // A cached redirect would set the cookie once and then be replayed from cache
  // for every later switch, which looks exactly like a broken toggle.
  res.headers.set('Cache-Control', 'no-store, must-revalidate');

  if (isLocale(to ?? undefined)) {
    res.cookies.set({
      name: LOCALE_COOKIE,
      value: to as string,
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      httpOnly: false,
    });
  }

  return res;
}
