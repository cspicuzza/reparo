---
target: Phases (/phases)
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/spicuzza/Development/reparo/apps/web/src/screens/phases.tsx"
target_fingerprint: "sha256:f4deec237c43487e69904046a179b991641e48a56b71a565b019bb0024a369b5"
target_path: /Users/spicuzza/Development/reparo/apps/web/src/screens/phases.tsx
timestamp: 2026-10-16T17-38-58Z
slug: apps-web-src-screens-phases-tsx
---
# Critique: Phases (/phases)

Method: dual-agent (A: ab7f6c0ac7e5848e7 · B: a3eb37f84dcb197f4). Mode: Operate. Detector: CLI 0 findings; browser 0 true findings.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | No money per phase; Active with 0 started |
| 2 | Match System / Real World | 2 | "Order: Lower comes first"; statuses don't say their money effect |
| 3 | User Control and Freedom | 2 | Status saves on pick, no Undo, moves ~$323k |
| 4 | Consistency and Standards | 2 | started vs done; Add phase vs Add a phase |
| 5 | Error Prevention | 1 | Status flip moves Committed silently; Complete with 0 done; new phase Order 0 sorts first |
| 6 | Recognition Rather Than Recall | 2 | Contents and cost live elsewhere |
| 7 | Flexibility and Efficiency | 2 | No path to the phase's jobs |
| 8 | Aesthetic and Minimalist Design | 3 | Calm; all-yellow tape carries least news |
| 9 | Error Recovery | 3 | Raw load error (phases.tsx:102) |
| 10 | Help and Documentation | 2 | Nothing explains Active vs Planned money |
| **Total** | | **21/40** | **Acceptable** |

## Design Specificity Verdict
System details specific; the page is a generic list that promises "work and money" and shows neither.

## Priority Issues
1. [P1] Status change silently moves the whole budget (phases.tsx:265-271, 321-328; money-rules.ts isCounting, verified). Say the consequence, Undo toast, warn on Complete with open jobs. harden, clarify.
2. [P1] No money per phase (spent, still to come, planned "leaves you $X"). shape.
3. [P2] Dead end: no link to the phase's jobs. craft.
4. [P2] Status vocabulary disagrees across Home, Phases, Jobs. clarify.
5. [P3] Order field and new-phase default 0. distill.

## Persona Red Flags
Casey: status dropdown is the first control in the row, one mis-tap moves the budget. Jordan: jargon, Active with nothing started. Sam: arrowing a closed select may save each option (inferred).

## Minor Observations
Name field hover-only edge; panel width ~40%; no "No dates yet" prompt; empty state without plan grid; native confirm.

## Questions to Consider
- Why does the stages screen hold the least money?
- Should "underway" derive from jobs?
- Should Phases be a timeline?
