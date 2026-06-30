import "server-only";

/**
 * Minimal structured logger for server code. Emits a single line per event with a
 * scope, a message, and JSON fields — picked up by Vercel logs. Never log
 * returned ERP rows or customer PII here (architecture §6): log SQL, table names,
 * counts, timings, and short input previews only.
 */
type Fields = Record<string, unknown>;

function emit(
  level: "info" | "warn" | "error",
  scope: string,
  message: string,
  fields?: Fields,
): void {
  const payload = fields ? ` ${JSON.stringify(fields)}` : "";
  const line = `[${new Date().toISOString()}] [${scope}] ${message}${payload}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const log = {
  info: (scope: string, message: string, fields?: Fields) =>
    emit("info", scope, message, fields),
  warn: (scope: string, message: string, fields?: Fields) =>
    emit("warn", scope, message, fields),
  error: (scope: string, message: string, fields?: Fields) =>
    emit("error", scope, message, fields),
};

/** Truncates user-supplied text for safe inclusion in a log line. */
export function preview(text: string, max = 160): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
