import { z } from "zod";

import { runChatTurn, type ChatTurnEvent } from "@/lib/ai/orchestrator";
import { classifyChatError } from "@/lib/ai/chat-error-classification";
import {
  persistChatError,
  persistChatRateLimitError,
  persistChatTokenLimitError,
} from "@/lib/ai/chat-errors";
import { checkAiRequestRateLimit } from "@/lib/ai/request-rate-limit";
import { checkMonthlyTokenLimit } from "@/lib/ai/token-usage";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  createChatMessage,
  getChatSessionForUser,
  setSessionTitleIfEmpty,
} from "@/lib/db/queries";
import { log, preview } from "@/lib/log";

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
    log.warn("chat.messages", "session not found", {
      sessionId,
      userId: user.id,
    });
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

  log.info("chat.messages", "request", {
    sessionId: session.id,
    userId: user.id,
    webSearchEnabled: session.webSearchEnabled,
    stream: useStream,
    messageLength: message.length,
    message: preview(message),
  });

  // Persist first: rejected turns must remain consistent between UI and DB.
  const userMessage = await createChatMessage({
    chatSessionId: session.id,
    userId: user.id,
    messageType: "user",
    content: message,
  });
  await setSessionTitleIfEmpty(session.id, message.slice(0, 60));
  const retryContext = {
    kind: "chat" as const,
    userMessageId: userMessage.id,
  };

  let limited;
  try {
    limited = await checkAiRequestRateLimit(user.id);
  } catch (error) {
    const event = await persistChatError({
      error,
      sessionId: session.id,
      userId: user.id,
      retryContext,
    });
    return Response.json(event, { status: 502 });
  }
  if (limited) {
    log.warn("chat.messages", "rate limited", {
      sessionId: session.id,
      userId: user.id,
      retryAfterSeconds: limited.retryAfterSeconds,
    });
    const event = await persistChatRateLimitError({
      sessionId: session.id,
      userId: user.id,
      retryContext,
      retryAfterSeconds: limited.retryAfterSeconds,
    });
    return Response.json(
      event,
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSeconds) },
      },
    );
  }

  // Monthly AI token limit (blocks only when live usage is available and over).
  let tokenLimit;
  try {
    tokenLimit = await checkMonthlyTokenLimit();
  } catch (error) {
    const event = await persistChatError({
      error,
      sessionId: session.id,
      userId: user.id,
      retryContext,
    });
    return Response.json(event, { status: 502 });
  }
  if (!tokenLimit.allowed) {
    log.warn("chat.messages", "monthly token limit exceeded", {
      sessionId: session.id,
      userId: user.id,
    });
    const event = await persistChatTokenLimitError({
      sessionId: session.id,
      userId: user.id,
      retryContext,
    });
    return Response.json(event, { status: 429 });
  }

  const events = runChatTurn({
    session,
    user,
    retryContext,
  });

  if (!useStream) {
    let text = "";
    let meta: Extract<ChatTurnEvent, { type: "meta" }> | null = null;
    let error: Extract<ChatTurnEvent, { type: "error" }> | null = null;
    for await (const event of events) {
      if (event.type === "delta") text += event.text;
      else if (event.type === "meta") meta = event;
      else if (event.type === "error") error = event;
    }
    if (error) {
      log.error("chat.messages", "turn error (non-stream)", {
        sessionId: session.id,
        userId: user.id,
        error: error.error,
      });
      return Response.json(error, { status: 502 });
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
      } catch (error) {
        const classified = classifyChatError(error);
        log.error("chat.messages", "stream failed", {
          sessionId: session.id,
          userId: user.id,
          errorCode: classified.code,
          error: classified.detail,
        });
        const event = await persistChatError({
          error,
          sessionId: session.id,
          userId: user.id,
          retryContext: { kind: "chat", userMessageId: userMessage.id },
        });
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
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
