# Conventions

Rules that keep four people and several agents producing code that looks like one person wrote it. `CLAUDE.md` has the short list; this is the long one.

## Language and tooling

- Node 26 (`.nvmrc`, `engines >=26` — Chris's choice, 2026-10-13), pnpm 12 via corepack (`packageManager` in `package.json`). TypeScript 6.0 until typescript-eslint supports 7.
- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. Shared `tsconfig.base.json` at the root; each workspace extends it.
- ESLint (flat config) + Prettier. Prettier owns formatting; ESLint owns correctness. No style rules in ESLint.
- `pnpm check` = `typecheck && lint && format:check && test`. CI runs exactly this plus `build`. Prettier formats code only; Markdown is hand-formatted and ignored (`.prettierignore`).
- Imports: absolute within a workspace via `@/`; cross-workspace via the package name (`@reparo/shared`). No `../../..`. Packages are consumed as TypeScript source (`exports` → `./src/index.ts`); only `apps/web` has a build step.

## Naming

- Files: `kebab-case.ts`. React components: `PascalCase.tsx`, one component per file, named export matching the file.
- Database: `snake_case` tables and columns, plural table names (`rooms`, `budget_lines`). Drizzle schema objects are `camelCase` singular-ish (`rooms`, `budgetLines`).
- tRPC routers: one per entity, named after the table (`rooms.list`, `rooms.create`, `rooms.update`, `rooms.archive`). Verbs: `list`, `get`, `create`, `update`, `archive` (soft-delete), `restore`. Avoid `delete` unless it is truly hard-deleting, which needs Chris.
- Zod schemas: `RoomSchema`, `CreateRoomInput`, `UpdateRoomInput` in `packages/shared`. Types are inferred from schemas, never written twice.
- Booleans read as predicates: `isArchived`, `hasRendering`.

## Data

- See ADR-004 for units. Use `cents()`, `inches()`, `formatMoney()`, `formatLength()` from `@reparo/shared`. If you're writing `/ 100` or `* 12` outside that package, stop.
- Every table: `id uuid default gen_random_uuid()`, `created_at timestamptz`, `updated_at timestamptz` (trigger-maintained), `deleted_at timestamptz null` where soft-delete applies.
- Foreign keys always, with explicit `on delete` behavior. Default is `restrict`; use `cascade` only for true owned children (a room's measurements, a cost's receipt files).
- Enums as Postgres enums via Drizzle `pgEnum`, mirrored as a Zod `z.enum` in shared. Add values with a migration; never remove one.
- Migrations: `pnpm db:generate` produces them; commit the SQL. Never hand-edit a generated migration except to add a data backfill below the schema change. Never squash applied migrations.
- Files (renderings, receipts, quotes) go to Supabase Storage in a bucket per kind; the DB row stores the storage path, mime type, size, and the entity it belongs to. Never store file bytes in Postgres.

## API

- All procedures are `memberProcedure` (authenticated and allowlisted). There is no `publicProcedure` in this codebase.
- Input is a Zod schema from `@reparo/shared`. Output types are inferred; don't annotate return types on procedures.
- Services do the work; routers only parse input, call a service, and return. A service is a plain function taking `(db, ctx, input)` so it can be unit-tested without tRPC.
- Errors: throw `TRPCError` with `NOT_FOUND`, `BAD_REQUEST`, `FORBIDDEN`. No stringly-typed error codes.
- Derived values (areas, totals, progress) are computed in services or SQL views, not in React.

## Web

- Routes are files under `apps/web/src/routes` (TanStack Router file-based). URL state for anything shareable (which room, which filter).
- Server state through TanStack Query via the tRPC client. Zustand only for UI state that must outlive a route (open panels, drafts). No Redux, no context-as-store.
- Forms: react-hook-form + the shared Zod schema via `zodResolver`. Same schema the API validates with.
- Tailwind utility classes in JSX; extract a component when the same cluster appears three times. No CSS modules, no styled-components.
- Mobile first: every list and detail screen must be usable at 375px wide. Bulk-edit tables can require a laptop and say so.
- Accessibility baseline: semantic elements, labels on every input, keyboard-reachable actions, visible focus.

## Testing

- Vitest everywhere. Unit tests sit next to the code (`room-service.test.ts`).
- `packages/shared`: every helper has tests, including rounding and fractional-inch edge cases.
- `packages/api`: service tests against a real local Postgres (Supabase CLI), each test in a transaction that rolls back.
- `apps/web`: component tests only for logic-bearing components; a Playwright smoke test (sign in, create a room, see it) from M1 onward.
- A bug fix comes with the test that would have caught it.

## Git and Linear

- `main` is deployable at all times. Protected; PRs only.
- Branch per Linear issue, using the name Linear suggests on the issue (`chris/od-42-room-measurements`). The `od-<n>` segment is what links it.
- Conventional commits: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, with a scope of `web`, `api`, `db`, `shared`, or `repo`. Example: `feat(db): rooms and measurements tables`.
- PR body: what and why in two sentences, `OD-<n>`, screenshots for UI, a line for any new dependency, a line for any doc updated.
- Squash-merge. The squash title becomes the commit on `main`, so make PR titles good.
- One issue, one PR. If an issue grows, split the issue in Linear rather than growing the PR.

## Documentation

- Behavior change → update `docs/` in the same PR.
- A PR that changes `docs/scope.md` also updates the *Scope* document in the Linear project (summary + "last synced" commit) so the two don't drift.
- Decisions from the "needs an ADR" list in `CLAUDE.md` → append to `docs/decisions.md` in the same PR.
- Comments explain *why*, not *what*. If the what isn't obvious, rename something.
- No `TODO` without a Linear issue number next to it.

## Identity

Reparo is an internal tool for one house, not a generic project manager. Don't reach for Notion/Linear/Asana patterns (boards of cards, sidebar-of-everything) by default; design each screen for what it is — a room, an item across rooms, a phase, the money. The name is the mending charm; the nod is in naming and tone, kept light. Chris reviews UI before it merges.

## Environment

- `.env.example` is the contract. Every variable it lists is validated at startup with Zod (`packages/shared/env.ts`); the app refuses to start with a missing one.
- Never commit `.env`, `.env.local`, or anything under `supabase/.temp`.
