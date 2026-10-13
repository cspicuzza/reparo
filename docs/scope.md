# Scope

## Goal

Run one home renovation as our own general contractor without losing track of money, measurements, people, materials, or progress. Reparo is the one place all of it lives, so any of the four of us can answer "what's this room going to be, what will it cost, who's doing it, and where are we?" from a phone or laptop.

## Who uses it

Up to four household members, all signing in with Google. Everyone can edit everything (ADR-003). Contractors and vendors are *records*, not users — if we later want them to see their own tasks or upload quotes, that's a roles milestone we haven't committed to.

## In scope (v1)

Each module is one roadmap milestone; order is in `docs/roadmap.md`.

1. **Rooms & specs** — every space in the house with dimensions (floor, walls, ceiling height, openings), a written spec per finish category (flooring, walls, ceiling, trim, electrical, plumbing, fixtures, cabinetry, appliances), and one or more renderings showing the intended final design. Derived areas (floor sq ft, wall sq ft net of openings) computed, not typed.
2. **Budget & costs** — budget lines by room and category with estimate → committed (quote accepted) → actual (paid). Receipts and invoices attached. Contingency tracked as its own line. Totals roll up by room, by category, and overall.
3. **Vendors & materials** — vendor directory (trade, contact, license/insurance docs, notes, quotes received). Material catalog: SKU, vendor, unit, unit price, lead time, link, which rooms/specs it's assigned to, quantity needed (computed from room areas where possible) vs ordered vs delivered.
4. **Tasks & progress** — work breakdown by room, status, dependencies, planned vs actual dates, who's responsible (member or vendor), blockers. Progress per room and overall derived from task completion and cost committed.
5. **Dashboard** — budget health, schedule health, per-room status at a glance, and exports (CSV/Excel) for anything tabular.

## Out of scope (v1)

- Multi-project or multi-household SaaS. One renovation. If we want a second one, that's a decision later, not a hidden feature now.
- Contractor/vendor logins and role-based permissions.
- Accounting integration (QuickBooks, bank sync). We type or import actuals.
- Native mobile app. The web app must be usable on a phone; that's enough.
- Permit tracking and inspections as a module. They're tasks with documents attached.
- Design tools. Renderings are uploaded images/PDFs from whatever produced them.
- AI assistant. Not until the data model has proven itself (same sequencing lesson as thebeast).

## Principles

- **Derive, don't duplicate.** Areas come from dimensions; progress comes from tasks; totals come from lines. If a number can be computed, it is.
- **Every dollar has a line, every line has a room or is explicitly "whole house".**
- **Documents stay attached to the thing they're about** — a receipt to a cost, a quote to a vendor and a budget line, a rendering to a room.
- **Phone-first for lookup, laptop-first for data entry.** Reading must work standing in the room; bulk entry can assume a keyboard.
- **Boring, consistent stack** shared with thebeast so agents and habits carry over.
