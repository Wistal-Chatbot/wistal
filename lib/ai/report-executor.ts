import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import { getCompanyData, isBizraportConfigured, searchCompanies } from "@/lib/bizraport/client";
import { insertQueryAudit } from "@/lib/db/queries";
import type { AiReport } from "@/lib/db/schema";
import { log } from "@/lib/log";
import { getPublicTableAllowlist } from "@/lib/sql/allowlist";
import { enforceRowLimit } from "@/lib/sql/enforce-row-limit";
import { executeReadOnly } from "@/lib/sql/execute";
import { validateSql } from "@/lib/sql/validate";

import { CHAT_MODEL, getAnthropic } from "./anthropic";
import { executeSqlTool, getCompanyInfoTool, searchCompanyTool } from "./tools";

const MAX_ITERATIONS = 8;
const ROW_LIMIT = 500;
const STATEMENT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_TOKENS = 4000;

export interface ReportExecutionOutcome {
  outputData: Record<string, unknown>;
  sqlQueries: string[];
  tablesUsed: string[];
  tokensUsed: number;
}

/** The model returns the final report JSON through this tool. */
const submitReportTool: Anthropic.Tool = {
  name: "submit_report",
  description:
    "Zwróć finalne dane raportu jako obiekt JSON w polu `data`, ściśle zgodny z output_schema. Wywołaj to narzędzie na końcu, po zebraniu wszystkich potrzebnych danych.",
  input_schema: {
    type: "object",
    properties: {
      data: {
        type: "object",
        description: "Dane wynikowe raportu, zgodne z output_schema.",
      },
    },
    required: ["data"],
  },
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function resolveMaxTokens(modelConfig: Record<string, unknown>): number {
  const raw = modelConfig.max_tokens;
  if (typeof raw === "number" && raw > 0) {
    return Math.min(Math.max(Math.floor(raw), 1000), 8000);
  }
  return DEFAULT_MAX_TOKENS;
}

function usageTotal(usage: Anthropic.Usage): number {
  return (
    usage.input_tokens +
    usage.output_tokens +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0)
  );
}

function extractOutputData(message: Anthropic.Message): Record<string, unknown> | null {
  const call = message.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name === "submit_report",
  );
  if (!call) return null;
  const data = (call.input as { data?: unknown }).data;
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : null;
}

function postgresErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === "57014") {
    return "Zapytanie trwało zbyt długo. Zawęź zakres danych.";
  }
  return "Wystąpił błąd podczas wykonywania zapytania.";
}

function buildSystemPrompt(
  report: AiReport,
  inputParams: Record<string, string>,
  bizraportAvailable: boolean,
): string {
  const sources = ["`execute_sql` — dane ERP (tylko zapytania SELECT)"];
  if (bizraportAvailable) {
    sources.push(
      "`get_company_info` / `search_company` — zewnętrzne dane o firmach z BizRaport (po NIP/KRS)",
    );
  }
  const mc = asObject(report.modelConfig);
  if (mc.web_search === true) {
    sources.push("`web_search` — wyszukiwanie w internecie");
  }

  return `${report.systemPrompt}

# Wykonanie raportu
Parametry wejściowe (input_params):
${JSON.stringify(inputParams, null, 2)}

Wymagany format wyniku (output_schema):
${JSON.stringify(report.outputSchema, null, 2)}

Dostępne narzędzia:
- ${sources.join("\n- ")}

Zbierz potrzebne dane wyłącznie za pomocą narzędzi, a następnie wywołaj \`submit_report\` z obiektem \`data\` ściśle zgodnym z output_schema (te same nazwy pól). Nie zmyślaj wartości — opieraj się tylko na danych zwróconych przez narzędzia; gdy dane są niedostępne, wpisz null lub „brak danych". Odpowiadaj po polsku.`;
}

/**
 * Runs one AI report: drives the agentic tool loop (execute_sql / BizRaport /
 * web_search) and captures the structured `output_data` via the `submit_report`
 * tool. SQL is validated + executed read-only and audited (`source='ai_report'`).
 * Throws when no valid report data could be produced.
 */
