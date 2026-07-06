const ALLOWED_DOMAIN = "@wistal.com.pl";

/** Trim and lowercase an email so storage/lookups are consistent. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Specific non-Wistal addresses allowed to log in, read from
 * AUTH_ALLOWED_EXTERNAL_EMAILS (comma-separated). Entries are normalized so
 * comparison is case/whitespace-insensitive; empty entries are ignored.
 */
export function allowedExternalEmails(): Set<string> {
  const raw = process.env.AUTH_ALLOWED_EXTERNAL_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((entry) => normalizeEmail(entry))
      .filter(Boolean),
  );
}

/** Whether any external addresses are allowlisted (drives login UI copy). */
export function hasAllowedExternalEmails(): boolean {
  return allowedExternalEmails().size > 0;
}

/** Login is restricted to Wistal staff addresses. */
export function isWistalEmail(email: string): boolean {
  return normalizeEmail(email).endsWith(ALLOWED_DOMAIN);
}

/** Email is an explicitly allowlisted non-Wistal address. */
export function isAllowedExternalEmail(email: string): boolean {
  return allowedExternalEmails().has(normalizeEmail(email));
}

/** Email is allowed for OTP login under the current auth configuration. */
export function isAllowedLoginEmail(email: string): boolean {
  return isWistalEmail(email) || isAllowedExternalEmail(email);
}
