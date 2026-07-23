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
    errorCode: classified.code,
    retryable: true,
    isRetried: false,
  };
}
