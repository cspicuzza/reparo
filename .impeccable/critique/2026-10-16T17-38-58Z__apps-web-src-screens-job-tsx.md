---
target: Jobs (/jobs, /jobs/<id>)
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/spicuzza/Development/reparo/apps/web/src/screens/job.tsx"
target_fingerprint: "sha256:ff4baf75258ebdae8d4c6720b4a12ab8d704ab172994325fce60ac41b191091c"
target_path: /Users/spicuzza/Development/reparo/apps/web/src/screens/job.tsx
timestamp: 2026-10-16T17-38-58Z
slug: apps-web-src-screens-job-tsx
---
# Critique: Jobs (/jobs, /jobs/<id>)

Method: dual-agent (A: a7b4f0c8132b93512 · B: a3eb37f84dcb197f4). Mode: Operate. Detector: CLI 0 findings; browser 0 true findings (nested-cards on dropzones = false positive).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Choose/Mark declined/All rooms give no feedback |
| 2 | Match System / Real World | 3 | Cost lines named "Estimate" above "No estimates yet" |
| 3 | User Control and Freedom | 2 | No Undo on Jobs; Choose rewrites price and vendor in one tap |
| 4 | Consistency and Standards | 2 | Inline spec editor; no drawn $; green for Chosen/Paid; window.confirm |
| 5 | Error Prevention | 2 | Chosen quote line offers Edit/Remove; Remove refused after confirm |
| 6 | Recognition Rather Than Recall | 3 | Adding rooms is a sentence, not a control |
| 7 | Flexibility and Efficiency | 2 | No sort/filter/phase totals; no batch |
| 8 | Aesthetic and Minimalist Design | 3 | "$0.00 paid" ×12; same price three times |
| 9 | Error Recovery | 3 | Good FormError + Try again |
| 10 | Help and Documentation | 3 | Section hints never fade |
| **Total** | | **26/40** | **Acceptable** |

## Design Specificity Verdict
Words and tape specific; layout is seven equal cards, a generic record page; tapes are flat yellow slabs at 0%.

## Priority Issues
1. [P1] Chosen quote line is an unprotected copy of the estimate (job-money.tsx:183-208; API refuses removal, job-money.ts:107-118; edits drift). harden.
2. [P1] Money summary overflows at 375px (grid-cols-3, job-money.tsx:72-85; "$35,000.00$0.00" seen). adapt.
3. [P1] One-tap structural changes with no Undo: Choose this one, Mark declined, All rooms. harden.
4. [P2] No hierarchy: money is panel 5 (~1,300px down on phone); empty sections loud. distill.
5. [P2] Green for Chosen/Paid in full (components/money.tsx); 0% tapes are the loudest element. polish.

## Persona Red Flags
Casey: money overflow, call/owed buried, payment panel hides amount owed. Sam: focus ring clipped by PanelList overflow-hidden; editable name looks static; native confirm. Alex: no sort/filter/batch.

## Minor Observations
status-idle tint equals accent, chips vanish on row hover; "Different here" vs "Different in this room"; money inputs without $; new-tab links without icon; phase name not a link; data: 11 of 12 jobs cover no rooms.

## Questions to Consider
- Why are Estimates and What it costs separate when the price is the chosen estimate?
- Is nothing-paid-yet a needs-someone state?
- Why does Jobs get no Undo when Shopping does?
