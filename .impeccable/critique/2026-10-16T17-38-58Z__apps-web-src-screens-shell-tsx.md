---
target: Manage and the app shell
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/spicuzza/Development/reparo/apps/web/src/screens/shell.tsx"
target_fingerprint: "sha256:079119507447de7139c1a228dc1da08236087dab01ef6617afedccc33cdb8f2e"
target_path: /Users/spicuzza/Development/reparo/apps/web/src/screens/shell.tsx
timestamp: 2026-10-16T17-38-58Z
slug: apps-web-src-screens-shell-tsx
---
# Critique: Manage and the app shell

Method: dual-agent (A: a035c77a265970fcd · B: a3eb37f84dcb197f4). Mode: Operate. Detector: CLI 0 findings; browser 0 true findings (open-menu occlusion and Base UI clip-path = false positives).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | No marker on /manage or /vendors; title "Reparo" everywhere; silent rename/merge |
| 2 | Match System / Real World | 3 | "lines" vs "items"; "Manage lists" holds one list |
| 3 | User Control and Freedom | 2 | Merge irreversible; Escape doesn't cancel inline editors; 404 dead end |
| 4 | Consistency and Standards | 2 | Merge breaks ask-first; focus rule broken; extra icons; text-lg |
| 5 | Error Prevention | 1 | Merge preselected, one click, no confirm; blank rename allowed |
| 6 | Recognition Rather Than Recall | 3 | Manage only behind account name |
| 7 | Flexibility and Efficiency | 2 | No reorder or bulk merge |
| 8 | Aesthetic and Minimalist Design | 3 | 22 equal ghost buttons |
| 9 | Error Recovery | 2 | Likely raw Zod JSON (inferred); empty panel on failure; bare 404 |
| 10 | Help and Documentation | 3 | Good one-liners |
| **Total** | | **23/40** | **Acceptable** |

## Design Specificity Verdict
Shell specific (tape marker at three sizes, mended logo); Manage generic CRUD; 404 is the framework default.

## Priority Issues
1. [P1] Merge irreversible, preselected, no confirmation; phone select truncated (categories-admin.tsx). harden, adapt.
2. [P1] Unknown routes show bare "Not Found" with no shell (seen at /nope). harden.
3. [P1] Top bar overflows 640-717px (seen; document width 718). adapt.
4. [P2] Lost place on /manage and /vendors; same document title everywhere. clarify.
5. [P2] Inline editors drop focus to body; Escape does nothing. harden.

## Persona Red Flags
Casey: "Fur" truncation, Sign out in thumb spot. Sam: focus to body, no skip link, faint Appearance knob. Riley: blank rename, empty panel on error.

## Minor Observations
Account button doesn't hint it's a menu; sign-in error leaks raw text; no loading component for session check.

## Questions to Consider
- Why is merge the only irreversible action with no Undo?
- Should categories be managed where they're used?
- What would a Reparo 404 say?
