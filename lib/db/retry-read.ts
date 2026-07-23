const TRANSIENT_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "ETIMEDOUT",
]);

const DATABASE_UNAVAILABLE_CODES = new Set([
  ...TRANSIENT_NETWORK_CODES,
  "EAI_AGAIN",
  "ENOTFOUND",
]);

type ErrorWithCause = {
  cause?: unknown;
  code?: unknown;
};

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as ErrorWithCause).code;
  return typeof code === "string" ? code : null;
}

function hasNestedErrorCode(error: unknown, codes: ReadonlySet<string>): boolean {
  let current = error;

  for (let depth = 0; depth < 5 && current; depth += 1) {
    const code = errorCode(current);
    if (code && codes.has(code)) return true;

    if (typeof current !== "object") return false;
    current = (current as ErrorWithCause).cause;
  }

  return false;
}

export function isTransientNetworkError(error: unknown): boolean {
  return hasNestedErrorCode(error, TRANSIENT_NETWORK_CODES);
}

export function isDatabaseUnavailableError(error: unknown): boolean {
  return hasNestedErrorCode(error, DATABASE_UNAVAILABLE_CODES);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Retries a read-only database operation after transient transport failures.
 * Do not use this for writes: the server may have committed a write even when
 * the client lost the connection before receiving its response.
 */
export async function retryRead<T>(
  operation: () => Promise<T>,
  delays: readonly number[] = [150, 400],
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const delay = delays[attempt];
      if (delay === undefined || !isTransientNetworkError(error)) throw error;
      await wait(delay);
    }
  }
}
