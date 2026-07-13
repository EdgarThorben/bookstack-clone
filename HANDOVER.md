# Handover — bookstack-clone → CMDB

Written 2026-07-13, end of a Cowork session, for continuation in Claude Code (terminal) or any other session.

## Orientation

Read `CLAUDE.md` (== `AGENTS.md`, hard-linked, same file under two names) first — it has the standing project rules: stack, what's built vs. not, v1 scope, data-model conventions, and what's explicitly out of scope. This file is just the session handoff on top of that: what changed most recently and what's next.

## What just happened (this session)

Added the first real CMDB layer on top of the existing BookStack-style wiki:

- **`src/db/schema.ts`** — three new tables: `assets` (typed CIs with `type`, `status`, `decommissioned_at`, structured `fields`), `asset_revisions` (same diff/snapshot pattern as `pageRevisions`), `asset_relationships` (directed edges: `asset_id → related_asset_id`, typed `relationship_type`, unique-indexed, DB-level check against self-reference).
- **`src/lib/assetGraph.ts`** — `wouldCreateCycle()`, a recursive-CTE check run before any relationship insert, so you can't create circular dependency chains (A depends_on B depends_on C depends_on A). This is app-level, not a constraint — Postgres can't express "no path back to origin" at arbitrary depth.
- **`src/lib/assetQueries.ts`** — `listAssets`, `getAssetBySlug`, `getAssetRevisions`, `getAssetRelationships` (returns outgoing + incoming edges separately since the graph is directed).
- **`src/actions/assets.ts`** — `createAsset`, `updateAsset`, `decommissionAsset` (soft-delete), `addAssetRelationship` (rejects self-refs and cycles with a specific error message). Registered in `src/actions/index.ts`.
- **`drizzle/0001_magenta_silhouette.sql`** — generated and reviewed, matches schema exactly. `astro check` passes with 0 errors.

## Immediate next step

**The migration has not been applied.** `npm run db:migrate` was not run against the live Neon database — it's additive (new tables only, no risk to existing shelves/books/pages data) but touches production, so it was left for explicit confirmation. Run it before building UI against these tables:

```sh
npm run db:migrate
```

## Updated punch list (2026-07-14, driven by client requirements email)

Client (mk@json-services.com, 2026-07-12) wants a classic CMDB: HW/SW inventory in their relationships (servers, disks w/ SATA-SAS-NVMe, DBs w/ version+size, apps like WordPress, network devices w/ IP/ports/LB), which customer uses which server plus that customer's access data, reusable config "instructions," and job/timer tracking. Mapped against current state:

1. ~~Typed asset model + relationships~~ — done, schema supports this.
2. ~~Asset types & relationship types~~ — done 2026-07-14. `assetTypes` extended with `storage-disk`, `database`, `application`; `relationshipTypes` extended with `attached_to`, `installed_on` (in `src/db/schema.ts`, plain TS const arrays over a `text` column — no migration needed).
3. ~~Asset UI~~ — done 2026-07-14. `/assets` (grouped-by-type list), `/assets/new`, `/assets/[slug]` (fields + directed relationships panel + inline "add relationship" form), `/assets/[slug]/edit`, `/assets/[slug]/revisions`. Reused `DetailRowsEditor`/`DetailsPanel`/`Breadcrumb` from the pages UI — `DetailRowsEditor` gained a `fieldName` prop (defaults to `"details"`, pass `"fields"` for assets) since its hidden input name was previously hardcoded. Assets are also in the global search index now (`src/lib/queries.ts`). Verified end-to-end via the actions API: create, field-diff revisions, directed relationships both sides, cycle rejection, decommission.
4. **Customer entity** — new `customers` table + `asset_customers` join table ("server serves customer"). Kept separate from `assets` — customers aren't CIs (no HW/SW attributes, no revision history the same way). Not started.
5. **Credentials/license-key table** — separate from `assets.fields`, field-level access control. Decisions confirmed: AES-256-GCM app-level encryption (key via env var, per-record IV); masked-by-default / reveal-on-demand / audit-logged access, no per-user RBAC. See `CLAUDE.md` for the standing rule. Not started.
6. **Job/timer tracking** — new `job_runs` log table keyed by `asset_id` (job name, start/end or duration, status) + a timeline view per asset. Not a CI — it's event data about a CI, so it does NOT go in `assets`/`asset_relationships`. Lowest priority; client's least fleshed-out ask. Not started.
7. **UI to create books/chapters/shelves** — pre-existing gap, still open; only seeded categories exist.
8. **RBAC** — still "any logged-in user can edit anything" except credentials reveal, which is now audit-logged (see #5). Broader RBAC confirmed out of scope unless asked.

## Known environment note

Deployment is **confirmed to stay on Vercel + Neon** — don't propose Docker/self-hosting changes (this is now recorded in `CLAUDE.md` too).

## Picking this up in the Code tab

The Claude desktop app has three tabs: Chat, Cowork (this session), and **Code** — a full dev environment inside the app, powered by Claude Code. Unlike Cowork, it applies file edits directly and only pauses to confirm before running terminal commands — so no more of the stale-sandbox-mount issue this session hit.

1. Click the **Code** tab in the desktop app.
2. First time on Windows: it needs Git for Windows installed — install it, then restart the app.
3. Open `C:\Users\Edgar\Projects\bookstack-clone` as the project.

It reads `CLAUDE.md` automatically on open — no need to re-paste context. A good first message is literally *"read HANDOVER.md and CLAUDE.md, then run npm run db:migrate"* to pick up exactly where this session left off. After that, delete or archive this file (or leave it — it won't hurt anything sitting in the repo, just keep it from going stale if you don't update it going forward).
