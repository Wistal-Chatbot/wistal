import { getCurrentUser } from "@/lib/auth/current-user";
import { setChatSessionWebSearch } from "@/lib/db/queries";

import { serializeSession, sessionIdSchema, webSearchSchema } from "../../_shared";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Brak autoryzacji." }, { status: 401 });
  }

  const { sessionId } = await params;
  if (!sessionIdSchema.safeParse(sessionId).success) {
    return Response.json({ error: "Nie znaleziono sesji." }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Nieprawidłowe żądanie." }, { status: 400 });
  }

  const parsed = webSearchSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Podaj wartość przełącznika (enabled)." },
      { status: 400 },
    );
  }

  const session = await setChatSessionWebSearch(
    sessionId,
    user.id,
    parsed.data.enabled,
  );
  if (!session) {
    return Response.json({ error: "Nie znaleziono sesji." }, { status: 404 });
  }

  return Response.json({ session: serializeSession(session) });
}
