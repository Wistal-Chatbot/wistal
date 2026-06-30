import { getCurrentUser } from "@/lib/auth/current-user";
import { createChatSession, listChatSessions } from "@/lib/db/queries";

import { createSessionSchema, serializeSession } from "./_shared";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Brak autoryzacji." }, { status: 401 });
  }

  const sessions = await listChatSessions(user.id);
  return Response.json({ sessions: sessions.map(serializeSession) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Brak autoryzacji." }, { status: 401 });
  }

  // The create body is fully optional, so accept an empty request body as `{}`
  // while still rejecting malformed JSON.
  let json: unknown = {};
  const raw = await request.text();
  if (raw.trim().length > 0) {
    try {
      json = JSON.parse(raw);
    } catch {
      return Response.json({ error: "Nieprawidłowe żądanie." }, { status: 400 });
    }
  }

  const parsed = createSessionSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Nieprawidłowe dane sesji." }, { status: 400 });
  }

  const session = await createChatSession({
    userId: user.id,
    title: parsed.data.title,
    webSearchEnabled: parsed.data.webSearchEnabled,
  });

  return Response.json({ session: serializeSession(session) }, { status: 201 });
}
