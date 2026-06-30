import "server-only";

import Anthropic from "@anthropic-ai/sdk";

/**
 * Lazily-constructed Anthropic client. Deferring construction avoids throwing at
 * import time (e.g. during `next build`) when `ANTHROPIC_API_KEY` is absent; the
 * key is read from the environment by the SDK on first use.
 */
let cached: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!cached) {
    cached = new Anthropic();
  }
  return cached;
}

/** Model is configurable via env; defaults to the project's Sonnet model. */
export const CHAT_MODEL = process.env.ANTHROPIC_CHAT_MODEL ?? "claude-sonnet-4-6";

/** Architecture §6: chat answers are short; cap output to keep latency/cost low. */
export const MAX_OUTPUT_TOKENS = 2000;
