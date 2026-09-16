'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'inyuku_merchant_dark_mode';

function readStoredPreference(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_KEY) === 'true';
}

function applyToDocument(isDark: boolean): void {
  document.documentElement.classList.toggle('dark', isDark);
}

/** Merchant-portal-only dark mode toggle, persisted per-viewer in localStorage. */
export function useDarkMode(): { isDark: boolean; toggle: () => void } {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const stored = readStoredPreference();
    setIsDark(stored);
    applyToDocument(stored);
  }, []);

  const toggle = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      applyToDocument(next);
      window.localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  return { isDark, toggle };
}
