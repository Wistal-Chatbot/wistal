import type {
  AiReportExecutionResultDto,
  AiReportPublicDto,
  AiReportRunDto,
} from "@/lib/api/ai-reports-types";

/** Client access to the user-facing ai-reports endpoints. */
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

export async function listReports(): Promise<AiReportPublicDto[]> {
  const data = await apiFetch<{ reports: AiReportPublicDto[] }>("/api/ai-reports");
  return data.reports;
}

export async function listRuns(): Promise<AiReportRunDto[]> {
  const data = await apiFetch<{ runs: AiReportRunDto[] }>("/api/ai-reports/runs");
  return data.runs;
}

export async function getReport(id: string): Promise<AiReportPublicDto> {
  const data = await apiFetch<{ report: AiReportPublicDto }>(`/api/ai-reports/${id}`);
  return data.report;
}

export async function executeReport(
  id: string,
  inputParams: Record<string, string>,
): Promise<AiReportExecutionResultDto> {
  const data = await apiFetch<{
    executionId: string;
    output_data: unknown;
    html_widget: string | null;
    execution_ms: number;
  }>(`/api/ai-reports/${id}/execute`, {
    method: "POST",
    body: JSON.stringify({ input_params: inputParams }),
  });
  return {
    executionId: data.executionId,
    outputData: data.output_data,
    htmlWidget: data.html_widget,
    executionMs: data.execution_ms,
  };
}
