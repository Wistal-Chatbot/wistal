import assert from "node:assert/strict";
import test from "node:test";

import { classifyChatError } from "../lib/ai/chat-error-classification";

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
