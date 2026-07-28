import assert from "node:assert/strict";
import test from "node:test";

import {
  expandSchemaPlaceholder,
  isStale,
  resolvePromptMap,
  PROMPT_CACHE_TTL_MS,
} from "../lib/ai/prompt-cache-core";
import {
  ERP_SCHEMA_PLACEHOLDER,
  PROMPT_DEFAULTS,
  PROMPT_KEYS,
  isPromptKey,
} from "../lib/ai/prompt-defaults";

test("resolvePromptMap uses stored content when present", () => {
  const map = resolvePromptMap([
    { key: "chat_system", content: "nowy prompt" },
    { key: "data_answer", content: "nowa odpowiedź" },
  ]);

  assert.equal(map.chat_system, "nowy prompt");
  assert.equal(map.data_answer, "nowa odpowiedź");
});

test("resolvePromptMap falls back to defaults for missing keys", () => {
  const map = resolvePromptMap([{ key: "chat_system", content: "nowy" }]);

  // Every key must resolve, not just the one that had a row.
  for (const key of PROMPT_KEYS) {
    assert.equal(typeof map[key], "string");
    assert.ok(map[key].length > 0, `${key} resolved empty`);
  }
  assert.equal(map.chat_bizraport, PROMPT_DEFAULTS.chat_bizraport);
});

test("resolvePromptMap falls back when stored content is blank", () => {
  // A row saved as whitespace must not become an empty system prompt.
  const map = resolvePromptMap([
    { key: "chat_system", content: "   \n  " },
    { key: "data_answer", content: "" },
  ]);

  assert.equal(map.chat_system, PROMPT_DEFAULTS.chat_system);
  assert.equal(map.data_answer, PROMPT_DEFAULTS.data_answer);
});

test("resolvePromptMap ignores unknown keys", () => {
  const map = resolvePromptMap([
    { key: "retired_prompt", content: "stare" },
    { key: "chat_system", content: "nowy" },
  ]);

  assert.equal(map.chat_system, "nowy");
  assert.equal(Object.keys(map).length, PROMPT_KEYS.length);
  assert.ok(!("retired_prompt" in map));
});

test("resolvePromptMap on an empty table returns the shipped defaults", () => {
  assert.deepEqual(resolvePromptMap([]), { ...PROMPT_DEFAULTS });
});

test("isStale flips only once the TTL has elapsed", () => {
  const state = { prompts: { ...PROMPT_DEFAULTS }, fetchedAt: 1_000 };

  assert.equal(isStale(state, 1_000), false);
  assert.equal(isStale(state, 1_000 + PROMPT_CACHE_TTL_MS - 1), false);
  assert.equal(isStale(state, 1_000 + PROMPT_CACHE_TTL_MS), true);
  assert.equal(isStale(state, 1_000 + PROMPT_CACHE_TTL_MS * 5), true);
});

test("expandSchemaPlaceholder injects the schema", () => {
  const text = `przed\n${ERP_SCHEMA_PLACEHOLDER}\npo`;
  assert.equal(expandSchemaPlaceholder(text, "SCHEMAT"), "przed\nSCHEMAT\npo");
});

test("expandSchemaPlaceholder replaces every occurrence", () => {
  const text = `${ERP_SCHEMA_PLACEHOLDER} i ${ERP_SCHEMA_PLACEHOLDER}`;
  assert.equal(expandSchemaPlaceholder(text, "X"), "X i X");
});

test("expandSchemaPlaceholder leaves text without the placeholder alone", () => {
  assert.equal(expandSchemaPlaceholder("bez znacznika", "SCHEMAT"), "bez znacznika");
});

test("expandSchemaPlaceholder does not treat $ in the schema as a replacement pattern", () => {
  // split/join is used precisely so `$&` in the ERP schema isn't interpreted.
  const out = expandSchemaPlaceholder(ERP_SCHEMA_PLACEHOLDER, "kwota $& USD");
  assert.equal(out, "kwota $& USD");
});

test("the default chat prompt carries the schema placeholder", () => {
  // If this ever stops holding, the model silently loses the ERP schema.
  assert.ok(PROMPT_DEFAULTS.chat_system.includes(ERP_SCHEMA_PLACEHOLDER));
});

test("isPromptKey guards the admin route params", () => {
  assert.equal(isPromptKey("chat_system"), true);
  assert.equal(isPromptKey("data_answer"), true);
  assert.equal(isPromptKey("../../etc/passwd"), false);
  assert.equal(isPromptKey("nieznany"), false);
});
