import "server-only";

import { redis } from "./redis";

export interface RateLimitOptions {
  /** Logical bucket, e.g. "otp:email" → key becomes rl:otp:email:{key}. */
  namespace: string;
  /** Per-subject identifier, e.g. the email or IP. */
  key: string;
  /** Max allowed hits within the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window rate limit backed by Redis INCR + EXPIRE. The TTL is set only on
 * the first hit of a window, so the window slides forward once it elapses.
 */
export async function checkRateLimit({
  namespace,
  key,
  limit,
  windowSeconds,
}: RateLimitOptions): Promise<RateLimitResult> {
  const redisKey = `rl:${namespace}:${key}`;
  const count = await redis.incr(redisKey);

  if (count === 1) {
    await redis.expire(redisKey, windowSeconds);
  }

  if (count > limit) {
    const ttl = await redis.ttl(redisKey);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: 0,
  };
}
