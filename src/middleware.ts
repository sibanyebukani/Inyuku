import { type NextRequest, NextResponse } from 'next/server';

const SUPPORTED_LOCALES = ['en', 'zu', 'xh', 'af', 'st', 'tn', 'nso', 'ts'];
const DEFAULT_LOCALE = 'en';
const LOCALE_COOKIE = 'inyuku_locale';

export function middleware(request: NextRequest) {
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = cookie && SUPPORTED_LOCALES.includes(cookie) ? cookie : DEFAULT_LOCALE;

  const response = NextResponse.next();
  response.headers.set('x-next-intl-locale', locale);
  return response;
}

export const config = {
  matcher: ['/((?!_next|api|_vercel|.*\\..*).*)'],
};
