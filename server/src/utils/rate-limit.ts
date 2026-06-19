import { redis } from '../redis.js';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Fixed-window rate limit backed by Redis.
 *
 * @param key      Identifier for the bucket (e.g. `ip:${ip}:leads`)
 * @param limit    Maximum allowed requests in the window
 * @param windowMs Window size in milliseconds
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  // Only bypass when explicitly opted-in — never trust NODE_ENV for security gates (H1)
  if (process.env.RATE_LIMIT_DISABLED === 'true') {
    return { allowed: true, remaining: Infinity, resetAt: 0 };
  }

  const now = Date.now();
  const bucketIndex = Math.floor(now / windowMs);
  const bucketKey = `rate:${key}:${bucketIndex}`;

  const pipeline = redis.pipeline();
  pipeline.incr(bucketKey);
  pipeline.pexpire(bucketKey, windowMs);
  const results = await pipeline.exec();

  const count = (results?.[0]?.[1] as number | undefined) ?? 1;
  const resetAt = (bucketIndex + 1) * windowMs;

  if (count > limit) {
    return { allowed: false, remaining: 0, resetAt };
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - count),
    resetAt,
  };
}
