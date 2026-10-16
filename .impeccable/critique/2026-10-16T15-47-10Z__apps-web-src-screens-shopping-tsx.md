---
target: the shopping screen and everything it opens
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/spicuzza/Development/reparo/apps/web/src/screens/shopping.tsx"
target_fingerprint: "sha256:3de3734ebcca3023c002cd2e98db8728c28b2f38528662b66c860b8276cf001c"
target_path: /Users/spicuzza/Development/reparo/apps/web/src/screens/shopping.tsx
timestamp: 2026-10-16T15-47-10Z
slug: apps-web-src-screens-shopping-tsx
---
# Critique: Shopping screen (list, search, filters, line panel, batch editing)

Method: dual-agent (A: a316f113be76f4148 · B: ac5660fbb1f0d9dd6). Mode: Operate.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Picked rows in Select mode differ only by a 20px checkbox; search Clear fails silently |
| 2 | Match System / Real World | 3 | "$0.00" means "no price yet"; picture file names (I016.png) shown in the panel |
| 3 | User Control and Freedom | 3 | Search Clear doesn't work with a mouse; Escape doesn't leave Select mode; single Remove has no Undo |
| 4 | Consistency and Standards | 2 | Two Remove styles/wordings (panel ghost "Yes, remove it", no Undo vs batch red "Yes, remove", Undo); two purchase flows; batch labels mix verb/noun |
| 5 | Error Prevention | 3 | Batch dropdowns apply on change (arrow keys on a closed select change value on Windows/Linux; inferred) |
| 6 | Recognition Rather Than Recall | 3 | "For a job" needs one phase, but rows only show a phase when it's planned |
| 7 | Flexibility and Efficiency | 2 | 14 always-open rooms, no fold/jump/sort, ~360 tab stops, no shortcuts |
| 8 | Aesthetic and Minimalist Design | 3 | 121 identical "Mark as purchased" outlines; page total repeated in the To buy line |
| 9 | Error Recovery | 3 | Field-level errors + Try again are excellent; page load error is bare text with no retry |
| 10 | Help and Documentation | 2 | Good field hints; Select mode explains nothing; Returned's reason is screen-reader only |
| **Total** | | **27/40** | **Acceptable (top of band)** |

## Design Specificity Verdict
LLM: voice and tokens are authored for this product (household copy, plaster/charcoal, band strips, tape nav marker); composition below the header is a generic grouped admin list. The design system's one bold element, the tape-measure money bar (web.md:38), is absent on the screen that is about money left to spend.
Deterministic scan: CLI detect over the four screens + components + index.css: 0 findings (regex rules only on .tsx). Browser scan on list, panel, Select mode, Filter: 1 finding, low-contrast 2.2:1 on the disabled "Returned" segment (shopping-line-panel.tsx:477); a false positive under WCAG 1.4.3 (inactive control), but the reason it's disabled is screen-reader only.

## Priority Issues
1. [P1] Search "Clear" ignores mouse clicks (verified twice by real click). Cause: Button base `active:translate-y-px` (ui/button.tsx:19) overrides the `-translate-y-1/2` centring (shopping.tsx:415) while pressed; the button drops ~22px and mouseup lands on the input. Fix: centre without transform (inset-y-0 / my-auto). Command: harden.
2. [P1] The list doesn't scale to 121 lines: 14 always-open rooms, ~11k px tall on laptop, ~19k on phone, no fold/jump/sort (shopping.tsx:311-349). Fix: foldable room strips with fold-all, a room jump, consider compact density. Command: distill, layout.
3. [P2] Remove and purchase behave differently in panel vs list: single Remove is muted, "Yes, remove it / Keep it", no Undo (shopping-line-panel.tsx:170-177, 391-397); batch Remove is red, "Yes, remove / Keep", Undo. Fix: one destructive style + wording; Undo for single remove. Command: harden.
4. [P2] Select mode is cluttered: picked rows untinted, row actions still showing, actions apply on pick, labels mix verb/noun, no money total for the selection, Escape doesn't exit, bar is max-w-6xl without the page's px-6 so it overhangs the column ~24px (shopping-batch.tsx:109 vs shell.tsx:143). Command: clarify.
5. [P3] Tape motif missing; "$0.00" for unknown price; blank tile for an unloadable picture; duplicate total; phone placeholder truncates. Command: delight (tape bar), polish.

## Persona Red Flags
Alex (power user): no "/" for search, no room skip, no fold/sort, batch bar clears after each action so room + category means re-picking, Escape doesn't exit Select.
Sam (accessibility): disabled Returned at 2.2:1 with an invisible reason; batch selects apply on change; page load error has no retry; dark-mode status knob barely distinct.
Casey (phone): Select/Done at top, batch bar at bottom; bar + nav cover ~27% of 844px; names wrap to 3 lines in Select mode; ~4.5 rows per screen; panel opens on Pictures, price/status start halfway down.

## Minor Observations
- "How many" sits in "Where it goes" while the Price hint says "the whole line, all of them".
- Money fields show "130.00" with no currency mark.
- White-background product photos glare in dark mode.
- "Rename this store everywhere" looks like a field action.
- Phone toast stack (z-50, bottom 4.5rem) may cover the batch bar's top row within 10s of an action (inferred).
- A Status chip can appear from ?status= with no control to set it.
- Select button uses aria-pressed and also changes its label (Select/Done).
- Data noticed: some pictures/links don't match their item (Pillows shows a fan, Rug shows a chair, Curtain Rod links to pillows).

## Questions to Consider
- Why is the most repeated control "Mark as purchased" rather than find/open link/compare?
- Where is the tape? Should bought vs left be drawn on this screen?
- Should a room be a fold, a filter, or a page?
- Should a single delete get less protection than a batch of ten?
