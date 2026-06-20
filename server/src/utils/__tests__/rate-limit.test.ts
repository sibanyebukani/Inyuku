import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { checkRateLimit } from '../rate-limit.js';

describe('rate-limit', () => {
  let original: string | undefined;

  beforeAll(() => {
    original = process.env.RATE_LIMIT_DISABLED;
    process.env.RATE_LIMIT_DISABLED = 'false';
  });

  afterAll(() => {
    process.env.RATE_LIMIT_DISABLED = original;
  });

  it('allows the first N requests then blocks', async () => {
    const key = `test:${Date.now()}`;
    const limit = 2;
    const windowMs = 10_000;

    const r1 = await checkRateLimit(key, limit, windowMs);
    expect(r1.allowed).toBe(true);

    const r2 = await checkRateLimit(key, limit, windowMs);
    expect(r2.allowed).toBe(true);

    const r3 = await checkRateLimit(key, limit, windowMs);
    expect(r3.allowed).toBe(false);
  });
});
