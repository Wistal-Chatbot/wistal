import type {
  DataQueryRequest,
  DataQueryResponse,
  DataSchemaResponse,
} from "@/lib/api/data-types";

/** Client-side access to the manual ERP data browser endpoints. */
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

export async function fetchDataSchema(): Promise<DataSchemaResponse> {
  return apiFetch<DataSchemaResponse>("/api/data/schema");
}

export async function queryData(
  body: DataQueryRequest,
): Promise<DataQueryResponse> {
  return apiFetch<DataQueryResponse>("/api/data/query", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
