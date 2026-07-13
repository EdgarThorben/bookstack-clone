## What this project is

A single-tenant IT documentation / CMDB tool (Docusnap/i-doit style) for one org's IT department. Astro SSR, Postgres + Drizzle, argon2 + session-cookie auth. Currently a BookStack-shaped clone: shelves → books → chapters → pages.

## Current state vs. gaps

Built: DB-backed shelves/books/pages, login/logout, page create/edit with auto-diffed revision history, a JSONB `details[]` array (category/label/value) per page.

Not built — do not assume these exist: signup/registration, account settings, role-based permissions (any logged-in user can edit any page today), UI to create books/chapters/shelves, and — important for CMDB work — no typed asset model or relationship graph yet. Pages today are documents with free-text detail rows, not typed Configuration Items with dependency edges.

## v1 direction (confirmed)

- Single org, single tenant. No multi-tenant isolation needed.
- Manual documentation core first (CRUD + structured records + relationships). Do not build network discovery/scanning (SNMP/WMI/SSH) unless explicitly asked — out of scope for v1.
- Hosting: **confirmed** — stays on Vercel + Neon (cloud Postgres). Do not propose Docker Compose, on-prem Postgres, or other self-hosting changes; deploy config is settled.

## Data model rules for CMDB work

- Schema lives in `src/db/schema.ts` (Drizzle/Postgres); migrate with `npm run db:generate` then `npm run db:migrate`.
- The current `pages.details` JSONB blob is fine for wiki-style docs but is NOT a CI relationship model. When building real asset relationships, add an explicit join table (`asset_id`, `related_asset_id`, `relationship_type`) with cycle detection — don't encode relationships as prose links inside `details`.
- Reuse the existing revision pattern (`pageRevisions`: snapshot + diffed `changes[]`) for any new versioned entity instead of inventing a second history mechanism.
- Prefer soft-delete (a `status`/`decommissioned_at` column) over hard delete for assets, so decommissioned hardware/licenses stay auditable.
- Treat credentials/license keys as a separate, more sensitive field type going forward — never store them in the general `details` JSONB alongside plain fields; when built, they need their own table and field-level (not just page-level) access control.
- **Credentials encryption (confirmed 2026-07-14):** secrets are encrypted app-side with AES-256-GCM (Node `crypto`), key from an env var (Vercel/Neon env, not committed). Per-record IV. Do not add pgcrypto or an external secrets manager — this was decided against in favor of the existing stack.
- **Credentials access control (confirmed 2026-07-14):** masked-by-default, reveal-on-demand, every reveal audit-logged (who/what/when). Any logged-in user may reveal — do not build per-user/role grants for this; that would pull in full RBAC, which stays out of scope unless separately requested.

## Out of scope unless explicitly requested

Network discovery/scanning, multi-tenancy, granular RBAC beyond "logged in or not", self-service signup.

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
