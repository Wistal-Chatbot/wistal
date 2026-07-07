import type Anthropic from "@anthropic-ai/sdk";

import type { TokenUsageMetadata } from "@/lib/api/chat-types";
import type { MonthlyAiUsageDto } from "@/lib/api/usage-types";

const DEFAULT_WARNING_PERCENT = 80;
const TOKEN_FIELDS = new Set([
  "input_tokens",
  "output_tokens",
  "cache_creation_input_tokens",
  "cache_read_input_tokens",
  "uncached_input_tokens",
  "cached_input_tokens",
]);

/** A fresh zeroed token-usage accumulator (shared by chat + report runs). */
export function createTokenUsageTotals(): TokenUsageMetadata {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    totalTokens: 0,
  };
}

/** Adds one Anthropic API turn's `usage` into `totals` (mutates in place). */
export function addTokenUsage(
  totals: TokenUsageMetadata,
  usage: Anthropic.Usage,
): void {
  totals.inputTokens += usage.input_tokens;
  totals.outputTokens += usage.output_tokens;
  totals.cacheCreationInputTokens += usage.cache_creation_input_tokens ?? 0;
  totals.cacheReadInputTokens += usage.cache_read_input_tokens ?? 0;
  totals.totalTokens =
    totals.inputTokens +
    totals.outputTokens +
    totals.cacheCreationInputTokens +
    totals.cacheReadInputTokens;
}

/** Coerces an app_settings JSONB value (number/string or { value }) to a number. */
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && !isNaN(Number(value))) {
    return Number(value);
  }
  if (typeof value === "object" && value !== null && "value" in value) {
    return toNumber((value as { value: unknown }).value);
  }
  return null;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function startOfNextMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

/** Last calendar day of `date`'s month (UTC), e.g. 31 Jul for any July date. */
export function lastDayOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function formatPeriod(date: Date): string {
  return new Intl.DateTimeFormat("pl-PL", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function sumKnownTokenFields(value: Record<string, unknown>): number | null {
  let total = 0;
  let found = false;

  for (const [key, raw] of Object.entries(value)) {
    if (!TOKEN_FIELDS.has(key) || typeof raw !== "number") continue;
    total += raw;
    found = true;
  }

  return found ? total : null;
}

export function sumAnthropicUsageTokens(payload: unknown): number | null {
  if (Array.isArray(payload)) {
    return payload.reduce<number | null>((total, item) => {
      const itemTotal = sumAnthropicUsageTokens(item);
      if (itemTotal === null) return total;
      return (total ?? 0) + itemTotal;
    }, null);
  }

  if (typeof payload !== "object" || payload === null) return null;

  const object = payload as Record<string, unknown>;
  const ownTokenTotal = sumKnownTokenFields(object);
  if (ownTokenTotal !== null) return ownTokenTotal;

  return Object.values(object).reduce<number | null>((total, item) => {
    const itemTotal = sumAnthropicUsageTokens(item);
    if (itemTotal === null) return total;
    return (total ?? 0) + itemTotal;
  }, null);
}

/**
 * Sums Anthropic Cost Report amounts, returning the total in **cents**, or null
 * when the payload carries no cost items. Each `data[].results[].amount` is a
 * decimal string in the lowest currency unit (cents) — e.g. `"123.45"` = 123.45
 * cents = $1.2345 — so callers divide by 100 to get USD.
 */
export function sumAnthropicCostCents(payload: unknown): number | null {
  if (typeof payload !== "object" || payload === null) return null;
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;

  let totalCents = 0;
  let found = false;

  for (const bucket of data) {
    if (typeof bucket !== "object" || bucket === null) continue;
    const results = (bucket as { results?: unknown }).results;
    if (!Array.isArray(results)) continue;

    for (const item of results) {
      const amount =
        item && typeof item === "object"
          ? (item as { amount?: unknown }).amount
          : undefined;
      const cents =
        typeof amount === "string"
          ? Number(amount)
          : typeof amount === "number"
            ? amount
            : NaN;
      if (Number.isFinite(cents)) {
        totalCents += cents;
        found = true;
      }
    }
  }

  return found ? totalCents : null;
}

interface BuildMonthlyAiUsageInput {
  limitTokens: number | null;
  usedTokens: number | null;
  warningPercent: number | null;
  now?: Date;
}

export function buildMonthlyAiUsage({
  limitTokens,
  usedTokens,
  warningPercent,
  now = new Date(),
}: BuildMonthlyAiUsageInput): MonthlyAiUsageDto {
  const normalizedLimit =
    limitTokens !== null && limitTokens > 0 ? Math.floor(limitTokens) : null;
  const normalizedUsed =
    usedTokens !== null && usedTokens >= 0 ? Math.floor(usedTokens) : null;
  const normalizedWarning = clampPercent(
    warningPercent ?? DEFAULT_WARNING_PERCENT,
  );
  const period = formatPeriod(now);

  if (normalizedLimit === null || normalizedUsed === null) {
    return {
      status: "usage_unavailable",
      period,
      limitTokens: normalizedLimit,
      usedTokens: normalizedUsed,
      remainingTokens: null,
      percent: null,
      warningPercent: normalizedWarning,
      usageAvailable: false,
    };
  }

  const percent = Math.round((normalizedUsed / normalizedLimit) * 100);
  const remainingTokens = Math.max(0, normalizedLimit - normalizedUsed);
  const status =
    normalizedUsed >= normalizedLimit
      ? "exceeded"
      : percent >= normalizedWarning
        ? "warning"
        : "normal";

  return {
    status,
    period,
    limitTokens: normalizedLimit,
    usedTokens: normalizedUsed,
    remainingTokens,
    percent,
    warningPercent: normalizedWarning,
    usageAvailable: true,
  };
}
