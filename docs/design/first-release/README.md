# Handoff: LightTrack v3 first-release review flow (Day → Week → Export, Rules, First run)

## Overview
A UI/UX audit of the current LightTrack renderer (Timer, Timeline, Projects, SAP export) and a redesign of the first-release workflow from `docs/LIGHTTRACK_V3_DEVELOPMENT_PLAN.md` §16 and ADR 0005: users correct **time blocks**, LightTrack derives **booking lines** per day × booking code × activity type, the user **approves** the day/week, and exports approved lines as **CSV** (LT3-302/303). Rules (LT3-301) and the first-run setup (LT3-601 retention) are included.

Backlog mapping: Day = LT3-202/203/204, Week = LT3-204, Export = LT3-302/303, Rules = LT3-301, First run = LT3-601 + LT3-201 manual codes, remote sessions = LT3-402/403.

## About the design files
The `.dc.html` files are **design references built in HTML** — prototypes of look and behaviour, not production code. Recreate them in the LightTrack renderer (`src/renderer/`, TypeScript per LT3-006, CSP: no inline styles/handlers — use classes in `styles/app.css`). Don't ship the HTML. Open any `.dc.html` directly in a browser (they need `support.js` next to them).

## Fidelity
**High fidelity.** Uses the existing LightTrack tokens from `src/renderer/styles/app.css` (Poppins, cobalt accent, black rail, 4px control / 8px card radii). Recreate pixel-accurately, reusing existing classes where they match (`.rail`, `.nav-btn`, `.topbar`, `.card`, `.solid`, `.ghost`, `.btn-small`, `.badge`, `.duration`) and adding the new ones below. All data is sample data. Activity-type codes `P0940005` (Meeting) and `P0940010` (Administration) and the CSV column set are placeholders.

The audit page (`LightTrack UX Audit.dc.html`) uses a separate design system (Nocturne) for the report only — it is not part of the product.

## Audit findings to implement alongside (see audit page for detail)
P0: (1) raw activity shown as timesheet, no draft/approved/exported state; (2) corrections fail silently — `switchProject`, `saveActivity` (merge), tag-wiping `activities:update`, restore (STATUS.md defects 1–4); (3) export has no approval gate or exact preview.
P1: (4) home is a productivity scoreboard; (5) duplicated totals; (6) gaps counted but not actionable; (7) `.activity-actions` hover-only (`opacity:0`, no `:focus-within`); (8) four 7-field rule forms with free-text project, overflow at 1280px; (12) `.label` uses `--ink-faint` at 10px — ~3.4:1 light, ~4.1:1 dark; (14) `span.badge`/`div.pill`/`div.activity` used as controls, bare Space toggles tracking; (15) no first run.
P2: (9) project rows look clickable; (10) input/button styles drift (two input styles, seven button classes); (11) case and duration formats vary; (13) billable vs non-billable by hue only (mauve 2.1:1 on white).

## System-level changes (apply everywhere)
- **Labels**: 11px / 500 / uppercase / letter-spacing 0.6px / `--ink-muted` (was 10px `--ink-faint`). Keep `--ink-faint` for decoration only.
- **Buttons**: only two kinds plus a small size. Every action is a `<button>`.
  - Primary `.solid`: h32, padding 0 14px, radius 4, bg `#3805e3`, text `#fff` 12.5px/500; hover bg `#3e257c`; disabled opacity .45.
  - Ghost `.ghost`: h32, padding 0 14px, 1px `--border-mid`, radius 4, bg `--paper`, `--ink` 12.5px; hover border+text `--accent`.
  - Small: h26, padding 0 10px, 12px, same two variants.
  - `white-space: nowrap` on all buttons.
  - Focus: `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }`.