export async function runReportExecution(params: {
  report: AiReport;
  inputParams: Record<string, string>;
  userId: string;
}): Promise<ReportExecutionOutcome> {
  const { report, inputParams, userId } = params;
  const anthropic = getAnthropic();
  const allowlist = await getPublicTableAllowlist();
  const modelConfig = asObject(report.modelConfig);
  const bizraportAvailable =
    isBizraportConfigured() && modelConfig.uses_company_lookup === true;
  const maxTokens = resolveMaxTokens(modelConfig);
  const auditLabel = `Raport AI: ${report.name}`;

  const tools: Anthropic.ToolUnion[] = [executeSqlTool, submitReportTool];
  if (bizraportAvailable) tools.push(getCompanyInfoTool, searchCompanyTool);
  if (modelConfig.web_search === true) {
    tools.push({ type: "web_search_20260209", name: "web_search", max_uses: 3 });
  }

  const system = buildSystemPrompt(report, inputParams, bizraportAvailable);
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: "Wykonaj raport zgodnie z instrukcją i parametrami." },
  ];

  const sqlQueries: string[] = [];
  const tablesUsed = new Set<string>();
  let tokensUsed = 0;
  let outputData: Record<string, unknown> | null = null;

  for (let i = 0; i < MAX_ITERATIONS && !outputData; i++) {
    const message = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: maxTokens,
      system,
      messages,
      tools,
      tool_choice: { type: "auto" },
    });
    tokensUsed += usageTotal(message.usage);
    messages.push({ role: "assistant", content: message.content });

    if (message.stop_reason === "pause_turn") continue; // web search in progress

    outputData = extractOutputData(message);
    if (outputData) break;

    if (message.stop_reason !== "tool_use") break; // model stopped without submitting

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    const toolUses = message.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    for (const toolUse of toolUses) {
      if (toolUse.name === "get_company_info") {
        const input = toolUse.input as { nip?: string; krs?: string };
        try {
          const data = await getCompanyData({ nip: input.nip, krs: input.krs });
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(data),
          });
        } catch (error) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: error instanceof Error ? error.message : "Błąd BizRaport.",
            is_error: true,
          });
        }
        continue;
      }

      if (toolUse.name === "search_company") {
        const input = toolUse.input as { query?: string; limit?: number };
        try {
          const result = await searchCompanies(String(input.query ?? ""), input.limit);
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          });
        } catch (error) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: error instanceof Error ? error.message : "Błąd wyszukiwania.",
            is_error: true,
          });
        }
        continue;
      }

      if (toolUse.name !== "execute_sql") {
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: "Nieznane narzędzie.",
          is_error: true,
        });
        continue;
      }

      const sql = String((toolUse.input as { sql?: string }).sql ?? "");
      const validation = validateSql(sql, allowlist);
      if (!validation.ok) {
        await insertQueryAudit({
          userId,
          source: "ai_report",
          userInput: auditLabel,
          sqlGenerated: sql,
          sqlValid: false,
          validationError: validation.error,
          llmModel: CHAT_MODEL,
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: `Błąd walidacji SQL: ${validation.error}`,
          is_error: true,
        });
        continue;
      }

      const executable = enforceRowLimit(sql, ROW_LIMIT);
      try {
        const { rows, executionMs } = await executeReadOnly(executable, {
          timeoutMs: STATEMENT_TIMEOUT_MS,
        });
        validation.tablesUsed.forEach((t) => tablesUsed.add(t));
        sqlQueries.push(sql);
        await insertQueryAudit({
          userId,
          source: "ai_report",
          userInput: auditLabel,
          sqlGenerated: sql,
          sqlExecuted: executable,
          sqlValid: true,
          tablesUsed: validation.tablesUsed,
          rowCount: rows.length,
          executionMs,
          llmModel: CHAT_MODEL,
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify({ row_count: rows.length, rows }),
        });
      } catch (error) {
        await insertQueryAudit({
          userId,
          source: "ai_report",
          userInput: auditLabel,
          sqlGenerated: sql,
          sqlExecuted: executable,
          sqlValid: true,
          tablesUsed: validation.tablesUsed,
          errorMessage: String(error),
          llmModel: CHAT_MODEL,
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: postgresErrorMessage(error),
          is_error: true,
        });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  // Fallback: force a final submit_report if the loop ended without output data.
  if (!outputData) {
    const forced = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [
        ...messages,
        {
          role: "user",
          content:
            "Na podstawie zebranych danych wywołaj teraz submit_report z finalnym obiektem `data` zgodnym z output_schema.",
        },
      ],
      tools: [submitReportTool],
      tool_choice: { type: "tool", name: "submit_report" },
    });
    tokensUsed += usageTotal(forced.usage);
    outputData = extractOutputData(forced);
  }

  if (!outputData) {
    log.warn("ai.report-executor", "no report data produced", {
      reportId: report.id,
    });
    throw new Error("Model nie zwrócił danych raportu.");
  }

  log.info("ai.report-executor", "report executed", {
    reportId: report.id,
    tables: [...tablesUsed],
    sqlCount: sqlQueries.length,
    tokensUsed,
  });

  return {
    outputData,
    sqlQueries,
    tablesUsed: [...tablesUsed],
    tokensUsed,
  };
}
