import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { buildApp } from '../../../app.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../../db.js';
import { cleanupTestUsers, cleanupTestBusinesses } from '../../../test-helpers.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterEach(async () => {
  await cleanupTestUsers([
    'signup-test@inyuku.test',
    'login-test@inyuku.test',
    'unknown@inyuku.test',
    'refresh-test@inyuku.test',
    'logout-test@inyuku.test',
  ]);
  await cleanupTestBusinesses(['Signup Biz', 'Refresh Biz', 'Logout Biz']);
});

describe('auth routes', () => {
  it('signup creates user, business, membership and sets cookies', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: {
        email: 'signup-test@inyuku.test',
        password: 'Password123!',
        name: 'Signup User',
        businessName: 'Signup Biz',
        acceptTerms: true,
      },
    });
    expect(r.statusCode).toBe(201);
    const body = r.json();
    expect(body.ok).toBe(true);
    expect(body.data.user.email).toBe('signup-test@inyuku.test');
    expect(body.data.membership.role).toBe('MERCHANT_OWNER');
    const cookies = r.cookies;
    expect(cookies.some((c) => c.name === 'inyuku_at')).toBe(true);
    expect(cookies.some((c) => c.name === 'inyuku_rt')).toBe(true);
  });

  it('rejects duplicate email with CONFLICT', async () => {
    const payload = {
      email: 'signup-test@inyuku.test',
      password: 'Password123!',
      name: 'Signup User',
      businessName: 'Signup Biz',
      acceptTerms: true,
    };
    const first = await app.inject({ method: 'POST', url: '/v1/auth/signup', payload });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({ method: 'POST', url: '/v1/auth/signup', payload });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ ok: false, error: { code: 'CONFLICT_DUPLICATE' } });
  });

  it('login success sets cookies and returns memberships', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: {
        email: 'login-test@inyuku.test',
        password: 'Password123!',
        name: 'Login User',
        businessName: 'Signup Biz',
        acceptTerms: true,
      },
    });
    const r = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'login-test@inyuku.test', password: 'Password123!' },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.ok).toBe(true);
    expect(body.data.user.email).toBe('login-test@inyuku.test');
    expect(body.data.memberships.length).toBeGreaterThan(0);
    expect(r.cookies.some((c) => c.name === 'inyuku_at')).toBe(true);
    expect(r.cookies.some((c) => c.name === 'inyuku_rt')).toBe(true);
  });

  it('wrong password returns AUTH_INVALID_CREDENTIALS', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: {
        email: 'login-test@inyuku.test',
        password: 'Password123!',
        name: 'Login User',
        businessName: 'Signup Biz',
        acceptTerms: true,
      },
    });
    const r = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'login-test@inyuku.test', password: 'WrongPassword1!' },
    });
    expect(r.statusCode).toBe(401);
    expect(r.json()).toMatchObject({ ok: false, error: { code: 'AUTH_INVALID_CREDENTIALS' } });
  });

  it('unknown email returns same AUTH_INVALID_CREDENTIALS (no enumeration)', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'unknown@inyuku.test', password: 'Password123!' },
    });
    expect(r.statusCode).toBe(401);
    expect(r.json()).toMatchObject({ ok: false, error: { code: 'AUTH_INVALID_CREDENTIALS' } });
  });

  it('escalating lockout after 5 failures', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: {
        email: 'login-test@inyuku.test',
        password: 'Password123!',
        name: 'Login User',
        businessName: 'Signup Biz',
        acceptTerms: true,
      },
    });
    for (let i = 0; i < 5; i++) {
      const r = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email: 'login-test@inyuku.test', password: 'WrongPassword1!' },
      });
      if (i < 4) {
        expect(r.statusCode).toBe(401);
      } else {
        expect(r.statusCode).toBe(403);
        expect(r.json()).toMatchObject({ ok: false, error: { code: 'AUTH_ACCOUNT_LOCKED' } });
      }
    }
    // Correct password while locked still rejected
    const locked = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'login-test@inyuku.test', password: 'Password123!' },
    });
    expect(locked.statusCode).toBe(403);
    expect(locked.json()).toMatchObject({ ok: false, error: { code: 'AUTH_ACCOUNT_LOCKED' } });
  });

  it('refresh rotates token and reusing old token revokes family', async () => {
    const signupRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: {
        email: 'refresh-test@inyuku.test',
        password: 'Password123!',
        name: 'Refresh User',
        businessName: 'Refresh Biz',
        acceptTerms: true,
      },
    });
    expect(signupRes.statusCode).toBe(201);
    const rt1 = signupRes.cookies.find((c) => c.name === 'inyuku_rt')!.value;

    // First refresh: rt1 -> rt2
    const refresh1 = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { inyuku_rt: rt1 },
    });
    expect(refresh1.statusCode).toBe(200);
    const rt2 = refresh1.cookies.find((c) => c.name === 'inyuku_rt')!.value;
    expect(rt2).not.toBe(rt1);

    // Reuse rt1 -> family revoked, rt2 also dead
    const reuse = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { inyuku_rt: rt1 },
    });
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json()).toMatchObject({ ok: false, error: { code: 'AUTH_REFRESH_REUSE' } });

    const dead = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { inyuku_rt: rt2 },
    });
    expect(dead.statusCode).toBe(401);
  });

  it('logout revokes refresh family', async () => {
    const signupRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: {
        email: 'logout-test@inyuku.test',
        password: 'Password123!',
        name: 'Logout User',
        businessName: 'Logout Biz',
        acceptTerms: true,
      },
    });
    expect(signupRes.statusCode).toBe(201);
    const at = signupRes.cookies.find((c) => c.name === 'inyuku_at')!.value;
    const rt = signupRes.cookies.find((c) => c.name === 'inyuku_rt')!.value;

    const logoutRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      cookies: { inyuku_at: at, inyuku_rt: rt },
    });
    expect(logoutRes.statusCode).toBe(200);
    expect(logoutRes.cookies.some((c) => c.name === 'inyuku_at' && c.value === '')).toBe(true);
    expect(logoutRes.cookies.some((c) => c.name === 'inyuku_rt' && c.value === '')).toBe(true);

    const after = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { inyuku_rt: rt },
    });
    expect(after.statusCode).toBe(401);
  });
});
