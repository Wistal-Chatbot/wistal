const ALLOWED_DOMAIN = "@wistal.com.pl";

/** Trim and lowercase an email so storage/lookups are consistent. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Login is restricted to Wistal staff addresses. */
export function isWistalEmail(email: string): boolean {
  return normalizeEmail(email).endsWith(ALLOWED_DOMAIN);
}
