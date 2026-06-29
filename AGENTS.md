<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Wistal ERP Chatbot Dashboard

Internal Next.js (App Router) + Neon PostgreSQL app: Wistal staff query ERP data in
natural language (text-to-SQL with Claude `claude-sonnet-4-6`), browse data manually,
and run structured AI reports. Hosted on Vercel; auth is email OTP → JWT, restricted
to `@wistal.com.pl`.

**Full project context and conventions live in the `wistal-erp-chatbot` skill**
([.claude/skills/wistal-erp-chatbot/](.claude/skills/wistal-erp-chatbot/)). It mirrors
the four canonical Notion docs (architecture, DB schema, backend, UI). Consult it for
any work on this project. Notion is the source of truth.

## Core conventions

- **A new page or widget = a `.tsx` file + a co-located `.css` file** (prefer a CSS
  Module, `Component.module.css`). Keep styling in the stylesheet, not inline, and
  reuse the design tokens (navy `#1E2188`, page bg `#eaecf0`, IBM Plex Sans/Mono).
- **Many small commits, not one big one.** After making and summarizing changes,
  propose grouped `git add` + short `git commit -m` commands — one per logical change.
- **Read-only data access, always.** Every generated query is a `SELECT`; the SQL
  validator blocks writes/DDL, enforces a table allowlist, and injects a row limit.
- **Polish** for all UI copy and model answers.

UI design prototypes (Claude Design handoff) are in
[wistal-erp-chatbot-ui/project/](wistal-erp-chatbot-ui/project/) — recreate them as real
React, don't copy their inline-style structure.
