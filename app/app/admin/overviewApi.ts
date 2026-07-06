import type { AdminOverviewResponse } from "@/lib/api/admin-overview-types";

/** Client access to the admin overview („Przegląd") endpoint. */
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

export function fetchAdminOverview(): Promise<AdminOverviewResponse> {
  return apiFetch<AdminOverviewResponse>("/api/admin/overview");
}
