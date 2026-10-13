# Roadmap

Milestones map one-to-one to Linear milestones in project *Reparo*. Each has a done-criterion a human can check. Order is a decision (ADR-007); change it here first, then in Linear.

## M0 — Setup

Accounts, local tooling, monorepo scaffold, CI, deploy pipeline, sign-in.

**Done when:** a fresh clone runs `pnpm install`, `supabase start`, `pnpm dev` and shows a sign-in page; CI passes on a PR; `main` deploys to Vercel; all four household members can sign in with Google and a fifth Google account is rejected.

Includes: Vercel and Supabase projects; Google OAuth client; pnpm workspaces with the four packages; tsconfig/ESLint/Prettier; `packages/shared` with env validation and unit/money helpers (tested); `packages/db` with `members` table and migration tooling; `packages/api` with the member guard and a `health` procedure; `apps/web` with router, tRPC client, sign-in, and an empty signed-in shell; GitHub Actions CI; branch protection.

## M1 — Rooms & specs

**Done when:** every room in the house exists with its dimensions, derived floor and wall areas are shown and correct against a tape-measure check, each room has a spec per finish category, and at least one rendering per room is uploaded and viewable on a phone.

Includes: `rooms`, `openings` (doors/windows that subtract from wall area), `specs`, `files` + Storage bucket for renderings; room list and detail screens; dimension entry in ft/in with fractions; spec editor; rendering upload and gallery.

## M2 — Budget & costs

**Done when:** the whole-house budget is entered as lines by room and category, each line shows estimate / committed / actual, a receipt can be attached to an actual, and the roll-up totals match a spreadsheet check to the cent.

Includes: `categories`, `budget_lines`, `costs`, receipt files; budget grid (laptop) and per-room budget view (phone); contingency line; CSV export.

## M3 — Vendors & materials

**Done when:** every contractor and supplier is in the directory with contact and documents, every material on a spec is in the catalog with a price and vendor, quantity needed is computed from room areas for area-based materials, and a budget line can be generated from a material assignment.

Includes: `vendors`, `vendor_documents`, `materials`, `material_assignments`, `quotes`; directory and catalog screens; assignment from a room spec; quantity math (with waste factor) in shared helpers.

## M4 — Tasks & progress

**Done when:** the renovation is broken into tasks by room with dependencies and dates, each task has an owner (member or vendor) and a status, a room's progress is derived from its tasks, and the schedule view shows what's late and what's blocked.

Includes: `tasks`, `task_dependencies`; kanban per room and whole-house list; simple timeline view; progress rollups; task documents (permits, inspections) via the existing files table.

## M5 — Dashboard & exports

**Done when:** the home screen answers "how are we doing on money and time, and what's going on in each room" without clicking, and any table can be exported to CSV/Excel.

Includes: budget health (estimate vs committed vs actual, contingency burn), schedule health (late/blocked counts), per-room cards with rendering thumbnail + progress + spend; Excel export with formulas for the budget.

## Later / not committed

Vendor logins and roles · accounting import · AI assistant over the data · second renovation support · metric display preference.
