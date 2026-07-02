import { z } from "zod";

import { aiReportExecuteSchema } from "@/lib/api/ai-reports-types";
import { runReportExecution } from "@/lib/ai/report-executor";
import { checkMonthlyTokenLimit } from "@/lib/ai/token-usage";
import { getCurrentUser } from "@/lib/auth/current-user";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { createAiReportExecution, getAiReportById } from "@/lib/db/queries";
import { log } from "@/lib/log";

const idSchema = z.string().uuid();

/** First required input param with no value, by label — or null when all present. */
function firstMissingParam(
  definition: unknown,
  values: Record<string, string>,
): string | null {
  if (!definition || typeof definition !== "object") return null;
  for (const [key, def] of Object.entries(definition as Record<string, unknown>)) {
    const required =
      def && typeof def === "object" && (def as { required?: unknown }).required === true;
    if (required && !(values[key] ?? "").trim()) {
      const label =
        def && typeof def === "object" && typeof (def as { label?: unknown }).label === "string"
          ? (def as { label: string }).label
          : key;
      return label;
    }
  }
  return null;
}

/** POST — run a report with user-supplied params; returns output_data + html_widget. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Brak autoryzacji." }, { status: 401 });
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return Response.json({ error: "Nie znaleziono raportu." }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Nieprawidłowe żądanie." }, { status: 400 });
  }

  const parsed = aiReportExecuteSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Nieprawidłowe parametry raportu." },
      { status: 400 },
    );
  }
  const inputParams = parsed.data.input_params;

  // Shared chat rate limit (5/min, 200/day per user).
  const [perMinute, perDay] = await Promise.all([
    checkRateLimit({ namespace: "chat", key: `user:${user.id}:minute`, limit: 5, windowSeconds: 60 }),
    checkRateLimit({ namespace: "chat", key: `user:${user.id}:day`, limit: 200, windowSeconds: 24 * 60 * 60 }),
  ]);
  const limited = !perMinute.allowed ? perMinute : !perDay.allowed ? perDay : null;
  if (limited) {
    return Response.json(
      { error: "Zbyt wiele zapytań. Spróbuj ponownie później." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  const tokenLimit = await checkMonthlyTokenLimit();
  if (!tokenLimit.allowed) {
    return Response.json(
      { error: "Miesięczny limit tokenów AI został wyczerpany.", code: tokenLimit.code },
      { status: 429 },
    );
  }

  const report = await getAiReportById(id);
  if (!report || !report.isActive) {
    return Response.json({ error: "Nie znaleziono raportu." }, { status: 404 });
  }

  const missing = firstMissingParam(report.inputParams, inputParams);
  if (missing) {
    return Response.json(
      { error: `Uzupełnij wymagane pole: ${missing}.` },
      { status: 400 },
    );
  }

  const startedAt = Date.now();
  try {
    const outcome = await runReportExecution({ report, inputParams, userId: user.id });
    const executionMs = Date.now() - startedAt;
    const execution = await createAiReportExecution({
      reportId: report.id,
      userId: user.id,
      inputParams,
      outputData: outcome.outputData,
      sqlQueries: outcome.sqlQueries,
      tokensUsed: outcome.tokensUsed,
      executionMs,
      status: "completed",
    });
    return Response.json({
      executionId: execution.id,
      output_data: outcome.outputData,
      html_widget: report.htmlWidget,
      execution_ms: executionMs,
    });
  } catch (error) {
    const executionMs = Date.now() - startedAt;
    log.error("api.ai-reports", "execute failed", {
      reportId: id,
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    await createAiReportExecution({
      reportId: report.id,
      userId: user.id,
      inputParams,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
      executionMs,
    });
    return Response.json(
      { error: "Nie udało się wykonać raportu. Spróbuj ponownie." },
      { status: 502 },
    );
  }
}
