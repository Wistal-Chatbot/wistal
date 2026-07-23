import { z } from "zod";

import { streamDataAnswer } from "@/lib/ai/data-answer";
import { runChatTurn, type ChatTurnEvent } from "@/lib/ai/orchestrator";
import type { RetryContext } from "@/lib/ai/chat-errors";
import { checkAiRequestRateLimit } from "@/lib/ai/request-rate-limit";
import { checkMonthlyTokenLimit } from "@/lib/ai/token-usage";
import { parseCustomInput } from "@/lib/api/quick-actions-types";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  claimChatMessageRetry,
  getChatMessageForSession,
  getChatSessionForUser,
  getQuickActionByKey,
} from "@/lib/db/queries";
import { fetchRow } from "@/lib/quick-actions/row-source";

const messageIdSchema = z.coerce.number().int().positive();

function readRetryContext(metadata: unknown): RetryContext | null {
  const context = (metadata as { retryContext?: unknown } | null)?.retryContext;
  if (!context || typeof context !== "object") return null;
  const value = context as Record<string, unknown>;
  if (
    value.kind === "chat" &&
    typeof value.userMessageId === "number"
  ) {
    return { kind: "chat", userMessageId: value.userMessageId };
  }
  if (
    value.kind === "quick_action" &&
    typeof value.userMessageId === "number" &&
    typeof value.key === "string" &&
    (typeof value.input === "string" || value.input === null) &&
    (value.variant === "prompt" || value.variant === "row")
  ) {
    return {
      kind: "quick_action",
      userMessageId: value.userMessageId,
      key: value.key,
      input: value.input,
      variant: value.variant,
    };
  }
  return null;
}

function streamEvents(
  events: AsyncGenerator<ChatTurnEvent>,
): Response {
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
  {
    params,
  }: {
    params: Promise<{ sessionId: string; messageId: string }>;
  },
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Brak autoryzacji." }, { status: 401 });
  }

  const { sessionId, messageId: rawMessageId } = await params;
  const parsedMessageId = messageIdSchema.safeParse(rawMessageId);
  if (!parsedMessageId.success) {
    return Response.json({ error: "Nie znaleziono błędu." }, { status: 404 });
  }

  const session = await getChatSessionForUser(sessionId, user.id);
  if (!session) {
    return Response.json({ error: "Nie znaleziono sesji." }, { status: 404 });
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

  const candidate = await getChatMessageForSession(
    parsedMessageId.data,
    session.id,
  );
  if (
    !candidate ||
    !candidate.errorCode ||
    !candidate.retryable ||
    candidate.isRetried
  ) {
    return Response.json(
      { error: "Ta próba została już ponowiona lub nie może zostać ponowiona." },
      { status: 409 },
    );
  }

  const retryContext = readRetryContext(candidate.metadata);
  if (!retryContext) {
    return Response.json(
      { error: "Brak danych potrzebnych do ponowienia wiadomości." },
      { status: 409 },
    );
  }

  if (retryContext.kind === "chat") {
    const failed = await claimChatMessageRetry(candidate.id, session.id);
    if (!failed) {
      return Response.json(
        { error: "Ta próba została już ponowiona." },
        { status: 409 },
      );
    }
    return streamEvents(
      runChatTurn({
        session,
        user,
        retryContext,
        retryOfMessageId: failed.id,
      }),
    );
  }

  const action = await getQuickActionByKey(retryContext.key);
  if (!action || !action.isEnabled) {
    return Response.json(
      { error: "Ta szybka akcja nie jest już dostępna." },
      { status: 409 },
    );
  }
  const webSearchEnabled = session.webSearchEnabled || action.usesWebSearch;

  if (retryContext.variant === "prompt") {
    const failed = await claimChatMessageRetry(candidate.id, session.id);
    if (!failed) {
      return Response.json(
        { error: "Ta próba została już ponowiona." },
        { status: 409 },
      );
    }
    return streamEvents(
      runChatTurn({
        session: { ...session, webSearchEnabled },
        user,
        source: "quick_action",
        retryContext,
        retryOfMessageId: failed.id,
      }),
    );
  }

  const config = parseCustomInput(action.customInput);
  if (!("type" in config) || config.type !== "row_from_table") {
    return Response.json(
      { error: "Konfiguracja szybkiej akcji uległa zmianie." },
      { status: 409 },
    );
  }
  const fetched = await fetchRow(config, retryContext.input ?? "");
  if (!fetched.row) {
    return Response.json(
      { error: "Wybrana wartość nie jest już dostępna." },
      { status: 409 },
    );
  }

  const failed = await claimChatMessageRetry(candidate.id, session.id);
  if (!failed) {
    return Response.json(
      { error: "Ta próba została już ponowiona." },
      { status: 409 },
    );
  }

  return streamEvents(
    streamDataAnswer({
      session: { ...session, webSearchEnabled },
      user,
      promptTemplate: action.promptTemplate,
      data: fetched.row,
      table: config.table,
      sqlExecuted: fetched.sql,
      source: "quick_action",
      retryContext,
      retryOfMessageId: failed.id,
    }),
  );
}
