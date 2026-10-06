# LightTrack v3: status and pickup

**Last updated:** 2026-10-06, end of day
**`main`:** `d95aebd`, CI green. No open pull requests.
**Next step:** #45 (show failed requests instead of silent fallbacks), branch `fix/45-visible-errors` from `main`.

## Where we are

Increment A (foundation) is done. Increment B (durable local data) has started: LT3-101 is merged, LT3-102 to LT3-105 remain. First release: 3 of 18 items done (LT3-003, LT3-101, #48).

The app is in daily use by the owner as a time tracker. The first-release workflow (approval, booking lines, CSV hand-off, RDP) is not built yet; see plan section 16 and `docs/design/first-release/REVIEW.md`.

**Installer:** `dist/LightTrack Setup 3.0.0.exe`, built from `main` (`d95aebd`) on 2026-10-06; the packaged-app harness (5 tests) passed against it. Unsigned, so SmartScreen warns on first run ("More info" > "Run anyway"). Data lives in `%APPDATA%\LightTrack` and survives reinstalls. Rebuild with `npm run electron:build:win` on `main`.

## Merged on 2026-10-06

- #36 LT3-003 typed, validated IPC contract (closes #10)
- #37 dependency audit with recorded, expiring exceptions (`scripts/audit.js`; `sprintf-js` advisory accepted until **2026-11-05**, then CI fails again unless renewed or fixed)
- #42 editing an activity no longer clears its tags (closes #38)
- #43 active-window detection through Win32 and `koffi` (`src/main/core/active-window.ts`); `active-win` 7 needed `ffi-napi`, which never installed, so tracking recorded nothing
- #46 first-release design handoff and review (`docs/design/first-release/`)
- #47 LT3-101 SQLite and migrations (closes #12): encrypted database file, migrations in one transaction with integrity checks and a backup before upgrades, migration 1 with the core tables. Not used by the app yet.
- #50 Salesforce: client remembered per case (closes #48). Case number read from the window title; each case is its own activity; editing an entry offers "Always book Salesforce case N to this project"; remembered cases under Projects > Salesforce cases.

Earlier (PRs #1 to #9, #34, #35): Windows baseline and CI with a packaged-app harness, ADRs 0002 to 0005, Fabrica page-kit styling, LT3-002, 004 to 009, 100, 006.

## Owner decisions (recorded in the plan's decisions table)

- First release hands off by CSV; Timmy submission after. Worklogs are time blocks with derived daily booking lines; rounding per user, default 15 min.
- Full TypeScript including renderer. SQLite file encrypted with the protected key. Retention chosen at first run (default 1 year). Releases unsigned; in-app updates off.
- Jira outbound with review. RDP clients: `mstsc.exe`, Windows App.
- First-release UI follows the design handoff. Minimum window width 1024 px, two-column screens stack below about 1100 px.
- Worklog states stored: draft, approved, superseded. "Exported" derived from export runs; "rejected" added with Timmy.
- Salesforce: client remembered per case, one case = one client. API lookup (LT3-502) deferred until a Salesforce admin can create a connected app.
- CSV layout: taken from a sample of the approver's SAP ByDesign import file (pending, see below).

## Waiting on the owner

1. **A real Salesforce window title** (a case record page, and the Service Console if used), to confirm the patterns in `src/main/core/salesforce-case.ts`.
2. **A sample CSV** the approver imports into SAP ByDesign. Needed for LT3-302 only.
3. Send `docs/integrations/timmy-integration-request.md` to Timmy's maintainer (Pieter Jan De Keyzer per Timmy's commit history; confirm the contact). Needed after the first release.
4. Pair the browser extension once by hand in Chrome or Edge (not covered by automated tests).
5. Report anything odd from daily use, especially tray, idle detection and tracking, which the harness does not cover.

## Next (in order)

1. **#45** Show failed requests to the user instead of falling back silently (preload fallbacks, renderer guards).
2. **#44** Design-system pass on the current screens (labels, buttons, inputs, focus, visible row actions, no bare Space shortcut); see `docs/design/first-release/README.md`, "System-level changes".
3. **#39, #40, #41, #49** Small defects: timeline merge, restore that restores nothing, switch project, browser extension parsing.
4. **LT3-102 (#13)** Typed repositories on the LT3-101 schema, then LT3-103 to LT3-105 (#14 to #16): v3 export, import with reconciliation, backup and restore.
5. Increment C (#17 to #21), the CSV hand-off (#22, #23), RDP (#26, #27), #31, #33.

## Working notes

- Gates: `npm run lint`, `npm run typecheck`, `npm run test:ci` (baseline Jest, TS via ts-jest; 124 tests), `npm run build` (into `out/`), `npm run electron:build:win` (production build and installer), `npm run test:app` (harness against `dist/win-unpacked`; set `LIGHTTRACK_EXE` to test another build).
- Quick packaged check without touching `dist/`: `npm run build:prod && npx electron-builder --win --dir --publish never --config.directories.output=<scratch dir>`.
- IPC: add a channel to `src/main/ipc/contract.ts`, register it with `registry.handle`, map it in `src/preload/index.ts` (see CONTRIBUTING). Schema changes: append a migration to `src/main/persistence/schema.ts`.
- The repository stores LF; `core.autocrlf` gives CRLF in some working copies. Git Bash tools hide the `\r`, so check with Node before a scripted edit that matches on newlines.
- TypeScript 6: set `rootDir` explicitly; `module: node16` for main. Use CommonJS packages in main (koffi 2.x, not the ESM-only 3.x types).
- If CI does not start on a new PR, close and reopen it.
- Workflow: one branch and PR per item, CI green before merging, merge commit after the owner approves. Never `git add` the untracked design zip in `docs/`.

## Pickup prompt

> Continue LightTrack v3 in `C:\Projects\Other\LightTrack_v3`. Read `docs/handover/STATUS.md` first and check "Waiting on the owner" for anything I have answered. Then start with the first item under "Next" (#45): branch from `main`, implement, keep lint, typecheck, `test:ci`, build and the packaged-app harness green, open a PR and report CI. Use `docs/design/first-release` for any UI work. Keep the plain, concise writing style used in the docs. Ask me before merging.
