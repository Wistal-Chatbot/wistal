import type Anthropic from "@anthropic-ai/sdk";

export const MAX_EXPLORATION_ROUNDS = 4;
export const MAX_SQL_FAILURES = 2;

export const FINALIZATION_INSTRUCTION = `Przygotuj teraz końcową odpowiedź dla użytkownika.
Nie wolno Ci używać żadnych narzędzi ani prosić o kolejne zapytanie.
Oprzyj odpowiedź na kontekście rozmowy oraz wynikach zebranych w tej turze.
Jeśli część danych jest niedostępna albo zapytanie zakończyło się błędem, zaznacz to krótko,
ale wykorzystaj wszystkie poprawne wyniki, które już masz. Odpowiedz po polsku.`;

/**
 * Forced finalization must ask for the answer in a *user* turn, not a system
 * block. Exploration always ends on a user turn made of `tool_result` blocks, and
 * from there a system-only instruction leaves the model with nothing left to say:
 * it returns `stop_reason: "end_turn"` with zero content blocks, which surfaces as
 * ChatResponseIncompleteError and discards every row already fetched. The same
 * text as a trailing user turn reliably produces the answer.
 *
 * The caller pairs this with an unmodified `system` and `tools`, plus
 * `tool_choice: "none"`: that keeps the cached prefix (tools + system) identical to
 * the one the exploration rounds already warmed, so finalization is a cache read
 * rather than a second cache entry, and it makes "no more tools" structural
 * instead of a request the model can ignore.
 */
export function buildFinalizationMessages(
  messages: readonly Anthropic.MessageParam[],
): Anthropic.MessageParam[] {
  return [...messages, { role: "user", content: FINALIZATION_INSTRUCTION }];
}

export class ChatResponseIncompleteError extends Error {
  readonly code = "CHAT_RESPONSE_INCOMPLETE";

  constructor() {
    super("Forced chat finalization returned no answer.");
    this.name = "ChatResponseIncompleteError";
  }
}

function errorCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

/** Safe, actionable feedback passed back only to the model's SQL tool result. */
export function sqlExecutionFeedback(error: unknown): string {
  const code = errorCode(error);
  const detail = error instanceof Error ? error.message : String(error);

  if (code === "42703") {
    const column = detail.match(/column "([^"]+)" does not exist/i)?.[1];
    return column
      ? `Błąd SQL: kolumna „${column}” nie istnieje. Użyj wyłącznie kolumn wymienionych w przekazanym schemacie ERP.`
      : "Błąd SQL: użyto nieistniejącej kolumny. Użyj wyłącznie kolumn wymienionych w przekazanym schemacie ERP.";
  }
  if (code === "57014") {
    return "Błąd SQL: zapytanie trwało zbyt długo. Zawęź zakres dat lub dodaj filtry.";
  }
  return "Błąd wykonania SQL. Sprawdź nazwy tabel i kolumn w przekazanym schemacie ERP oraz uprość zapytanie.";
}

export function shouldStopExploration(sqlFailures: number): boolean {
  return sqlFailures >= MAX_SQL_FAILURES;
}
