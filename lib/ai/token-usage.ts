import "server-only";

import type { MonthlyAiUsageDto } from "@/lib/api/usage-types";
import { getAppSetting } from "@/lib/db/queries";
import { log, preview } from "@/lib/log";
import {
  buildMonthlyAiUsage,
  lastDayOfMonth,
  startOfMonth,
  startOfNextMonth,
  sumAnthropicCostCents,
  sumAnthropicUsageTokens,
  toNumber,
} from "./token-usage-core";

export interface TokenLimitCheck {
  allowed: boolean;
  /** Set when blocked, for the API response. */
  code?: "AI_MONTHLY_TOKEN_LIMIT_EXCEEDED";
  /** False when live usage couldn't be fetched (we then never block). */
  usageAvailable: boolean;
}

const ANTHROPIC_USAGE_URL =
  "https://api.anthropic.com/v1/organizations/usage_report/messages";

const ANTHROPIC_COST_URL =
  "https://api.anthropic.com/v1/organizations/cost_report";

function settingShape(value: unknown): string {
  if (value === null) return "missing";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object" && "value" in value) return "object_with_value";
  return typeof value;
}

interface FetchLiveMonthlyTokensOptions {
  now?: Date;
  fetchImpl?: typeof fetch;
  apiKey?: string | null;
  usageUrl?: string;
}

/**
 * Best-effort live monthly token usage. The DB only stores the *limit*; usage is
 * fetched live from the provider when possible. If Anthropic usage is unavailable
 * for any reason, callers receive null and must not block AI calls.
 */
