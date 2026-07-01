import "server-only";

import {
  parseCustomInput,
  resolvePromptTemplate,
  type QuickActionDto,
  type QuickActionInputDto,
} from "@/lib/api/quick-actions-types";
import type { QuickAction } from "@/lib/db/schema";

const MAX_TEXT_LENGTH = 500;

/**
 * Serializes a quick action to its client DTO. `row_from_table` rows are NOT
 * embedded — the chat searches them lazily via the rows endpoint — so this no
 * longer touches the database.
 */
export function toQuickActionDto(action: QuickAction): QuickActionDto {
  const config = parseCustomInput(action.customInput);

  let input: QuickActionInputDto | null = null;
  if ("type" in config) {
    input = {
      type: config.type,
      label: config.label,
      placeholder: config.type === "text" ? config.placeholder : undefined,
      required: config.required ?? false,
    };
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
 * For `none` / `text` actions: validates the input and returns the effective
 * user message (template with the value substituted). `row_from_table` actions
 * do NOT use this — they run a deterministic fetch + data answer instead.
 */
export function validateAndResolvePrompt(
  action: Pick<QuickAction, "promptTemplate" | "customInput">,
  rawInput: string | null,
): ResolveResult {
  const config = parseCustomInput(action.customInput);

  if (!("type" in config)) {
    return {
      ok: true,
      prompt: resolvePromptTemplate(action.promptTemplate, null),
    };
  }

  if (config.type !== "text") {
    // row_from_table is handled by the dedicated run path.
    return { ok: false, error: "Nieobsługiwany typ pola wejścia." };
  }

  const value = (rawInput ?? "").trim();
  const required = config.required ?? false;
  if (!value) {
    if (required) {
      return { ok: false, error: `Pole „${config.label}” jest wymagane.` };
    }
    return {
      ok: true,
      prompt: resolvePromptTemplate(action.promptTemplate, null),
    };
  }
  if (value.length > MAX_TEXT_LENGTH) {
    return {
      ok: false,
      error: `Wartość pola „${config.label}” jest zbyt długa (maks. ${MAX_TEXT_LENGTH} znaków).`,
    };
  }
  return {
    ok: true,
    prompt: resolvePromptTemplate(action.promptTemplate, value),
  };
}
