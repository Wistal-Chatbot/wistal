export interface ClassifiedChatError {
  code: string;
  message: string;
  detail: string;
}

function errorChain(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (current instanceof Error) {
      parts.push(`${current.name}: ${current.message}`);
      current = (current as Error & { cause?: unknown }).cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join(" | ");
}

export function classifyChatError(error: unknown): ClassifiedChatError {
  const detail = errorChain(error);
  const code = (error as { code?: string } | null)?.code;
  const causeCode = (error as { cause?: { code?: string } } | null)?.cause?.code;

  if (
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    causeCode === "UND_ERR_CONNECT_TIMEOUT" ||
    /connect timeout|timed out|timeout/i.test(detail)
  ) {
    return {
      code: "CHAT_UPSTREAM_TIMEOUT",
      message: "Usługa nie odpowiedziała na czas. Spróbuj ponownie.",
      detail,
    };
  }
  if (/anthropic|api.*provider|serwis ai/i.test(detail)) {
    return {
      code: "CHAT_AI_UNAVAILABLE",
      message: "Serwis AI jest tymczasowo niedostępny. Spróbuj ponownie.",
      detail,
    };
  }
  if (/postgres|database|neon|sql/i.test(detail)) {
    return {
      code: "CHAT_DATABASE_UNAVAILABLE",
      message: "Nie udało się pobrać danych. Spróbuj ponownie.",
      detail,
    };
  }
  return {
    code: "CHAT_SERVICE_UNAVAILABLE",
    message: "Wystąpił błąd podczas przygotowywania odpowiedzi. Spróbuj ponownie.",
    detail,
  };
}
