import "server-only";

import { getAppSetting } from "@/lib/db/queries";

export interface TokenLimitCheck {
  allowed: boolean;
  /** Set when blocked, for the API response. */
  code?: "AI_MONTHLY_TOKEN_LIMIT_EXCEEDED";
  /** False when live usage couldn't be fetched (we then never block). */
  usageAvailable: boolean;
}

/** Coerces an app_settings JSONB value (number or numeric string) to a number. */
function toNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && !isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

/**
 * Best-effort live monthly token usage. The DB only stores the *limit*; usage is
 * fetched live from the provider when possible. For MVP we have no admin key, so
 * usage is unavailable and the limit never blocks (per the backend docs). When an
 * admin key is configured, wire the Anthropic Admin usage API here.
 */
async function fetchLiveMonthlyTokens(): Promise<number | null> {
  if (!process.env.ANTHROPIC_ADMIN_KEY) return null;
  // TODO: call the Anthropic Admin usage report API and sum monthly tokens.
  return null;
}

/**
 * Pre-call gate: read the monthly limit, try live usage; block only when usage is
 * available AND over the limit. Unavailable usage does not block.
 */
export async function checkMonthlyTokenLimit(): Promise<TokenLimitCheck> {
  const limit = toNumber(await getAppSetting("monthly_ai_token_limit"));
  const usage = await fetchLiveMonthlyTokens();

  if (usage === null) {
    return { allowed: true, usageAvailable: false };
  }
  if (limit !== null && limit > 0 && usage >= limit) {
    return {
      allowed: false,
      code: "AI_MONTHLY_TOKEN_LIMIT_EXCEEDED",
      usageAvailable: true,
    };
  }
  return { allowed: true, usageAvailable: true };
}
