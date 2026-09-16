'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'inyuku_merchant_dark_mode';

function readStoredPreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
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
    const next = !isDark;
    applyToDocument(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Blocked storage (private browsing, blocked site data) — the in-memory
      // state still flips correctly for the current page view.
    }
    setIsDark(next);
  }, [isDark]);

  return { isDark, toggle };
}
