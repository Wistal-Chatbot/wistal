import assert from "node:assert/strict";
import test from "node:test";

import { ChatResponsePersistenceError } from "../lib/ai/chat-error-classification";
import { persistChatErrorWithFallback } from "../lib/ai/chat-error-persistence-core";

test("emits a non-persisted terminal error when the error row also cannot be saved", async () => {
  let touchCalled = false;
  const loggedErrors: string[] = [];

  const event = await persistChatErrorWithFallback(
    {
      error: new ChatResponsePersistenceError(
        Object.assign(new Error("database unavailable"), {
          code: "ECONNREFUSED",
        }),
      ),
      sessionId: "f1429375-dbf9-4334-9415-94e707da89dc",
      userId: "990f114e-08a2-44f9-a030-8eaa6ae78923",
      retryContext: { kind: "chat", userMessageId: 129 },
    },
    {
      createMessage: async () => {
        throw Object.assign(new Error("database still unavailable"), {
          code: "ECONNREFUSED",
        });
      },
      touchSession: async () => {
        touchCalled = true;
      },
      logWarn: () => {},
      logError: (_scope, message) => {
        loggedErrors.push(message);
      },
    },
  );

  assert.deepEqual(event, {
    type: "error",
    error: "Nie udało się zapisać odpowiedzi. Spróbuj ponownie.",
    messageId: null,
    userMessageId: 129,
    errorCode: "CHAT_RESPONSE_NOT_SAVED",
    retryable: true,
    isRetried: false,
  });
  assert.equal(touchCalled, false);
  assert.deepEqual(loggedErrors, ["failed to persist terminal error"]);
});

test("does not discard a persisted terminal error when touching the session fails", async () => {
  const loggedWarnings: string[] = [];

  const event = await persistChatErrorWithFallback(
    {
      error: new Error("upstream failed"),
      sessionId: "f1429375-dbf9-4334-9415-94e707da89dc",
      userId: "990f114e-08a2-44f9-a030-8eaa6ae78923",
      retryContext: { kind: "chat", userMessageId: 129 },
    },
    {
      createMessage: async () => ({ id: 130 }),
      touchSession: async () => {
        throw new Error("timestamp update failed");
      },
      logWarn: (_scope, message) => {
        loggedWarnings.push(message);
      },
      logError: () => {},
    },
  );

  assert.equal(event.messageId, 130);
  assert.equal(event.userMessageId, 129);
  assert.deepEqual(loggedWarnings, ["session timestamp update failed"]);
});
