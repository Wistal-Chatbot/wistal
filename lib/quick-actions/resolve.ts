import "server-only";

import {
  parseCustomInput,
  resolvePromptTemplate,
  type CustomInput,
  type QuickActionDto,
  type QuickActionInputDto,
  type QuickActionOption,
} from "@/lib/api/quick-actions-types";
import type { QuickAction } from "@/lib/db/schema";
import { log } from "@/lib/log";
import { enforceRowLimit } from "@/lib/sql/enforce-row-limit";
import { executeReadOnly } from "@/lib/sql/execute";
import { getPublicTableAllowlist } from "@/lib/sql/allowlist";
import { validateSql } from "@/lib/sql/validate";

const OPTION_ROW_LIMIT = 500;
const OPTION_TIMEOUT_MS = 10_000;
const MAX_TEXT_LENGTH = 500;

type SelectConfig = Extract<CustomInput, { type: "select_from_db" }>;

/**
 * Runs a `select_from_db` query through the same read-only SQL stack the chatbot
 * uses (allowlist + SELECT-only validator + row limit + READ ONLY transaction),
 * then maps rows to `{ value, label }` options. Throws if the query is invalid.
 */
export async function resolveSelectOptions(
  config: SelectConfig,
): Promise<QuickActionOption[]> {
  const allowlist = await getPublicTableAllowlist();
  const validation = validateSql(config.query, allowlist);
  if (!validation.ok) {
    throw new Error(`Nieprawidłowe zapytanie akcji: ${validation.error}`);
  }

  const { rows } = await executeReadOnly(
    enforceRowLimit(config.query, OPTION_ROW_LIMIT),
    { timeoutMs: OPTION_TIMEOUT_MS },
  );

  const labelColumn = config.labelColumn ?? config.valueColumn;
  const options: QuickActionOption[] = [];
  for (const row of rows) {
    const value = row[config.valueColumn];
    if (value === null || value === undefined) continue;
    const label = row[labelColumn];
    options.push({
      value: String(value),
      label: label === null || label === undefined ? String(value) : String(label),
    });
  }
  return options;
}

/**
 * Serializes a quick action to its client DTO, resolving `select_from_db` options
 * server-side. A broken option query never breaks the list — it yields an empty
 * option set and is logged.
 */
export async function toQuickActionDto(
  action: QuickAction,
): Promise<QuickActionDto> {
  const config = parseCustomInput(action.customInput);

  let input: QuickActionInputDto | null = null;
  if ("type" in config) {
    input = {
      type: config.type,
      label: config.label,
      placeholder: config.type === "text" ? config.placeholder : undefined,
      required: config.required ?? false,
    };
    if (config.type === "select_from_db") {
      try {
        input.options = await resolveSelectOptions(config);
      } catch (error) {
        log.error("quick-actions", "select_from_db option resolve failed", {
          key: action.key,
          error: error instanceof Error ? error.message : String(error),
        });
        input.options = [];
      }
    }
  }

  return {
    key: action.key,
    name: action.namePl,
    description: action.descriptionPl,
    category: action.category,
    input,
    usesWebSearch: action.usesWebSearch,
  };
}

export type ResolveResult =
  | { ok: true; prompt: string }
  | { ok: false; error: string };

/**
 * Validates the user-supplied `input` against a quick action's `custom_input`
 * config and returns the effective user message (template with the value
 * substituted). For `select_from_db`, the value must be one of the resolved
 * options — this blocks arbitrary values from being injected into the prompt.
 */
export async function validateAndResolvePrompt(
  action: Pick<QuickAction, "promptTemplate" | "customInput">,
  rawInput: string | null,
): Promise<ResolveResult> {
  const config = parseCustomInput(action.customInput);

  // No input configured → ignore anything the client sent.
  if (!("type" in config)) {
    return { ok: true, prompt: resolvePromptTemplate(action.promptTemplate, null) };
  }

  const value = (rawInput ?? "").trim();
  const required = config.required ?? false;

  if (!value) {
    if (required) {
      return { ok: false, error: `Pole „${config.label}” jest wymagane.` };
    }
    return { ok: true, prompt: resolvePromptTemplate(action.promptTemplate, null) };
  }

  if (config.type === "text") {
    if (value.length > MAX_TEXT_LENGTH) {
      return {
        ok: false,
        error: `Wartość pola „${config.label}” jest zbyt długa (maks. ${MAX_TEXT_LENGTH} znaków).`,
      };
    }
    return { ok: true, prompt: resolvePromptTemplate(action.promptTemplate, value) };
  }

  // select_from_db → value must match one of the resolved options.
  const options = await resolveSelectOptions(config);
  const chosen = options.find((option) => option.value === value);
  if (!chosen) {
    return { ok: false, error: "Wybrana wartość jest nieprawidłowa." };
  }
  // Substitute the human-readable label for a natural-language prompt.
  return {
    ok: true,
    prompt: resolvePromptTemplate(action.promptTemplate, chosen.label),
  };
}
