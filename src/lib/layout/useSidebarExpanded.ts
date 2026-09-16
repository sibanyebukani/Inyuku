'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'inyuku_merchant_sidebar_expanded';

/** Desktop sidebar collapse state, persisted per-viewer in localStorage. Defaults open. */
export function useSidebarExpanded(): { expanded: boolean; toggle: () => void } {
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored !== null) setExpanded(stored === 'true');
  }, []);

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      window.localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  return { expanded, toggle };
}