- **Inputs/selects**: h32, padding 0 10px, 1px `--border-mid`, radius 4, bg `--paper`, 12.5px. Retire the filled 8px `.mapping-form` / `.settings-row` input style.
- **Durations**: `H:MM` in mono (`--mono`, 12px) in all review UI; decimal-comma hours only inside the CSV.
- **Copy**: sentence case everywhere.
- **Status chips** (h20–22, padding 0 7–8px, pill, 11–11.5px/500):
  Draft `--raised`/`--ink-muted` · Approved `--added-bg`/`--added-ink` · Exported `--changed-bg`/`--changed-ink` · Issue `--risk-bg`/`--risk-ink`.
- Check marks in lists: 18px circle, same tint pairs, glyph ✓ / ! / i at 11px/600.

## Shell (all redesigned screens)
- Window 1280 min width. `body` grid `200px 1fr`, `--bg` ground.
- **Rail** (unchanged visual): black, items h32 (was 28), margin 0 8px, padding 0 10px, gap 10, 12.5px `#c8c8c8`, icon 17px `#8a8a8a`; active bg `#3805e3`, text/icon `#fff`, 500; hover bg `#1a1a1a`.
  Items: **Day, Week, Export, Rules**; Settings in footer. Analytics/Timer/Timeline/Projects/SAP export are removed from the main nav (personal stats can return as an opt-in Reports view).
  Day shows an issue count badge: min 18×18 pill, bg `#eb652b`, text `#1a1a1a` 11px/600.
  Tracking status card above footer: margin 0 8px 6px, padding 10, 1px `#1e1e22`, radius 8, 11.5px; 8px dot (`#8a8a8a` stopped; use `--added-ink` / neon when tracking) + "Not tracking" / "Stopped 17:38 · idle".
- **Topbar**: sticky, h52, padding 0 14px 0 24px, `--paper`, bottom 1px `--divider`, title 15px/600/-0.2px, gap 12.
- **Content**: padding 0 24px 24px, grid gap 16.
- **Cards**: `--paper`, 1px `--divider`, radius 8. Card header: padding 14px 16px, bottom 1px `--divider`, title 13px/500, subtitle 12.5px `--ink-muted`.

## Screens

### 1. Day (home; replaces Timer + Timeline) — `new-01-day-draft.png`, `new-02-day-approved.png`, `new-09-day-dark.png`
Purpose: correct one day and approve it.
- Topbar: "Day" · ‹ (28×28 ghost) "Friday 2 October" (500) › · status chip · right: "Tracking stopped at 17:38 (idle)" 12.5px muted + ghost "Start tracking".
- Summary row (no cards): three stats, gap 32: label + 22px/500 mono value — Tracked `7:32`, To book (rounded) `7:15`→`7:45`, Before approval `2 issues` (`--risk-ink`) → `Ready` (`--added-ink`, Poppins).
- Two columns: `minmax(0,1.35fr) minmax(0,1fr)`, gap 16, align start.
- **Time blocks card** (left). Header "Time blocks" / "What happened. Edit, split or merge here." + ghost "Add block". Rows: grid `96px 3px minmax(0,1fr) 52px`, gap 12, padding 12px 16px, bottom divider.
  - Col 1 time range mono 12px muted (`09:12–10:47`).
  - Col 2 3px bar, radius 2: `#3805e3` billable client work, `#7d70b8` light / `#b8afda` dark for internal non-billable, `--risk-ink` for an unbookable block, transparent for gaps, `--border-mid` for breaks.
  - Col 3: target "Project · Activity type" 13px/500 (+ optional flag chip), code `PRD201-0003 · P0940003` mono 11.5px muted, evidence 12.5px muted, single line ellipsis; then actions row (gap 6, margin-top 6) of small buttons.
  - Col 4 duration mono 12px/500 right.
  - Gap rows: background `repeating-linear-gradient(135deg, transparent 0 6px, var(--hover) 6px 12px)`, title "No activity recorded" muted, text "Gaps do not block approval.", actions "Mark as break" / "Add block".
  - Unassigned block: title "No booking code" in `--risk-ink`, flag "Blocks approval" (risk chip), actions: primary small "Book to Internal · Administration" (top suggestion), ghost "Choose code…", ghost "Delete".
  - Remote session block (RDP, lower confidence): flag "Confirm remote session" (risk chip), evidence explains rule that proposed it and that titles inside the session aren't visible; actions primary "Confirm", ghost "Choose code…", "Split". After confirm, flag becomes "You confirmed" (changed chip); after approval "Remote session".
  - Normal rows: ghost small "Split", "Edit" — always visible (no hover reveal). After approval: no actions.
