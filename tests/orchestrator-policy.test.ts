import assert from "node:assert/strict";
import test from "node:test";

import {
  ChatResponseIncompleteError,
  MAX_EXPLORATION_ROUNDS,
  MAX_SQL_FAILURES,
  shouldStopExploration,
  sqlExecutionFeedback,
} from "../lib/ai/orchestrator-policy";
import { classifyChatError } from "../lib/ai/chat-error-classification";

test("reserves the fifth model call after four exploration rounds", () => {
  assert.equal(MAX_EXPLORATION_ROUNDS, 4);
});

test("stops SQL exploration when the shared failure budget is reached", () => {
  assert.equal(MAX_SQL_FAILURES, 2);
  assert.equal(shouldStopExploration(1), false);
  assert.equal(shouldStopExploration(2), true);
});

test("returns actionable feedback for a hallucinated SQL column", () => {
  const error = Object.assign(new Error('column "jm" does not exist'), {
    code: "42703",
  });

  const feedback = sqlExecutionFeedback(error);

  assert.match(feedback, /kolumna „jm” nie istnieje/);
  assert.match(feedback, /schemacie ERP/);
});

test("classifies empty forced synthesis as a retryable chat error code", () => {
  const classified = classifyChatError(new ChatResponseIncompleteError());

  assert.equal(classified.code, "CHAT_RESPONSE_INCOMPLETE");
  assert.equal(
    classified.message,
    "Nie udało się dokończyć odpowiedzi. Spróbuj ponownie.",
  );
});
