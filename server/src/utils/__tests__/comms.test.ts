import { describe, it, expect } from 'vitest';
import { sendEmail } from '../email.js';
import { sendSms, toE164ZA } from '../sms.js';

describe('comms', () => {
  it('normalises SA phone numbers', () => {
    expect(toE164ZA('0821234567')).toBe('+27821234567');
    expect(toE164ZA('+27 82 123 4567')).toBe('+27821234567');
    expect(toE164ZA('27821234567')).toBe('+27821234567');
  });

  it('returns PROVIDER_DISABLED when email settings are absent', async () => {
    const result = await sendEmail({
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>hi</p>',
    });
    expect(result).toMatchObject({ sent: false, reason: 'PROVIDER_DISABLED' });
  });

  it('returns PROVIDER_DISABLED when SMS settings are absent', async () => {
    const result = await sendSms('0821234567', 'Hello');
    expect(result).toMatchObject({ sent: false, reason: 'PROVIDER_DISABLED' });
  });
});
