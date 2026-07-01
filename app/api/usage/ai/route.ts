import { getCurrentUser } from "@/lib/auth/current-user";
import { getMonthlyAiUsage } from "@/lib/ai/token-usage";
import { log } from "@/lib/log";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    log.warn("api.usage.ai", "unauthorized usage request");
    return Response.json({ error: "Brak autoryzacji." }, { status: 401 });
  }

  log.info("api.usage.ai", "usage request started", {
    userId: user.id,
  });

  const usage = await getMonthlyAiUsage();

  log.info("api.usage.ai", "usage request completed", {
    userId: user.id,
    status: usage.status,
    usageAvailable: usage.usageAvailable,
    limitTokens: usage.limitTokens,
    usedTokens: usage.usedTokens,
    percent: usage.percent,
  });

  return Response.json({ usage });
}
