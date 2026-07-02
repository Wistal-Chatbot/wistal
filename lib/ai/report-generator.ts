import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import {
  generatedReportConfigSchema,
  type ReportConfigDraft,
} from "@/lib/api/ai-reports-types";
import { isBizraportConfigured } from "@/lib/bizraport/client";
import { log } from "@/lib/log";

import { CHAT_MODEL, getAnthropic } from "./anthropic";
import { ERP_SCHEMA_DESCRIPTION } from "./erp-schema";

/**
 * The whole config (system_prompt + an HTML widget) is emitted in one tool call,
 * so the ceiling must be generous — too low truncates the trailing fields
 * (html_widget/input_params/model_config) and the config fails validation.
 */
const REPORT_GEN_MAX_TOKENS = 16000;

/** Single forced tool — the only way the model returns the report config. */
const saveReportConfigTool: Anthropic.Tool = {
  name: "save_report_config",
  description:
    "Zapisz kompletną konfigurację raportu AI wygenerowaną na podstawie opisu administratora.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Krótka nazwa raportu (po polsku)." },
      description: {
        type: "string",
        description: "Jednozdaniowy opis, co raport robi (po polsku).",
      },
      system_prompt: {
        type: "string",
        description:
          "Pełny system prompt sterujący wykonaniem raportu: co model ma policzyć/pobrać, z jakich źródeł skorzystać i jak zbudować output zgodny z output_schema.",
      },
      output_schema: {
        type: "object",
        description:
          "Definicja JSON, który raport zwróci: mapa nazw pól na ich typy/opis (np. { \"score\": \"integer\", \"recommendation\": \"string\" }).",
      },
      html_widget: {
        type: "string",
        description:
          "ZWIĘZŁY, dopracowany fragment HTML dashboardu (po polsku) renderujący output_data raportu — bez <!DOCTYPE>, <html>, <head> ani <script>. Ma wyglądać jak gotowy panel analityczny: nagłówek, karty KPI, sekcje, tabele i proste diagramy CSS-only (paski, skale, osie, badge). Do wstawiania danych używaj składni Mustache opartej na nazwach pól z output_schema: {{pole}} dla wartości, {{#lista}}…{{/lista}} dla tablic (w środku {{pole_elementu}}, a dla listy wartości prostych {{.}}), {{^pole}}…{{/pole}} gdy pole jest puste. Trzymaj go kompaktowo.",
      },
      input_params: {
        type: "object",
        description:
          "Parametry wymagane od użytkownika, np. { \"kontrahent_kod\": { \"type\": \"text\", \"label\": \"Kod klienta\", \"required\": true } }. Pusty obiekt, jeśli brak.",
      },
      model_config: {
        type: "object",
        description:
          "Konfiguracja wykonania: { web_search: boolean, tables: string[], uses_company_lookup: boolean, max_tokens: number }.",
      },
    },
    required: [
      "name",
      "system_prompt",
      "output_schema",
      "html_widget",
      "input_params",
      "model_config",
    ],
  },
};

