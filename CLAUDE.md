# Reparo

Home-renovation management app for a household acting as its own general contractor. One renovation, up to four signed-in people. It centralizes the budget, room measurements and specifications, vendors, materials, costs, task status and progress, and renderings of the intended final design for each space.

## Where truth lives

| What | Where |
|---|---|
| What we're building (and not) | `docs/scope.md` |
| Why we chose things | `docs/decisions.md` — dated ADRs, append-only |
| How we write code | `docs/conventions.md` |
| Milestones and done-criteria | `docs/roadmap.md` |
| Entities and relationships | `docs/data-model.md` |
| Task tracking | Linear project **Reparo** (P-OD-4), team **OD** — https://linear.app/okayishdev/project/reparo-ffa182a4db1c |

Linear issues reference these docs; they don't duplicate them. If code and docs disagree, the docs win until an ADR says otherwise. If a PR changes behavior a doc describes, update the doc in the same PR.

## Stack (ADR-001, ADR-002)

- **Web:** React 19 SPA on Vite, TypeScript strict, Tailwind, TanStack Router + Query, Zustand for the little client state that isn't server state.
- **API:** Node + tRPC + Zod, deployed as Vercel serverless functions from `apps/web/api/`.
- **Data:** Postgres on Supabase, Drizzle ORM + migrations. Supabase Storage for renderings, receipts, quotes.
- **Auth:** Google SSO via Supabase Auth; API only admits emails present in `members`.
- **Repo:** pnpm monorepo. `apps/web`, `packages/api`, `packages/db`, `packages/shared`.
- **Hosting:** Vercel (web + API), Supabase (DB, auth, storage). Local dev uses the Supabase CLI (`supabase start`).

## Commands

Landing in M0 (OD issues under milestone "M0 Setup"). Target shape:

```
pnpm install          # once
supabase start        # local Postgres + Auth + Storage (Docker)
pnpm dev              # web + api with HMR
pnpm check            # typecheck + lint + test — run before every PR
pnpm db:generate      # Drizzle migration from schema change
pnpm db:migrate       # apply migrations locally
```

## Workflow for agents

1. Start from a Linear issue. Branch from `main` using the name Linear suggests on the issue (`chris/od-<n>-<slug>`); the `od-<n>` part is what links the branch to the issue.
2. Read this file, the relevant `docs/` pages, and the issue before writing code. Don't re-derive decisions that are already in `docs/decisions.md`.
3. One issue per PR, small PRs. Conventional-commit title (`feat(web): room list`). Put `OD-<n>` in the PR body so Linear links it.
4. `pnpm check` must pass before a PR is opened. CI runs the same thing.
5. Behavior change → doc change in the same PR. Choice from the "needs an ADR" list → ADR in the same PR.
6. When done, move the Linear issue and leave a comment: what changed, what's left, anything surprising.

## Hard rules

- TypeScript `strict`. No `any`, no `@ts-ignore`/`@ts-expect-error` without a one-line reason.
- Validate every boundary with Zod: tRPC inputs, environment variables, file uploads, imported data.
- **Money is integer cents** (`bigint` in Postgres, `number` in TS, never floats). **Lengths are stored in inches** as `numeric(10,3)` and displayed as ft/in. Helpers live in `packages/shared`; don't reimplement them.
- Every table has `id uuid`, `created_at`, `updated_at`. Soft-delete (`deleted_at`) on anything a person would regret deleting: rooms, budget lines, tasks, documents.
- Schema changes only through Drizzle migrations committed to the repo. Never alter the database by hand, locally or hosted.
- No anonymous routes. Every tRPC procedure runs behind the member guard.
- Secrets live only in `.env` (gitignored) and the Vercel/Supabase dashboards. `.env.example` lists every variable with a comment.
- Don't add a dependency for something the stack already does. A new runtime dependency gets a sentence of justification in the PR body.
- Don't write code that isn't on the roadmap. If an issue needs something out of scope, say so in the issue instead of building it.

## Needs an ADR before doing

- A new top-level app or package
- A new external service or paid tier
- Any change to the auth model or roles
- Any change to how money, lengths, or dates are represented
- Anything that changes a milestone's done-criteria

## Ask Chris before

- Deleting data, dropping tables, or rewriting a migration that has been applied anywhere
- Spending money (paid tiers, domains, services)
- Reordering the roadmap
- Force-pushing or rewriting `main`
