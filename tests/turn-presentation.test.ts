import assert from "node:assert/strict";
import test from "node:test";

import {
  finalAnswerFromModelTurn,
  workingStatusForTools,
} from "../lib/ai/turn-presentation";

test("discards temporary text from tool and paused model turns", () => {
  assert.equal(
    finalAnswerFromModelTurn("tool_use", "Najpierw sprawdzę dane."),
    null,
  );
  assert.equal(
    finalAnswerFromModelTurn("pause_turn", "Wyszukuję informacje."),
    null,
  );
});

test("returns only trimmed text from the final model turn", () => {
  assert.equal(
    finalAnswerFromModelTurn("end_turn", "  Oto właściwa odpowiedź.  "),
    "Oto właściwa odpowiedź.",
  );
});

test("maps tools to polished working statuses", () => {
  assert.equal(
    workingStatusForTools(["execute_sql"]),
    "Sprawdzam dane w systemie ERP…",
  );
  assert.equal(
    workingStatusForTools(["search_company"]),
    "Pobieram dane o firmie…",
  );
  assert.equal(
    workingStatusForTools(["get_google_rating"]),
    "Sprawdzam informacje w internecie…",
  );
});
