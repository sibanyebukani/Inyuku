import type { FastifyReply } from 'fastify';

const ACCESS_COOKIE = 'inyuku_at';
const REFRESH_COOKIE = 'inyuku_rt';
const ACCESS_TTL_MS = 15 * 60 * 1000; // 15 minutes
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function cookieDomain(): string | undefined {
  const raw = process.env.COOKIE_DOMAIN;
  return raw && raw.trim().length > 0 ? raw.trim() : undefined;
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Set the access + refresh HttpOnly cookies.
 */
export function setAuthCookies(reply: FastifyReply, tokens: Tokens): void {
  const domain = cookieDomain();
  reply.setCookie(ACCESS_COOKIE, tokens.accessToken, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: ACCESS_TTL_MS,
    ...(domain ? { domain } : {}),
  });
  reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, {
    path: '/v1/auth',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: REFRESH_TTL_MS,
    ...(domain ? { domain } : {}),
  });
}

/**
 * Clear both auth cookies server-side.
 */
export function clearAuthCookies(reply: FastifyReply): void {
  const domain = cookieDomain();
  reply.clearCookie(ACCESS_COOKIE, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    ...(domain ? { domain } : {}),
  });
  reply.clearCookie(REFRESH_COOKIE, {
    path: '/v1/auth',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    ...(domain ? { domain } : {}),
  });
}

export { ACCESS_COOKIE, REFRESH_COOKIE };
