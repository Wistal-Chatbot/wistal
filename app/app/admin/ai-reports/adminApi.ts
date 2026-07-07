import type {
  AdminAiReportDto,
  AiReportUpdatePayload,
} from "@/lib/api/ai-reports-types";

/** Client access to the admin ai-reports endpoints. */
async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  if (!res.ok) {
    let message = "Wystąpił błąd. Spróbuj ponownie.";
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

export async function listAiReports(): Promise<AdminAiReportDto[]> {
  const data = await apiFetch<{ reports: AdminAiReportDto[] }>(
    "/api/admin/ai-reports",
  );
  return data.reports;
}

export async function generateAiReport(
  description: string,
): Promise<AdminAiReportDto> {
  const data = await apiFetch<{ report: AdminAiReportDto }>(
    "/api/admin/ai-reports/generate",
    { method: "POST", body: JSON.stringify({ description }) },
  );
  return data.report;
}

export async function updateAiReport(
  id: string,
  body: AiReportUpdatePayload,
): Promise<AdminAiReportDto> {
  const data = await apiFetch<{ report: AdminAiReportDto }>(
    `/api/admin/ai-reports/${id}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return data.report;
}

export async function deleteAiReport(id: string): Promise<void> {
  await apiFetch(`/api/admin/ai-reports/${id}`, { method: "DELETE" });
}
