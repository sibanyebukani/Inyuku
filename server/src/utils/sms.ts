/**
 * SMS utility — BulkSMS REST v1 via native fetch + Basic auth.
 *
 * Settings-first: configuration is read from the `Setting` table
 * (`sms.bulksms.tokenId`, `sms.bulksms.tokenSecret`) (ADR-INY-011).
 * Env fallbacks are intentionally not provided for SMS credentials.
 *
 * Edge-UNSAFE (uses Node Buffer) — never import into Edge code.
 */

import { getSecretSetting } from '../services/settings.service.js';
import { ValidationError } from './errors.js';

const BULKSMS_URL = 'https://api.bulksms.com/v1/messages';

export type SmsResult =
  | { sent: true; providerId: string }
  | {
      sent: false;
      reason: 'PROVIDER_DISABLED' | 'INVALID_PHONE' | 'SEND_FAILED';
      error?: string;
    };

/**
 * Normalise an SA phone number to E.164 `+27XXXXXXXXX`.
 * Accepts: 0XX..., +27XX..., 27XX..., with any whitespace/dashes/parens.
 * Throws Error('INVALID_PHONE_FORMAT') if the result is not exactly 9 digits
 * after stripping the leading indicator.
 */
export function toE164ZA(raw: string): string {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new ValidationError('Invalid phone number format');
  }

  // Strip whitespace, dashes, parentheses.
  const cleaned = raw.replace(/[\s\-()]/g, '');

  let nineDigits: string;
  if (cleaned.startsWith('+27')) {
    nineDigits = cleaned.slice(3);
  } else if (cleaned.startsWith('27')) {
    nineDigits = cleaned.slice(2);
  } else if (cleaned.startsWith('0')) {
    nineDigits = cleaned.slice(1);
  } else {
    throw new ValidationError('Invalid phone number format');
  }

  if (nineDigits.length !== 9 || !/^[0-9]{9}$/.test(nineDigits)) {
    throw new ValidationError('Invalid phone number format');
  }

  return '+27' + nineDigits;
}

async function resolveBulkSmsConfig(): Promise<{
  tokenId: string;
  tokenSecret: string;
} | null> {
  const tokenId = await getSecretSetting('sms.bulksms.tokenId');
  const tokenSecret = await getSecretSetting('sms.bulksms.tokenSecret');
  if (tokenId && tokenSecret) {
    return { tokenId, tokenSecret };
  }
  return null;
}

/**
 * Send a single SMS via BulkSMS REST. Never throws — returns an SmsResult.
 *
 * Resolution order:
 *  1. Validate phone via toE164ZA → INVALID_PHONE on failure
 *  2. Load Settings config (`sms.bulksms.*`) → PROVIDER_DISABLED if missing
 *  3. POST to BulkSMS → SEND_FAILED on any HTTP error or network failure
 */
export async function sendSms(to: string, body: string): Promise<SmsResult> {
  // 1. Phone validation
  let e164: string;
  try {
    e164 = toE164ZA(to);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { sent: false, reason: 'INVALID_PHONE', error: msg };
  }

  // Enforce single-segment SMS cap server-side (160 chars, non-empty).
  if (body.trim().length === 0 || body.length > 160) {
    return {
      sent: false,
      reason: 'SEND_FAILED',
      error: body.trim().length === 0 ? 'SMS_BODY_EMPTY' : 'SMS_BODY_TOO_LONG',
    };
  }

  // 2. Settings config
  const cfg = await resolveBulkSmsConfig();
  if (!cfg) {
    return { sent: false, reason: 'PROVIDER_DISABLED' };
  }

  // 3. HTTP
  const auth =
    'Basic ' + Buffer.from(`${cfg.tokenId}:${cfg.tokenSecret}`).toString('base64');

  try {
    const response = await fetch(BULKSMS_URL, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: e164, body, encoding: 'TEXT' }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        sent: false,
        reason: 'SEND_FAILED',
        error: `SMS_API_${response.status}: ${text.slice(0, 200)}`,
      };
    }

    const data = (await response.json()) as Array<{ id: string }>;
    const providerId = data?.[0]?.id;
    if (!providerId) {
      return {
        sent: false,
        reason: 'SEND_FAILED',
        error: 'SMS_API_NO_ID',
      };
    }
    return { sent: true, providerId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { sent: false, reason: 'SEND_FAILED', error: msg };
  }
}
