# Decisions

Architecture Decision Records. Append new ones at the bottom; never edit an accepted record except to add a *Superseded by* line. Format: context, decision, consequences. Keep each short.

---

## ADR-001 — Stack: React SPA + tRPC + Supabase, shared with thebeast

**Date:** 2026-10-13 · **Status:** Accepted

**Context.** Reparo is a CRUD-heavy app with file uploads for a four-person household. Chris already runs the same shape of app (thebeast) on a known stack, and agents working across both repos benefit from identical conventions.

**Decision.** React 19 + Vite + TypeScript strict + Tailwind + TanStack Router/Query + Zustand on the client; Node + tRPC + Zod for the API; Postgres on Supabase with Drizzle ORM; pnpm monorepo. Next.js was considered and rejected: it would be the only Next app in the portfolio and the SPA + tRPC split already gives us end-to-end types.

**Consequences.** Conventions, lint config, and helper packages can be copied from thebeast. No SSR; initial load is a static bundle plus API calls, which is fine for a private app. Vercel preview deploys work out of the box for the SPA.

---

## ADR-002 — Hosting: Vercel for web + API, Supabase for everything stateful

**Date:** 2026-10-13 · **Status:** Accepted · **Amended by:** ADR-010 (local only until Chris says deploy)

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

**Date:** 2026-10-13 · **Status:** Accepted

**Context.** Renovation math mixes dollars, square footage, linear feet, and fractional inches. Float money is a classic bug; mixed length units are another.

**Decision.** Money is stored as integer cents (`bigint`), typed `number` in TS, formatted only at the edge. Lengths are stored in inches as `numeric(10,3)`; the UI accepts ft/in (including fractions like 7/8) and displays ft/in. Areas are derived in square inches and displayed in sq ft. Dates that don't need a time (task dates, invoice dates) are `date`, not `timestamptz`. Conversion and formatting helpers live in `packages/shared` and are the only place these rules are implemented.

**Consequences.** Every input and display goes through the shared helpers. Metric can be added later as a display preference without touching storage.

---

## ADR-005 — Repo layout: pnpm monorepo with four workspaces

**Date:** 2026-10-13 · **Status:** Accepted

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
