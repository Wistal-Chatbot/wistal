import "server-only";

import { checkRateLimit, type RateLimitResult } from "@/lib/auth/rate-limit";

export const AI_REQUESTS_PER_MINUTE = 10;
export const AI_REQUESTS_PER_DAY = 200;

export async function checkAiRequestRateLimit(
  userId: string,
): Promise<RateLimitResult | null> {
  const [perMinute, perDay] = await Promise.all([
    checkRateLimit({
      namespace: "ai",
      key: `user:${userId}:minute`,
      limit: AI_REQUESTS_PER_MINUTE,
      windowSeconds: 60,
    }),
    checkRateLimit({
      namespace: "ai",
      key: `user:${userId}:day`,
      limit: AI_REQUESTS_PER_DAY,
      windowSeconds: 24 * 60 * 60,
    }),
  ]);

  return !perMinute.allowed ? perMinute : !perDay.allowed ? perDay : null;
}
