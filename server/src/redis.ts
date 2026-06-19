import { Redis } from 'ioredis';

const globalForRedis = globalThis as unknown as { redis: Redis };

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

globalForRedis.redis = redis;
export default redis;