function buildSystemPrompt(): string {
  const bizraportCapability = isBizraportConfigured()
    ? `- **BizRaport** (dane zewnętrzne o polskich firmach): narzędzia \`get_company_info\` (po NIP/KRS) i \`search_company\` (po nazwie) — dane rejestrowe KRS, finansowe, powiązania, KRZ, Monitor Sądowy. W \`model_config\` ustaw \`uses_company_lookup: true\`, gdy raport ma z nich korzystać. Dla klienta z ERP NIP ustala się zapytaniem do \`kontrahenci\`.\n`
    : "";

  return `Jesteś generatorem konfiguracji Raportów AI dla wewnętrznego systemu ERP firmy Wistal (handel wyrobami hutniczymi/stalowymi).
Administrator opisze słownie, co raport ma robić. Twoim zadaniem jest wygenerować KOMPLETNĄ konfigurację raportu i zwrócić ją WYŁĄCZNIE przez wywołanie narzędzia \`save_report_config\`.

${ERP_SCHEMA_DESCRIPTION}

# Dostępne źródła danych, z których raport może korzystać
- **ERP (SQL)**: zapytania \`SELECT\` (tylko do odczytu) po tabelach ERP wymienionych wyżej. W \`model_config.tables\` wypisz tabele, których raport realnie używa.
${bizraportCapability}- **Wyszukiwanie w internecie**: ustaw \`model_config.web_search: true\`, jeśli raport potrzebuje danych spoza ERP i BizRaport.

# Co masz wygenerować
- **name** — zwięzła nazwa raportu.
- **description** — jedno zdanie, co raport robi.
- **system_prompt** — pełna instrukcja wykonania raportu: jakie dane pobrać (SQL / BizRaport / web), jak je przetworzyć i jak zbudować wynik ściśle zgodny z \`output_schema\`. Nakazuj opieranie się wyłącznie na pobranych danych (bez zmyślania liczb) i odpowiedzi po polsku.
- **output_schema** — obiekt JSON opisujący pola wyniku (nazwa → typ), np. \`{ "score": "integer", "risk_level": "string", "recommendation": "string" }\`.
- **html_widget** — ZWIĘZŁY, estetyczny fragment HTML (po polsku) prezentujący wynik jako gotowy **dashboard/panel analityczny**, bez \`<!DOCTYPE>\`/\`<html>\`/\`<head>\`/\`<script>\`. To nie może być sam tekst. Używaj:
  - nagłówka z nazwą/okresem/parametrami,
  - kart KPI z dużymi wartościami i krótkim kontekstem,
  - sekcji tematycznych z wyraźnymi tytułami,
  - tabel dla list i porównań,
  - prostych diagramów CSS-only: paski postępu, skale ryzyka, mini wykresy słupkowe, timeline, badge statusów,
  - neutralnej palety Wistal: granat \`#1E2188\`, tło \`#eaecf0\`, powierzchnie białe, akcenty czerwony/zielony.
  Wstawiaj dane składnią **Mustache** wg nazw pól z \`output_schema\`: \`{{pole}}\` (wartość), \`{{#lista}}…{{/lista}}\` (tablice, w środku \`{{pole_elementu}}\`), \`{{^pole}}…{{/pole}}\` (gdy brak). Placeholdery muszą odpowiadać polom z \`output_schema\`. Dodawaj czytelne stany puste przez \`{{^lista}}\`.
- **input_params** — parametry od użytkownika (np. kod klienta / NIP). Pusty obiekt, jeśli raport ich nie potrzebuje.
- **model_config** — \`{ web_search, tables, uses_company_lookup, max_tokens }\` dopasowane do tego, czego raport faktycznie używa.

# Zasady
- Dobieraj źródła danych do opisu — nie włączaj możliwości, których raport nie potrzebuje.
- \`output_schema\` i \`html_widget\` muszą być spójne (te same pola).
- Cała treść widoczna dla użytkownika (name, description, html_widget, komunikaty w system_prompt) po polsku.`;
}

/**
 * Turns an admin's plain-language brief into a full report config via a single
 * forced tool-use call. Throws when the model returns no tool use or an invalid
 * config (the route maps that to a 502).
 */
export async function generateReportConfig(
  description: string,
): Promise<ReportConfigDraft> {
  const response = await getAnthropic().messages.create({
    model: CHAT_MODEL,
    max_tokens: REPORT_GEN_MAX_TOKENS,
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: description }],
    tools: [saveReportConfigTool],
    tool_choice: { type: "tool", name: "save_report_config" },
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === "tool_use" && block.name === "save_report_config",
  );
  if (!toolUse) {
    log.warn("ai.report-generator", "no tool_use in response", {
      stopReason: response.stop_reason,
    });
    throw new Error("Model nie zwrócił konfiguracji raportu.");
  }

  const parsed = generatedReportConfigSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    // `max_tokens` here means the tool JSON was truncated — raise REPORT_GEN_MAX_TOKENS.
    log.warn("ai.report-generator", "invalid generated config", {
      stopReason: response.stop_reason,
      issues: parsed.error.issues.map((i) => i.path.join(".")),
    });
    throw new Error("Wygenerowana konfiguracja raportu jest nieprawidłowa.");
  }

  const c = parsed.data;
  log.info("ai.report-generator", "config generated", {
    name: c.name,
    tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
  });

  return {
    name: c.name,
    description: c.description ?? null,
    systemPrompt: c.system_prompt,
    outputSchema: c.output_schema,
    htmlWidget: c.html_widget,
    inputParams: c.input_params,
    modelConfig: c.model_config,
  };
}
