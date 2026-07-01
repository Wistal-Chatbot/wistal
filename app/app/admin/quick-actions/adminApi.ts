import type {
  AdminQuickActionDto,
  QuickActionPayload,
} from "@/lib/api/quick-actions-types";

/** Client access to the admin quick-actions CRUD endpoints. */
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

export async function listQuickActions(): Promise<AdminQuickActionDto[]> {
  const data = await apiFetch<{ actions: AdminQuickActionDto[] }>(
    "/api/admin/quick-actions",
  );
  return data.actions;
}

export async function createQuickAction(
  body: QuickActionPayload,
): Promise<AdminQuickActionDto> {
  const data = await apiFetch<{ action: AdminQuickActionDto }>(
    "/api/admin/quick-actions",
    { method: "POST", body: JSON.stringify(body) },
  );
  return data.action;
}

export async function updateQuickAction(
  id: number,
  body: QuickActionPayload,
): Promise<AdminQuickActionDto> {
  const data = await apiFetch<{ action: AdminQuickActionDto }>(
    `/api/admin/quick-actions/${id}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
  return data.action;
}

export async function deleteQuickAction(id: number): Promise<void> {
  await apiFetch(`/api/admin/quick-actions/${id}`, { method: "DELETE" });
}
