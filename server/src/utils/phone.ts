/** Normalise a raw phone / WhatsApp contact id to E.164 (+<digits>). */
export function normalizeMsisdn(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  // ZA local form: 0XXXXXXXXX (10 digits, leading 0) -> +27XXXXXXXXX
  if (digits.length === 10 && digits.startsWith('0')) {
    return `+27${digits.slice(1)}`;
  }
  return `+${digits}`;
}

/** PII-masked display form: country digits kept, middle masked, last 4 kept. */
export function maskMsisdn(raw: string): string {
  const e164 = normalizeMsisdn(raw);
  const digits = e164.replace(/\D/g, '');
  if (digits.length <= 4) return '•'.repeat(digits.length);
  // keep leading country code (assume 2) + last 4; mask the rest
  const cc = digits.slice(0, 2);
  const last4 = digits.slice(-4);
  const maskedLen = digits.length - cc.length - last4.length;
  return `+${cc}${'•'.repeat(maskedLen)}${last4}`;
}
