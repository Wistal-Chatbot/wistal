import "server-only";

import { Redis } from "@upstash/redis";

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;

if (!url || !token) {
  throw new Error(
    "KV_REST_API_URL or KV_REST_API_TOKEN environment variable is not set",
  );
}

// Single Upstash REST client, reused for OTP storage and rate limiting.
export const redis = new Redis({ url, token });
