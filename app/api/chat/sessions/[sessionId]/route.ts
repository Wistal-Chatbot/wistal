import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getChatSessionForUser,
  getChatSessionMessages,
  updateChatSession,
} from "@/lib/db/queries";

import {
  serializeMessage,
  serializeSession,
  sessionIdSchema,
  updateSessionSchema,
} from "../_shared";

export async function GET(
  _request: Request,
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

  const session = await getChatSessionForUser(sessionId, user.id);
  if (!session) {
    return Response.json({ error: "Nie znaleziono sesji." }, { status: 404 });
  }

  const messages = await getChatSessionMessages(session.id);
  return Response.json({
    session: serializeSession(session),
    messages: messages.map(serializeMessage),
  });
}

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

  const parsed = updateSessionSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Nieprawidłowe dane sesji." }, { status: 400 });
  }

  const session = await updateChatSession(sessionId, user.id, parsed.data);
  if (!session) {
    return Response.json({ error: "Nie znaleziono sesji." }, { status: 404 });
  }

  return Response.json({ session: serializeSession(session) });
}
