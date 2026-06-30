import { getCurrentUser } from "@/lib/auth/current-user";
import { setChatSessionWebSearch } from "@/lib/db/queries";
import { log } from "@/lib/log";

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
    log.warn("chat.web-search", "session not found", {
      sessionId,
      userId: user.id,
    });
    return Response.json({ error: "Nie znaleziono sesji." }, { status: 404 });
  }

  log.info("chat.web-search", "toggled", {
    sessionId: session.id,
    userId: user.id,
    enabled: parsed.data.enabled,
  });

  return Response.json({ session: serializeSession(session) });
}
