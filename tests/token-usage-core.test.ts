import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMonthlyAiUsage,
  lastDayOfMonth,
  sumAnthropicCostCents,
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

test("lastDayOfMonth returns the final calendar day (UTC)", () => {
  assert.equal(
    lastDayOfMonth(new Date("2026-07-07T00:00:00.000Z")).toISOString(),
    "2026-07-31T00:00:00.000Z",
  );
  assert.equal(
    lastDayOfMonth(new Date("2026-02-15T00:00:00.000Z")).toISOString(),
    "2026-02-28T00:00:00.000Z",
  );
  assert.equal(
    lastDayOfMonth(new Date("2024-02-10T00:00:00.000Z")).toISOString(),
    "2024-02-29T00:00:00.000Z",
  );
});

test("sumAnthropicCostCents sums decimal-string cents across buckets", () => {
  const cents = sumAnthropicCostCents({
    data: [
      { results: [{ amount: "123.45", currency: "USD" }] },
      {
        results: [
          { amount: "10", currency: "USD" },
          { amount: "0.55", currency: "USD" },
        ],
      },
    ],
    has_more: false,
  });

  assert.equal(cents, 134);
});

test("sumAnthropicCostCents returns null when there are no cost items", () => {
  assert.equal(sumAnthropicCostCents({ data: [] }), null);
  assert.equal(sumAnthropicCostCents({ data: [{ results: [] }] }), null);
  assert.equal(sumAnthropicCostCents(null), null);
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
