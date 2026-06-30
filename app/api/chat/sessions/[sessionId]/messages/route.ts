import { z } from "zod";

import { runChatTurn, type ChatTurnEvent } from "@/lib/ai/orchestrator";
import { checkMonthlyTokenLimit } from "@/lib/ai/token-usage";
import { getCurrentUser } from "@/lib/auth/current-user";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import {
  createChatMessage,
  getChatSessionForUser,
  setSessionTitleIfEmpty,
} from "@/lib/db/queries";

import { sessionIdSchema } from "../../_shared";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  stream: z.boolean().optional(),
});

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
      { error: "Treść wiadomości jest wymagana (1–4000 znaków)." },
      { status: 400 },
    );
  }
  const { message, stream: useStream = true } = parsed.data;

  // Rate limit: 5/min and 200/day per user (architecture §6).
  const [perMinute, perDay] = await Promise.all([
    checkRateLimit({
      namespace: "chat",
      key: `user:${user.id}:minute`,
      limit: 5,
      windowSeconds: 60,
    }),
    checkRateLimit({
      namespace: "chat",
      key: `user:${user.id}:day`,
      limit: 200,
      windowSeconds: 24 * 60 * 60,
    }),
  ]);
  const limited = !perMinute.allowed
    ? perMinute
    : !perDay.allowed
      ? perDay
      : null;
  if (limited) {
    return Response.json(
      { error: "Zbyt wiele zapytań. Spróbuj ponownie później." },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSeconds) },
      },
    );
  }

  // Monthly AI token limit (blocks only when live usage is available and over).
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

  // Persist the user message and seed the title from the first question.
  await createChatMessage({
    chatSessionId: session.id,
    userId: user.id,
    messageType: "user",
    content: message,
  });
  await setSessionTitleIfEmpty(session.id, message.slice(0, 60));

  const events = runChatTurn({ session, user });

  if (!useStream) {
    let text = "";
    let meta: Extract<ChatTurnEvent, { type: "meta" }> | null = null;
    let error: string | null = null;
    for await (const event of events) {
      if (event.type === "delta") text += event.text;
      else if (event.type === "meta") meta = event;
      else if (event.type === "error") error = event.error;
    }
    if (error) {
      return Response.json({ error }, { status: 502 });
    }
    return Response.json({ message: { content: text }, meta });
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of events) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } catch {
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({ type: "error", error: "Wystąpił błąd serwera." })}\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
