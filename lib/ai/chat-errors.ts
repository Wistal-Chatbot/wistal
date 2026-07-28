import "server-only";

import { createChatMessage, touchChatSession } from "@/lib/db/queries";
import { log } from "@/lib/log";
import { classifyChatError } from "./chat-error-classification";
import {
  persistChatErrorWithFallback,
  type ChatErrorEvent,
  type ChatErrorPersistenceDependencies,
} from "./chat-error-persistence-core";

export type { ChatErrorEvent } from "./chat-error-persistence-core";

export type RetryContext =
  | { kind: "chat"; userMessageId: number }
  | {
      kind: "quick_action";
      userMessageId: number;
      key: string;
      input: string | null;
      variant: "prompt" | "row";
    };

const defaultPersistenceDependencies: ChatErrorPersistenceDependencies = {
  createMessage: createChatMessage,
  touchSession: touchChatSession,
  logWarn: log.warn,
  logError: log.error,
};

export async function touchChatSessionBestEffort(
  sessionId: string,
  scope: string,
  touchSession: typeof touchChatSession = touchChatSession,
): Promise<void> {
  try {
    await touchSession(sessionId);
  } catch (error) {
    const classified = classifyChatError(error);
    log.warn(scope, "session timestamp update failed", {
      sessionId,
      errorCode: classified.code,
      error: classified.detail,
    });
  }
}

export async function persistChatError(
  params: {
    error: unknown;
    sessionId: string;
    userId: string;
    retryContext: RetryContext;
    retryOfMessageId?: number | null;
  },
  dependencies: ChatErrorPersistenceDependencies = defaultPersistenceDependencies,
): Promise<ChatErrorEvent> {
  return persistChatErrorWithFallback(params, dependencies);
}

export async function persistChatRateLimitError(params: {
  sessionId: string;
  userId: string;
  retryContext: RetryContext;
  retryAfterSeconds: number;
}) {
  const message = await createChatMessage({
    chatSessionId: params.sessionId,
    userId: params.userId,
    messageType: "assistant",
    content: "Zbyt wiele zapytań. Spróbuj ponownie później.",
    errorCode: "CHAT_RATE_LIMITED",
    errorDetail: `retry_after_seconds=${params.retryAfterSeconds}`,
    retryable: true,
    metadata: {
      retryContext: params.retryContext,
      retryAfterSeconds: params.retryAfterSeconds,
    },
  });
  await touchChatSessionBestEffort(params.sessionId, "chat.errors");
  return {
    type: "error" as const,
    error: message.content,
    messageId: message.id,
    userMessageId: params.retryContext.userMessageId,
    errorCode: "CHAT_RATE_LIMITED",
    retryable: true,
    isRetried: false,
  };
}

export async function persistChatTokenLimitError(params: {
  sessionId: string;
  userId: string;
  retryContext: RetryContext;
}) {
  const message = await createChatMessage({
    chatSessionId: params.sessionId,
    userId: params.userId,
    messageType: "assistant",
    content: "Miesięczny limit tokenów AI został wyczerpany.",
    errorCode: "AI_MONTHLY_TOKEN_LIMIT_EXCEEDED",
    retryable: false,
    metadata: { retryContext: params.retryContext },
  });
  await touchChatSessionBestEffort(params.sessionId, "chat.errors");
  return {
    type: "error" as const,
    error: message.content,
    messageId: message.id,
    userMessageId: params.retryContext.userMessageId,
    errorCode: "AI_MONTHLY_TOKEN_LIMIT_EXCEEDED",
    retryable: false,
    isRetried: false,
  };
}

export async function persistKnownChatError(params: {
  sessionId: string;
  userId: string;
  retryContext: RetryContext;
  message: string;
  code: string;
  retryable: boolean;
}) {
  const message = await createChatMessage({
    chatSessionId: params.sessionId,
    userId: params.userId,
    messageType: "assistant",
    content: params.message,
    errorCode: params.code,
    retryable: params.retryable,
    metadata: { retryContext: params.retryContext },
  });
  await touchChatSessionBestEffort(params.sessionId, "chat.errors");
  return {
    type: "error" as const,
    error: message.content,
    messageId: message.id,
    userMessageId: params.retryContext.userMessageId,
    errorCode: params.code,
    retryable: params.retryable,
    isRetried: false,
  };
}
