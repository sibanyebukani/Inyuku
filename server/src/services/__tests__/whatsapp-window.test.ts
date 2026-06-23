import { describe, it, expect } from 'vitest';
import { windowState } from '../whatsapp-window.js';

describe('whatsapp-window', () => {
  it('null lastInboundAt → CLOSED', () => {
    const now = new Date('2026-06-23T10:00:00Z');
    expect(windowState(null, now)).toEqual({ state: 'CLOSED', windowExpiresAt: null });
  });

  it('just inside 24h → OPEN with correct expiry', () => {
    const last = new Date('2026-06-22T10:00:01Z');
    const now = new Date('2026-06-23T10:00:00Z');
    const result = windowState(last, now);
    expect(result.state).toBe('OPEN');
    expect(result.windowExpiresAt).toEqual(new Date('2026-06-23T10:00:01Z'));
  });

  it('exactly 24h → CLOSED', () => {
    const last = new Date('2026-06-22T10:00:00Z');
    const now = new Date('2026-06-23T10:00:00Z');
    expect(windowState(last, now)).toEqual({ state: 'CLOSED', windowExpiresAt: null });
  });

  it('just outside 24h → CLOSED', () => {
    const last = new Date('2026-06-22T09:59:59Z');
    const now = new Date('2026-06-23T10:00:00Z');
    expect(windowState(last, now)).toEqual({ state: 'CLOSED', windowExpiresAt: null });
  });
});