export async function fetchLiveMonthlyTokens(
  options: FetchLiveMonthlyTokensOptions = {},
): Promise<number | null> {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_ADMIN_KEY ?? null;
  if (!apiKey) {
    log.warn("ai.usage", "live usage unavailable: missing ANTHROPIC_ADMIN_KEY", {
      hasUsageUrlOverride: Boolean(process.env.ANTHROPIC_USAGE_API_URL),
      hasBetaHeader: Boolean(process.env.ANTHROPIC_USAGE_BETA_HEADER),
    });
    return null;
  }

  const now = options.now ?? new Date();
  const url = new URL(
    options.usageUrl ?? process.env.ANTHROPIC_USAGE_API_URL ?? ANTHROPIC_USAGE_URL,
  );
  url.searchParams.set("starting_at", startOfMonth(now).toISOString());
  url.searchParams.set("ending_at", startOfNextMonth(now).toISOString());
  url.searchParams.set("bucket_width", "1d");

  const headers: Record<string, string> = {
    "x-api-key": apiKey,
    "anthropic-version": process.env.ANTHROPIC_VERSION ?? "2023-06-01",
  };
  if (process.env.ANTHROPIC_USAGE_BETA_HEADER) {
    headers["anthropic-beta"] = process.env.ANTHROPIC_USAGE_BETA_HEADER;
  }

  log.info("ai.usage", "fetching Anthropic monthly usage", {
    endpoint: `${url.origin}${url.pathname}`,
    startingAt: url.searchParams.get("starting_at"),
    endingAt: url.searchParams.get("ending_at"),
    bucketWidth: url.searchParams.get("bucket_width"),
    hasBetaHeader: Boolean(headers["anthropic-beta"]),
  });

  try {
    const response = await (options.fetchImpl ?? fetch)(url, { headers });
    if (!response.ok) {
      const body = await response.text();
      log.warn("ai.usage", "Anthropic usage API unavailable", {
        status: response.status,
        statusText: response.statusText,
        bodyPreview: preview(body, 240),
      });
      return null;
    }

    const payload = await response.json();
    const tokens = sumAnthropicUsageTokens(payload);
    if (tokens === null) {
      log.warn("ai.usage", "Anthropic usage API response had no token fields", {
        payloadShape: settingShape(payload),
      });
      return null;
    }

    log.info("ai.usage", "Anthropic monthly usage fetched", {
      usedTokens: tokens,
    });
    return tokens;
  } catch (error) {
    log.warn("ai.usage", "Anthropic usage API request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

interface FetchLiveMonthlySpendOptions {
  now?: Date;
  fetchImpl?: typeof fetch;
  apiKey?: string | null;
  costUrl?: string;
}

/**
 * Best-effort live month-to-date spend in **USD**, from the Anthropic Cost Report
 * API. Nothing about cost is stored locally; it is read live from the provider.
 * Returns null on any failure so the caller can degrade gracefully (show „—")
 * instead of surfacing an error.
 */
export async function fetchLiveMonthlySpendUsd(
  options: FetchLiveMonthlySpendOptions = {},
): Promise<number | null> {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_ADMIN_KEY ?? null;
  if (!apiKey) {
    log.warn("ai.usage", "live spend unavailable: missing ANTHROPIC_ADMIN_KEY");
    return null;
  }

  const now = options.now ?? new Date();
  const url = new URL(
    options.costUrl ?? process.env.ANTHROPIC_COST_API_URL ?? ANTHROPIC_COST_URL,
  );
  url.searchParams.set("starting_at", startOfMonth(now).toISOString());
  url.searchParams.set("ending_at", startOfNextMonth(now).toISOString());
  url.searchParams.set("bucket_width", "1d");

  const headers: Record<string, string> = {
    "x-api-key": apiKey,
    "anthropic-version": process.env.ANTHROPIC_VERSION ?? "2023-06-01",
  };

  log.info("ai.usage", "fetching Anthropic monthly spend", {
    endpoint: `${url.origin}${url.pathname}`,
    startingAt: url.searchParams.get("starting_at"),
    endingAt: url.searchParams.get("ending_at"),
  });

  try {
    const response = await (options.fetchImpl ?? fetch)(url, { headers });
    if (!response.ok) {
      const body = await response.text();
      log.warn("ai.usage", "Anthropic cost API unavailable", {
        status: response.status,
        statusText: response.statusText,
        bodyPreview: preview(body, 240),
      });
      return null;
    }

    const payload = await response.json();
    const cents = sumAnthropicCostCents(payload);
    if (cents === null) {
      log.warn("ai.usage", "Anthropic cost API response had no cost items", {
        payloadShape: settingShape(payload),
      });
      return null;
    }

    const spendUsd = cents / 100;
    log.info("ai.usage", "Anthropic monthly spend fetched", { spendUsd });
    return spendUsd;
  } catch (error) {
    log.warn("ai.usage", "Anthropic cost API request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export interface MonthlyAiSpend {
  /** Month-to-date Anthropic spend in USD, or null when live cost is unavailable. */
  spendUsd: number | null;
  /** Billing period start — the first day of the current calendar month (UTC). */
  periodStart: Date;
  /** Billing period end — the last day of the current calendar month (UTC). */
  periodEnd: Date;
  /** False when the Cost API couldn't be reached (then `spendUsd` is null). */
  available: boolean;
}

interface MonthlyAiSpendOptions {
  now?: Date;
  fetchLiveSpend?: () => Promise<number | null>;
}

/**
 * Month-to-date Anthropic spend (USD) plus the billing period it covers, for the
 * admin „Zużycie AI / mies." tile. Anthropic bills per calendar month, so the
 * period is the current month. Best-effort: `spendUsd` is null (and `available`
 * false) when the Cost API can't be reached; the period is always returned.
 */
export async function getMonthlyAiSpend(
  options: MonthlyAiSpendOptions = {},
): Promise<MonthlyAiSpend> {
  const now = options.now ?? new Date();
  const spendUsd = await (options.fetchLiveSpend
    ? options.fetchLiveSpend()
    : fetchLiveMonthlySpendUsd({ now }));

  if (spendUsd === null) {
    log.warn("ai.usage", "live monthly spend is unavailable; tile shows „—”");
  }

  const spend: MonthlyAiSpend = {
    spendUsd,
    periodStart: startOfMonth(now),
    periodEnd: lastDayOfMonth(now),
    available: spendUsd !== null,
  };

  log.info("ai.usage", "monthly spend computed", {
    spendUsd: spend.spendUsd,
    available: spend.available,
    periodStart: spend.periodStart.toISOString(),
    periodEnd: spend.periodEnd.toISOString(),
  });

  return spend;
}

interface MonthlyAiUsageOptions {
  now?: Date;
  fetchLiveTokens?: () => Promise<number | null>;
}

export async function getMonthlyAiUsage(
  options: MonthlyAiUsageOptions = {},
): Promise<MonthlyAiUsageDto> {
  const [limitSetting, warningSetting] = await Promise.all([
    getAppSetting("monthly_ai_token_limit"),
    getAppSetting("monthly_ai_token_warning_percent"),
  ]);
  const limitTokens = toNumber(limitSetting);
  const warningPercent = toNumber(warningSetting);

  log.info("ai.usage", "monthly usage settings loaded", {
    limitSettingShape: settingShape(limitSetting),
    warningSettingShape: settingShape(warningSetting),
    limitTokens,
    warningPercent,
  });

  if (limitTokens === null) {
    log.warn("ai.usage", "monthly_ai_token_limit is missing or not numeric", {
      settingShape: settingShape(limitSetting),
    });
  }

  const usedTokens = await (options.fetchLiveTokens
    ? options.fetchLiveTokens()
    : fetchLiveMonthlyTokens({ now: options.now }));

  if (usedTokens === null) {
    log.warn("ai.usage", "live monthly usage is unavailable; returning usage_unavailable");
  }

  const usage = buildMonthlyAiUsage({
    limitTokens,
    usedTokens,
    warningPercent,
    now: options.now,
  });

  log.info("ai.usage", "monthly usage status computed", {
    status: usage.status,
    usageAvailable: usage.usageAvailable,
    limitTokens: usage.limitTokens,
    usedTokens: usage.usedTokens,
    remainingTokens: usage.remainingTokens,
    percent: usage.percent,
    warningPercent: usage.warningPercent,
  });

  return usage;
}

/**
 * Pre-call gate: read the monthly limit, try live usage; block only when usage is
 * available AND over the limit. Unavailable usage does not block.
 */
export async function checkMonthlyTokenLimit(): Promise<TokenLimitCheck> {
  const usage = await getMonthlyAiUsage();

  if (!usage.usageAvailable) {
    log.warn("ai.usage", "token limit check allowed because usage is unavailable");
    return { allowed: true, usageAvailable: false };
  }
  if (usage.status === "exceeded") {
    log.warn("ai.usage", "token limit check blocked AI call", {
      usedTokens: usage.usedTokens,
      limitTokens: usage.limitTokens,
      percent: usage.percent,
    });
    return {
      allowed: false,
      code: "AI_MONTHLY_TOKEN_LIMIT_EXCEEDED",
      usageAvailable: true,
    };
  }
  log.info("ai.usage", "token limit check allowed AI call", {
    status: usage.status,
    usedTokens: usage.usedTokens,
    limitTokens: usage.limitTokens,
    percent: usage.percent,
  });
  return { allowed: true, usageAvailable: true };
}
