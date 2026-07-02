# API reference

Next.js App Router **Route Handlers** for the Wistal ERP Chatbot. Every handler
lives in `app/api/.../route.ts`; the segment path is the URL. This file documents
the endpoints that actually exist in the code. For the intended/full backend design
(including routes not yet built), see
[`.claude/skills/wistal-erp-chatbot/references/backend-api.md`](../../.claude/skills/wistal-erp-chatbot/references/backend-api.md).

> **Keep this in sync.** When you add, remove, or change any route under `app/api/`
> (path, method, request body, response shape, status codes, auth), update this file
> in the same change.

## Conventions

- **Auth.** Session is a JWT in an `HttpOnly` cookie. Most handlers call
  `getCurrentUser()` and return `401 { error }` when there is no valid session.
  Admin handlers use `requireAdmin()`: `401` when unauthenticated, `403` when
  authenticated but not an admin (`Brak uprawnień.`). Login is restricted to
  `@wistal.com.pl`.
- **Bodies & validation.** JSON in, JSON out. Bodies are validated with Zod;
  malformed JSON → `400 { error: "Nieprawidłowe żądanie." }`, invalid fields →
  `400` with a Polish message.
- **Errors.** Error responses are always `{ error: string }` (Polish, user-facing).
  Some add a machine `code` (see the monthly-token-limit rows). Rate-limited
  responses are `429` with a `Retry-After` header (seconds).
- **IDs.** `sessionId` is a UUID; quick-action admin `id` is a positive integer;
  quick-action `key` is `[a-z0-9_]+`. A malformed/unknown id is treated as `404`.
- **Streaming.** The two AI endpoints (`messages`, quick-action `run`) stream by
  default as **NDJSON** (`application/x-ndjson`, `Cache-Control: no-store`): one
  JSON `ChatTurnEvent` per line. Send `{ "stream": false }` to get a single
  buffered JSON response instead.

### `ChatTurnEvent` (streamed lines)

```ts
| { type: "delta"; text: string }                 // incremental answer text
| { type: "meta";                                 // one terminal metadata line
    messageId: number; tables: string[];
    rowCount: number | null; executionMs: number | null;
    responseMs: number | null; queryAuditId: number | null;
    tokensUsed: number | null; tokenUsage: TokenUsageMetadata | null }
| { type: "error"; error: string }                // recoverable/terminal error
```

---

## Auth — `/api/auth`

### `POST /api/auth/request-otp`
Request a one-time login code. Body `{ email }`. Normalizes the email, enforces the
`@wistal.com.pl` domain, rate-limits per email (5 / 10 min) and per IP (10 / 10 min),
generates + stores a hashed OTP in Redis, and emails it via Resend. **Always returns
`{ ok: true }`** — never reveals whether the account exists.
- `400` invalid email / wrong domain · `429` rate limited (`Retry-After`).

### `POST /api/auth/verify-otp`
Verify the code and start a session. Body `{ email, code }` (`code` = 6 digits).
Rate-limited per IP+email (10 / 10 min). On success: upserts/loads the `app_users`
row, checks `is_active`, signs a JWT, sets the `HttpOnly` session cookie, and returns
`{ user: { id, email, name, isAdmin } }`.
- `400` bad input / invalid or expired code · `403` inactive account · `429` rate
  limited · `500` if the DB still has the legacy `@wistal.com.pl` check constraint
  (run migrations).

### `POST /api/auth/logout`
Clears the session cookie. No body. Returns `{ ok: true }`.

### `GET /api/me`
Returns the current user from the JWT: `{ user: { id, email, name, isAdmin, isActive } }`.
- `401` when unauthenticated.

---

## Chat — `/api/chat/sessions`

Wire shapes: `SessionDto`, `MessageDto` in
[`lib/api/chat-types.ts`](../../lib/api/chat-types.ts). All routes require a session.

### `GET /api/chat/sessions`
List the current user's chat sessions → `{ sessions: SessionDto[] }`.

### `POST /api/chat/sessions`
Create a session. Body (all optional) `{ title?, webSearchEnabled? }`; an empty body
is accepted as `{}`. Returns `201 { session: SessionDto }`.

### `GET /api/chat/sessions/:sessionId`
Load one session plus its messages →
`{ session: SessionDto, messages: MessageDto[] }`.
- `404` when the session doesn't exist or isn't the caller's.

