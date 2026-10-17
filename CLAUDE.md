# Reparo

Home-renovation app for Chris's household, acting as its own general contractor on one house, renovated in phases over years. Up to four people sign in with Google. It replaces a budget spreadsheet: money left, what each room is becoming (specs, products, images), what's been bought, who's doing what, and where it stands.

## Where things live

- **Scope, plan, milestones, issues, what's next:** Linear project **Reparo** (P-OD-4, team OD) — https://linear.app/okayishdev/project/reparo-ffa182a4db1c. Read its *Scope* and *Data model* documents and the issue you're on. Milestone descriptions hold done-criteria.
- **Coding rules:** this file, plus `.claude/rules/` (each loads when you touch its area).
- **What exists:** the code. The Drizzle schema in `packages/db/src/schema` is the data model as built.
- If you can't reach Linear, say so and ask Chris for the issue text. Don't guess scope.

## Research & answering rules

1. Accuracy comes first. Everything must be grounded in verifiable information. Never guess, fabricate details, or fill gaps just to provide an answer. If something cannot be verified, say so clearly.
2. Research in proportion to the stakes. Do not rely on surface-level information when additional research could materially improve accuracy or completeness — but match the depth of research to the importance of the question. If web search or document fetching is available, use it for version-specific, product-specific, or time-sensitive questions rather than answering from training memory.
3. Prioritize primary sources. For technology, products, specifications, compatibility, and technical questions, use official documentation as the primary source. Verify the documentation applies to the exact product, model, software version, or generation in use. In code, this means linking the doc page for the API or library version you relied on.
4. Separate fact from inference. When an answer rests on facts that could be wrong or on a judgment call, label them:
   - Verified: directly supported by reliable evidence or documentation.
   - Inferred: a reasonable conclusion from verified information, not explicitly confirmed.
   - Assumed: not verified; used only as a working assumption.
   Do not label the obvious or the trivial.
5. Cite your sources. Provide direct links supporting important factual claims. Prefer primary over secondary sources when both are available.
6. Check recency. Note the date of any figure that can go stale (prices, versions, availability, schedules). Prefer the docs version that matches the version actually in use.
7. When sources conflict, observed behavior wins. If official docs disagree with what the code, tests, or a live system actually do, go with the observed behavior and flag the discrepancy.
8. Handle ambiguity and missing information. If an interpretation or assumption would not materially change the answer, state it and proceed. If it would, ask before proceeding. Never make a material assumption silently.
9. Stay within scope. Answer the question asked. In code, do not refactor, rename, reformat, or "improve" anything outside the task unless it is necessary or specifically requested. Do not branch into unrelated research, recommendations, or side quests.
10. Do not simply agree. If a premise appears incorrect, incomplete, or contradicted by the evidence, say so. Point out meaningful risks, tradeoffs, flaws, or alternatives, even when they conflict with the stated position.
11. Be transparent about uncertainty. Never present uncertain, outdated, conflicting, or incomplete information as established fact. Explain the limitation and, when possible, what would resolve it.

## How Chris works

- Proposals before artifacts. Nothing is written to the repo or Linear until Chris has said yes to a specific proposal.
- Decisions are his. Lay out options and stop; don't pick a "recommended default" and build on it.
- One Linear issue at a time. Chris names the next one; don't pick or suggest it unprompted.
- Work on `develop`. No feature branches or PRs unless Chris asks. Leave `main` alone.
- **Chris commits and pushes.** Leave changes in the working tree and give him a commit title and message: conventional commit with scope and issue (`feat(web): room list (OD-30)`), title under 50 characters, a body with the why and any new dependency. No `Co-Authored-By` or session trailer.
- Never add a dependency, install a package, or run `brew` or another system installer without asking. Run commands only inside the project folder.
- `pnpm check` must pass before you call work done. There is no CI.
- Small changes, one concern each. If an issue grows, propose splitting it in Linear.
- When an issue is done, comment on it in Linear: what changed, what's left, anything surprising.

## Ask Chris before

- Deleting data, dropping tables, or rewriting an applied migration
- Spending money (paid tiers, domains, services)
- Reordering milestones or changing done-criteria
- Changing the auth model or roles, or how money, lengths, or dates are represented
- Adding a top-level app or package, or a new external service
- Force-pushing or rewriting `develop` or `main`

## Hard rules

