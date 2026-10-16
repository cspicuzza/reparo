---
target: Home (/)
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/spicuzza/Development/reparo/apps/web/src/screens/home.tsx"
target_fingerprint: "sha256:f6d32aa6f8c9ac14da241b16d499cd334c202d5247650b3f3b2d4848dd5655fb"
target_path: /Users/spicuzza/Development/reparo/apps/web/src/screens/home.tsx
timestamp: 2026-10-16T17-38-58Z
slug: apps-web-src-screens-home-tsx
---
# Critique: Home (/)

Method: dual-agent (A: ada5bf6d7d542edd0 · B: a3eb37f84dcb197f4). Mode: Operate. Detector: CLI 0 findings; browser 0 true findings.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Phase status contradicts itself |
| 2 | Match System / Real World | 2 | Over-budget sub-line says "That's what remains of the budget" |
| 3 | User Control and Freedom | 3 | Navigation-only surface, clean exits |
| 4 | Consistency and Standards | 2 | "underway"/"under way"/"Active"; "started" vs "done"; See all links in two positions |
| 5 | Error Prevention | 3 | Little to prevent |
| 6 | Recognition Rather Than Recall | 3 | "Committed" explained only on Money |
| 7 | Flexibility and Efficiency | 2 | No route from red headline to its cause; rooms alphabetical |
| 8 | Aesthetic and Minimalist Design | 2 | 8 "No picture yet" tiles; empty Needs you takes a full panel |
| 9 | Error Recovery | 1 | Raw load error, no FormError, no Try again (home.tsx:53) |
| 10 | Help and Documentation | 1 | No explanation of committed; no link to Money |
| **Total** | | **22/40** | **Acceptable** |

## Design Specificity Verdict
Top third specific (money sentence, tape with dollar scale, tape-yellow Needs you). Lower half a generic card grid of empty room tiles.

## Priority Issues
1. [P1] Over-budget state contradicts itself and offers no way forward: wrong sub-line (home.tsx:103-106); tape clamps at full so the overrun isn't drawn and the yellow "Over by" swatch matches nothing (money-tape.tsx:75-90, lib/tape.ts:12); no link to Money. Fix: over-budget copy, scale past budget with budget tick and red overrun segment, split spent/committed, "See where it goes" link. clarify, harden.
2. [P1] Dark mode: a full tape's fill equals the page colour, so a full or over budget reads as empty (seen on Home and Money). Fix: dark-mode fill token at 3:1. colorize.
3. [P2] Phase panel contradicts itself and /phases ("underway" with 0 started; started vs done; no tape). clarify.
4. [P2] Rooms block: alphabetical, mostly empty placeholders, no progress tape, names not headings, placeholder text inside link names. distill.
5. [P2] Load error and empty Needs you state weaker than system rules. harden.

## Persona Red Flags
Casey: red headline, no path to Money on phone (under Menu); two screens of placeholder tiles. Sam: each room link name starts with "No picture yet"; names not headings. Jordan: "committed", "That's what remains", "underway" with 0 started.

## Minor Observations
text-lg off-scale (home.tsx:261); greeting uses lowercase profile name; document.title "Reparo" everywhere; empty-phase copy names Jobs page without linking.

## Questions to Consider
- What should Home say when the plan, not spending, is over budget?
- Should "underway" come from a flag or from jobs starting?
- Should Rooms here be "rooms with something happening"?
