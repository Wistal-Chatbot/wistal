import { z } from "zod";

import { runChatTurn, type ChatTurnEvent } from "@/lib/ai/orchestrator";
import { checkMonthlyTokenLimit } from "@/lib/ai/token-usage";
import { getCurrentUser } from "@/lib/auth/current-user";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import {
  createChatMessage,
  getChatSessionForUser,
  getQuickActionByKey,
  setSessionTitleIfEmpty,
} from "@/lib/db/queries";
import { log, preview } from "@/lib/log";
import {
  validateAndResolvePrompt,
  type ResolveResult,
} from "@/lib/quick-actions/resolve";

const bodySchema = z.object({
  session_id: z.string().uuid(),
  input: z.string().max(500).nullable().optional(),
  stream: z.boolean().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Brak autoryzacji." }, { status: 401 });
  }

  const { key } = await params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Nieprawidłowe żądanie." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Nieprawidłowe dane żądania." },
      { status: 400 },
    );
  }
  const { session_id, input = null, stream: useStream = true } = parsed.data;

  // Load the action first so an unknown/disabled key is a clean 404.
  const action = await getQuickActionByKey(key);
  if (!action || !action.isEnabled) {
    return Response.json({ error: "Nie znaleziono akcji." }, { status: 404 });
  }

  const session = await getChatSessionForUser(session_id, user.id);
  if (!session) {
    log.warn("quick-actions.run", "session not found", {
      sessionId: session_id,
      userId: user.id,
    });
    return Response.json({ error: "Nie znaleziono sesji." }, { status: 404 });
  }

  // Rate limit: 5/min and 200/day per user (mirrors the chat pipeline).
  const [perMinute, perDay] = await Promise.all([
    checkRateLimit({
      namespace: "quick-actions",
      key: `user:${user.id}:minute`,
      limit: 5,
      windowSeconds: 60,
    }),
    checkRateLimit({
      namespace: "quick-actions",
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
    log.warn("quick-actions.run", "rate limited", {
      key,
      userId: user.id,
      retryAfterSeconds: limited.retryAfterSeconds,
    });
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
    log.warn("quick-actions.run", "monthly token limit exceeded", {
      key,
      userId: user.id,
    });
    return Response.json(
      {
        error: "Miesięczny limit tokenów AI został wyczerpany.",
        code: tokenLimit.code,
      },
      { status: 429 },
    );
  }

  // Validate input against custom_input and build the effective user message.
  let resolved: ResolveResult;
  try {
    resolved = await validateAndResolvePrompt(action, input);
  } catch (error) {
    log.error("quick-actions.run", "prompt resolution failed", {
      key,
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { error: "Nie udało się przygotować akcji." },
      { status: 502 },
    );
  }
  if (!resolved.ok) {
    return Response.json({ error: resolved.error }, { status: 400 });
  }
  const promptText = resolved.prompt;

  const webSearchEnabled = session.webSearchEnabled || action.usesWebSearch;

  log.info("quick-actions.run", "request", {
    sessionId: session.id,
    userId: user.id,
    key,
    webSearchEnabled,
    stream: useStream,
    prompt: preview(promptText),
  });

  // Persist the resolved prompt as the user turn, then run the shared pipeline —
  // runChatTurn reads the session's messages, so it picks this up as the turn.
  await createChatMessage({
    chatSessionId: session.id,
    userId: user.id,
    messageType: "user",
    content: promptText,
  });
  await setSessionTitleIfEmpty(session.id, promptText.slice(0, 60));

  const events = runChatTurn({
    session: { ...session, webSearchEnabled },
    user,
    source: "quick_action",
  });

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
      log.error("quick-actions.run", "turn error (non-stream)", {
        sessionId: session.id,
        userId: user.id,
        error,
      });
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
      } catch (error) {
        log.error("quick-actions.run", "stream failed", {
          sessionId: session.id,
          userId: user.id,
          error: error instanceof Error ? error.message : String(error),
        });
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