- TypeScript `strict`. No `any`; no `@ts-ignore`/`@ts-expect-error` without a one-line reason.
- Validate every boundary with Zod: tRPC inputs, env vars, uploads, imported data. Schemas live in `@reparo/shared`; types are inferred from them, never written twice.
- **Money** is integer cents: `bigint` in Postgres, `number` in TS, never floats.
- **Lengths** are inches, `numeric(10,4)`, snapped to 1/16". Shown as ft/in with fractions (`7' 3 1/2"`).
- **Dates** without a time are `date` (ISO strings), not `timestamptz`.
- All unit math goes through `@reparo/shared` (`cents`, `formatMoney`, `sumCents`, `parseLength`, `inches`, `formatLength`, `area`, `IsoDate`). If you're writing `/ 100`, `* 12`, or `new Date()` arithmetic anywhere else, stop.
- Every tRPC procedure is `memberProcedure`, `editorProcedure`, or `adminProcedure`. There is no public procedure. Roles: admin (Chris: members, phases, archiving vendors, hard deletes), editor (everything else), viewer (read-only).
- Schema changes only through Drizzle migrations in the repo. Never alter a database by hand.
- Secrets only in `.env` (gitignored) and hosting dashboards. `.env.example` lists every variable.
- Don't build what isn't in the Linear issue. If it needs something out of scope, say so on the issue.
- `raw/` is Chris's source material (the current budget spreadsheet). Read it; never modify, move, rename, delete, or commit anything in it.

## Settled — don't re-propose

- React 19 SPA on Vite, not Next.js. tRPC + Zod, not REST/GraphQL. Drizzle owns the schema, not Supabase migrations.
- Supabase Auth with Google only; membership by email in `members`. New Supabase keys (`sb_publishable_…` / `sb_secret_…`), not legacy anon/service_role. Tokens verified against JWKS (ES256), never a shared secret.
- RLS on every table with no policies; the API connects as the DB owner and bypasses it.
- Node 24 (newest Vercel runs). pnpm 12 (deploy needs `ENABLE_EXPERIMENTAL_COREPACK=1` on Vercel — on the Deploy issue).
- Everything local until Chris says deploy. Target: Vercel + hosted Supabase at `reparo.okayish.dev`. Keep code Vercel-shaped.
- No CI while local.
- Parked, not rejected: scenario comparison; viewer scoping / hiding areas.

## Stack and layout

```
apps/web          React 19 + Vite + TanStack Router/Query + Tailwind v4; apps/web/api/index.ts is the Vercel function
packages/api      tRPC routers + services + role guards (framework-free Node)
packages/db       Drizzle schema, migrations, seed
packages/shared   Zod schemas, env validation, money/length/date helpers (depends on nothing)
```

`api` depends on `db` and `shared`; `web` depends on `shared` and imports only the API's types. Packages are consumed as TypeScript source; only `apps/web` builds. Imports: `@/` within a workspace, package name across (`@reparo/shared`); no `../../..`.

## Commands

Copy `.env.example` to `.env` first; `supabase start` prints the local keys.

```
pnpm install          # once
supabase start        # local Postgres + Auth + Storage (Docker)
pnpm dev              # Vite :5173 + API :3001; Vite proxies /api
pnpm check            # typecheck + lint + format + test — before calling work done
pnpm db:generate      # migration from a schema change
pnpm db:migrate       # apply migrations to DATABASE_URL (local: port 54322)
pnpm db:seed          # upsert members from MEMBERS in .env
pnpm db:studio        # Drizzle Studio
pnpm db:import        # dry-run the spreadsheet import (import/spreadsheet-lines.csv); --write keeps it
pnpm db:import-images # dry-run attaching the spreadsheet's pictures (import/spreadsheet-images.csv); --write uploads
pnpm db:import-estimates # dry-run making the imported vendor prices chosen estimates; --write keeps it
# db:seed and db:import* print their database and storage first, stop if those are different
# stacks, and need --target=<project ref> to write to a hosted project (OD-164)
```

`@reparo/db` and `@reparo/api` tests need local Supabase running. Each package uses its own database on that server (`reparo_test_db`, `reparo_test_api`, `reparo_test_import`, `reparo_test_images`), dropped and rebuilt from every migration on each run; your dev database is never touched. Tests refuse to run unless `DATABASE_URL` is local. Every test still rolls back its own writes.

## Naming

- Files `kebab-case.ts`; React components `PascalCase.tsx`, one per file, named export.
- Tables and columns `snake_case`, plural tables. Booleans read as predicates (`isArchived`).
- Comments explain why, not what. No `TODO` without a Linear issue number.
