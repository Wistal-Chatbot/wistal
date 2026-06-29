import "server-only";

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import { redis } from "./redis";

const OTP_TTL_SECONDS = 10 * 60; // codes expire after 10 minutes
const MAX_ATTEMPTS = 5;

interface StoredOtp {
  codeHash: string;
  attempts: number;
  maxAttempts: number;
}

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; reason: "expired" | "mismatch" | "too_many_attempts" };

function otpKey(email: string): string {
  return `otp:${email}`;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return secret;
}

/** A 6-digit numeric code, generated with a CSPRNG. */
export function generateOtpCode(): string {
  return randomInt(100000, 1000000).toString();
}

/** Keyed HMAC-SHA256 — codes are never stored in plaintext. */
export function hashOtp(code: string): string {
  return createHmac("sha256", getSecret()).update(code).digest("hex");
}

function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Store a fresh OTP for an email, replacing any previous one. */
export async function storeOtp(email: string, code: string): Promise<void> {
  const payload: StoredOtp = {
    codeHash: hashOtp(code),
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
  };
  await redis.set(otpKey(email), payload, { ex: OTP_TTL_SECONDS });
}

/**
 * Verify a submitted code. On success the OTP is consumed (deleted). On a wrong
 * code the attempt counter is incremented and the OTP is dropped once the limit
 * is reached, so a code can't be brute-forced within its TTL.
 */
export async function verifyOtp(
  email: string,
  code: string,
): Promise<VerifyOtpResult> {
  const key = otpKey(email);
  const stored = await redis.get<StoredOtp>(key);

  if (!stored) {
    return { ok: false, reason: "expired" };
  }

  if (hashesMatch(stored.codeHash, hashOtp(code))) {
    await redis.del(key);
    return { ok: true };
  }

  const attempts = stored.attempts + 1;
  if (attempts >= stored.maxAttempts) {
    await redis.del(key);
    return { ok: false, reason: "too_many_attempts" };
  }

  // Preserve the remaining TTL so attempts can't extend the code's lifetime.
  const ttl = await redis.ttl(key);
  await redis.set(
    key,
    { ...stored, attempts } satisfies StoredOtp,
    { ex: ttl > 0 ? ttl : OTP_TTL_SECONDS },
  );
  return { ok: false, reason: "mismatch" };
}
