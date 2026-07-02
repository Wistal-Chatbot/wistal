import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import { isBizraportConfigured } from "@/lib/bizraport/client";

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

/** Claude calls this to fetch external company data from BizRaport by NIP or KRS. */
export const getCompanyInfoTool: Anthropic.Tool = {
  name: "get_company_info",
  description:
    "Pobierz kompleksowe dane o polskiej firmie z BizRaport: dane rejestrowe (KRS), dane finansowe (przychody, zysk netto, EBITDA, wskaźniki rentowności, modele ryzyka), opis działalności, powiązania i udziałowców, wpisy z Monitora Sądowego oraz KRZ. Podaj NIP albo KRS. Dla klientów z ERP najpierw ustal NIP zapytaniem SELECT do tabeli kontrahenci, a potem użyj tego narzędzia.",
  input_schema: {
    type: "object",
    properties: {
      nip: {
        type: "string",
        description: "NIP firmy (10 cyfr). Wymagany, jeśli nie podano KRS.",
      },
      krs: {
        type: "string",
        description: "Numer KRS firmy. Wymagany, jeśli nie podano NIP.",
      },
    },
  },
};

/** Claude calls this to resolve a company name/NIP/KRS/REGON to KRS numbers. */
export const searchCompanyTool: Anthropic.Tool = {
  name: "search_company",
  description:
    "Wyszukaj firmy w BizRaport po nazwie, NIP, KRS lub REGON. Zwraca listę numerów KRS. Użyj, gdy nie znasz NIP ani KRS firmy, a następnie pobierz szczegóły przez get_company_info.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Fraza wyszukiwania: nazwa firmy, NIP, KRS lub REGON.",
      },
      limit: {
        type: "integer",
        description: "Maksymalna liczba zwróconych wyników (opcjonalnie).",
      },
    },
    required: ["query"],
  },
};

/**
 * Tools for one chat turn. The BizRaport company tools are added whenever the API
 * is configured; web search is opt-in per session (Sonnet 4.6 supports the
 * dynamic-filtering `web_search_20260209` variant).
 */
export function buildTools(webSearchEnabled: boolean): Anthropic.ToolUnion[] {
  const tools: Anthropic.ToolUnion[] = [executeSqlTool, askClarificationTool];
  if (isBizraportConfigured()) {
    tools.push(getCompanyInfoTool, searchCompanyTool);
  }
  if (webSearchEnabled) {
    tools.push({
      type: "web_search_20260209",
      name: "web_search",
      max_uses: 3,
    });
  }
  return tools;
}
