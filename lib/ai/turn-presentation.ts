export function finalAnswerFromModelTurn(
  stopReason: string | null,
  text: string,
): string | null {
  if (stopReason === "tool_use" || stopReason === "pause_turn") return null;
  return text.trim();
}

export function workingStatusForTools(toolNames: Iterable<string>): string | null {
  const names = new Set(toolNames);

  if (names.has("execute_sql")) return "Sprawdzam dane w systemie ERP…";
  if (names.has("get_company_info") || names.has("search_company")) {
    return "Pobieram dane o firmie…";
  }
  if (names.has("get_google_rating")) {
    return "Sprawdzam informacje w internecie…";
  }
  return null;
}
