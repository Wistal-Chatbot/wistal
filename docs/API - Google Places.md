# Dokumentacja integracji: Google Places (ocena firmy)

Lekka integracja z **Google Places API (New)** służąca wyłącznie do pobrania
**oceny firmy w Google** (średnia ocena + liczba ocen). Świadomie **nie**
pobieramy treści opinii ani żadnych pól „Atmosphere", aby pozostać w tańszym
poziomie rozliczeń. Implementacja: [`lib/google-places/client.ts`](../lib/google-places/client.ts).

## Zakres

- Tylko **ocena** (`rating` 1–5) i **liczba ocen** (`userRatingCount`) — bez recenzji.
- Używany jest wyłącznie endpoint **Text Search (New)** z **minimalną maską pól**.
- Przy wielu dopasowaniach zwracamy do **3 kandydatów** (z oceną i adresem), aby
  można było wskazać właściwe miejsce.

## Endpoint

`POST https://places.googleapis.com/v1/places:searchText`

### Nagłówki

| Nagłówek | Wartość |
| --- | --- |
| `Content-Type` | `application/json` |
| `X-Goog-Api-Key` | `GOOGLE_PLACES_API_KEY` (nigdy nie logujemy klucza) |
| `X-Goog-FieldMask` | `places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri` |

**Ważne:** maska pól celowo **nie** zawiera `places.reviews`, `places.reviewSummary`,
`places.generativeSummary`, `places.editorialSummary` ani innych pól „Atmosphere".

### Treść żądania

```json
{
  "textQuery": "<nazwa firmy> <miasto>",
  "languageCode": "pl",
  "regionCode": "PL",
  "pageSize": 3
}
```

`pageSize` (domyślnie 3, maks. 5) ogranicza liczbę kandydatów i zarazem liczbę
rozliczanych wyników.

### Odpowiedź

```json
{
  "places": [
    {
      "id": "ChIJ...",
      "displayName": { "text": "Nazwa firmy", "languageCode": "pl" },
      "formattedAddress": "ul. Przykładowa 1, 00-000 Miasto",
      "rating": 4.6,
      "userRatingCount": 123,
      "googleMapsUri": "https://maps.google.com/?cid=..."
    }
  ]
}
```

Pola `rating` / `userRatingCount` są nieobecne, gdy miejsce nie ma ocen — klient
mapuje je wtedy na `null`. `displayName` (obiekt `{ text, languageCode }`) jest
spłaszczane do samego tekstu.

## Rozliczenia

Pola `rating` i `userRatingCount` mieszczą się w SKU **Text Search Enterprise** —
tańszym niż **Enterprise + Atmosphere**, który obejmuje recenzje. Ponieważ nie
pobieramy recenzji ani podsumowań, nie wchodzimy w poziom Atmosphere.

## Wykorzystanie w aplikacji

- **Narzędzie modelu:** `get_google_rating` (definicja w
  [`lib/ai/tools.ts`](../lib/ai/tools.ts)). Wejście: `query` (nazwa firmy,
  wymagane), `miasto` (opcjonalne). Zwraca listę `places` (do 3).
- **Chatbot:** narzędzie dostępne, gdy ustawiony jest `GOOGLE_PLACES_API_KEY`
  (patrz `buildTools` i `buildSystemPrompt`).
- **Raporty AI:** narzędzie dołączane, gdy `GOOGLE_PLACES_API_KEY` jest ustawiony
  **oraz** `model_config.uses_google_rating === true` (patrz
  [`lib/ai/report-executor.ts`](../lib/ai/report-executor.ts)).

## Konfiguracja

Zmienna środowiskowa: `GOOGLE_PLACES_API_KEY` (patrz [`.env.example`](../.env.example)).
Klucz musi mieć włączone **Places API (New)** w Google Cloud Console.
