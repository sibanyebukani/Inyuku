'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'inyuku_merchant_sidebar_expanded';

/** Desktop sidebar collapse state, persisted per-viewer in localStorage. Defaults open. */
export function useSidebarExpanded(): { expanded: boolean; toggle: () => void } {
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored !== null) setExpanded(stored === 'true');
    } catch {
      // Blocked storage — fall back to the default (expanded).
    }
  }, []);

  const toggle = useCallback(() => {
    const next = !expanded;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Blocked storage (private browsing, blocked site data) — the in-memory
      // state still flips correctly for the current page view.
    }
    setExpanded(next);
  }, [expanded]);

  return { expanded, toggle };
}
