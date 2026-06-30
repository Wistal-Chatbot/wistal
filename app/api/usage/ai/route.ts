import { getCurrentUser } from "@/lib/auth/current-user";
import { getMonthlyAiUsage } from "@/lib/ai/token-usage";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Brak autoryzacji." }, { status: 401 });
  }

  const usage = await getMonthlyAiUsage();
  return Response.json({ usage });
}
