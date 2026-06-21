import { runSync, type SyncSummary } from './sync';

/** Attach sync triggers (reconnect + tab-visible). Returns an unsubscribe fn. */
export function registerSyncTriggers(
  businessId: string,
  onSummary?: (s: SyncSummary) => void,
): () => void {
  let inFlight = false;

  const tick = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const summary = await runSync(businessId);
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
