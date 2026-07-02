import {
  adminAiReportGenerateSchema,
  serializeAdminAiReport,
} from "@/lib/api/ai-reports-types";
import { generateReportConfig } from "@/lib/ai/report-generator";
import { checkMonthlyTokenLimit } from "@/lib/ai/token-usage";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAiReport } from "@/lib/db/queries";
import { log } from "@/lib/log";

/**
 * POST — generate a report config from a plain-language description and save it as
 * a draft (`is_active=false`). The admin then edits/activates via PATCH.
 */
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Nieprawidłowe żądanie." }, { status: 400 });
  }

  const parsed = adminAiReportGenerateSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Opis raportu jest wymagany (1–2000 znaków)." },
      { status: 400 },
    );
  }

  // Generation is an AI call — gate on the monthly token limit.
  const tokenLimit = await checkMonthlyTokenLimit();
  if (!tokenLimit.allowed) {
    log.warn("admin.ai-reports", "monthly token limit exceeded", {
      userId: guard.user.id,
    });
    return Response.json(
      {
        error: "Miesięczny limit tokenów AI został wyczerpany.",
        code: tokenLimit.code,
      },
      { status: 429 },
    );
  }

  try {
    const config = await generateReportConfig(parsed.data.description);
    const row = await createAiReport({
      ...config,
      isActive: false,
      createdBy: guard.user.id,
    });
    return Response.json(
      { report: serializeAdminAiReport(row) },
      { status: 201 },
    );
  } catch (error) {
    log.error("admin.ai-reports", "generate failed", {
      userId: guard.user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { error: "Nie udało się wygenerować raportu. Spróbuj ponownie." },
      { status: 502 },
    );
  }
}