- **Booking lines card** (right, top). Header "Booking lines" / "What gets booked. Summed from the blocks per code and activity type." Column header row (labels): Line · Actual · Book, grid `minmax(0,1fr) 52px 52px`, gap 12. Rows: name 500, code mono 11.5 muted, Jira key chips (`--raised`, mono 11px/500, radius 4, padding 1px 6px); Actual mono 12 muted; Book mono 12/600. Unbookable line: "Not bookable yet" / "1 block without a code" in `--risk-ink`, Book "—". Total row. Note: "Each line is rounded to the nearest 15 min. Change in Settings › Booking." 12px muted.
- **Approval card** (right, bottom). Draft: title "Approve Friday", checklist, primary "Approve day" (disabled until no blocking issues) + note "Approving locks these blocks. Later changes create a new version." Approved: "✓ Friday approved · 7:45 in 4 lines" in `--added-ink`, primary "Review week", ghost "Reopen day".
  Checklist items: `32 min (10:48–11:20) has no booking code` / `Every block has a booking code`; `Remote session 16:05–17:38 needs your confirmation` / `Remote session confirmed`; `50 min gap at 12:40. Fine to leave as is.` (info) / `Gap 12:40–13:30 marked as break`; `All codes valid on 2 October`.

### 2. Week — `new-03-week-draft.png`, `new-04-week-ready.png`, `new-10-week-dark.png`
Purpose: read the week as SAP will receive it; approve remaining days; go to export.
- Topbar "Week" · "Week 40 · 28 Sep – 2 Oct 2026" (500) · right ghost "Copy previous week…" (LT3-204: must preview before saving).
- Table card: header row `--raised`; first column "Booking line" label; one column per day with label (`Mon 28`) and status chip under it; last column "Week". Body rows: line name 500 + code mono 11.5 muted; cells mono 12 right-aligned, padding 12; the unapproved day's column tinted `--active-bg`; missing values `—` in `--risk-ink`. Total row with top border `--border-mid`, 600.
- Footer card: headline "4 of 5 days approved" / sub "Friday is still a draft. Approve it to export the week." + ghost "Review Friday" + primary "Export week…" (disabled until all approved). Ready: "All five days approved" / "40:00 booked in 20 lines. Ready to export."

### 3. Export (replaces SAP export) — `new-05-export-ready.png`, `new-06-export-done.png`, `new-11-export-dark.png`
Purpose: hand off approved booking lines as CSV and record the run.
- Topbar "Export" · "CSV hand-off of approved booking lines".
- Columns `minmax(0,1fr) 340px`.
- Left card: meta strip (Period · Profile "SAP ByDesign CSV · v2" · Format "; delimiter · decimal comma · UTF-8"); label "Exact file contents · 20 rows"; preview box `--raised`, 1px divider, radius 4, mono 12px, line-height 1.7, `white-space: pre`, max-height 420 scroll. Header line in `--ink-muted`. Rows: `EmployeeID;Date;ProjectElement;ServiceProduct;Hours;Comment`, e.g. `E10482;02.10.2026;PRD178-0012;P0940003;3,25;PORTAL-412 PORTAL-415`.
- Right, before export: "Checks" list (20 rows from 20 approved booking lines; all booking codes valid on their dates; none exported before; window titles and remote-session data excluded) + primary "Export 20 rows" + note "Exported lines are locked. A correction later produces a corrected export, never a silent re-export."
- After export: card with border `--added-line`; "✓ Exported"; key/value grid (72px label col): File `LightTrack_E10482_2026-W40.csv`, Rows `20 · 40,00 h`, SHA-256 `3f9a…c21e`, At `Fri 2 Oct 2026, 17:51`; ghost "Show in folder", ghost "Copy summary for approver"; summary text block (pre-line, 12px muted) — this is the approver hand-off for the first release.
- Export history card: rows "Week 39 · 20 rows · 40,25 h · 25 Sep", corrected exports labelled "(corrected)".
- Employee ID moves to first run / Settings.

