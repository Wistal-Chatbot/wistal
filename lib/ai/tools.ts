import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

/** Claude calls this to run a read-only SELECT against the ERP database. */
export const executeSqlTool: Anthropic.Tool = {
  name: "execute_sql",
  description:
    "Wykonaj zapytanie SELECT na bazie ERP (schemat public, tylko do odczytu) i otrzymaj wiersze wynikowe. Używaj do każdego pytania o dane. Dozwolone są wyłącznie zapytania SELECT.",
  input_schema: {
    type: "object",
    properties: {
      sql: {
        type: "string",
        description:
          "Pojedyncze zapytanie SELECT w dialekcie PostgreSQL. Bez średnika na końcu.",
      },
    },
    required: ["sql"],
  },
};

/** Claude calls this instead of guessing when a question is ambiguous. */
export const askClarificationTool: Anthropic.Tool = {
  name: "ask_clarification",
  description:
    "Zadaj użytkownikowi pytanie doprecyzowujące, gdy zapytanie jest niejednoznaczne lub brakuje informacji (np. którego klienta lub jakiego zakresu dat dotyczy).",
  input_schema: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "Pytanie doprecyzowujące dla użytkownika, po polsku.",
      },
    },
    required: ["question"],
  },
};

/**
 * Tools for one chat turn. Web search is opt-in per session; Sonnet 4.6 supports
 * the dynamic-filtering `web_search_20260209` variant.
 */
export function buildTools(webSearchEnabled: boolean): Anthropic.ToolUnion[] {
  const tools: Anthropic.ToolUnion[] = [executeSqlTool, askClarificationTool];
  if (webSearchEnabled) {
    tools.push({
      type: "web_search_20260209",
      name: "web_search",
      max_uses: 3,
    });
  }
  return tools;
}
