'use client';

import { useEffect, useRef } from 'react';

/**
 * Visibility-gated polling (ADR-INY-026). Runs `fn` every `intervalMs` while the
 * tab is visible; pauses when hidden and resumes (with an immediate tick) on
 * re-show. A single interval is cleared on unmount. No websockets.
 */
export function usePoll(fn: () => void, intervalMs: number, enabled = true): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => fnRef.current(), intervalMs);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fnRef.current(); // immediate refresh on re-show
        start();
      } else {
        stop();
      }
    };

    if (typeof document === 'undefined' || document.visibilityState === 'visible') {
      start();
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, enabled]);
}
