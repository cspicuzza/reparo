# Decisions

Architecture Decision Records. Append new ones at the bottom; never edit an accepted record except to add a *Superseded by* line. Format: context, decision, consequences. Keep each short.

---

## ADR-001 — Stack: React SPA + tRPC + Supabase, shared with thebeast

**Date:** 2026-10-13 · **Status:** Accepted · **Amended by:** ADR-012 (Node 24; toolchain verified)

**Context.** Reparo is a CRUD-heavy app with file uploads for a four-person household. Chris already runs the same shape of app (thebeast) on a known stack, and agents working across both repos benefit from identical conventions.

**Decision.** React 19 + Vite + TypeScript strict + Tailwind + TanStack Router/Query + Zustand on the client; Node + tRPC + Zod for the API; Postgres on Supabase with Drizzle ORM; pnpm monorepo. Next.js was considered and rejected: it would be the only Next app in the portfolio and the SPA + tRPC split already gives us end-to-end types.

**Consequences.** Conventions, lint config, and helper packages can be copied from thebeast. No SSR; initial load is a static bundle plus API calls, which is fine for a private app. Vercel preview deploys work out of the box for the SPA.

---

## ADR-002 — Hosting: Vercel for web + API, Supabase for everything stateful

**Date:** 2026-10-13 · **Status:** Accepted · **Amended by:** ADR-010 (local only until Chris says deploy); ADR-012 (API entry is `api/index.ts` + rewrite)

**Context.** Options were Vercel, Digital Ocean App Platform, or a DO droplet. Supabase already covers Postgres, auth, and file storage, so the only thing left to host is a static bundle and a thin API.

**Decision.** One Vercel project rooted at `apps/web`. The Vite build is the static site; `apps/web/api/trpc/[trpc].ts` is a Vercel serverless function that mounts the tRPC router from `packages/api`. One hosted Supabase project is production. Local development runs the Supabase CLI (`supabase start`) so every developer has a private Postgres/Auth/Storage.

**Consequences.** Free tiers cover us. No servers to patch. Vercel previews get a working frontend; whether previews point at a shared dev Supabase project or at production-read-only is deferred to an ADR when it matters (M1). Cold starts on serverless are acceptable for this traffic.

---

## ADR-003 — Auth: Google SSO through Supabase Auth, membership by email allowlist, single role

**Date:** 2026-10-13 · **Status:** Accepted · **Superseded by:** ADR-008 (roles); SSO and allowlist stand

**Context.** Up to four household members, all with Google accounts. Vendors and contractors don't need logins in v1.

**Decision.** Supabase Auth with Google as the only provider. A `members` table holds the allowed emails; the API's member guard rejects any authenticated user whose email isn't in it. One role — every member can read and write everything. New members are added by inserting a row (seed/migration or an admin screen in M0).

**Consequences.** No permission logic to write or test in v1. Adding contractor access later means adding a `role` column and per-procedure checks — that's an ADR and a milestone, not a quiet change.

---

## ADR-004 — Units: money in integer cents, lengths in inches, dates as ISO dates

