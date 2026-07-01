import { getCurrentUser } from "@/lib/auth/current-user";
import { getEnabledQuickActions } from "@/lib/db/queries";
import { toQuickActionDto } from "@/lib/quick-actions/resolve";

/** Active quick actions for the chat UI (input options resolved server-side). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Brak autoryzacji." }, { status: 401 });
  }

  const actions = await getEnabledQuickActions();
  return Response.json({ actions: actions.map(toQuickActionDto) });
}