### 4. Rules (replaces Projects) — `new-07-rules.png`
Purpose: ordered, explainable auto-assignment (LT3-301).
- Topbar "Rules" · "First matching rule wins. Drag to reorder." · ghost "Booking codes" · primary "New rule".
- Columns `minmax(0,1fr) 380px`.
- List card: each rule is a `<button>` row, grid `28px minmax(0,1fr) 72px`: priority number mono muted; "Window title" (muted) + value chip (mono 12, `--raised`, radius 4) / "→ Northwind ERP · Development" (500); hours assigned in last 7 days mono right. Selected: bg `--active-bg`, `box-shadow: inset 3px 0 0 #3805e3`. Footer note "Hours: time each rule assigned in the last 7 days."
- Editor card: "Rule N"; When = condition-type select (App, Window title, URL domain, Jira key, Meeting subject, Remote host) + value input (mono); Book to = select from booking codes (no free text) + code line; "Test on last 7 days" with small ghost "Run again", result line, precedence line (e.g. "Rule 1 claimed 4 of these first (1 h 35 min) because their titles contain a PORTAL key."), note "Testing never changes existing blocks."; primary "Save rule", ghost "Disable".

### 5. First run — `new-08-first-run.png`
- Topbar "Set up LightTrack" · "Four steps. Everything stays on this computer."
- Columns `220px minmax(0,640px)`, gap 32. Left: step buttons (h36, 20px numbered circle; current `--active-bg`/`--accent`; done = filled cobalt circle with ✓).
- Right card (padding 24): step title 18px/500 and content; footer ghost "Back" + primary "Continue" / "Start tracking".
  1. Data retention — radio cards: 3 months / **1 year (recommended, default)** / 2 years.
  2. Booking details — Employee ID; rounding segmented: None / **15 min** / 30 min / 1 hour; "Nearest, per day and line. Your blocks keep their exact times."
  3. Booking codes — list with "Valid" chips; "Add code", "Import CSV…" (until Timmy reference data exists).
  4. Start — plain statement of what is recorded; checkboxes: start with Windows, remind at 17:30 to approve, pair browser extension (optional).

## Interactions & behaviour
- Rail switches screens. Day badge = open blocking issues for the day.
- Day: "Book to …" assigns the block → line appears, rounded total updates (7:15 → 7:45), check turns ✓. "Confirm" on the remote session clears that issue. "Mark as break" converts gap row to a Break row (not booked). "Approve day" enabled only with 0 blocking issues → day status Approved, blocks locked (no actions), rail badge cleared. "Reopen day" returns to Draft (in production: creates a superseding version per LT3-202, never edits approved data in place).
- Week reflects the same state (shared data — LT3-204 "daily, weekly and inbox views share the same underlying worklog data").
- Export enabled only when every day in the period is approved and not yet exported. Export → immutable run record (profile version, worklog IDs, row count, time, SHA-256), lines → Exported.
- Rounding: per booking line, nearest 15 by default; show actual and rounded side by side.
- Every failed IPC call must surface an error toast (no silent guards).
- Keyboard: all actions are buttons; no single-key global shortcuts without a modifier.
- No animations beyond existing `--speed` (120ms ease) colour transitions.

