import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

const SUPPORTED_LOCALES = ['en', 'zu', 'xh', 'af', 'st', 'tn', 'nso', 'ts'];

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const raw = cookieStore.get('inyuku_locale')?.value ?? 'en';
  const locale = SUPPORTED_LOCALES.includes(raw) ? raw : 'en';

  const messages = (await import(`../messages/${locale}.json`)).default;

  return { locale, messages };
});
