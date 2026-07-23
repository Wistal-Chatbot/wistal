import assert from "node:assert/strict";
import test from "node:test";

import { isTransientNetworkError, retryRead } from "../lib/db/retry-read";

test("detects a transient network code nested inside a query error", () => {
  const connectionError = Object.assign(new Error("connection reset"), {
    code: "ECONNRESET",
  });
  const queryError = new Error("query failed", { cause: connectionError });

  assert.equal(isTransientNetworkError(queryError), true);
});

test("does not classify a database error as transient", () => {
  const databaseError = Object.assign(new Error("relation does not exist"), {
    code: "42P01",
  });

  assert.equal(isTransientNetworkError(databaseError), false);
});

test("retries a read after a transient connection failure", async () => {
  let attempts = 0;

  const result = await retryRead(async () => {
    attempts += 1;
    if (attempts === 1) {
      throw Object.assign(new Error("connection reset"), { code: "ECONNRESET" });
    }
    return "user";
  }, [0]);

  assert.equal(result, "user");
  assert.equal(attempts, 2);
});

test("does not retry non-transient failures", async () => {
  let attempts = 0;
  const databaseError = Object.assign(new Error("invalid query"), { code: "42601" });

  await assert.rejects(
    retryRead(async () => {
      attempts += 1;
      throw databaseError;
    }, [0]),
    databaseError,
  );
  assert.equal(attempts, 1);
});
