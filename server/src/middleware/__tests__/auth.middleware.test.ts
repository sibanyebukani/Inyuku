import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import { signAccessToken } from '../../utils/jwt.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  app.register(async (app) => {
    app.get('/__test/protected', { preHandler: [app.authenticate] }, async (req) => {
      return { ok: true, user: req.user };
    });
  });
  await app.ready();
});

describe('auth middleware', () => {
  it('returns 401 AUTH_MISSING_BEARER without cookie', async () => {
    const r = await app.inject({ method: 'GET', url: '/__test/protected' });
    expect(r.statusCode).toBe(401);
    expect(r.json()).toMatchObject({ ok: false, error: { code: 'AUTH_MISSING_BEARER' } });
  });

  it('returns 401 AUTH_INVALID_TOKEN for tampered token', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/__test/protected',
      headers: { Authorization: 'Bearer invalid.token.here' },
    });
    expect(r.statusCode).toBe(401);
    expect(r.json()).toMatchObject({ ok: false, error: { code: 'AUTH_INVALID_TOKEN' } });
  });

  it('allows valid access cookie and populates req.user', async () => {
    const token = await signAccessToken({
      sub: 'u1',
      email: 'a@b.co.za',
      status: 'ACTIVE',
      memberships: [{ businessId: 'b1', role: 'MERCHANT_OWNER', permissions: [] }],
    });
    const r = await app.inject({
      method: 'GET',
      url: '/__test/protected',
      cookies: { inyuku_at: token },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.ok).toBe(true);
    expect(body.user.sub).toBe('u1');
    expect(body.user.email).toBe('a@b.co.za');
  });

  it('allows valid Bearer header', async () => {
    const token = await signAccessToken({
      sub: 'u2',
      email: 'b@b.co.za',
      status: 'ACTIVE',
      memberships: [],
    });
    const r = await app.inject({
      method: 'GET',
      url: '/__test/protected',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().user.sub).toBe('u2');
  });

  it('returns 403 AUTH_ACCOUNT_INACTIVE for suspended users', async () => {
    const token = await signAccessToken({
      sub: 'u3',
      email: 'c@b.co.za',
      status: 'SUSPENDED',
      memberships: [],
    });
    const r = await app.inject({
      method: 'GET',
      url: '/__test/protected',
      cookies: { inyuku_at: token },
    });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ ok: false, error: { code: 'AUTH_ACCOUNT_INACTIVE' } });
  });
});
