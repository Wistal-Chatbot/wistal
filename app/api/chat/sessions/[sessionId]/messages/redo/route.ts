import { z } from "zod";

import { runChatTurn, type ChatTurnEvent } from "@/lib/ai/orchestrator";
import { checkAiRequestRateLimit } from "@/lib/ai/request-rate-limit";
import { checkMonthlyTokenLimit } from "@/lib/ai/token-usage";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  claimChatTurnRedo,
  getChatSessionForUser,
} from "@/lib/db/queries";

import { sessionIdSchema } from "../../../_shared";

const bodySchema = z.object({
  userMessageId: z.number().int().positive(),
});

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

  const session = await getChatSessionForUser(sessionId, user.id);
  if (!session) {
    return Response.json({ error: "Nie znaleziono sesji." }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Nieprawidłowe żądanie." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Identyfikator wiadomości jest wymagany." },
      { status: 400 },
    );
  }

  const limited = await checkAiRequestRateLimit(user.id);
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

  const turn = await claimChatTurnRedo(session.id, parsed.data.userMessageId);
  if (!turn) {
    return Response.json(
      { error: "Nie znaleziono wiadomości do ponowienia." },
      { status: 404 },
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
