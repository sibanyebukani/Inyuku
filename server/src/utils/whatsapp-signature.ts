/**
 * WhatsApp webhook signature verification (Meta / 360dialog).
 *
 * Security contract (THREAT-MODEL §7 / M3-A contract §3.1):
 *   - Signature is verified over the **raw** request body.
 *   - Verification is **fail-closed**: invalid/missing signature returns `false`.
 *   - Comparison is **constant-time** via `crypto.timingSafeEqual`.
 *   - The app secret is read from the encrypted `Setting`
 *     `whatsapp.webhook.appSecret`; it is never env-plaintext or in a response.
 *
 * Raw-body capture is scoped to the webhook route so the global JSON parser is
 * not disturbed. The webhook route plugin registers a content-type parser for
 * `application/json` in its own Fastify encapsulation; that parser stores the
 * original `Buffer` on `request.rawBody` before delegating to `JSON.parse`.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_PREFIX = 'sha256=';

/**
 * Verify the `X-Hub-Signature-256` header against the raw request body.
 *
 * @param rawBody   The untouched request body as a Buffer.
 * @param header    The value of the `X-Hub-Signature-256` header (may be missing).
 * @param appSecret The WhatsApp/Meta app secret (plain text, from Settings).
 */
export function verifySignature(
  rawBody: Buffer,
  header: string | undefined,
  appSecret: string,
): boolean {
  if (!header || !header.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }

  const expectedHex = header.slice(SIGNATURE_PREFIX.length);
  const expected = Buffer.from(expectedHex, 'hex');
  const computed = createHmac('sha256', appSecret).update(rawBody).digest();

  if (expected.length !== computed.length) {
    return false;
  }

  try {
    return timingSafeEqual(expected, computed);
  } catch {
    // Any compare failure must be treated as a verification failure.
    return false;
  }
}