## State (prototype → real model)
Prototype state in `LT First Release.dc.html`: `screen`, `assigned`, `rdpOk`, `gapBreak`, `approved`, `exported`, `rule`, `step`, `retention`, `rounding`. `preset` prop (`resolved`/`approved`/`exported`) seeds states for screenshots.
Real model: `worklog` (time block: start, end, booking ref = project element ID + service product ID, billable, Jira keys, comment, state `draft|approved|exported|rejected|superseded`), `allocation` (raw evidence → worklog), derived `booking_line` (day × booking code × activity type, unrounded + rounded), `export_run`. Booking lines are never edited directly.

## Design tokens (from `src/renderer/styles/app.css`)
Light: bg `#f7f7f4`, paper `#ffffff`, raised `#f0f0ec`, hover `#f3f3ef`, divider `#e6e6e0`, border-mid `#d2d2ca`, ink `#1a1a1a`, ink-muted `#5e5e5e`, ink-faint `#8c8c88`, accent `#3805e3`, accent-fill-hover `#3e257c`, accent-line `#c9bef7`, active-bg `#eeeafd`, added-bg `#dcfebc`, added-ink `#1e5a0a`, added-line `#b6e59a`, changed-bg `#e7e3f5`, changed-ink `#3e257c`, risk-bg `#fce3d7`, risk-ink `#a8410f`.
Dark: bg `#0b0b0d`, paper `#131316`, raised `#1c1c20`, hover `#1a1a1e`, divider `#26262b`, border-mid `#34343a`, ink `#f2f2ee`, ink-muted `#a6a6a0`, ink-faint `#76766f`, accent `#b8afda`, accent-line `#4a3f7a`, active-bg `#221a40`, added-bg `#22330f`, added-ink `#b3fc4f`, added-line `#3d5a1c`, changed-bg `#2a2442`, changed-ink `#cfc8ea`, risk-bg `#3a1e12`, risk-ink `#f4915f`.
Constants: cobalt `#3805e3`, purple `#3e257c`, mauve `#b8afda`, neon `#b3fc4f`, orange `#eb652b`; rail `#000`, rail border `#1e1e22`, rail text `#c8c8c8`, rail icon `#8a8a8a`, rail hover `#1a1a1a`.
New token: `--seg-nb` (non-billable bar) `#7d70b8` light (≥3:1 on white) / `#b8afda` dark.
Type: Poppins 400/500/600 (bundled), mono "JetBrains Mono", "Cascadia Mono", Consolas. Sizes: 22 (stat), 18 (step title), 15 (topbar), 13 (body), 12.5 (secondary/buttons), 12 (mono, small buttons), 11.5, 11 (labels/chips). Line-height 1.5.
Radius: 4 controls, 8 cards, 999 pills. Spacing: 4/6/8/10/12/14/16/24/32. Shadows: none except popovers `0 8px 24px rgba(0,0,0,.12)` (dark `.5`).

## Assets
- `lt/icon.png` — app icon (from `assets/icon.png`).
- `lt/fonts/poppins-*.woff2` — from `src/renderer/fonts/poppins/` (OFL).
- Icons: the Material-style SVG paths already in `src/renderer/index.html` (timer, analytics, download, folder, settings) plus Material check (`M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z`). Replace the unicode glyph icons (▼ ▶ ✎ ✕ ← →) with SVGs from the same set.

## Files
- `LT First Release.dc.html` — interactive redesign (props `screen`: day|week|export|rules|firstrun, `theme`: light|dark, `preset`).
- `LT Current.dc.html` — rebuilt current screens (props `screen`: timer|timeline|projects|sap, `theme`, `annotate`).
- `LightTrack UX Audit.dc.html` — the full audit: findings, annotated current screens, redesign walkthrough.
- `support.js`, `lt/`, `_ds/` — runtime and assets needed to open the HTML.
- `screenshots/` — `current-01…04` (annotated current UI, light), `new-01…11` (redesign states, light + dark).
