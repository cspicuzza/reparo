---
target: Vendors (/vendors)
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/spicuzza/Development/reparo/apps/web/src/screens/vendors.tsx"
target_fingerprint: "sha256:613d3238d7258370a31dbc737fdb3b5abc9d912492ceaf09a0c51d41c5d04803"
target_path: /Users/spicuzza/Development/reparo/apps/web/src/screens/vendors.tsx
timestamp: 2026-10-16T17-38-58Z
slug: apps-web-src-screens-vendors-tsx
---
# Critique: Vendors (/vendors)

Method: dual-agent (A: a509ea390a5642e90 · B: a3eb37f84dcb197f4). Mode: Operate. Detector: CLI 0 findings; browser 0 true findings.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | No current-page marker on a laptop |
| 2 | Match System / Real World | 3 | "Change to nobody yet" |
| 3 | User Control and Freedom | 2 | Clearing a job's vendor saves at once; vendor link lands on bare list |
| 4 | Consistency and Standards | 2 | Phone/email text inputs in panel; FormError not used |
| 5 | Error Prevention | 2 | No duplicate check; one-tap vendor clear |
| 6 | Recognition Rather Than Recall | 2 | Contacts behind Details; not in laptop nav |
| 7 | Flexibility and Efficiency | 2 | No deep link; no search |
| 8 | Aesthetic and Minimalist Design | 3 | Tidy, thin |
| 9 | Error Recovery | 3 | Raw load error (vendors.tsx:110) |
| 10 | Help and Documentation | 3 | Good hints |
| **Total** | | **25/40** | **Acceptable** |

## Design Specificity Verdict
Generic contacts structure, specific words; nothing about money.

## Priority Issues
1. [P1] Vendor panel says nothing about money (quotes, paid, owed). shape.
2. [P1] Hard to reach on a laptop (not in top bar, shell.tsx:42-51) and not linkable (no ?vendor=). layout.
3. [P2] "Change to nobody yet" clears a job's vendor in one tap (vendor-picker.tsx:101-113). harden.
4. [P2] Phone/email are type=text in the panel (auto-save-field.tsx type union). adapt.
5. [P2] List isn't a call sheet (4 taps to call on a phone). layout.

## Persona Red Flags
Casey: 4 taps to call, letter keyboard for numbers, rename hover-only. Sam: archive confirm swaps without focus (inferred). Jordan: no Vendors in top bar.

## Minor Observations
Archived names larger than live; restore error under the whole list; picker add form lacks Notes and heading; jobs in panel show no status.

## Questions to Consider
- If a vendor is who you pay, why does their page know nothing about money?
- Should documents carry expiry dates?
- Should the row be the call sheet?
