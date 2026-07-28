import { classifyChatError } from "./chat-error-classification";

export interface ChatErrorEvent {
  type: "error";
  error: string;
  messageId: number | null;
  userMessageId: number;
  errorCode: string;
  retryable: boolean;
  isRetried: boolean;
}

interface RetryContextLike {
  userMessageId: number;
  [key: string]: unknown;
}

interface ErrorMessageInput {
  chatSessionId: string;
  userId: string;
  messageType: "assistant";
  content: string;
  errorCode: string;
  errorDetail: string;
  retryable: true;
  retryOfMessageId: number | null;
  metadata: { retryContext: RetryContextLike };
}

export interface ChatErrorPersistenceDependencies {
  createMessage(input: ErrorMessageInput): Promise<{ id: number }>;
  touchSession(sessionId: string): Promise<void>;
  logWarn(
    scope: string,
    message: string,
    fields: Record<string, unknown>,
  ): void;
  logError(
    scope: string,
    message: string,
    fields: Record<string, unknown>,
  ): void;
}

export async function persistChatErrorWithFallback(
  params: {
    error: unknown;
    sessionId: string;
    userId: string;
    retryContext: RetryContextLike;
    retryOfMessageId?: number | null;
  },
  dependencies: ChatErrorPersistenceDependencies,
): Promise<ChatErrorEvent> {
  const classified = classifyChatError(params.error);
  try {
    const message = await dependencies.createMessage({
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
    try {
      await dependencies.touchSession(params.sessionId);
    } catch (error) {
      const touchFailure = classifyChatError(error);
      dependencies.logWarn("chat.errors", "session timestamp update failed", {
        sessionId: params.sessionId,
        errorCode: touchFailure.code,
        error: touchFailure.detail,
      });
    }
    return {
      type: "error",
      error: classified.message,
      messageId: message.id,
      userMessageId: params.retryContext.userMessageId,
      errorCode: classified.code,
      retryable: true,
      isRetried: false,
    };
  } catch (persistenceError) {
    const persistenceFailure = classifyChatError(persistenceError);
    dependencies.logError("chat.errors", "failed to persist terminal error", {
      sessionId: params.sessionId,
      userId: params.userId,
      originalErrorCode: classified.code,
      persistenceErrorCode: persistenceFailure.code,
      error: persistenceFailure.detail,
    });
    return {
      type: "error",
      error: classified.message,
      messageId: null,
      userMessageId: params.retryContext.userMessageId,
      errorCode: classified.code,
      retryable: true,
      isRetried: false,
    };
  }
}
