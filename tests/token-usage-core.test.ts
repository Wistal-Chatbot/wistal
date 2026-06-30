import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMonthlyAiUsage,
  sumAnthropicUsageTokens,
  toNumber,
} from "../lib/ai/token-usage-core";

const now = new Date("2026-06-30T12:00:00.000Z");

test("toNumber reads plain and app_settings JSON values", () => {
  assert.equal(toNumber(42), 42);
  assert.equal(toNumber("42"), 42);
  assert.equal(toNumber({ value: "80" }), 80);
  assert.equal(toNumber({ value: 1_000_000 }), 1_000_000);
  assert.equal(toNumber({ value: "abc" }), null);
});

test("buildMonthlyAiUsage returns normal below the warning threshold", () => {
  const usage = buildMonthlyAiUsage({
    limitTokens: 1_000,
    usedTokens: 240,
    warningPercent: 80,
    now,
  });

  assert.equal(usage.status, "normal");
  assert.equal(usage.percent, 24);
  assert.equal(usage.remainingTokens, 760);
  assert.equal(usage.usageAvailable, true);
});

test("buildMonthlyAiUsage returns warning at the configured threshold", () => {
  const usage = buildMonthlyAiUsage({
    limitTokens: 1_000,
    usedTokens: 820,
    warningPercent: 80,
    now,
  });

  assert.equal(usage.status, "warning");
  assert.equal(usage.percent, 82);
});

test("buildMonthlyAiUsage returns exceeded when usage reaches the limit", () => {
  const usage = buildMonthlyAiUsage({
    limitTokens: 1_000,
    usedTokens: 1_000,
    warningPercent: 80,
    now,
  });

  assert.equal(usage.status, "exceeded");
  assert.equal(usage.remainingTokens, 0);
});

test("buildMonthlyAiUsage falls back to usage_unavailable without live usage", () => {
  const usage = buildMonthlyAiUsage({
    limitTokens: 1_000,
    usedTokens: null,
    warningPercent: 80,
    now,
  });

  assert.equal(usage.status, "usage_unavailable");
  assert.equal(usage.percent, null);
  assert.equal(usage.usageAvailable, false);
});

test("sumAnthropicUsageTokens sums token fields without double counting parents", () => {
  const tokens = sumAnthropicUsageTokens({
    data: [
      {
        results: [
          {
            uncached_input_tokens: 100,
            cache_creation_input_tokens: 20,
            cache_read_input_tokens: 30,
            output_tokens: 50,
          },
          {
            input_tokens: 40,
            output_tokens: 10,
          },
        ],
      },
    ],
  });

  assert.equal(tokens, 250);
});
