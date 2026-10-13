# Data model

First draft (2026-10-13). This is the target shape across M0–M5; each milestone adds its tables via migrations. Conventions in `docs/conventions.md` (every table has `id`, `created_at`, `updated_at`; soft-delete via `deleted_at` where marked). Units per ADR-004: money in integer cents, lengths in inches.

## Overview

```
members ─┐
         │ (who did what, via created_by on everything)
rooms ───┼─< openings
   │     ├─< specs ───< material_assignments >─── materials >─── vendors
   │     ├─< files (renderings)                       │              ├─< vendor_documents
   │     ├─< budget_lines ───< costs ───< files        └─< quotes ────┘
   │     │        └── category                            (quote → budget_line)
   │     └─< tasks ───< task_dependencies
   │             └─< files (permits, inspections)
   └── "whole house" is room_id NULL on budget_lines and tasks
```

## M0

**members** — who may sign in. `email` (unique, lowercase), `display_name`, `supabase_user_id` (nullable until first sign-in). No role column in v1 (ADR-003).

**files** — one table for every uploaded file. `kind` enum (`rendering`, `receipt`, `quote`, `vendor_document`, `task_document`), `bucket`, `path`, `mime_type`, `size_bytes`, `original_name`, `uploaded_by`, plus a polymorphic owner: `owner_type` enum + `owner_id`. Soft-delete.

## M1 — Rooms & specs

**rooms** — `name`, `floor` (`basement`/`main`/`upper`/`exterior`), `sort_order`, `notes`. Dimensions: `length_in`, `width_in`, `ceiling_height_in` (`numeric(10,3)`). For non-rectangular rooms, `floor_area_override_sqin` and `perimeter_override_in` win over the derived values. Derived (SQL view `room_metrics`): floor area, perimeter, gross wall area, net wall area (minus openings). Soft-delete.

**openings** — doors, windows, pass-throughs that subtract from wall area. `room_id`, `kind` enum, `width_in`, `height_in`, `count`, `label`. Cascade-delete with room.

**specs** — one row per room per finish category. `room_id`, `category` enum (`flooring`, `walls`, `ceiling`, `trim`, `electrical`, `plumbing`, `fixtures`, `cabinetry`, `countertops`, `appliances`, `doors_windows`, `other`), `description` (markdown), `status` enum (`idea`, `decided`, `ordered`, `installed`). Unique on `(room_id, category)`. Soft-delete.

**files** with `kind = rendering`, `owner_type = room`.

## M2 — Budget & costs

**categories** — budget categories, seeded (labor, materials, permits, fees, contingency…). `name`, `sort_order`.

**budget_lines** — `room_id` (nullable = whole house), `category_id`, `name`, `estimate_cents`, `committed_cents` (set when a quote is accepted or an order placed), `notes`, `spec_id` (nullable link to the spec this pays for). Soft-delete. Derived: `actual_cents` = sum of costs.

**costs** — money actually spent. `budget_line_id`, `vendor_id` (nullable), `amount_cents`, `paid_on` (date), `method`, `description`, `receipt` via files (`kind = receipt`, `owner_type = cost`). Soft-delete.

## M3 — Vendors & materials

**vendors** — `name`, `trade` (free text), `contact_name`, `phone`, `email`, `website`, `license_number`, `insurance_expires_on`, `notes`, `rating` (1–5, nullable). Soft-delete. Documents via files (`kind = vendor_document`).

**quotes** — `vendor_id`, `budget_line_id` (nullable until matched), `amount_cents`, `received_on`, `valid_until`, `status` enum (`received`, `accepted`, `declined`), `notes`. Quote PDF via files (`kind = quote`). Accepting a quote sets the budget line's `committed_cents`.

**materials** — catalog. `name`, `vendor_id` (nullable), `sku`, `url`, `unit` enum (`each`, `sqft`, `lnft`, `box`, `gallon`, `bag`…), `unit_price_cents`, `coverage_per_unit` (e.g. sqft per box, `numeric`), `lead_time_days`, `notes`. Soft-delete.

**material_assignments** — `material_id`, `spec_id`, `quantity_mode` enum (`manual`, `floor_area`, `wall_area`, `perimeter`), `waste_pct`, `quantity_needed` (derived unless manual), `quantity_ordered`, `quantity_delivered`, `budget_line_id` (nullable; generated on demand).

## M4 — Tasks & progress

**tasks** — `room_id` (nullable = whole house), `title`, `description` (markdown), `status` enum (`backlog`, `ready`, `in_progress`, `blocked`, `done`), `owner_member_id` (nullable), `owner_vendor_id` (nullable), `planned_start`, `planned_end`, `actual_start`, `actual_end` (dates), `blocker_note`, `sort_order`. Soft-delete. Documents via files (`kind = task_document`).

**task_dependencies** — `task_id`, `depends_on_task_id`. A task is blocked if any dependency isn't `done`.

Derived: room progress = done tasks / all non-cancelled tasks for the room; "late" = `planned_end < today` and not done.

## M5 — Dashboard

No new tables. SQL views: `budget_rollup` (by room, by category, overall), `schedule_health`, `room_summary`. Exports read from these views.

## Open questions (resolve by ADR when the milestone starts)

- Should `openings` carry their own spec (door/window purchase) or is that just a material assignment on the `doors_windows` spec? Leaning: material assignment.
- Does a cost need to split across budget lines (one Home Depot receipt, three rooms)? Leaning: yes, via `cost_allocations` in M2 if it bites in the first month.
- Vercel preview deploys: shared dev Supabase project or none? Decide at M1.
