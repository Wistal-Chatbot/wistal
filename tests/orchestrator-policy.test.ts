import assert from "node:assert/strict";
import test from "node:test";

import type Anthropic from "@anthropic-ai/sdk";

import {
  buildFinalizationMessages,
  ChatResponseIncompleteError,
  FINALIZATION_INSTRUCTION,
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

test("asks for the forced final answer in a trailing user turn", () => {
  // A system-only instruction after a `tool_result` turn returns an empty
  // `end_turn` message, which surfaces as CHAT_RESPONSE_INCOMPLETE.
  const explored: Anthropic.MessageParam[] = [
    { role: "user", content: "Przeanalizuj fakturę FA/1/02/2022." },
    {
      role: "assistant",
      content: [
        { type: "tool_use", id: "toolu_1", name: "execute_sql", input: {} },
      ],
    },
    {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "toolu_1", content: "{}" },
      ],
    },
  ];

  const finalization = buildFinalizationMessages(explored);
  const last = finalization[finalization.length - 1];

  assert.equal(finalization.length, explored.length + 1);
  assert.equal(last.role, "user");
  assert.equal(last.content, FINALIZATION_INSTRUCTION);
});

test("leaves the explored message array untouched when finalizing", () => {
  const explored: Anthropic.MessageParam[] = [
    { role: "user", content: "Ile mamy kontrahentów?" },
  ];

  buildFinalizationMessages(explored);

  assert.equal(explored.length, 1);
});

test("classifies empty forced synthesis as a retryable chat error code", () => {
  const classified = classifyChatError(new ChatResponseIncompleteError());

  assert.equal(classified.code, "CHAT_RESPONSE_INCOMPLETE");
  assert.equal(
    classified.message,
    "Nie udało się dokończyć odpowiedzi. Spróbuj ponownie.",
  );
});
