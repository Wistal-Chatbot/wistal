import assert from "node:assert/strict";
import test from "node:test";

import {
  ChatResponsePersistenceError,
  classifyChatError,
} from "../lib/ai/chat-error-classification";

test("maps a nested Upstash connection timeout to a safe support code", () => {
  const cause = Object.assign(
    new Error(
      "Connect Timeout Error (attempted address: harmless-serval-106044.upstash.io:443)",
    ),
    { code: "UND_ERR_CONNECT_TIMEOUT" },
  );
  const error = new TypeError("fetch failed", { cause });

  const classified = classifyChatError(error);

  assert.equal(classified.code, "CHAT_UPSTREAM_TIMEOUT");
  assert.equal(
    classified.message,
    "Usługa nie odpowiedziała na czas. Spróbuj ponownie.",
  );
  assert.match(classified.detail, /upstash\.io/);
  assert.doesNotMatch(classified.message, /upstash|443/i);
});

test("maps unknown exceptions without exposing their detail", () => {
  const classified = classifyChatError(new Error("secret internal detail"));

  assert.equal(classified.code, "CHAT_SERVICE_UNAVAILABLE");
  assert.doesNotMatch(classified.message, /secret internal detail/);
  assert.match(classified.detail, /secret internal detail/);
});

test("classifies an unsaved generated answer separately from provider failures", () => {
  const classified = classifyChatError(
    new ChatResponsePersistenceError(new Error("database connection failed")),
  );

  assert.equal(classified.code, "CHAT_RESPONSE_NOT_SAVED");
  assert.equal(
    classified.message,
    "Nie udało się zapisać odpowiedzi. Spróbuj ponownie.",
  );
  assert.match(classified.detail, /database connection failed/);
});

test("keeps Drizzle query parameters out of diagnostic details", () => {
  const cause = Object.assign(new Error("connection timed out"), {
    code: "ETIMEDOUT",
  });
  const wrapper = Object.assign(
    new Error("Failed query: insert into chat_messages\nparams: tajne dane ERP", {
      cause,
    }),
    {
      query: "insert into chat_messages values ($1)",
      params: ["tajne dane ERP"],
    },
  );

  const classified = classifyChatError(wrapper);

  assert.doesNotMatch(classified.detail, /tajne dane ERP/);
  assert.match(classified.detail, /ETIMEDOUT/);
});
