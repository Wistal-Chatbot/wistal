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
      userMessageId: 41,
      errorCode: "CHAT_UPSTREAM_TIMEOUT",
      retryable: true,
      isRetried: false,
    }),
    {
      ...handlers,
      onError: (error) =>
        events.push(
          `error:${error.userMessageId}:${error.messageId}:${error.errorCode}:${error.retryable}`,
        ),
    },
  );

  assert.deepEqual(events, ["error:41:42:CHAT_UPSTREAM_TIMEOUT:true"]);
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
    userMessageId: null,
    errorCode: "CHAT_SERVER_ERROR",
    retryable: true,
    isRetried: false,
  });
});

test("reports a retryable error when the stream closes without a terminal frame", async () => {
  const events: string[] = [];
  let receivedError:
    | {
        message: string;
        errorCode: string | null;
        retryable: boolean;
      }
    | undefined;
  const handlers = recordingHandlers(events);
  handlers.onError = (error) => {
    receivedError = {
      message: error.message,
      errorCode: error.errorCode,
      retryable: error.retryable,
    };
  };

  await pumpTurnStream(
    new Response(
      `${JSON.stringify({ type: "delta", text: "Gotowa odpowiedź." })}\n`,
      {
        status: 200,
        headers: { "Content-Type": "application/x-ndjson" },
      },
    ),
    handlers,
  );

  assert.deepEqual(events, ["delta:Gotowa odpowiedź."]);
  assert.deepEqual(receivedError, {
    message:
      "Połączenie zakończyło się przed zapisaniem odpowiedzi. Spróbuj ponownie.",
    errorCode: "CHAT_STREAM_INCOMPLETE",
    retryable: true,
  });
});

test("finishes as soon as persisted metadata arrives", async () => {
  const events: string[] = [];
  const encoder = new TextEncoder();
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          [
            JSON.stringify({ type: "delta", text: "Gotowa odpowiedź." }),
            JSON.stringify({
              type: "meta",
              messageId: 42,
              userMessageId: 41,
              tables: [],
            }),
            "",
          ].join("\n"),
        ),
      );
    },
    cancel() {
      cancelled = true;
    },
  });

  await pumpTurnStream(
    new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/x-ndjson" },
    }),
    recordingHandlers(events),
  );

  assert.deepEqual(events, ["delta:Gotowa odpowiedź.", "meta:42"]);
  assert.equal(cancelled, true);
});
