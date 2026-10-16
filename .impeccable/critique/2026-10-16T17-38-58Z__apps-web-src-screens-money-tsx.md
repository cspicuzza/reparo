---
target: Money (/money)
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/spicuzza/Development/reparo/apps/web/src/screens/money.tsx"
target_fingerprint: "sha256:f9a4ad757dc4997dd227889674b89cb6d9fc6af7c5564bbb973d39e80d4683d6"
target_path: /Users/spicuzza/Development/reparo/apps/web/src/screens/money.tsx
timestamp: 2026-10-16T17-38-58Z
slug: apps-web-src-screens-money-tsx
---
# Critique: Money (/money)

Method: dual-agent (A: a756a7d4730341ef5 · B: a3eb37f84dcb197f4). Mode: Operate. Detector: CLI 0 findings; browser 0 true findings.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | Overrun not drawn on the tape; no save toasts |
| 2 | Match System / Real World | 3 | "Committed" needs a paragraph |
| 3 | User Control and Freedom | 2 | Removing an adjustment has no Undo |
| 4 | Consistency and Standards | 2 | No drawn $; weak Remove; "Save the budget" vs "starting balance" |
| 5 | Error Prevention | 2 | In/out by typing a minus; button says Add when taking out |
| 6 | Recognition Rather Than Recall | 3 | Budget notes editable but never shown |
| 7 | Flexibility and Efficiency | 1 | Breakdowns don't link anywhere |
| 8 | Aesthetic and Minimalist Design | 2 | Over-by stated three times; $0.00 columns; no totals |
| 9 | Error Recovery | 3 | Raw load error (money.tsx:81) |
| 10 | Help and Documentation | 3 | Good explanations |
| **Total** | | **23/40** | **Acceptable** |

## Design Specificity Verdict
Headline and tape specific; tables generic; the tape fails in the over-budget state.

## Priority Issues
1. [P1] Tape can't show over budget (clamped, lib/tape.ts:12; "Over by" swatch is the left-to-spend yellow). harden, polish.
2. [P1] Dark mode: full tape looks empty (seen). colorize.
3. [P1] Money in or out depends on typing a minus (money.tsx:444-456; iPhone keypad inferred). Money in / Money out switch, named button, MoneyInput, Undo toast. harden, clarify.
4. [P2] Breakdowns are dead ends: no sort, totals or links to filtered Shopping/Phases. distill, layout.
5. [P2] Remove/save differ from Shopping: weak confirm, no Undo, no toast, notes hidden. polish.

## Persona Red Flags
Alex: no drill-down or sort. Sam: headline h2 here vs h1 on Home; sr-only headers read per row. Casey: minus sign on phone; overrun invisible on phone scale.

## Minor Observations
By phase tables misaligned; "Still to come" vs "Committed"; Home and Money word the rule differently; page shifts when panel opens.

## Questions to Consider
- What should the household do first when over?
- Should the scale stop at the budget?
- Is "Committed" the right word for planned shopping?