**Date:** 2026-10-13 · **Status:** Accepted · **Amended by:** ADR-011 (`numeric(10,4)`, 1/16")

**Context.** Renovation math mixes dollars, square footage, linear feet, and fractional inches. Float money is a classic bug; mixed length units are another.

**Decision.** Money is stored as integer cents (`bigint`), typed `number` in TS, formatted only at the edge. Lengths are stored in inches as `numeric(10,3)`; the UI accepts ft/in (including fractions like 7/8) and displays ft/in. Areas are derived in square inches and displayed in sq ft. Dates that don't need a time (task dates, invoice dates) are `date`, not `timestamptz`. Conversion and formatting helpers live in `packages/shared` and are the only place these rules are implemented.

**Consequences.** Every input and display goes through the shared helpers. Metric can be added later as a display preference without touching storage.

---

## ADR-005 — Repo layout: pnpm monorepo with four workspaces

**Date:** 2026-10-13 · **Status:** Accepted · **Risk noted in:** ADR-012 (TS-source packages inside Vercel functions)

**Decision.**

```
apps/web          Vite SPA; apps/web/api/ holds Vercel function entrypoints
packages/api      tRPC routers, services, member guard — framework-free Node
packages/db       Drizzle schema, migrations, seed scripts
packages/shared   Zod schemas, domain types, unit/money/date helpers
```

`packages/shared` has no dependencies on the other packages. `packages/api` depends on `db` and `shared`. `apps/web` depends on `shared` and imports the API's *types* only.

**Consequences.** Clear dependency direction; the API can be tested without a browser; the web app never touches the database directly.

---

## ADR-006 — Linear tracks work; the repo holds the truth

**Date:** 2026-10-13 · **Status:** Accepted · **Amended 2026-10-13:** the roadmap lives in Linear, not in a `docs/roadmap.md` (Chris's call)

**Decision.** Linear project *Reparo* (team OD) holds issues, milestones, milestone order, and done-criteria. Scope, decisions, conventions, and data model live in `docs/` and `CLAUDE.md`. Issues link to docs; they don't restate them. For scope and design questions the repo is right; for what's next and whether it's done, Linear is right.

**Consequences.** Agents and humans read the repo for "why" and Linear for "what's next". Reordering milestones is a Linear change plus an ADR note.

---

## ADR-007 — M1 is Rooms & specs

**Date:** 2026-10-13 · **Status:** Superseded by ADR-010

**Context.** Chris had no preference for the first usable slice. Budget lines, materials, and tasks each reference a room.

**Decision.** Build rooms, measurements, specs, and renderings first. Budget & costs second, because money is the next most useful thing to see per room.

**Consequences.** M1 proves the full stack (auth, DB, storage, deploy) on the simplest domain. If Chris wants budget earlier, swap M1 and M2 in `docs/roadmap.md` and Linear — the data model already supports either order.

---

## ADR-008 — Roles: admin, editor, viewer

**Date:** 2026-10-13 · **Status:** Accepted · **Supersedes:** ADR-003's single role (Google SSO + email allowlist stand)

**Context.** Chris is the admin; some members enter data, some only look.

**Decision.** `members.role` ∈ {admin, editor, viewer}. Editor edits everything. Viewer reads everything for now; scoping and hiding areas are deferred until the app is built out. Admin-only: members and roles, the item list, phases, hard deletes. Enforced in the API guard per procedure, not in the UI alone.

**Consequences.** Every write procedure declares its minimum role. Adding viewer scoping later is a per-area check, not a model change.

---

## ADR-009 — Phases, work items, cost lines, one budget pool

**Date:** 2026-10-13 · **Status:** Accepted

**Context.** The house is renovated in phases over years. Work like flooring spans rooms with per-room variation. Some money (the cross-country move) is in a phase but belongs to no room. The spreadsheet tracks a single money pool with a remaining balance.

**Decision.**
- **Phase** is first-class; work and money belong to a phase.
- **Work item** = item × room, in a phase. `room_id` null is the item's house-wide default; a room row overrides it.
- **Cost line** belongs to a phase, optionally to a work item. Typed labor / material / permit / other with its own vendor, estimate, actual, link. Phase-level lines (no work item) cover things like moving.
- **One budget pool** with a starting balance and an adjustment ledger. Remaining balance = pool − actuals − outstanding estimates across all phases.
- **Payment status is derived** from payments recorded against a cost line, never set by hand.

**Consequences.** "Whole-house" work is just a work item with no room; no separate concept. Scenario comparison is out (scope is locked); one plan. The spreadsheet's Overview number must be reproducible from lines (M2 done-criterion).

---

## ADR-010 — M1 is Foundation; everything local until Chris says deploy

**Date:** 2026-10-13 · **Status:** Accepted · **Supersedes:** ADR-007 · **Amends:** ADR-002 (hosting target unchanged; timing changed)

**Decision.** Order: M0 Setup (local only) → M1 Foundation (phases, rooms, items, work items, status) → M2 Budget → M3 Item detail → M4 Phase views & dashboard. Done-criteria are in the Linear milestone descriptions. Hosting on Vercel + Supabase happens in a separate *Deploy* milestone with no date, when Chris wants to share it. Code stays Vercel-shaped (serverless entry under `apps/web/api/`, env contract in `.env.example`) so deploying is configuration.

**Consequences.** No hosted accounts are needed to start. OD-243 and OD-250 move to Deploy. M0's done-criterion is local sign-in with roles, not a production URL.

---

## ADR-011 — Lengths at 1/16" precision: `numeric(10,4)`

**Date:** 2026-10-13 · **Status:** Accepted · **Amends:** ADR-004 (inches stand; precision changes)

**Context.** ADR-004 chose `numeric(10,3)` for inches. Three decimals cannot hold 1/16" exactly (0.0625 → 0.063), and carpentry commonly works in sixteenths.

**Decision.** Lengths are stored as `numeric(10,4)` inches. `@reparo/shared` snaps every parsed or constructed length to the nearest 1/16" (`snapInches`), so stored values are always exact multiples of 0.0625. Display is feet/inches with reduced fractions (`7' 3 1/2"`).

**Consequences.** Max representable length is 999,999.9999" (~15.8 miles) — not a constraint. Any future finer precision (1/32") is a column change plus a new ADR.

---

## ADR-012 — Technology audit against vendor docs (2026-10-13)

**Date:** 2026-10-13 · **Status:** Accepted · **Amends:** ADR-001 (Node), ADR-002 (API entry), ADR-005 (risk noted)

**Context.** Several early choices were made from memory. Chris asked for every technology decision to be re-verified against official documentation. Findings and corrections:

**Corrected**
- **Node 24 LTS**, not 26. Vercel runs Node 22.x and 24.x only (https://vercel.com/docs/functions/runtimes/node-js/node-js-versions). `engines: 24.x`, `.nvmrc` 24, `@types/node` 24.
- **API entry is `apps/web/api/index.ts`** exporting `{ fetch(request) }`, with a rewrite from `/api/trpc/*`, not `api/trpc/[trpc].ts`. Vercel documents one shared function and the Web-standard handler (https://vercel.com/docs/functions/runtimes/node-js); dynamic `[segment]` files aren't documented. tsconfig path mappings are not supported inside `api/`, so the entry never uses `@/`.
- **Supabase keys**: publishable (`sb_publishable_…`) and secret (`sb_secret_…`); legacy anon/service_role are deprecated end of 2026 (https://supabase.com/docs/guides/api/api-keys). Tokens are verified against `SUPABASE_JWKS_URL` with ES256 (https://supabase.com/docs/guides/auth/signing-keys, https://supabase.com/docs/guides/auth/jwts).
- **Google secret env var** is `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET`, matching https://supabase.com/docs/guides/auth/social-login/auth-google. Local redirect URI `http://127.0.0.1:54321/auth/v1/callback` confirmed there.
- **CI installs pnpm with `pnpm/action-setup@v6`** (reads `packageManager`); `actions/setup-node`'s `cache: pnpm` requires pnpm pre-installed (https://github.com/actions/setup-node, https://github.com/pnpm/action-setup).

**pnpm 12 on Vercel.** Zero-config support is pnpm 6–10 (https://vercel.com/docs/package-managers); pnpm 12 requires `ENABLE_EXPERIMENTAL_COREPACK=1` on the project (https://vercel.com/docs/builds/configure-a-build#corepack). Recorded on the Deploy issue. Package-manager choice itself is open with Chris.

**Conflicts to settle by observation (rule 7)**
- `skip_nonce_check` for local Google sign-in: the Google guide shows `false`; the CLI-generated `config.toml` comment says it is required (`true`). First local sign-in in OD-20 decides.

**Assumed — verify when first exercised**
- The local stack serves JWKS at `/auth/v1/.well-known/jwks.json` (OD-21: `curl` it; fallback is the Auth server's `/auth/v1/user`).
- The hosted project uses asymmetric signing keys (Dashboard → Authentication → JWT Keys); on the legacy shared secret the JWKS endpoint returns no keys (Deploy).
- Vercel's function bundler compiles workspace packages consumed as TypeScript source through `node_modules` symlinks (ADR-005). Fallback: bundle `api/index.ts` with esbuild, or give packages a build step (Deploy).
- supabase-js minimum version for publishable keys (OD-20 proposal).

**Verified and unchanged**: RLS on every table; Data API off at deploy; pooler + `prepare: false`; `config.toml` keys; TypeScript 6.0 defaults; typescript-eslint `projectService` and its TS `<6.1` range; Vite 8 / Vitest 5 / ESLint 10 Node floors; Tailwind v4 Vite plugin; TanStack Router Vite plugin with `src/routes`; tRPC v11 fetch adapter; Drizzle `numeric(10,4, mode:'number')`, `bigint(mode:'number')`, `date(mode:'string')`, custom migrations.

**Consequences.** Nothing version-specific is written from memory again: every dependency proposal cites the doc page it was checked against, with its date.
