---
paths:
  - "apps/web/src/**"
---

# Web (apps/web)

- Routes are files under `src/routes` (TanStack Router, file-based). `routeTree.gen.ts` is generated and committed. Route files export only `Route`; screens live in `src/screens/`. `_app.tsx` is the signed-in layout; `sign-in.tsx` is the only public route.
- Put anything shareable in the URL (which room, which filter).
- Server state via TanStack Query through `@trpc/tanstack-react-query` (`useTRPC()` → `useQuery(trpc.x.y.queryOptions())`). One Supabase client (`src/lib/supabase.ts`, PKCE); the tRPC link attaches the access token. Zustand only for UI state that must outlive a route. No Redux, no context-as-store.
- Forms: react-hook-form + the shared Zod schema via `zodResolver` — the same schema the API validates with.
- Derived values (areas, totals, progress) come from the API, not computed in React.
- Tailwind v4 utilities in JSX. Extract a component when the same cluster appears three times. No CSS modules or styled-components.
- Phone and laptop are equal: every screen works at 375px wide and on a laptop. Touch targets at least 44px; nothing depends on a mouse.
- Accessibility: semantic elements, a label on every input, keyboard-reachable actions, visible focus. Colour never carries meaning alone.
- Tests: Vitest, next to the code, for logic-bearing modules.

## Design system: Plaster and tape

Decisions and reasons: Linear → *Design system* doc. Values: `src/index.css` (the only place colours, type sizes and radii are defined — never hard-code a hex, px font size or one-off radius in JSX). Visual reference: the canvas linked from that doc, section D.

**Tokens (Tailwind classes).** Use the semantic names, not raw palette colours (`bg-neutral-*`, `text-gray-*` etc. are out).
- Surfaces: `bg-background` (page), `bg-card` (panels, fields), `bg-inset` (recessed areas, picture placeholders), `bg-bar` (top/bottom bars).
- Text: `text-foreground`; `text-muted-foreground` for secondary text. Nothing lighter for readable text.
- Lines: `border-border` for dividers and panel edges; `border-input` for anything you interact with (fields, outline buttons, selects) — it's the 3:1 one.
- Actions: `bg-primary`/`text-primary-foreground` is the dark main button; `destructive` is brick red and only for delete-type actions and negative money.
- Status: `status-idle`, `status-progress`, `status-done` (+ `-tint` backgrounds); awaiting review is `bg-tape text-tape-ink`.
- shadcn's `accent` is a **hover background**, never the tape yellow.

**Tape yellow (`tape`) is reserved** for: what needs someone (awaiting review, the attention count), the tape-measure strip, and the current-page marker in navigation. Always a fill behind `text-tape-ink`, never text or an icon on a light background. Don't use it for buttons, links or decoration.

**Colour and money.** Money is in the normal text colour, with `tabular-nums`. Red (`text-destructive`) only when money goes negative or over budget. No green for "good" money.

**Type.** Archivo (self-hosted). `h1`–`h3` get the narrow heading width from the base styles — use real heading elements rather than styling a `div`. Sizes: `text-4xl` 44, `text-3xl` 32, `text-2xl` 24, `text-xl` 20, `text-base` 16 (body), `text-sm` 14 (smallest). Nothing below 14px. Sentence case; no all-caps labels.

**Shape and depth.** `rounded-lg` (6px) on controls and chips, `rounded-xl` (10px) on panels. Separate sections with tone and a thin border, not a shadow on every card. Shadows only on things that float (menus, dialogs, the phone bottom bar).

**The tape motif** is the one bold element: money and progress bars drawn as tape measure (ticks along the top, dark fill for committed/done, yellow for what's left), drafting dimension lines for room sizes, the plan grid (`grid` token) only in empty states and picture placeholders. Don't add other decorative flourishes, and no monospace "technical" labels.

**Components.** shadcn/ui on Base UI, Nova style, in `src/components/ui/`; `cn` from `@/lib/utils`. Add a component when an issue needs it — the CLI (`pnpm exec shadcn add <name>`) or, if it can't reach the registry, by hand from shadcn's source with the source commit noted in the file. Then adapt it to these rules before use: Nova's defaults are compact (32px controls, 14px text, faint outline borders, a 50% focus ring), which break the 44px, 16px, 3:1 and focus rules here. Use `<Button>` for every button (`variant`: default, outline, ghost, destructive, link); `buttonVariants()` to style a link as a button.

**Icons.** Lucide (`lucide-react`), outline, one stroke weight, always next to a text label. No icon-only buttons; no emoji as icons.

**Light and dark** follow the device (`prefers-color-scheme`). There is no toggle and no `.dark` class; Tailwind's `dark:` variant is media-based. Every new colour gets a light and a dark value in `index.css`, each contrast-checked on its own (text ≥ 4.5:1, control edges and focus ≥ 3:1). Check new UI in both modes.

**Motion** only answers something the person did (a status changing, a section opening). No page-load or scroll-driven animation. Reduced motion is respected globally in `index.css`.

**Words on screen.** Household words, not database terms. Labels say what happens ("Mark as checked", "Record payment", not "Submit"). Avoid template habits: no "A · B" middle-dot strings, no "Word — fragment" labels, no "→" on buttons.

## Identity

Reparo is a tool for one house, not a generic project manager. Clear enough for someone non-technical: every action is a visible, labelled control (nothing hover-only or shortcut-only). Borrow Linear's feel (speed, calm, list → detail, instant feedback), not its look or power-user patterns. Use household words in the UI, not database terms. Design each screen for what it is: a room, a job, a phase, the money. The name is the mending charm; nod to it lightly. Chris reviews UI in the browser before it's committed.
