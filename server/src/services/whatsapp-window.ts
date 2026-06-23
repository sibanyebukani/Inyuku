/**
 * 24-hour WhatsApp customer-care session-window pure function.
 *
 * The window is OPEN when `now - lastInboundAt < 24 hours`. It is CLOSED when
 * there has never been an inbound, or the last inbound is older than 24 hours.
 */

const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface WindowState {
  state: 'OPEN' | 'CLOSED';
  windowExpiresAt: Date | null;
}

export function windowState(lastInboundAt: Date | null, now: Date): WindowState {
  if (!lastInboundAt) {
    return { state: 'CLOSED', windowExpiresAt: null };
  }

  const expiresAt = new Date(lastInboundAt.getTime() + WINDOW_MS);
  if (now.getTime() < expiresAt.getTime()) {
    return { state: 'OPEN', windowExpiresAt: expiresAt };
  }

  return { state: 'CLOSED', windowExpiresAt: null };
}
