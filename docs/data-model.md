# Data model

*Rewritten 2026-10-13 after the scope conversation. Draft — each Linear milestone lands its tables via migrations and may refine this.* Conventions in `docs/conventions.md` (every table has `id`, `created_at`, `updated_at`; soft-delete via `deleted_at` where marked). Units per ADR-004/011: money in integer cents, lengths in inches as `numeric(10,4)` snapped to 1/16".

## Overview

```
members (role)

budget ──< budget_adjustments

phases ──< work_items >── items          work_items.room_id NULL = house-wide default
   │          │  └──── rooms             (item_id, room_id) unique per item
   │          ├──< files (mockup, spec_drawing)
   │          └──< cost_lines ──< payments
   │                  │   ├──< files (receipt)
   │                  │   ├── vendors ──< quotes ──< files (quote)
   │                  │   └── categories
   └──< cost_lines (work_item_id NULL = phase-level, e.g. moving)
```

Remaining balance = `budget.starting_cents` + Σ `budget_adjustments` − Σ `cost_lines.actual_cents` − Σ `cost_lines.estimate_cents` where `actual_cents` is null and the line's work item isn't Cancelled.

## M0

**members** — `email` (unique, lowercased), `display_name`, `role` enum (`admin`, `editor`, `viewer`), `supabase_user_id` (nullable until first sign-in). Seeded: Chris as admin.

**files** — one table for all uploads. `kind` enum (`mockup`, `spec_drawing`, `receipt`, `quote`, `vendor_document`, `other`), `bucket`, `path`, `mime_type`, `size_bytes`, `original_name`, `uploaded_by`, polymorphic owner (`owner_type` enum + `owner_id`), `sort_order`. Soft-delete.

## M1 — Foundation

*Landed in OD-27 (migration `0002_m1_foundation`); ADR-013.*

**phases** — `name` ("Phase 1"; unique among live rows), `sort_order`, `status` enum (`planned`, `active`, `complete`), `starts_on`, `ends_on` (nullable dates), `notes`. Soft-delete. Seeded: Phase 1, `active`.

**rooms** — `name` (unique among live rows), `sort_order`, `notes`; measurements `length_in`, `width_in`, `ceiling_height_in` (nullable `numeric(10,4)` inches, 1/16" snapped). Floor area is derived; openings and wall areas are deferred (ADR-013). Soft-delete. Not seeded — entered through the UI.

**items** — the managed catalog. `name` (unique; "Paint", "Flooring", "Trim"…), `sort_order`, `retired_at` (nullable; retired items stay on existing work). Never deleted. Admin-managed. Seeded starter list (23): Demo, Trim, Paint, Flooring, Electric, Plumbing, Drywall, Windows & Doors, Stucco, Fireplace, Bathroom Remodel, Project Fee; Furniture, Rugs, Decor, Lighting, Ceiling Fans, Window Treatments, Wallpaper, Wall Paneling, TV & Tech, Network & Security, Appliances. `default_category_id` arrives with `categories` in M2.

**work_items** — item × room, in a phase. `item_id`, `room_id` (nullable = house-wide default), `phase_id`, `status` enum (`unstarted`, `in_progress`, `awaiting_review` = done, awaiting someone's verification, `completed`, `cancelled`), `spec` (markdown), `notes`, `sort_order`. One live row per `(item_id, room_id)` including the NULL room, via two partial unique indexes that ignore soft-deleted rows. Soft-delete. `vendor_id` arrives with `vendors` in M3. Files: `kind` in (`mockup`, `spec_drawing`), `owner_type = work_item`.

Resolution rule for a room: a room's spec for an item is its own work item if one exists, else the item's house-wide default.

## M2 — Budget

**budget** — one row. `starting_cents` (300,000.00 as of 9/3 in the spreadsheet), `as_of` (date), `notes`.

**budget_adjustments** — ledger of changes to the pool. `amount_cents` (signed), `on` (date), `note` ("401K loan").

**categories** — `name`, `sort_order`. Seeded from the spreadsheet: Remodel, Furnishing, Tech, Lighting, Ceiling Fans, Window Treatments, Appliances, Misc, Moving.

**cost_lines** — `phase_id` (required), `work_item_id` (nullable = phase-level), `kind` enum (`labor`, `material`, `permit`, `other`), `category_id`, `vendor_id` (nullable, M3), `description`, `estimate_cents`, `actual_cents` (nullable until known), `quantity` + `unit` (nullable), `model_number` (nullable — appliances), `link`, `ordered_on`, `expected_on`, `delivered_on` (nullable dates — the spreadsheet's Ordered / Delivery Date), `notes`. Soft-delete. Files: `kind = receipt`.

## M3 — Item detail

**vendors** — `name`, `trade`, `contact_name`, `phone`, `email`, `website`, `notes`. Soft-delete. Files: `kind = vendor_document`.

**quotes** — `vendor_id`, `work_item_id` (nullable), `cost_line_id` (nullable), `amount_cents`, `received_on`, `valid_until`, `status` enum (`received`, `accepted`, `declined`), `notes`. Files: `kind = quote`. Accepting a quote sets the cost line's `estimate_cents` (or creates the line).

**payments** — `cost_line_id`, `amount_cents`, `paid_on`, `method`, `note`. Derived payment status per cost line: `unpaid` (Σ = 0), `partial` (0 < Σ < actual or estimate), `paid` (Σ ≥ actual). "Deposit paid" is `partial` shown with the percentage.

## M4 — Phase views & dashboard

No new tables. SQL views: `remaining_balance`, `phase_rollup` (estimate / actual / status counts), `room_rollup`, `category_rollup`, `item_across_rooms`.

## Open questions (resolve by ADR when the milestone starts)

- Does a work item need a category, or is category only on cost lines? (M2)
- Should a cost line split across work items (one Home Depot receipt, three rooms)? (M2; `cost_allocations` if it bites)
- Timeline per phase: derived from work-item dates we don't have yet, or from phase `starts_on`/`ends_on` only? (M4)
