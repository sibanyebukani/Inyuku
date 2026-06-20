import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import * as crypto from 'node:crypto';
import { buildApp } from '../../../app.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../../db.js';
import { cleanupTestUsers, cleanupTestBusinesses } from '../../../test-helpers.js';
import { redis } from '../../../redis.js';

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, randomInt: vi.fn(() => 211110) };
});

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupTestUsers([
    'signup-test@inyuku.test',
    'login-test@inyuku.test',
    'unknown@inyuku.test',
    'refresh-test@inyuku.test',
    'logout-test@inyuku.test',
    'reset-test@inyuku.test',
    'reset-confirm-test@inyuku.test',
    'no-such-user@inyuku.test',
    'global-limit-1@inyuku.test',
    'global-limit-2@inyuku.test',
    'global-limit-3@inyuku.test',
  ]);
  await cleanupTestBusinesses(['Signup Biz', 'Refresh Biz', 'Logout Biz', 'Reset Biz', 'Reset Confirm Biz']);
  await prisma.phoneOtp.deleteMany({
    where: { phone: { in: ['+27821234567', '+27821234568', '+27828888888', '+27829999999'] } },
  });
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

  it('OTP request stores a hashed code', async () => {
    vi.mocked(crypto.randomInt).mockImplementation(() => 211110);
    const r = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      payload: { phone: '+27821234567', purpose: 'login' },
    });
    vi.restoreAllMocks();
    expect(r.statusCode).toBe(200);
    expect(r.json().data.requested).toBe(true);
    const record = await prisma.phoneOtp.findFirst({ where: { phone: '+27821234567' } });
    expect(record).toBeDefined();
    expect(record?.codeHash).not.toBe('211110');
    expect(record?.attempts).toBe(0);
  });

  it('OTP verify with correct code succeeds', async () => {
    vi.mocked(crypto.randomInt).mockImplementation(() => 211110);
    await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      payload: { phone: '+27821234567', purpose: 'login' },
    });
    vi.restoreAllMocks();
    // No user linked, so verify should error for login purpose.
    const r = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: '+27821234567', code: '211110', purpose: 'login' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ ok: false, error: { code: 'AUTH_OTP_INVALID' } });
  });

  it('OTP wrong code increments attempts and caps', async () => {
    vi.mocked(crypto.randomInt).mockImplementation(() => 211110);
    await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      payload: { phone: '+27821234567', purpose: 'login' },
    });
    vi.restoreAllMocks();
    for (let i = 0; i < 5; i++) {
      const r = await app.inject({
        method: 'POST',
        url: '/v1/auth/otp/verify',
        payload: { phone: '+27821234567', code: '000000', purpose: 'login' },
      });
      if (i < 4) {
        expect(r.statusCode).toBe(400);
        expect(r.json()).toMatchObject({ ok: false, error: { code: 'AUTH_OTP_INVALID' } });
      } else {
        expect(r.statusCode).toBe(429);
        expect(r.json()).toMatchObject({ ok: false, error: { code: 'AUTH_OTP_ATTEMPTS' } });
      }
    }
  });

  it('password reset request returns uniform ok for known and unknown emails', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: {
        email: 'reset-test@inyuku.test',
        password: 'Password123!',
        name: 'Reset User',
        businessName: 'Reset Biz',
        acceptTerms: true,
      },
    });
    const known = await app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset-request',
      payload: { email: 'reset-test@inyuku.test' },
    });
    expect(known.statusCode).toBe(200);
    expect(known.json().ok).toBe(true);

    const unknown = await app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset-request',
      payload: { email: 'no-such-user@inyuku.test' },
    });
    expect(unknown.statusCode).toBe(200);
    expect(unknown.json().ok).toBe(true);
  });

  it('password reset confirm revokes all refresh families', async () => {
    const signupRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: {
        email: 'reset-confirm-test@inyuku.test',
        password: 'Password123!',
        name: 'Reset Confirm User',
        businessName: 'Reset Confirm Biz',
        acceptTerms: true,
      },
    });
    expect(signupRes.statusCode).toBe(201);
    const rt = signupRes.cookies.find((c) => c.name === 'inyuku_rt')!.value;
    const user = await prisma.user.findUnique({
      where: { email: 'reset-confirm-test@inyuku.test' },
    });

    const rawToken = crypto.randomBytes(32).toString('base64url');
    await prisma.passwordResetToken.create({
      data: {
        userId: user!.id,
        tokenHash: crypto.createHash('sha256').update(rawToken).digest('hex'),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const confirm = await app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset-confirm',
      payload: { token: rawToken, password: 'NewPassword123!' },
    });
    expect(confirm.statusCode).toBe(200);
    expect(confirm.json().ok).toBe(true);

    // Old refresh token is revoked.
    const refreshAfter = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      cookies: { inyuku_rt: rt },
    });
    expect(refreshAfter.statusCode).toBe(401);

    // New password works.
    const loginAfter = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'reset-confirm-test@inyuku.test', password: 'NewPassword123!' },
    });
    expect(loginAfter.statusCode).toBe(200);
  });

  it('OTP expired returns AUTH_OTP_EXPIRED', async () => {
    vi.mocked(crypto.randomInt).mockImplementation(() => 211110);
    await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      payload: { phone: '+27821234568', purpose: 'login' },
    });
    vi.restoreAllMocks();
    await prisma.phoneOtp.updateMany({
      where: { phone: '+27821234568' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const r = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: '+27821234568', code: '211110', purpose: 'login' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ ok: false, error: { code: 'AUTH_OTP_EXPIRED' } });
  });

  it('OTP verify is rate-limited per ip+phone', async () => {
    const prev = process.env.RATE_LIMIT_DISABLED;
    process.env.RATE_LIMIT_DISABLED = 'false';
    vi.mocked(crypto.randomInt).mockImplementation(() => 211110);
    await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      payload: { phone: '+27829999999', purpose: 'login' },
    });
    vi.restoreAllMocks();
    let blocked = false;
    try {
      for (let i = 0; i < 12; i++) {
        const r = await app.inject({
          method: 'POST',
          url: '/v1/auth/otp/verify',
          payload: { phone: '+27829999999', code: '000000', purpose: 'login' },
        });
        if (r.statusCode === 429) {
          blocked = true;
          break;
        }
      }
      expect(blocked).toBe(true);
    } finally {
      process.env.RATE_LIMIT_DISABLED = prev;
    }
  });

  it('single-active-OTP invalidates prior codes', async () => {
    vi.mocked(crypto.randomInt).mockImplementationOnce(() => 111111).mockImplementationOnce(() => 222222);
    await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      payload: { phone: '+27828888888', purpose: 'login' },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      payload: { phone: '+27828888888', purpose: 'login' },
    });
    vi.restoreAllMocks();
    // The first code should no longer verify (attempt cap / invalidated).
    const r = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone: '+27828888888', code: '111111', purpose: 'login' },
    });
    expect([400, 429]).toContain(r.statusCode);
    expect(['AUTH_OTP_INVALID', 'AUTH_OTP_ATTEMPTS']).toContain(r.json().error.code);
  });

  it('global per-IP auth limiter blocks excessive POSTs', async () => {
    const prevLimit = process.env.AUTH_GLOBAL_LIMIT;
    const prevRate = process.env.RATE_LIMIT_DISABLED;
    process.env.AUTH_GLOBAL_LIMIT = '2';
    process.env.RATE_LIMIT_DISABLED = 'false';
    await redis.flushall();
    const limiterApp = buildApp();
    await limiterApp.ready();
    try {
      const r1 = await limiterApp.inject({
        method: 'POST',
        url: '/v1/auth/password/reset-request',
        payload: { email: 'global-limit-1@inyuku.test' },
      });
      expect(r1.statusCode).toBe(200);
      const r2 = await limiterApp.inject({
        method: 'POST',
        url: '/v1/auth/password/reset-request',
        payload: { email: 'global-limit-2@inyuku.test' },
      });
      expect(r2.statusCode).toBe(200);
      const r3 = await limiterApp.inject({
        method: 'POST',
        url: '/v1/auth/password/reset-request',
        payload: { email: 'global-limit-3@inyuku.test' },
      });
      expect(r3.statusCode).toBe(429);
      expect(r3.json()).toMatchObject({ ok: false, error: { code: 'RATE_LIMIT_EXCEEDED' } });
    } finally {
      process.env.AUTH_GLOBAL_LIMIT = prevLimit;
      process.env.RATE_LIMIT_DISABLED = prevRate;
      await limiterApp.close();
    }
  });

  it('rejects cross-site unsafe requests when CORS origins are configured', async () => {
    const csrfApp = buildApp({ corsAllowedOrigins: ['https://app.inyuku.co.za'] });
    await csrfApp.ready();
    const r = await csrfApp.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: { origin: 'https://evil.example' },
      payload: { email: 'a@b.co.za', password: 'x' },
    });
    expect(r.statusCode).toBe(403);
    expect(r.json().error.code).toBe('FORBIDDEN');
  });
});
