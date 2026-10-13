# Scope

*Rewritten 2026-10-13 from a scope conversation with Chris. Earlier version was a guess from the project description; this one is what he said.*

## Goal

One house, renovated in phases over years, run by the household as its own general contractor. Reparo replaces a spreadsheet that tracks a money pool and estimates but has no actuals, no per-room detail for house-wide work, and no way to see the same work by room *and* by item. It should unify the process — plan, spec, vendors, money, status, images — in one place that is ours, not a generic project-management tool.

Phase 1 is underway. Numbers get backfilled once the app exists.

## People

Up to four household members, Google sign-in. Three roles:

- **Admin** (Chris): everything, plus members and roles, item list, phases, hard deletes.
- **Editor**: edits everything else.
- **Viewer**: sees everything. Scoping what a viewer sees, and hiding areas, is deferred until the app is built out.

Vendors and contractors are records, not users.

## Core concepts

- **Phase.** A unit of the renovation with its own timeline and spend. Phase 1 = the spreadsheet's "Required" + "Phase 1" tiers plus the cross-country move. The spreadsheet's "Not Included" tier is future phases. Phases are added over time; this is not one-and-done.
- **Room.** A space in the house. Twelve today, from the spreadsheet: Living Room, Kitchen, Kitchen Nook, Powder/Pool Bath, Dining Room, Foyer, Primary Bedroom, Guest Den, Main Guest Room, Secondary Guest Room, Nikki's Office, Chris' Office. Measurements are kept on the room: length, width, ceiling height (ADR-013).
- **Item.** A kind of work or purchase — Paint, Flooring, Trim, Lighting, Ceiling Fans, Window Treatments, Appliances… A shipped starter list that the admin manages.
- **Work item** (item × room). Where the spec lives. Each item has a **house-wide default** (room = none) and any room can **override** it: flooring is one product house-wide with tile in the bathrooms; paint is a different color per room. A work item belongs to a phase, so the same room can appear in several phases (kitchen paint in Phase 1, kitchen floor in a later phase). Carries: status, spec/notes, vendor, materials with costs and links, and uploaded mockups and spec drawings (drag-and-drop).
- **Work status:** Unstarted, In Progress, Awaiting Review, Completed, Cancelled. *Awaiting Review* = the work is done and someone still has to verify it's good (ADR-013).
- **Cost line.** Money, typed labor / material / permit / other, with its own vendor, estimate, actual, and link. Belongs to a phase; optionally to a work item (and so to a room or to the house-wide default). Moving costs are Phase 1 lines with no work item. A vendor may or may not supply materials; typed lines handle both.
- **Budget pool.** A starting balance ($300,000 as of 9/3 in the spreadsheet) with a ledger of adjustments. **Remaining balance** is always current: pool − actuals − outstanding estimates. Everything in a phase draws from it, including non-room lines like moving. Realistic forecasting means lines for labor, permits, dumpster, contingency, not just materials.
- **Category.** A second axis across rooms (Remodel, Furnishing, Tech, Lighting, Window Treatments, Appliances, Misc…) so totals can be seen by category as the spreadsheet does today.
- **Payment status** is derived, not set: payments recorded against a cost line (date, amount) give Unpaid / Deposit paid / Paid in full. Work status and payment status move independently (deposit paid on Unstarted work; balance due on Completed work).
- **Vendor.** Name, trade, contact, notes, quotes received, documents. Referenced from work items and cost lines.
- **Views.** By room, by item across rooms, by phase (spend, status counts, timeline), and the remaining-balance headline.

## What it is not

An internal tool that grows. There is no fixed out-of-scope list; new needs become Linear issues. Two things are explicitly parked, not rejected: scenario comparison (the spreadsheet's copy-the-file what-ifs — scope is locked now) and viewer scoping / hiding areas.

## Identity

Not Notion, not a generic project manager. Reparo is the mending charm; the name and tone can nod to it, lightly. It should look and feel like a tool built for this house.

## Delivery

Everything runs locally (Supabase CLI + Vite) until Chris says deploy. The code stays Vercel-shaped so deploying is configuration. Milestones, order, and done-criteria live in the Linear project *Reparo*; the order is recorded in ADR-010.
