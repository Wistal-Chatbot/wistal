import "server-only";

import type { MonthlyAiUsageDto } from "@/lib/api/usage-types";
import { getAppSetting } from "@/lib/db/queries";
import { log } from "@/lib/log";
import {
  buildMonthlyAiUsage,
  startOfMonth,
  startOfNextMonth,
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
  if (!apiKey) return null;

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

  try {
    const response = await (options.fetchImpl ?? fetch)(url, { headers });
    if (!response.ok) {
      log.warn("ai.usage", "Anthropic usage API unavailable", {
        status: response.status,
      });
      return null;
    }

    const payload = await response.json();
    return sumAnthropicUsageTokens(payload);
  } catch (error) {
    log.warn("ai.usage", "Anthropic usage API request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
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

  const usedTokens = await (options.fetchLiveTokens
    ? options.fetchLiveTokens()
    : fetchLiveMonthlyTokens({ now: options.now }));

  return buildMonthlyAiUsage({
    limitTokens: toNumber(limitSetting),
    usedTokens,
    warningPercent: toNumber(warningSetting),
    now: options.now,
  });
}

/**
 * Pre-call gate: read the monthly limit, try live usage; block only when usage is
 * available AND over the limit. Unavailable usage does not block.
 */
export async function checkMonthlyTokenLimit(): Promise<TokenLimitCheck> {
  const usage = await getMonthlyAiUsage();

  if (!usage.usageAvailable) {
    return { allowed: true, usageAvailable: false };
  }
  if (usage.status === "exceeded") {
    return {
      allowed: false,
      code: "AI_MONTHLY_TOKEN_LIMIT_EXCEEDED",
      usageAvailable: true,
    };
  }
  return { allowed: true, usageAvailable: true };
}
