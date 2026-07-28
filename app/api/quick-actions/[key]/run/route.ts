import { z } from "zod";

import { classifyChatError } from "@/lib/ai/chat-error-classification";
import { streamDataAnswer } from "@/lib/ai/data-answer";
import {
  persistChatError,
  persistChatRateLimitError,
  persistChatTokenLimitError,
  persistKnownChatError,
  type RetryContext,
} from "@/lib/ai/chat-errors";
import { checkAiRequestRateLimit } from "@/lib/ai/request-rate-limit";
import { runChatTurn, type ChatTurnEvent } from "@/lib/ai/orchestrator";
import { checkMonthlyTokenLimit } from "@/lib/ai/token-usage";
import { parseCustomInput } from "@/lib/api/quick-actions-types";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  createChatMessage,
  getChatSessionForUser,
  getQuickActionByKey,
  setSessionTitleIfEmpty,
} from "@/lib/db/queries";
import { log, preview } from "@/lib/log";
import { validateAndResolvePrompt } from "@/lib/quick-actions/resolve";
import { fetchRow } from "@/lib/quick-actions/row-source";

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

  const config = parseCustomInput(action.customInput);
  const webSearchEnabled = session.webSearchEnabled || action.usesWebSearch;
  const isRowAction = "type" in config && config.type === "row_from_table";

  let userMessageText: string;
  let normalizedInput = input;
  if (isRowAction) {
    normalizedInput = (input ?? "").trim();
    if (!normalizedInput) {
      return Response.json(
        { error: `Wybierz wartość dla pola „${config.label}”.` },
        { status: 400 },
      );
    }
    userMessageText = `${action.namePl}: ${normalizedInput}`;
  } else {
    const resolved = validateAndResolvePrompt(action, input);
    if (!resolved.ok) {
      return Response.json({ error: resolved.error }, { status: 400 });
    }
    userMessageText = resolved.prompt;
  }

  // Persist exactly once before any infrastructure or external API call.
  const userMessage = await createChatMessage({
    chatSessionId: session.id,
    userId: user.id,
    messageType: "user",
    content: userMessageText,
  });
  await setSessionTitleIfEmpty(session.id, userMessageText.slice(0, 60));
  const retryContextForTurn: RetryContext = {
    kind: "quick_action",
    userMessageId: userMessage.id,
    key,
    input: normalizedInput,
    variant: isRowAction ? "row" : "prompt",
  };

  let limited;
  try {
    limited = await checkAiRequestRateLimit(user.id);
  } catch (error) {
    const event = await persistChatError({
      error,
      sessionId: session.id,
      userId: user.id,
      retryContext: retryContextForTurn,
    });
    return Response.json(event, { status: 502 });
  }
  if (limited) {
    log.warn("quick-actions.run", "rate limited", {
      key,
      userId: user.id,
      retryAfterSeconds: limited.retryAfterSeconds,
    });
    const event = await persistChatRateLimitError({
      sessionId: session.id,
      userId: user.id,
      retryContext: retryContextForTurn,
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
      retryContext: retryContextForTurn,
    });
    return Response.json(event, { status: 502 });
  }
  if (!tokenLimit.allowed) {
    log.warn("quick-actions.run", "monthly token limit exceeded", {
      key,
      userId: user.id,
    });
    const event = await persistChatTokenLimitError({
      sessionId: session.id,
      userId: user.id,
      retryContext: retryContextForTurn,
    });
    return Response.json(event, { status: 429 });
  }

  let events: AsyncGenerator<ChatTurnEvent>;

  if (isRowAction) {
    // Deterministic path: fetch the chosen row, then the AI only composes the
    // answer from it — no AI-generated SQL.
    const chosenId = normalizedInput as string;

    let fetched: { row: Record<string, unknown> | null; sql: string };
    try {
      fetched = await fetchRow(config, chosenId);
    } catch (error) {
      log.error("quick-actions.run", "row fetch failed", {
        key,
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
      });
      const event = await persistChatError({
        error,
        sessionId: session.id,
        userId: user.id,
        retryContext: retryContextForTurn,
      });
      return Response.json(event, { status: 502 });
    }
    if (!fetched.row) {
      const event = await persistKnownChatError({
        sessionId: session.id,
        userId: user.id,
        retryContext: retryContextForTurn,
        message: "Wybrana wartość jest nieprawidłowa.",
        code: "QUICK_ACTION_INPUT_INVALID",
        retryable: false,
      });
      return Response.json(event, { status: 400 });
    }

    log.info("quick-actions.run", "request (row_from_table)", {
      sessionId: session.id,
      userId: user.id,
      key,
      table: config.table,
      stream: useStream,
    });
    events = streamDataAnswer({
      session,
      user,
      promptTemplate: action.promptTemplate,
      data: fetched.row,
      table: config.table,
      sqlExecuted: fetched.sql,
      source: "quick_action",
      retryContext: retryContextForTurn,
    });
  } else {
    // text / no-input path: the AI generates the SQL (runChatTurn).
    log.info("quick-actions.run", "request", {
      sessionId: session.id,
      userId: user.id,
      key,
      webSearchEnabled,
      stream: useStream,
      prompt: preview(userMessageText),
    });

    events = runChatTurn({
      session: { ...session, webSearchEnabled },
      user,
      source: "quick_action",
      retryContext: retryContextForTurn,
    });
  }

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
      log.error("quick-actions.run", "turn error (non-stream)", {
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
        log.error("quick-actions.run", "stream failed", {
          sessionId: session.id,
          userId: user.id,
          errorCode: classified.code,
          error: classified.detail,
        });
        const event = await persistChatError({
          error,
          sessionId: session.id,
          userId: user.id,
          retryContext: retryContextForTurn,
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
