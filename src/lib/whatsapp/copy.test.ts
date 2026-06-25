import { describe, it, expect } from 'vitest';
import {
  needsReply,
  needsReplyCount,
  maskMsisdn,
  sendErrorCopy,
  statusLabel,
  windowBannerCopy,
  formatSastTime,
} from './copy';

describe('needsReply truth table', () => {
  it('is false when there is no inbound', () => {
    expect(needsReply({ lastInboundAt: null, lastOutboundAt: null })).toBe(false);
    expect(needsReply({ lastInboundAt: null, lastOutboundAt: '2026-06-21T10:00:00Z' })).toBe(false);
  });

  it('is true when inbound exists and we never replied', () => {
    expect(needsReply({ lastInboundAt: '2026-06-21T10:00:00Z', lastOutboundAt: null })).toBe(true);
  });

  it('is true when inbound is newer than outbound', () => {
    expect(
      needsReply({ lastInboundAt: '2026-06-21T12:00:00Z', lastOutboundAt: '2026-06-21T10:00:00Z' }),
    ).toBe(true);
  });

  it('is false when our outbound is newer than (or equal to) inbound', () => {
    expect(
      needsReply({ lastInboundAt: '2026-06-21T10:00:00Z', lastOutboundAt: '2026-06-21T12:00:00Z' }),
    ).toBe(false);
  });

  it('counts needs-reply over a list', () => {
    expect(
      needsReplyCount([
        { lastInboundAt: '2026-06-21T12:00:00Z', lastOutboundAt: null },
        { lastInboundAt: '2026-06-21T10:00:00Z', lastOutboundAt: '2026-06-21T12:00:00Z' },
        { lastInboundAt: null, lastOutboundAt: null },
      ]),
    ).toBe(1);
  });
});

describe('maskMsisdn', () => {
  it('masks all but the last 3 digits', () => {
    expect(maskMsisdn('27821234567')).toBe('•••567');
    expect(maskMsisdn('+27 82 123 4567')).toBe('•••567');
  });
  it('handles short inputs', () => {
    expect(maskMsisdn('12')).toBe('•••12');
  });
});

describe('sendErrorCopy maps codes to plain language', () => {
  it('covers 409/422/403 codes without leaking the raw code', () => {
    for (const code of [
      'whatsapp_window_closed',
      'whatsapp_consent_denied',
      'whatsapp_channel_disabled',
      'whatsapp_template_invalid',
    ]) {
      const text = sendErrorCopy(code);
      expect(text).not.toContain(code);
      expect(text.length).toBeGreaterThan(0);
    }
  });
  it('falls back for unknown codes', () => {
    expect(sendErrorCopy('SOMETHING_WEIRD')).toBe(sendErrorCopy('default'));
    expect(sendErrorCopy(undefined)).toBe(sendErrorCopy('default'));
  });
});

describe('statusLabel', () => {
  it('renders plain-language status', () => {
    expect(statusLabel('SENT')).toBe('Sent');
    expect(statusLabel('FAILED')).toBe("Didn't send");
    expect(statusLabel('QUEUED')).toBe('Sending');
  });
});

describe('windowBannerCopy', () => {
  it('CLOSED shows the resting copy, never a code', () => {
    const t = windowBannerCopy('CLOSED', null);
    expect(t).toMatch(/resting/i);
  });
  it('OPEN interpolates the SAST expiry time', () => {
    const iso = '2026-06-21T12:32:00Z'; // 14:32 SAST
    const t = windowBannerCopy('OPEN', iso);
    expect(t).toContain(formatSastTime(iso));
    expect(t).toContain('14:32');
  });
});