### `PATCH /api/chat/sessions/:sessionId`
Update `title` (nullable) and/or `status` (`active | completed | failed | archived`);
at least one is required. Returns `{ session: SessionDto }`.
- `400` invalid data · `404` not found.

### `PATCH /api/chat/sessions/:sessionId/web-search`
Toggle web search for the session. Body `{ enabled: boolean }`. Returns
`{ session: SessionDto }`.
- `400` missing `enabled` · `404` not found.

### `POST /api/chat/sessions/:sessionId/messages`
Send a user message and run an AI turn. Body `{ message: string(1–4000), stream?: boolean }`
(`stream` defaults to `true`). Flow: auth → rate limit (**5/min, 200/day** per user)
→ monthly AI token check → persist the user message (seeds the title from the first
message) → run the orchestrator.
- **Streaming (default):** NDJSON stream of `ChatTurnEvent`.
- **`stream: false`:** `{ message: { content }, meta }` (buffered), or `502 { error }`
  on turn failure.
- `400` invalid body · `404` session not found · `429` rate limited or
  `{ code: "AI_MONTHLY_TOKEN_LIMIT_EXCEEDED", error }`.

---

## Szybkie akcje (quick actions) — `/api/quick-actions`

Admin-configured inline chat actions. Wire shapes / `custom_input` contract in
[`lib/api/quick-actions-types.ts`](../../lib/api/quick-actions-types.ts).

### `GET /api/quick-actions`
Active actions for the chat UI → `{ actions: QuickActionDto[] }` (each with a
resolved `input` descriptor; `row_from_table` rows are fetched lazily, see below).
- `401` when unauthenticated.

### `GET /api/quick-actions/:key/rows?q=`
Search rows for a `row_from_table` action (chat combobox). `?q=` filters on the
action's 1–2 search columns (ILIKE). Returns `{ rows: { value, label }[] }`.
Light rate limit (60/min per user — called per keystroke).
- `400` action isn't `row_from_table` · `404` unknown/disabled action · `429` rate
  limited · `502` search failed.

### `POST /api/quick-actions/:key/run`
Run an action into a chat session. Body
`{ session_id: uuid, input?: string(≤500) | null, stream?: boolean }` (`stream`
defaults to `true`). Loads the action by `key`; same rate limit + token check as
chat. Two paths:
- **`row_from_table`** — deterministic: fetches the chosen row by `input` (its id)
  and the AI only composes the answer (no AI-generated SQL). `400` when `input` is
  empty/invalid; `502` when the row fetch fails.
- **`text` / no input** — validates/resolves the prompt template with `input`, then
  runs the normal chat turn (AI may generate SQL). Web search is on when the session
  or the action enables it.

Response format matches `messages`: NDJSON `ChatTurnEvent` stream (default), or
buffered `{ message: { content }, meta }` when `stream: false`.
- `400` invalid body / input · `404` unknown or disabled action, or session not
  found · `429` rate limited or monthly token limit.

---

## Dane (data browser) — `/api/data`

Manual ERP data browser. Any signed-in user (**not** admin-only). Wire shapes in
[`lib/api/data-types.ts`](../../lib/api/data-types.ts); the exposed tables + column
capabilities are configured in
[`lib/data-browser/tables-config.ts`](../../lib/data-browser/tables-config.ts). No
client SQL — the backend validates every identifier against the static config and
the live `public` schema and builds a parametrized `SELECT` itself.

### `GET /api/data/schema`
Table + column config for the browser UI → `{ tables: DataSchemaTable[] }`. Each
table has `key`, `label`, `description`, `primaryKey` (single-column, from live
introspection, or `null`), and `columns[]` of
`{ name, label, type: "text"|"integer"|"numeric"|"date", searchable, filterable, sortable }`.
The static config is reconciled with the live schema on each request (missing
tables/columns are dropped). Runs no ERP query, so nothing is audited.
- `401` when unauthenticated.

### `POST /api/data/query`
Run a read-only query for one table. Body (`dataQueryRequestSchema`):
`{ table, global_search?, filters?, sort?, page?, page_size? }`, where
`filters[]` = `{ column, operator: "eq"|"gt"|"lt"|"gte"|"lte"|"like", value: string|number }`
and `sort[]` = `{ column, direction: "asc"|"desc" }`. `global_search` ILIKE-matches
across the table's `searchable` columns; filters/sort are rejected on columns that
aren't `filterable`/`sortable`. Pagination is `page` (≥1, default 1) + `page_size`
(default 50, max 100); the backend fetches `page_size + 1` rows to set `has_more`
without a count. Returns `{ rows, has_more, page, page_size }` (raw typed DB values).
Every executed query is audited with `source='manual_browser'`.
- `400` malformed JSON / invalid params / unknown table or column / wrong capability
  / bad filter value · `401` unauthenticated · `500` query execution failed.

