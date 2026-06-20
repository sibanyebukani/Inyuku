/**
 * PII masking utilities for POPIA compliance.
 *
 * Used by the audit logger and any other component that persists or logs
 * user-supplied data. Never log raw PII.
 */

const SENSITIVE_KEY_RE = /password|token|secret|signature|medicalaidnumber|mainmemberid|hospitalnumber|authcode|apikey|pin|cvv|dob|dateofbirth|address|passport|bloburl|strokedatabloburl|snapshoturl|audiourl|name|firstname|lastname|surname/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SA_ID_RE = /^\d{13}$/;
const PHONE_RE = /^(\+27|0)\d{9,11}$/;

/**
 * 'sibanye@example.co.za' -> 's***@example.co.za'
 */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const first = local.charAt(0);
  return `${first}***${domain}`;
}

/**
 * '9001015800087' -> '900101****087'
 */
export function maskSAID(id: string): string {
  if (id.length !== 13) return id;
  return `${id.slice(0, 6)}****${id.slice(10)}`;
}

/**
 * '+27821234567'  -> '+27*****4567'  (country code + last 4 visible)
 * '0821234567'    -> '0*****4567'    (first digit + last 4 visible)
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (phone.startsWith('+27')) {
    if (phone.length <= 7) return phone;
    const last4 = phone.slice(-4);
    return `+27${'*'.repeat(phone.length - 3 - 4)}${last4}`;
  }
  if (phone.startsWith('0')) {
    if (digits.length <= 5) return phone;
    const last4 = phone.slice(-4);
    return `0${'*'.repeat(phone.length - 1 - 4)}${last4}`;
  }
  return phone;
}

/**
 * Always returns '[REDACTED]'. Used for passwords / tokens / secrets / signatures.
 */
export function maskToken(_token: string): string {
  return '[REDACTED]';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

/**
 * Recursively mask PII in arbitrary values.
 *
 * - If `fieldKey` matches /password|token|secret|signature/i -> '[REDACTED]'
 * - Strings: detect SA ID, email, ZA phone and mask accordingly
 * - Objects / arrays: recurse
 * - Everything else: passed through unchanged
 */
export function maskPII(value: unknown, fieldKey?: string): unknown {
  // Field-key check takes priority — even non-string values under
  // a sensitive key get redacted to avoid leaking shape info.
  if (fieldKey && SENSITIVE_KEY_RE.test(fieldKey)) {
    return '[REDACTED]';
  }

  if (typeof value === 'string') {
    const digitsOnly = value.replace(/\D/g, '');

    if (SA_ID_RE.test(value)) {
      return maskSAID(value);
    }
    if (value.includes('@') && EMAIL_RE.test(value)) {
      return maskEmail(value);
    }
    if (PHONE_RE.test(digitsOnly.startsWith('27') ? `+${digitsOnly}` : digitsOnly)
        || PHONE_RE.test(value)) {
      return maskPhone(value);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => maskPII(item));
  }

  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = maskPII(v, k);
    }
    return out;
  }

  return value;
}
