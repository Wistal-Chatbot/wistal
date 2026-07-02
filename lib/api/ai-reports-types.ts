/**
 * Wire shapes + validation for the admin Raporty AI endpoints. Kept free of
 * `server-only`/`db` imports (like `quick-actions-types.ts`) so route handlers and
 * the client can share these types. The AI generation itself lives in
 * `lib/ai/report-generator.ts`; the SQL/query layer in `lib/db/queries/ai-reports.ts`.
 */

import { z } from "zod";

/** A free-form JSON object — used for the `output_schema` / `input_params` / `model_config` jsonb columns. */
const jsonObjectSchema = z.record(z.string(), z.unknown());

// ── Request bodies ───────────────────────────────────────────────────────────

/** `POST /api/admin/ai-reports/generate` — the admin's plain-language brief. */
export const adminAiReportGenerateSchema = z.object({
  description: z.string().trim().min(1).max(2000),
});

/**
 * `PATCH /api/admin/ai-reports/:id` — edit fields and/or activate. All optional
 * (only sent keys change); at least one key is required. Field names match the
 * `ai_reports` columns so the parsed body maps straight to `updateAiReport`.
 */
export const adminAiReportUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).nullish(),
    systemPrompt: z.string().trim().min(1).max(20000),
    outputSchema: jsonObjectSchema,
    htmlWidget: z.string().max(50000).nullish(),
    inputParams: jsonObjectSchema,
    modelConfig: jsonObjectSchema,
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "Podaj przynajmniej jedno pole do zmiany.",
  });

// ── Generated config (structured model output) ───────────────────────────────

/**
 * The shape the generation model must return (snake_case matches the
 * `save_report_config` tool input). Validated before the draft is saved.
 */
export const generatedReportConfigSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullish(),
  system_prompt: z.string().trim().min(1),
  output_schema: jsonObjectSchema,
  html_widget: z.string().min(1),
  input_params: jsonObjectSchema,
  model_config: jsonObjectSchema,
});

export type GeneratedReportConfig = z.infer<typeof generatedReportConfigSchema>;

/** Normalised (camelCase) draft ready to insert into `ai_reports`. */
export interface ReportConfigDraft {
  name: string;
  description: string | null;
  systemPrompt: string;
  outputSchema: Record<string, unknown>;
  htmlWidget: string;
  inputParams: Record<string, unknown>;
  modelConfig: Record<string, unknown>;
}

// ── Admin DTO ────────────────────────────────────────────────────────────────

/** Full admin-facing view of a report (admins may see the prompt + config). */
export interface AdminAiReportDto {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  outputSchema: unknown;
  htmlWidget: string | null;
  inputParams: unknown;
  modelConfig: unknown;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Maps a stored `ai_reports` row to the admin DTO. Accepts any object with the
 * needed fields (the Drizzle row has extras) so this file stays free of db imports.
 */
export function serializeAdminAiReport(row: {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  outputSchema: unknown;
  htmlWidget: string | null;
  inputParams: unknown;
  modelConfig: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): AdminAiReportDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    systemPrompt: row.systemPrompt,
    outputSchema: row.outputSchema,
    htmlWidget: row.htmlWidget,
    inputParams: row.inputParams,
    modelConfig: row.modelConfig,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
