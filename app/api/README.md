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
| { type: "status"; text: string }                // temporary Polish progress text
| { type: "delta"; text: string }                 // incremental answer text
| { type: "meta";                                 // one terminal metadata line
    messageId: number; userMessageId: number; tables: string[];
    rowCount: number | null; executionMs: number | null;
    responseMs: number | null; queryAuditId: number | null;
    tokensUsed: number | null; tokenUsage: TokenUsageMetadata | null }
| { type: "error"; error: string; messageId: number | null;
    userMessageId: number;
    errorCode: string; retryable: boolean; isRetried: boolean }
```

`status` is ephemeral UI feedback and is never persisted as message content.
Tool-loop narration is withheld. After exploration finishes, a separate
tools-disabled synthesis call emits the final answer incrementally as `delta`.
After the final delta, `status: "Zapisuję odpowiedź…"` remains visible until the
assistant row is durable. A turn is complete only after one terminal `meta` or
`error` line: `meta` confirms that the answer was saved; `error` may have
`messageId: null` only when the database could not even store the failure record.
Clients must not treat a completed-looking sequence of deltas or a bare stream
close as a successful turn.
Persisted `MessageDto` objects expose `errorCode`, `retryable`, `isRetried`, and
`retryOfMessageId`. Internal `error_detail` is never serialized.

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
(`stream` defaults to `true`). Flow: auth → persist the user message (seeds the
title from the first message) → shared AI rate limit (**10/min, 200/day** per user)
→ monthly AI token check → run the orchestrator.
- The orchestrator allows up to four exploration/tool rounds and reserves a fifth
  Anthropic call for tool-disabled final synthesis. Validator and execution
  failures share a two-error SQL budget; an empty final synthesis is persisted as
  retryable `CHAT_RESPONSE_INCOMPLETE`, never as a generic successful answer.
- **Streaming (default):** NDJSON stream of `ChatTurnEvent`.
- **`stream: false`:** `{ message: { content }, meta }` (buffered), or `502 { error }`
  on turn failure.
- The composer remains locked through the temporary save status and unlocks only
  after terminal `meta`/`error`. If success persistence fails, the visible draft
  is replaced with retryable `CHAT_RESPONSE_NOT_SAVED`; the terminal error still
  reaches the client with `messageId: null` if the database is unavailable.
- Rate/token-limit rejections persist a linked assistant error, so the complete
  rejected turn remains visible after reloading the session.
- `400` invalid body · `404` session not found · `429` rate limited or
  `{ code: "AI_MONTHLY_TOKEN_LIMIT_EXCEEDED", error }`.

Unexpected operational failures are stored as assistant error messages whenever
the database is available. A `502` returns the same public error fields as the
stream event.

### `POST /api/chat/sessions/:sessionId/messages/:messageId/retry`
Retry one unresolved, retryable assistant error. The original user message is
reused and is not inserted again. Normal messages and quick actions are both
supported from the private retry context stored with the failure.
- Success streams the replacement answer as `ChatTurnEvent` and marks the old
  error `isRetried=true`.
- Another operational failure persists a linked replacement error.
- `404` invalid session/message · `409` non-retryable, already retried, concurrent
  retry, or stale quick-action configuration · `429` rate/token limit.

### `POST /api/chat/sessions/:sessionId/messages/redo`
Regenerate the answer to a specific persisted user message. Body
`{ userMessageId: number }`. If its assistant answer already exists, it is marked
as replaced and the newly streamed answer takes its place in conversation history.
- Success streams the replacement answer as `ChatTurnEvent`.
- `400` invalid body · `404` invalid session/message · `409` concurrent redo · `429`
  rate/token limit.

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
chat. After validating the action/session and resolving its input, the user
message is persisted exactly once before Redis, usage, row-source, or AI calls.
Any later failure persists a linked assistant error, so the complete turn remains
visible after reload. Two paths:
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
capabilities come from the DB-backed ERP tables model
([`lib/erp-schema/*`](../../lib/erp-schema), edited in admin → **Schemat bazy**),
derived via `getDataTables()`. No client SQL — the backend validates every
identifier against that config and the live `public` schema and builds a
parametrized `SELECT` itself.

### `GET /api/data/schema`
Table + column config for the browser UI → `{ tables: DataSchemaTable[] }`. Each
table has `key`, `label`, `description`, `primaryKey` (single-column, from live
introspection, or `null`), and `columns[]` of
`{ name, label, type: "text"|"integer"|"numeric"|"date", searchable, filterable, sortable }`.
The config is reconciled with the live schema on each request (missing
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

## Raporty AI (run) — `/api/ai-reports`

User-facing report execution. Any signed-in user. Wire shapes in
[`lib/api/ai-reports-types.ts`](../../lib/api/ai-reports-types.ts).

### `GET /api/ai-reports`
Active reports → `{ reports: AiReportPublicDto[] }` (`{ id, name, description, inputParams }`
— **no** `system_prompt`).
- `401` unauthenticated.

### `GET /api/ai-reports/runs`
The 10 most recent runs **across all users** → `{ runs: AiReportRunDto[] }`
(`{ id, reportId, reportName, userName, inputParams, status, createdAt }`). Static
segment resolves before `:id`.
- `401` unauthenticated.

### `GET /api/ai-reports/runs/search?q=...&limit=50`
Search saved report executions **across all users** by report name, user name/email,
status, or `input_params` text (for example NIP). Returns `{ runs: AiReportRunDto[] }`
with the same shape as recent runs. `limit` is optional and capped at `100`.
- `400` invalid query · `401` unauthenticated.

### `GET /api/ai-reports/runs/:executionId`
One saved report execution → `{ execution: AiReportExecutionDetailDto }`, including
report name, user, params, `output_data`, `html_widget`, status, error, SQL count data,
`tokensUsed` (total) plus a `tokenUsage` per-type breakdown (input/output/cache; `null`
for runs recorded before tracking), execution time, and creation date. Used by the result
page opened after a run or from "Ostatnie uruchomienia"; it does **not** execute the report again.
- `401` · `404` unknown execution.

### `GET /api/ai-reports/:id`
One active report (params to build the run form) → `{ report: AiReportPublicDto }`.
- `401` · `404` unknown or inactive.

### `POST /api/ai-reports/:id/execute`
Run a report. Body `{ input_params: Record<string,string> }`. Flow: shared AI rate
limit (**10/min · 200/day**) → monthly AI token check → load active report → validate
required `input_params` → agentic run (`execute_sql` + BizRaport + Google rating + web search per
`model_config`; SQL audited `source='ai_report'`) → the model returns JSON via the
`submit_report` tool → save `ai_report_executions` → `{ executionId, output_data,
html_widget, execution_ms }`.
- `400` invalid body / missing required param · `401` · `404` unknown or inactive ·
  `429` rate limit or `{ code: "AI_MONTHLY_TOKEN_LIMIT_EXCEEDED" }` · `502` execution failed.

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
(`isActive=false`). Body `{ description: string(1–2000) }`. Uses the shared AI
rate limit (**10/min · 200/day** per admin). The generation model
(`ANTHROPIC_CHAT_MODEL`) returns `name`, `systemPrompt`, `outputSchema`, `htmlWidget`,
`inputParams`, `modelConfig` via a forced tool call
([`lib/ai/report-generator.ts`](../../lib/ai/report-generator.ts)); the generator may
wire ERP SQL, BizRaport, Google rating, and web search into `modelConfig`. Returns
`201 { report: AdminAiReportDto }`.
- `400` invalid body · `429` request or monthly AI token limit
  · `502` generation failed.

#### `PATCH /api/admin/ai-reports/:id`
Edit fields and/or activate. Body = any subset of
`{ name, description, systemPrompt, outputSchema, htmlWidget, inputParams, modelConfig, isActive }`
(at least one; activate with `isActive: true`). Returns `{ report: AdminAiReportDto }`.
- `400` invalid data · `404` unknown id.

#### `DELETE /api/admin/ai-reports/:id`
Delete a report. Returns `{ ok: true }`.
- `404` not found.

### Prompty systemowe — `/api/admin/prompts`
Editable AI prompt texts, stored versioned in `chatbot.system_prompts` (newest
version per key is live). Keys and shipped defaults are the registry in
[`lib/ai/prompt-defaults.ts`](../../lib/ai/prompt-defaults.ts); wire shapes in
[`lib/api/prompts-types.ts`](../../lib/api/prompts-types.ts). The chat/data paths
read these through a 60s stale-while-revalidate cache
([`lib/ai/prompt-store.ts`](../../lib/ai/prompt-store.ts)) that falls back to the
compiled-in defaults if the DB is unavailable.

#### `GET /api/admin/prompts`
Every editable prompt with its live text → `{ prompts: AdminPromptDto[] }`. A key
never edited since deploy has `version: null` and the compiled-in default as
`content`.

#### `GET /api/admin/prompts/:key`
One prompt plus its full version history (newest first) →
`{ prompt: AdminPromptDto, versions: PromptVersionDto[] }`.
- `404` unknown `key` (not in the registry).

#### `PUT /api/admin/prompts/:key`
Saves `{ content }` as the next version, which becomes live (also used for
revert — the client resends an older version's text). Invalidates the prompt
cache on this instance → `{ prompt: AdminPromptDto }`.
- `400` empty or >20000 chars.
- `404` unknown `key`.
- `409` a concurrent save took the same version — refresh and retry.

### Schemat bazy (ERP tables model) — `/api/admin/erp-tables`
The one DB-backed source of truth for the ERP tables, stored in
`chatbot.erp_tables` + `chatbot.erp_columns` and edited in admin → **Schemat
bazy**. It feeds BOTH the AI schema prompt (`{{ERP_SCHEMA}}`) and the Dane
browser, via a 60s stale-while-revalidate cache
([`lib/erp-schema/store.ts`](../../lib/erp-schema/store.ts)) that falls back to
`DEFAULT_ERP_MODEL` ([`lib/erp-schema/model.ts`](../../lib/erp-schema/model.ts))
if the DB is unavailable. Wire shapes in
[`lib/api/erp-tables-types.ts`](../../lib/api/erp-tables-types.ts). **Not
versioned** — edits are in-place full replacements. Read-only SQL safety does not
depend on it (the executable allowlist is derived live from `public`).

#### `GET /api/admin/erp-tables`
The current model → `{ tables: ErpTableModel[] }` (falls back to the compiled-in
default when unseeded).

#### `PUT /api/admin/erp-tables`
Replaces the whole model (`{ tables }`, validated by `erpModelSaveSchema`) in one
transaction, invalidates the cache, and cross-checks names against the live
`public` schema → `{ tables, warnings }`. Unknown table/column names are
non-blocking `warnings` (the browser drops them; the model keeps them), not errors.
- `400` invalid model, duplicate table key, or duplicate column in a table.

### `GET /api/admin/schema`
Public (ERP) tables with their columns and primary key, for the quick-action
builder → `{ tables }`.

### `GET /api/admin/overview`
Aggregated stats for the admin „Przegląd" page. Wire shapes in
[`lib/api/admin-overview-types.ts`](../../lib/api/admin-overview-types.ts); queries in
[`lib/db/queries/admin-stats.ts`](../../lib/db/queries/admin-stats.ts). Returns
**display-ready** `AdminOverviewResponse`
(`{ stats, weeklyQueries, systemStatus, users }`) — KPI tiles, the 7-day query chart
(Warsaw days, today highlighted), live DB/AI-provider status, and the busiest active
users this month. The „Zużycie AI / mies." tile shows **month-to-date spend in USD**
fetched live from the Anthropic Cost API (`getMonthlyAiSpend`, `lib/ai/token-usage.ts`),
with the billing period (calendar month, `DD.MM.YYYY – DD.MM.YYYY`) as its delta line;
the value falls back to „—" when `ANTHROPIC_ADMIN_KEY` is missing or the Cost API is
unreachable.
- `500` load failed.

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
POST   /api/chat/sessions/:sessionId/messages/:messageId/retry # NDJSON stream

GET    /api/quick-actions
GET    /api/quick-actions/:key/rows
POST   /api/quick-actions/:key/run                      # NDJSON stream

GET    /api/data/schema
POST   /api/data/query

GET    /api/ai-reports
GET    /api/ai-reports/runs
GET    /api/ai-reports/runs/search
GET    /api/ai-reports/runs/:executionId
GET    /api/ai-reports/:id
POST   /api/ai-reports/:id/execute

GET    /api/admin/quick-actions
POST   /api/admin/quick-actions
PATCH  /api/admin/quick-actions/:id
DELETE /api/admin/quick-actions/:id

GET    /api/admin/ai-reports
POST   /api/admin/ai-reports/generate
PATCH  /api/admin/ai-reports/:id
DELETE /api/admin/ai-reports/:id

GET    /api/admin/prompts
GET    /api/admin/prompts/:key
PUT    /api/admin/prompts/:key

GET    /api/admin/erp-tables
PUT    /api/admin/erp-tables

GET    /api/admin/schema
GET    /api/admin/overview
```
