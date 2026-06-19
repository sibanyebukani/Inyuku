import { SignJWT, jwtVerify } from 'jose';
import { randomBytes, createHash } from 'node:crypto';
import { AuthError } from './errors.js';

export interface AccessMembershipClaim {
  businessId: string;
  role: string;
  permissions: string[];
}

export interface AccessClaims {
  sub: string;
  email: string;
  memberships: AccessMembershipClaim[];
}

const ACCESS_ALG = 'HS256';
const ACCESS_TTL_SEC = 15 * 60; // 15 minutes

function getSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw) throw new AuthError('CONFIG_ERROR', 'JWT_SECRET is not configured', 500);
  return new TextEncoder().encode(raw);
}

function getPreviousSecret(): Uint8Array | undefined {
  const raw = process.env.JWT_SECRET_PREVIOUS;
  if (!raw) return undefined;
  return new TextEncoder().encode(raw);
}

/**
 * Sign a short-lived access token (HS256, 15 minutes).
 */
export async function signAccessToken(payload: AccessClaims): Promise<string> {
  return await new SignJWT({
    sub: payload.sub,
    email: payload.email,
    memberships: payload.memberships,
  })
    .setProtectedHeader({ alg: ACCESS_ALG })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .sign(getSecret());
}

/**
 * Verify an access token, accepting the previous secret during rotation.
 */
export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const secrets = [getSecret()];
  const previous = getPreviousSecret();
  if (previous) secrets.push(previous);

  let lastError: unknown;
  for (const secret of secrets) {
    try {
      const { payload } = await jwtVerify(token, secret, { algorithms: [ACCESS_ALG] });
      const claims = payload as unknown as Partial<AccessClaims>;
      if (!claims.sub || !claims.email || !Array.isArray(claims.memberships)) {
        throw new AuthError('AUTH_INVALID_TOKEN', 'Malformed access token');
      }
      return claims as AccessClaims;
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError instanceof Error && lastError.name === 'JWTExpired') {
    throw new AuthError('AUTH_INVALID_TOKEN', 'Access token expired');
  }
  throw new AuthError('AUTH_INVALID_TOKEN', 'Invalid access token');
}

/**
 * Generate a new opaque refresh token and its sha256 hash.
 */
export function generateRefreshToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashRefreshToken(token);
  return { token, tokenHash };
}

/**
 * Sha256 hash of a raw refresh token (hex).
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
