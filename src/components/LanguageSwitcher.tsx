'use client'

import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'

const LOCALE_NAMES: Record<string, string> = {
  en: 'English',
  zu: 'isiZulu',
  xh: 'isiXhosa',
  af: 'Afrikaans',
  st: 'Sesotho',
  tn: 'Setswana',
  nso: 'Sepedi',
  ts: 'Xitsonga',
}

const LOCALE_ORDER = ['en', 'zu', 'xh', 'af', 'st', 'tn', 'nso', 'ts']

export default function LanguageSwitcher() {
  const locale = useLocale()
  const router = useRouter()
  const t = useTranslations('locale')

  function setLocale(next: string) {
    document.cookie = `inyuku_locale=${next};path=/;max-age=31536000`
    router.refresh()
  }

  return (
    <label className="flex items-center gap-2 text-[13px] font-medium text-text-primary">
      <span className="sr-only">{t('label')}</span>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value)}
        className="bg-transparent outline-none cursor-pointer"
        aria-label={t('label')}
      >
        {LOCALE_ORDER.map((loc) => (
          <option key={loc} value={loc}>
            {LOCALE_NAMES[loc]}
          </option>
        ))}
      </select>
    </label>
  )
}
