---
target: Rooms (/rooms, /rooms/<id>)
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/spicuzza/Development/reparo/apps/web/src/screens/rooms.tsx"
target_fingerprint: "sha256:bfa59b5078d813262edf54e89f9ed5eea7b691edfa59cdf267f51d44930a2c58"
target_path: /Users/spicuzza/Development/reparo/apps/web/src/screens/rooms.tsx
timestamp: 2026-10-16T17-38-58Z
slug: apps-web-src-screens-rooms-tsx
---
# Critique: Rooms (/rooms, /rooms/<id>)

Method: dual-agent (A: a6a66a97a3f36e56a · B: a3eb37f84dcb197f4). Mode: Operate. Detector: CLI 0 findings; browser 0 true findings (nested-cards on dropzones = false positive).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | List ignores awaitingReview (inferred) |
| 2 | Match System / Real World | 3 | "Order: Lower comes first"; "the Chris' Office" templates |
| 3 | User Control and Freedom | 3 | Room removal has no Undo; Escape doesn't close inline spec editor |
| 4 | Consistency and Standards | 2 | Inline multi-field editor; weak room remove vs Shopping's; raw load errors |
| 5 | Error Prevention | 2 | Remove room doesn't mention its 11 lines and job |
| 6 | Recognition Rather Than Recall | 2 | Rename hidden; Order numbers |
| 7 | Flexibility and Efficiency | 2 | No section jumps on a 4,173px phone page; reorder only by numbers |
| 8 | Aesthetic and Minimalist Design | 2 | Empty room ≈ four screens of scaffolding |
| 9 | Error Recovery | 3 | Good SaveProblem; raw load errors |
| 10 | Help and Documentation | 3 | Good hints, size hint far from fields |
| **Total** | | **25/40** | **Acceptable** |

## Design Specificity Verdict
Details specific (dimension lines, tape, plan grid, mended stitch); page structure is a generic CRUD detail page; no money on the room.

## Priority Issues
1. [P1] Rooms list on phone squeezes names (76px seen at 390; ~40px at 375 inferred) (rooms.tsx:107-138). adapt.
2. [P1] Room page leads with a 320px empty hero; Jobs status ~1,450px down. Reorder: header, Jobs, Buying, Pictures, Size & notes; one Add pictures row when empty. distill.
3. [P1] Rename hidden (transparent name field, panel-name-field.tsx:29); Edit room panel shows only "Order". clarify.
4. [P2] Remove room asks too little; lines of a removed room keep pointing at it (shopping-lines.ts:72 left-joins rooms without deletedAt; verified in code). harden.
5. [P2] Room page has no money (no total, no tape). clarify / new issue.

## Persona Red Flags
Casey: crushed names, status three screens down, rename hover-only, full-size images. Sam: focusable paste-only upload groups, Escape on inline editor, load errors without icon. Jordan: Order, spec model jargon, contradictory "Set each job's status here" over empty state.

## Minor Observations
Size editor stacks three fields in a wide panel; viewer titles fall back to file names; Edit room panel apologises for itself; data: mismatched thumbnails.

## Questions to Consider
- Why are the first 320px an empty grid?
- Should a room carry its own money tape?
- Does Order earn a field?
