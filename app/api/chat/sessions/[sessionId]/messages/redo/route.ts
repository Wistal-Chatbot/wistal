import { runChatTurn, type ChatTurnEvent } from "@/lib/ai/orchestrator";
import { checkMonthlyTokenLimit } from "@/lib/ai/token-usage";
import { getCurrentUser } from "@/lib/auth/current-user";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import {
  claimLatestChatTurnRedo,
  getChatSessionForUser,
} from "@/lib/db/queries";

import { sessionIdSchema } from "../../../_shared";

function streamEvents(events: AsyncGenerator<ChatTurnEvent>): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          for await (const event of events) {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          }
        } finally {
          controller.close();
        }
      },
    }),
    {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function POST(
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

  const [perMinute, perDay] = await Promise.all([
    checkRateLimit({
      namespace: "chat-redo",
      key: `user:${user.id}:minute`,
      limit: 5,
      windowSeconds: 60,
    }),
    checkRateLimit({
      namespace: "chat-redo",
      key: `user:${user.id}:day`,
      limit: 200,
      windowSeconds: 24 * 60 * 60,
    }),
  ]);
  const limited = !perMinute.allowed ? perMinute : !perDay.allowed ? perDay : null;
  if (limited) {
    return Response.json(
      { error: "Zbyt wiele zapytań. Spróbuj ponownie później." },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSeconds) },
      },
    );
  }

  const tokenLimit = await checkMonthlyTokenLimit();
  if (!tokenLimit.allowed) {
    return Response.json(
      {
        error: "Miesięczny limit tokenów AI został wyczerpany.",
        code: tokenLimit.code,
      },
      { status: 429 },
    );
  }

  const turn = await claimLatestChatTurnRedo(session.id);
  if (!turn) {
    return Response.json(
      { error: "Ostatniej wiadomości nie można ponowić." },
      { status: 409 },
    );
  }

  return streamEvents(
    runChatTurn({
      session,
      user,
      retryContext: { kind: "chat", userMessageId: turn.userMessage.id },
      retryOfMessageId: turn.assistantMessage?.id ?? null,
    }),
  );
}
