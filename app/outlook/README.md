# Outlook task pane (`/outlook`)

An Outlook add-in task pane that reuses the dashboard's chat + quick actions as a
**new client of the existing API** — not a new backend. It lives in its own
`app/outlook` segment (a sibling of `/app`, so no sidebar shell and no `/app`
auth guard) and is served by the same Next.js app, so it's same-origin with the
API (no CORS).

## How it differs from `/app/chat`

| Concern | `/app` (browser) | `/outlook` (task pane) |
| --- | --- | --- |
| Auth transport | Session cookie (HttpOnly) | `Authorization: Bearer <jwt>` from `localStorage` |
| Why | first-party page | third-party iframe — cookie is unreliable |
| Streaming + adapters | `lib/api/chat-stream` | `lib/api/chat-stream` (shared) |
| Email context | — | sender + subject via Office.js (prefill only) |

The single backend change that unlocks Bearer for **every** endpoint is in
`lib/auth/session.ts` (`getSessionPayload` now reads the `Authorization` header
first, then the cookie). `POST /api/auth/verify-otp` also accepts
`issueToken: true` to return the raw JWT for the pane to store.

## Files

- `layout.tsx` — loads Office.js from the CDN (scoped to this route).
- `page.tsx` → `OutlookApp.tsx` — waits for `Office.onReady()`, validates the
  stored token via `/api/me`, then shows `LoginPane` or `ChatPane`.
- `LoginPane.tsx` — email → OTP → `verify-otp` (`issueToken`), stores the token.
- `ChatPane.tsx` — messages (Markdown), streaming, lazy session on first turn.
- `QuickActionsBar.tsx` — quick-action chips (`text` / `row_from_table`).
- `EmailContextBanner.tsx` — sender/subject banner + one-click prompt prefill.
- `outlookApi.ts` — Bearer fetch client + 401 → back to login.
- `lib/outlook/office.ts`, `lib/outlook/auth-client.ts` — Office.js + token store.
- `public/outlook/manifest.xml` + `public/outlook/assets/*` — the add-in manifest.

## Run & sideload (dev)

Office add-ins require **HTTPS**. Serve the app over HTTPS on port 3000:

```bash
# Option A: Next's built-in self-signed cert
npm run dev -- --experimental-https --port 3000

# Option B: trusted dev certs, then run next dev behind them
npx office-addin-dev-certs install
```

Then sideload `public/outlook/manifest.xml`:

- **Outlook Web** — Settings → Add-ins → *My add-ins* → *Add a custom add-in* →
  *Add from file* → pick `public/outlook/manifest.xml`.
- **Desktop (Win/Mac)** — File → *Get Add-ins* → *My add-ins* → *Add a custom
  add-in* → *Add from file*.

Open a message → the **Wistal ERP · Asystent ERP** button opens the pane. Log in
with an `@wistal.com.pl` address (OTP), then chat / run quick actions. Pin the
pane to keep the email-context banner refreshing as you switch messages.

## Production

Replace every `https://localhost:3000` in `public/outlook/manifest.xml` with the
deployed origin (e.g. `https://<app>.vercel.app`) and bump `<Version>`. No other
change is needed — the pane is same-origin with the API on that host.
