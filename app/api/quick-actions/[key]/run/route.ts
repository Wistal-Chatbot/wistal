import { z } from "zod";

import { streamDataAnswer } from "@/lib/ai/data-answer";
import {
  persistChatError,
  persistChatRateLimitError,
  persistChatTokenLimitError,
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

  const earlyConfig = parseCustomInput(action.customInput);
  let limited;
  try {
    limited = await checkAiRequestRateLimit(user.id);
  } catch (error) {
    const displayText = input ? `${action.namePl}: ${input}` : action.namePl;
    const failedUserMessage = await createChatMessage({
      chatSessionId: session.id,
      userId: user.id,
      messageType: "user",
      content: displayText,
    });
    await setSessionTitleIfEmpty(session.id, displayText.slice(0, 60));
    const retryContext: RetryContext = {
      kind: "quick_action",
      userMessageId: failedUserMessage.id,
      key,
      input,
      variant:
        "type" in earlyConfig && earlyConfig.type === "row_from_table"
          ? "row"
          : "prompt",
    };
    const event = await persistChatError({
      error,
      sessionId: session.id,
      userId: user.id,
      retryContext,
    });
    return Response.json(event, { status: 502 });
  }
  if (limited) {
    log.warn("quick-actions.run", "rate limited", {
      key,
      userId: user.id,
      retryAfterSeconds: limited.retryAfterSeconds,
    });
    const displayText = input ? `${action.namePl}: ${input}` : action.namePl;
    const failedUserMessage = await createChatMessage({
      chatSessionId: session.id,
      userId: user.id,
      messageType: "user",
      content: displayText,
    });
    await setSessionTitleIfEmpty(session.id, displayText.slice(0, 60));
    const event = await persistChatRateLimitError({
      sessionId: session.id,
      userId: user.id,
      retryContext: {
        kind: "quick_action",
        userMessageId: failedUserMessage.id,
        key,
        input,
        variant:
          "type" in earlyConfig && earlyConfig.type === "row_from_table"
            ? "row"
            : "prompt",
      },
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
    const displayText = input ? `${action.namePl}: ${input}` : action.namePl;
    const failedUserMessage = await createChatMessage({
      chatSessionId: session.id,
      userId: user.id,
      messageType: "user",
      content: displayText,
    });
    await setSessionTitleIfEmpty(session.id, displayText.slice(0, 60));
    const retryContext: RetryContext = {
      kind: "quick_action",
      userMessageId: failedUserMessage.id,
      key,
      input,
      variant:
        "type" in earlyConfig && earlyConfig.type === "row_from_table"
          ? "row"
          : "prompt",
    };
    const event = await persistChatError({
      error,
      sessionId: session.id,
      userId: user.id,
      retryContext,
    });
    return Response.json(event, { status: 502 });
  }
  if (!tokenLimit.allowed) {
    log.warn("quick-actions.run", "monthly token limit exceeded", {
      key,
      userId: user.id,
    });
    const displayText = input ? `${action.namePl}: ${input}` : action.namePl;
    const failedUserMessage = await createChatMessage({
      chatSessionId: session.id,
      userId: user.id,
      messageType: "user",
      content: displayText,
    });
    await setSessionTitleIfEmpty(session.id, displayText.slice(0, 60));
    const event = await persistChatTokenLimitError({
      sessionId: session.id,
      userId: user.id,
      retryContext: {
        kind: "quick_action",
        userMessageId: failedUserMessage.id,
        key,
        input,
        variant:
          "type" in earlyConfig && earlyConfig.type === "row_from_table"
            ? "row"
            : "prompt",
      },
    });
    return Response.json(event, { status: 429 });
  }

  const config = earlyConfig;
  const webSearchEnabled = session.webSearchEnabled || action.usesWebSearch;

  let events: AsyncGenerator<ChatTurnEvent>;
  let retryContextForTurn: RetryContext;

  if ("type" in config && config.type === "row_from_table") {
    // Deterministic path: fetch the chosen row, then the AI only composes the
    // answer from it — no AI-generated SQL.
    const chosenId = (input ?? "").trim();
    if (!chosenId) {
      return Response.json(
        { error: `Wybierz wartość dla pola „${config.label}”.` },
        { status: 400 },
      );
    }

    let fetched: { row: Record<string, unknown> | null; sql: string };
    try {
      fetched = await fetchRow(config, chosenId);
    } catch (error) {
      log.error("quick-actions.run", "row fetch failed", {
        key,
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return Response.json(
        { error: "Nie udało się pobrać danych akcji." },
        { status: 502 },
      );
    }
    if (!fetched.row) {
      return Response.json(
        { error: "Wybrana wartość jest nieprawidłowa." },
        { status: 400 },
      );
    }

    const userMessageText = `${action.namePl}: ${chosenId}`;
    log.info("quick-actions.run", "request (row_from_table)", {
      sessionId: session.id,
      userId: user.id,
      key,
      table: config.table,
      stream: useStream,
    });
    const userMessage = await createChatMessage({
      chatSessionId: session.id,
      userId: user.id,
      messageType: "user",
      content: userMessageText,
    });
    await setSessionTitleIfEmpty(session.id, userMessageText.slice(0, 60));

    retryContextForTurn = {
      kind: "quick_action",
      userMessageId: userMessage.id,
      key,
      input: chosenId,
      variant: "row",
    };
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
    const resolved = validateAndResolvePrompt(action, input);
    if (!resolved.ok) {
      return Response.json({ error: resolved.error }, { status: 400 });
    }
    const promptText = resolved.prompt;

    log.info("quick-actions.run", "request", {
      sessionId: session.id,
      userId: user.id,
      key,
      webSearchEnabled,
      stream: useStream,
      prompt: preview(promptText),
    });

    // Persist the resolved prompt as the user turn; runChatTurn reads the
    // session's messages, so it picks this up as the current turn.
    const userMessage = await createChatMessage({
      chatSessionId: session.id,
      userId: user.id,
      messageType: "user",
      content: promptText,
    });
    await setSessionTitleIfEmpty(session.id, promptText.slice(0, 60));

    retryContextForTurn = {
      kind: "quick_action",
      userMessageId: userMessage.id,
      key,
      input,
      variant: "prompt",
    };
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
        log.error("quick-actions.run", "stream failed", {
          sessionId: session.id,
          userId: user.id,
          error: error instanceof Error ? error.message : String(error),
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
