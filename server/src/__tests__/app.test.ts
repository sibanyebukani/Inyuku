import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as Sentry from '@sentry/node';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(() => ''),
}));

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

  it('captures unexpected errors in Sentry and still returns an envelope', async () => {
    const capture = vi.mocked(Sentry.captureException);
    capture.mockClear();
    const obsApp = buildApp();
    obsApp.get('/__throw', async () => {
      throw new Error('boom');
    });
    await obsApp.ready();
    try {
      const r = await obsApp.inject({ method: 'GET', url: '/__throw' });
      expect(r.statusCode).toBe(500);
      expect(r.json()).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
      expect(capture).toHaveBeenCalled();
    } finally {
      await obsApp.close();
    }
  });
});
