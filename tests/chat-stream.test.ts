import assert from "node:assert/strict";
import test from "node:test";

import {
  dispatchTurnStreamLine,
  pumpTurnStream,
  type StreamHandlers,
} from "../app/app/chat/chatApi";

function recordingHandlers(events: string[]): StreamHandlers {
  return {
    onStatus: (text) => events.push(`status:${text}`),
    onDelta: (text) => events.push(`delta:${text}`),
    onMeta: (_source, _metrics, meta) =>
      events.push(`meta:${meta.messageId}`),
    onError: (error) => events.push(`error:${error.message}`),
  };
}

test("dispatches working status separately from answer content", () => {
  const events: string[] = [];
  const handlers = recordingHandlers(events);

  dispatchTurnStreamLine(
    JSON.stringify({ type: "status", text: "Sprawdzam dane w systemie ERP…" }),
    handlers,
  );
  dispatchTurnStreamLine(
    JSON.stringify({ type: "delta", text: "Gotowa odpowiedź." }),
    handlers,
  );

  assert.deepEqual(events, [
    "status:Sprawdzam dane w systemie ERP…",
    "delta:Gotowa odpowiedź.",
  ]);
});

test("ignores malformed and unknown stream frames", () => {
  const events: string[] = [];
  const handlers = recordingHandlers(events);

  dispatchTurnStreamLine("not-json", handlers);
  dispatchTurnStreamLine(JSON.stringify({ type: "status", text: 123 }), handlers);
  dispatchTurnStreamLine(JSON.stringify({ type: "unknown", text: "ignored" }), handlers);

  assert.deepEqual(events, []);
});

test("dispatches persisted error metadata separately from its copy", () => {
  const events: string[] = [];
  const handlers = recordingHandlers(events);

  dispatchTurnStreamLine(
    JSON.stringify({
      type: "error",
      error: "Usługa nie odpowiedziała na czas. Spróbuj ponownie.",
      messageId: 42,
      errorCode: "CHAT_UPSTREAM_TIMEOUT",
      retryable: true,
      isRetried: false,
    }),
    {
      ...handlers,
      onError: (error) =>
        events.push(
          `error:${error.messageId}:${error.errorCode}:${error.retryable}`,
        ),
    },
  );

  assert.deepEqual(events, ["error:42:CHAT_UPSTREAM_TIMEOUT:true"]);
});

test("makes an unstructured HTTP 500 retryable", async () => {
  let received:
    | {
        message: string;
        errorCode: string | null;
        retryable: boolean;
      }
    | undefined;
  const handlers = recordingHandlers([]);
  handlers.onError = (error) => {
    received = error;
  };

  await pumpTurnStream(
    new Response("<html>Internal Server Error</html>", {
      status: 500,
      headers: { "Content-Type": "text/html" },
    }),
    handlers,
  );

  assert.deepEqual(received, {
    message: "Wystąpił błąd. Spróbuj ponownie.",
    messageId: null,
    errorCode: "CHAT_SERVER_ERROR",
    retryable: true,
    isRetried: false,
  });
});
