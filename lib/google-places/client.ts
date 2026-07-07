import "server-only";

import { log } from "@/lib/log";

/**
 * Google Places API (New) client — a lightweight, rating-only lookup. We only ever
 * use Text Search with a MINIMAL field mask (id, name, address, rating, rating
 * count, maps link) so we stay on the cheaper "Enterprise" SKU and never pay for
 * the "Atmosphere" tier. We deliberately do NOT request `reviews`, `reviewSummary`,
 * `generativeSummary`, `editorialSummary`, or any other Atmosphere/review fields —
 * the goal is a company's Google score, not individual opinions.
 * Docs: `docs/API - Google Places.md`. The API key goes in the `X-Goog-Api-Key`
 * header; we log only the endpoint + status + timing, never the key.
 */

const SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";
const REQUEST_TIMEOUT_MS = 15_000;

/** Minimal field mask — rating-only, no reviews/Atmosphere fields. */
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
].join(",");

/** Default and hard cap on candidate places per search (also caps billed results). */
const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 5;

export type PlaceRating = {
  placeId: string;
  displayName: string | null;
  formattedAddress: string | null;
  /** Average Google star rating (1–5); null when the place has no ratings. */
  rating: number | null;
  /** Number of user ratings; null when the place has none. */
  userRatingCount: number | null;
  googleMapsUri: string | null;
};

export type PlaceSearchOptions = {
  /** City/locality appended to the query to disambiguate (e.g. `kontrahenci.miasto`). */
  city?: string | null;
  /** Max candidate places to return (default 3, capped at 5). */
  limit?: number;
};

/** True when the Google Places API key is present in the environment. */
export function isGooglePlacesConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

function apiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    throw new Error(
      "Google Places nie jest skonfigurowany (brak GOOGLE_PLACES_API_KEY).",
    );
  }
  return key;
}

/** Unwraps a `{ text, languageCode }` localized-text object to a plain string. */
function localizedText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "text" in value) {
    const text = (value as { text?: unknown }).text;
    return typeof text === "string" ? text : null;
  }
  return null;
}

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizePlace(raw: unknown): PlaceRating | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const placeId = typeof p.id === "string" ? p.id : null;
  if (!placeId) return null;
  return {
    placeId,
    displayName: localizedText(p.displayName),
    formattedAddress:
      typeof p.formattedAddress === "string" ? p.formattedAddress : null,
    rating: toNumber(p.rating),
    userRatingCount: toNumber(p.userRatingCount),
    googleMapsUri:
      typeof p.googleMapsUri === "string" ? p.googleMapsUri : null,
  };
}

/**
 * Searches Google Places via Text Search (New) and returns up to `limit` candidate
 * places with their Google rating + rating count (no reviews). Combine the company
 * name with its city for a precise match; several candidates let the caller pick the
 * right branch by address.
 */
export async function searchPlaceRatings(
  query: string,
  options: PlaceSearchOptions = {},
): Promise<PlaceRating[]> {
  const name = query.trim();
  if (!name) throw new Error("Podaj nazwę firmy do wyszukania.");
  const city = options.city?.trim();
  const textQuery = city ? `${name} ${city}` : name;
  const pageSize = Math.min(
    Math.max(1, Math.floor(options.limit ?? DEFAULT_LIMIT)),
    MAX_LIMIT,
  );

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(SEARCH_TEXT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey(),
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery,
        languageCode: "pl",
        regionCode: "PL",
        pageSize,
      }),
      signal: controller.signal,
    });
    const ms = Date.now() - startedAt;
    if (!res.ok) {
      log.warn("google-places", "request failed", {
        endpoint: "searchText",
        status: res.status,
        ms,
      });
      if (res.status === 400) {
        throw new Error("Nieprawidłowe zapytanie do Google Places.");
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          "Błąd uwierzytelnienia Google Places. Sprawdź klucz API.",
        );
      }
      if (res.status === 429) {
        throw new Error(
          "Przekroczono limit zapytań do Google Places. Spróbuj później.",
        );
      }
      throw new Error(`Google Places zwrócił błąd HTTP ${res.status}.`);
    }

    const json = (await res.json()) as { places?: unknown[] };
    const places = Array.isArray(json.places)
      ? json.places
          .map(normalizePlace)
          .filter((p): p is PlaceRating => p !== null)
      : [];
    log.info("google-places", "request ok", {
      endpoint: "searchText",
      resultCount: places.length,
      ms,
    });
    return places;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      log.warn("google-places", "request timeout", { endpoint: "searchText" });
      throw new Error("Przekroczono czas oczekiwania na odpowiedź Google Places.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
