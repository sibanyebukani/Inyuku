import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import { setAuthCookies, clearAuthCookies } from '../auth-cookies.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  app.get('/__test/set', async (_req, reply) => {
    setAuthCookies(reply, { accessToken: 'at123', refreshToken: 'rt456' });
    return { ok: true };
  });
  app.get('/__test/clear', async (_req, reply) => {
    clearAuthCookies(reply);
    return { ok: true };
  });
  await app.ready();
});

describe('auth-cookies', () => {
  it('sets both cookies with correct attributes', async () => {
    const r = await app.inject({ method: 'GET', url: '/__test/set' });
    expect(r.statusCode).toBe(200);
    const cookies = r.cookies;
    const at = cookies.find((c) => c.name === 'inyuku_at');
    const rt = cookies.find((c) => c.name === 'inyuku_rt');
    expect(at).toBeDefined();
    expect(rt).toBeDefined();
    expect(at?.value).toBe('at123');
    expect(rt?.value).toBe('rt456');
    expect(at?.httpOnly).toBe(true);
    expect(at?.secure).toBe(true);
    expect(at?.sameSite?.toLowerCase()).toBe('lax');
    expect(at?.path).toBe('/');
    expect(rt?.path).toBe('/v1/auth');
  });

  it('clears both cookies', async () => {
    const r = await app.inject({ method: 'GET', url: '/__test/clear' });
    expect(r.statusCode).toBe(200);
    const cookies = r.cookies;
    const at = cookies.find((c) => c.name === 'inyuku_at');
    const rt = cookies.find((c) => c.name === 'inyuku_rt');
    expect(at).toBeDefined();
    expect(rt).toBeDefined();
    expect(at?.value).toBe('');
    expect(rt?.value).toBe('');
  });
});
