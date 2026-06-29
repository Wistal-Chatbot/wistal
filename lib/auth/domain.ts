const ALLOWED_DOMAIN = "@wistal.com.pl";

/** Trim and lowercase an email so storage/lookups are consistent. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Non-Wistal email login is opt-in and disabled by default. */
export function allowNonWistalEmails(): boolean {
  return process.env.AUTH_ALLOW_NON_WISTAL_EMAILS === "true";
}

/** Login is restricted to Wistal staff addresses. */
export function isWistalEmail(email: string): boolean {
  return normalizeEmail(email).endsWith(ALLOWED_DOMAIN);
}

/** Email is allowed for OTP login under the current auth configuration. */
export function isAllowedLoginEmail(email: string): boolean {
  return allowNonWistalEmails() || isWistalEmail(email);
}
