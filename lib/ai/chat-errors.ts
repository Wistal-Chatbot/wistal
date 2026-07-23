import "server-only";

import { createChatMessage, touchChatSession } from "@/lib/db/queries";
import { classifyChatError } from "./chat-error-classification";

export type RetryContext =
  | { kind: "chat"; userMessageId: number }
  | {
      kind: "quick_action";
      userMessageId: number;
      key: string;
      input: string | null;
      variant: "prompt" | "row";
    };

export async function persistChatError(params: {
  error: unknown;
  sessionId: string;
  userId: string;
  retryContext: RetryContext;
  retryOfMessageId?: number | null;
}) {
  const classified = classifyChatError(params.error);
  const message = await createChatMessage({
    chatSessionId: params.sessionId,
    userId: params.userId,
    messageType: "assistant",
    content: classified.message,
    errorCode: classified.code,
    errorDetail: classified.detail,
    retryable: true,
    retryOfMessageId: params.retryOfMessageId ?? null,
    metadata: { retryContext: params.retryContext },
  });
  await touchChatSession(params.sessionId);
  return {
    type: "error" as const,
    error: classified.message,
    messageId: message.id,
    userMessageId: params.retryContext.userMessageId,
    errorCode: classified.code,
    retryable: true,
    isRetried: false,
  };
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
  await touchChatSession(params.sessionId);
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
  await touchChatSession(params.sessionId);
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
  await touchChatSession(params.sessionId);
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
