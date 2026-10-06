# LightTrack v3: status and pickup

**Last updated:** 2026-10-06, end of day
**Current branch:** `feat/lt3-101-sqlite-migrations` (LT3-101 complete, PR open)
**`main`:** `1e7f02f`

## Where we are

Increment A is done. Increment B has started: LT3-101 (database and migrations) is in review.

Merged on 2026-10-06:

- #36 LT3-003 typed, validated IPC contract (closes #10)
- #37 dependency audit with recorded, expiring exceptions (`scripts/audit.js`; `sprintf-js` advisory accepted until 2026-11-05)
- #42 editing an activity no longer clears its tags (closes #38)
- #43 active-window detection replaced: `active-win` 7 needed `ffi-napi`, which never installed, so tracking recorded nothing; now Win32 through `koffi` (`src/main/core/active-window.ts`)
- #46 first-release design handoff and its review (`docs/design/first-release/`, `REVIEW.md`)

Earlier (PRs #1 to #9, #34, #35): Windows baseline and CI with a packaged-app harness, ADRs 0002 to 0005, Fabrica page-kit styling, LT3-002, 004 to 009, 100, 006.

**Installer for daily use:** `dist/LightTrack Setup 3.0.0.exe`, built from the window-detection fix on 2026-10-06 (before #42 was merged). Unsigned, so SmartScreen warns on first run ("More info" > "Run anyway"). Data lives in `%APPDATA%\LightTrack` and survives reinstalls. Rebuild with `npm run electron:build:win` on `main`.

## Owner decisions (all recorded in the plan's decisions table)

First release hands off by CSV; Timmy submission comes after. Worklogs are time blocks with derived daily booking lines. Rounding per user (default 15 min). Full TypeScript including renderer. SQLite file encrypted with the protected key. Retention chosen at first run (default 1 year). Releases stay unsigned; in-app updates off. Jira outbound with review. RDP clients: `mstsc.exe`, Windows App. Salesforce kept for later. The first-release design handoff is the UI reference (2026-10-06).

## LT3-101 (#12): on the branch

- `src/main/persistence/sqlite-db.ts` (replaces the JavaScript spike wrapper): open, run, transaction, atomic save, AES-256-GCM file encryption (`file-crypto.ts`). Found and fixed: sql.js `export()` turns foreign keys off, so the spike wrapper stopped enforcing them after the first save.
- `database.ts`: migration runner (user_version plus `schema_migrations`), all pending migrations in one transaction, integrity and foreign-key checks before saving, backup `<file>.pre-v<N>.bak` before an upgrade, refuses a newer schema.
- `schema.ts`: migration 1 with the core tables of plan 6.4; every foreign key indexed.
- Not used by the app yet; LT3-102 adds repositories, LT3-104 moves data in.

## Decisions taken 2026-10-06 (recorded in the plan)

- Minimum window width 1024 px, stacking below about 1100 px.
- Worklog states stored as draft, approved, superseded; exported derived; rejected with Timmy.
- CSV layout comes from a sample of the approver's import file. **Waiting on the owner** for that sample; only LT3-302 needs it.

## Open issues found today

#39 timeline merge fails, #40 restore reports success but restores nothing, #41 switch project does nothing, #44 design-system pass on current screens, #45 show failed requests instead of silent fallbacks.

## Open items for the owner

1. Send `docs/integrations/timmy-integration-request.md` to Timmy's maintainer, Pieter Jan De Keyzer (per Timmy's commit history; confirm he is the right contact).
2. Load the browser extension unpacked in Chrome or Edge and pair it once by hand (not covered by automated tests).
3. Use a build for a while: `tsc` now adds `"use strict"` to the legacy main-process JavaScript; the harness passed, but tray, tracking and idle paths are not covered by it.

## Next

Merge LT3-101, then #45 and #44 (small, visible to daily use), then LT3-102 (#13) repositories, LT3-103 to LT3-105 (#14 to #16), Increment C (#17 to #21), the CSV hand-off (#22, #23), RDP (#26, #27), #31, #33.

## Working notes

- Gates: `npm run lint`, `npm run typecheck`, `npm run test:ci` (baseline Jest, TS via ts-jest), `npm run build` (into `out/`), `npm run electron:build:win` (production build + installer), `npm run test:app` (harness against `dist/win-unpacked`; set `LIGHTTRACK_EXE` to test another build).
- For a quick packaged check without touching `dist/`: `npm run build && npx electron-builder --win --dir --publish never --config.directories.output=<scratch dir>`.
- The repository stores LF; `core.autocrlf` gives CRLF in some working copies. Git Bash tools hide the `\r`, so check with Node before a scripted edit that matches on newlines.
- TypeScript 6: set `rootDir` explicitly; `module: node16` for main.
- Workflow so far: one branch and PR per backlog item, CI green before merging, merges with a merge commit after the owner approves.

## Pickup prompt

> Continue LightTrack v3 in `C:\Projects\Other\LightTrack_v3`. Read `docs/handover/STATUS.md` first. If the LT3-101 PR is open, check its CI and ask me before merging. Then follow "Next" in STATUS.md, one branch and PR per item, keeping lint, typecheck, `test:ci`, build and the packaged-app harness green. Use `docs/design/first-release` for any UI work. Keep the plain, concise writing style used in the docs. Ask me before merging.
