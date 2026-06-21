import { runSync, type SyncSummary } from './sync';
import type { SyncNotice } from './types';

function defaultNotice(notice: SyncNotice): void {
  // Non-blocking fallback; the shell can pass a real toast handler.
  console.warn('[sync] conflict', notice);
}

/** Attach sync triggers (reconnect + tab-visible). Returns an unsubscribe fn. */
export function registerSyncTriggers(
  businessId: string,
  onSummary?: (s: SyncSummary) => void,
  onNotice?: (n: SyncNotice) => void,
): () => void {
  let inFlight = false;
  const emitNotice = onNotice ?? defaultNotice;

  const tick = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const summary = await runSync(businessId, emitNotice);
      onSummary?.(summary);
    } catch {
      // network/refresh failures are non-fatal; the outbox is retried on the next trigger
    } finally {
      inFlight = false;
    }
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible') void tick();
  };

  window.addEventListener('online', tick);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.removeEventListener('online', tick);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
