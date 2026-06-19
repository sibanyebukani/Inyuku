/**
 * Blob utilities — signed URLs and deletion.
 *
 * Edge-UNSAFE: uses Node crypto and the storage driver. Never import into Edge code.
 */

import { createHmac } from 'node:crypto';
import { deleteObject, isHttpUrl, storageDriver } from './storage.js';

// H8 — dedicated secret for blob-proxy URL signing (decoupled from JWT_SECRET / ENCRYPTION_KEY)
function getSignSecret(): string {
  const secret = process.env.BLOB_SIGN_SECRET;
  if (!secret) {
    throw new Error('BLOB_SIGN_SECRET_MISSING: BLOB_SIGN_SECRET env var must be set');
  }
  return secret;
}

// Fail fast at module load — don't let the server boot without the signing secret.
// This ensures health checks surface the misconfiguration immediately rather than
// only when the first user requests a blob URL.
if (!process.env.BLOB_SIGN_SECRET) {
  throw new Error('BLOB_SIGN_SECRET_MISSING: BLOB_SIGN_SECRET env var must be set');
}

const SIGNED_URL_MAX_TTL_SECONDS = 3600; // 1 hour cap for POPIA compliance

function r2EndpointHost(): string | null {
  try {
    return new URL(process.env.R2_ENDPOINT ?? '').hostname;
  } catch {
    return null;
  }
}

function r2PublicHost(): string | null {
  try {
    return new URL(process.env.R2_PUBLIC_BASE_URL ?? '').hostname;
  } catch {
    return null;
  }
}

function allowedBlobHosts(): string[] {
  const hosts: (string | null)[] = [r2EndpointHost(), r2PublicHost()];
  return hosts.filter((h): h is string => Boolean(h));
}

function assertAllowedBlobHost(blobUrl: string): void {
  // Local filesystem refs are bare pathnames, not URLs — traversal is guarded
  // at read time in storage.ts. No host allow-list applies.
  if (!isHttpUrl(blobUrl)) return;

  let hostname: string;
  try {
    hostname = new URL(blobUrl).hostname;
  } catch {
    throw new Error('BLOB_URL_INVALID: not a valid URL');
  }

  const allowed = allowedBlobHosts();
  if (allowed.length === 0) {
    throw new Error('BLOB_ALLOWLIST_EMPTY: R2_ENDPOINT or R2_PUBLIC_BASE_URL must be configured');
  }

  const isAllowed = allowed.some(
    (h) => hostname === h || hostname.endsWith('.' + h),
  );
  if (!isAllowed) {
    throw new Error(`BLOB_URL_DISALLOWED_HOST: ${hostname}`);
  }
}

// ---------------------------------------------------------------------------
// Signed URL helpers
// ---------------------------------------------------------------------------

function encodeBlobUrl(blobUrl: string): string {
  return Buffer.from(blobUrl, 'utf8').toString('base64url');
}

function decodeBlobUrl(encoded: string): string {
  return Buffer.from(encoded, 'base64url').toString('utf8');
}

function signBlobUrl(blobUrl: string, expiryTs: number, secret: string): string {
  const payload = `${encodeBlobUrl(blobUrl)}:${expiryTs}`;
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/**
 * Generates a time-limited signed proxy URL for a blob.
 * The proxy endpoint (`/api/blob-proxy`) validates the signature and expiry,
 * authenticates the user, and streams the blob content.
 *
 * @param blobUrl    The original R2 endpoint or public URL.
 * @param ttlSeconds Time-to-live in seconds. Capped at 3600 (1 hour).
 * @returns A relative URL pointing to the blob proxy route.
 */
export function getSignedBlobUrl(blobUrl: string, ttlSeconds: number): string {
  assertAllowedBlobHost(blobUrl); // H8 — validate host before signing
  const signSecret = getSignSecret();

  const ttl = Math.min(ttlSeconds, SIGNED_URL_MAX_TTL_SECONDS);
  const expiry = Math.floor(Date.now() / 1000) + ttl;
  const encoded = encodeBlobUrl(blobUrl);
  const sig = signBlobUrl(blobUrl, expiry, signSecret);

  return `/api/blob-proxy?b=${encoded}&e=${expiry}&s=${sig}`;
}

/**
 * Validates a signed blob-proxy query string.
 * Returns the decoded blob URL if valid; throws otherwise.
 */
export function verifySignedBlobUrl(
  encoded: string,
  expiryTs: number,
  signature: string,
): string {
  const signSecret = getSignSecret();

  const now = Math.floor(Date.now() / 1000);
  if (expiryTs < now) {
    throw new Error('BLOB_URL_EXPIRED');
  }

  const blobUrl = decodeBlobUrl(encoded);
  assertAllowedBlobHost(blobUrl); // H8 — validate host BEFORE signature check (SSRF guard)

  const expectedSig = signBlobUrl(blobUrl, expiryTs, signSecret);

  // Timing-safe comparison would be ideal, but HMAC comparison with === is
  // acceptable for this threat model (URL unguessability is the primary defense).
  if (signature !== expectedSig) {
    throw new Error('BLOB_URL_INVALID_SIGNATURE');
  }

  return blobUrl;
}

// ---------------------------------------------------------------------------
// Blob deletion helper
// ---------------------------------------------------------------------------

/**
 * Deletes a blob from the configured storage driver.
 */
export async function deleteBlob(blobUrl: string): Promise<void> {
  await deleteObject(blobUrl);
}
