import "server-only";

import { log } from "@/lib/log";

/**
 * BizRaport API client — external data about Polish companies (KRS registry,
 * financials, activity descriptions, relations/shareholders, Monitor Sądowy, KRZ).
 * Docs: `docs/API - BizRaport.md`. Auth is the account email + password passed as
 * query params (the method the docs demonstrate). We only ever log the endpoint
 * path, never the full URL, so credentials never reach the logs. Calls are
 * metered/billed per returned row by BizRaport.
 */

const BASE_URL = "https://api.bizraport.pl/api";
const REQUEST_TIMEOUT_MS = 15_000;

/** Nested fields that BizRaport returns as JSON *strings* and we parse for callers. */
const NESTED_JSON_FIELDS = [
  "informacje_o_firmie",
  "dane_finansowe",
  "opisy_firmy",
  "powiazania",
  "udzialy",
  "monitor_sadowy",
  "krz",
] as const;

export type CompanyLookup = {
  nip?: string | null;
  krs?: string | null;
  /** Add `rozszerz_polaczenia=tak` to fetch one level deeper of relations. */
  expandRelations?: boolean;
};

export type CompanySearchResult = {
  krs: string[];
  /** BizRaport's `dane_uciete`: results were capped (by `limit` or size). */
  truncated: boolean;
};

/** True when the BizRaport credentials are present in the environment. */
export function isBizraportConfigured(): boolean {
  return Boolean(
    process.env.BIZRAPORT_API_EMAIL && process.env.BIZRAPORT_API_PASSWORD,
  );
}

/** Auth query params (email + password) appended to every request URL. */
function authParams(): URLSearchParams {
  const email = process.env.BIZRAPORT_API_EMAIL;
  const password = process.env.BIZRAPORT_API_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "BizRaport nie jest skonfigurowany (brak BIZRAPORT_API_EMAIL/BIZRAPORT_API_PASSWORD).",
    );
  }
  return new URLSearchParams({ email, password });
}

/** Parses a nested JSON-string field; returns null on empty and the raw value on parse failure. */
function parseNested(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

async function request(url: string, endpoint: string): Promise<unknown> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const ms = Date.now() - startedAt;
    if (!res.ok) {
      log.warn("bizraport", "request failed", { endpoint, status: res.status, ms });
      if (res.status === 401 || res.status === 403) {
        throw new Error("Błąd uwierzytelnienia BizRaport. Sprawdź dane dostępowe.");
      }
      if (res.status === 404) {
        throw new Error("Nie znaleziono firmy w BizRaport.");
      }
      if (res.status === 429) {
        throw new Error("Przekroczono limit zapytań do BizRaport. Spróbuj później.");
      }
      throw new Error(`BizRaport zwrócił błąd HTTP ${res.status}.`);
    }
    log.info("bizraport", "request ok", { endpoint, ms });
    return await res.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      log.warn("bizraport", "request timeout", { endpoint });
      throw new Error("Przekroczono czas oczekiwania na odpowiedź BizRaport.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Returned KRS numbers carry a trailing "_" (e.g. "0000123456_"); strip it before re-querying. */
function normalizeKrs(krs: string): string {
  return krs.trim().replace(/_+$/, "");
}

function normalizeCompany(raw: unknown): Record<string, unknown> {
  // The API wraps the company in a `{ data: [ ... ] }` envelope; unwrap it. The
  // nested fields already arrive as real arrays/objects, but parseNested also
  // handles the JSON-string form the docs describe.
  let obj: unknown = raw;
  if (obj && typeof obj === "object" && !Array.isArray(obj) && "data" in obj) {
    obj = (obj as { data: unknown }).data;
  }
  if (Array.isArray(obj)) obj = obj[0];
  if (!obj || typeof obj !== "object") return {};
  const out: Record<string, unknown> = { ...(obj as Record<string, unknown>) };
  for (const field of NESTED_JSON_FIELDS) {
    if (field in out) out[field] = parseNested(out[field]);
  }
  return out;
}

/**
 * Fetches comprehensive company data from `/api/dane` by NIP or KRS. The nested
 * JSON-string fields are parsed into real objects/arrays for the caller.
 */
export async function getCompanyData(
  lookup: CompanyLookup,
): Promise<Record<string, unknown>> {
  const nip = lookup.nip?.trim();
  const krs = lookup.krs ? normalizeKrs(lookup.krs) : undefined;
  if (!nip && !krs) {
    throw new Error("Podaj NIP lub KRS firmy.");
  }
  const params = authParams();
  // KRS is the primary key in BizRaport; prefer it when both are provided.
  if (krs) params.set("krs", krs);
  else if (nip) params.set("nip", nip);
  if (lookup.expandRelations) params.set("rozszerz_polaczenia", "tak");

  const data = await request(`${BASE_URL}/dane?${params.toString()}`, "/dane");
  return normalizeCompany(data);
}

/**
 * Searches companies by name / NIP / KRS / REGON via `/api/szukaj`. Returns the
 * matching KRS numbers (BizRaport's search only returns identifiers).
 */
export async function searchCompanies(
  query: string,
  limit?: number,
): Promise<CompanySearchResult> {
  const q = query.trim();
  if (!q) throw new Error("Podaj frazę wyszukiwania.");
  const params = authParams();
  params.set("q", q);
  if (limit && Number.isFinite(limit)) {
    params.set("limit", String(Math.max(1, Math.floor(limit))));
  }
  const json = (await request(
    `${BASE_URL}/szukaj?${params.toString()}`,
    "/szukaj",
  )) as { data?: { krs?: string }[]; dane_uciete?: boolean };

  const krs = Array.isArray(json.data)
    ? json.data
        .map((d) => d?.krs)
        .filter((k): k is string => typeof k === "string")
        .map(normalizeKrs)
    : [];
  return { krs, truncated: Boolean(json.dane_uciete) };
}
