import type {
  AdminPromptDto,
  PromptVersionDto,
} from "@/lib/api/prompts-types";

/** Client access to the admin prompt endpoints. */
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

export async function listPrompts(): Promise<AdminPromptDto[]> {
  const data = await apiFetch<{ prompts: AdminPromptDto[] }>(
    "/api/admin/prompts",
  );
  return data.prompts;
}

export async function fetchPromptHistory(key: string): Promise<{
  prompt: AdminPromptDto;
  versions: PromptVersionDto[];
}> {
  return apiFetch<{ prompt: AdminPromptDto; versions: PromptVersionDto[] }>(
    `/api/admin/prompts/${key}`,
  );
}

/**
 * Saves `content` as a new version. Also used for reverting — the client sends
 * an older version's text back, which appends it as the newest version.
 */
export async function savePrompt(
  key: string,
  content: string,
): Promise<AdminPromptDto> {
  const data = await apiFetch<{ prompt: AdminPromptDto }>(
    `/api/admin/prompts/${key}`,
    { method: "PUT", body: JSON.stringify({ content }) },
  );
  return data.prompt;
}