---

## Admin — `/api/admin` (all `requireAdmin`)

### `GET /api/admin/quick-actions`
Every quick action (enabled or not) for the admin table →
`{ actions: AdminQuickActionDto[] }`.

### `POST /api/admin/quick-actions`
Create a quick action. Body validated by `adminQuickActionCreateSchema`
(`key`, `namePl`, `promptTemplate` required; `descriptionPl`, `category`,
`customInput`, `usesDatabase`, `usesWebSearch`, `displayOrder`, `isEnabled`
optional). Returns `201 { action: AdminQuickActionDto }`.
- `400` invalid data · `409` duplicate `key` · `500` save failed.

### `PATCH /api/admin/quick-actions/:id`
Update an action (all fields optional — only sent keys change). Returns
`{ action: AdminQuickActionDto }`.
- `400` invalid data · `404` not found · `409` duplicate `key` · `500` save failed.

### `DELETE /api/admin/quick-actions/:id`
Delete an action. Returns `{ ok: true }`.
- `404` not found.

### Raporty AI — `/api/admin/ai-reports`
Admin backend for AI reports. Wire shapes / validation in
[`lib/api/ai-reports-types.ts`](../../lib/api/ai-reports-types.ts); the report `id`
is a UUID. A report row is `AdminAiReportDto`
(`{ id, name, description, systemPrompt, outputSchema, htmlWidget, inputParams, modelConfig, isActive, createdAt, updatedAt }`).

#### `GET /api/admin/ai-reports`
Every report (draft or active), newest first → `{ reports: AdminAiReportDto[] }`.

#### `POST /api/admin/ai-reports/generate`
Generate a report config from a plain-language brief and save it as a **draft**
(`isActive=false`). Body `{ description: string(1–2000) }`. The generation model
(`ANTHROPIC_CHAT_MODEL`) returns `name`, `systemPrompt`, `outputSchema`, `htmlWidget`,
`inputParams`, `modelConfig` via a forced tool call
([`lib/ai/report-generator.ts`](../../lib/ai/report-generator.ts)); the generator may
wire ERP SQL, BizRaport, and web search into `modelConfig`. Returns
`201 { report: AdminAiReportDto }`.
- `400` invalid body · `429` monthly AI token limit (`{ code: "AI_MONTHLY_TOKEN_LIMIT_EXCEEDED" }`)
  · `502` generation failed.

#### `PATCH /api/admin/ai-reports/:id`
Edit fields and/or activate. Body = any subset of
`{ name, description, systemPrompt, outputSchema, htmlWidget, inputParams, modelConfig, isActive }`
(at least one; activate with `isActive: true`). Returns `{ report: AdminAiReportDto }`.
- `400` invalid data · `404` unknown id.

#### `DELETE /api/admin/ai-reports/:id`
Delete a report. Returns `{ ok: true }`.
- `404` not found.

### `GET /api/admin/schema`
Public (ERP) tables with their columns and primary key, for the quick-action
builder → `{ tables }`.

---

## Endpoint index

```
POST   /api/auth/request-otp
POST   /api/auth/verify-otp
POST   /api/auth/logout
GET    /api/me

GET    /api/chat/sessions
POST   /api/chat/sessions
GET    /api/chat/sessions/:sessionId
PATCH  /api/chat/sessions/:sessionId
PATCH  /api/chat/sessions/:sessionId/web-search
POST   /api/chat/sessions/:sessionId/messages          # NDJSON stream

GET    /api/quick-actions
GET    /api/quick-actions/:key/rows
POST   /api/quick-actions/:key/run                      # NDJSON stream

GET    /api/data/schema
POST   /api/data/query

GET    /api/admin/quick-actions
POST   /api/admin/quick-actions
PATCH  /api/admin/quick-actions/:id
DELETE /api/admin/quick-actions/:id

GET    /api/admin/ai-reports
POST   /api/admin/ai-reports/generate
PATCH  /api/admin/ai-reports/:id
DELETE /api/admin/ai-reports/:id

GET    /api/admin/schema
```
