import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'zu', 'xh', 'af', 'st', 'tn', 'nso', 'ts'],
  defaultLocale: 'en',
  localeCookie: { name: 'inyuku_locale' },
});
