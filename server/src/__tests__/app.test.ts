import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

describe('app', () => {
  it('404 returns the error envelope', async () => {
    const r = await app.inject({ method: 'GET', url: '/nope' });
    expect(r.statusCode).toBe(404);
    expect(r.json()).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });
});
