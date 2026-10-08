# LightTrack v3: status and pickup

**Last updated:** 2026-10-08, end of session
**`main`:** `7615165`, CI green. Open, CI green, waiting for approval: #57 (#41) and #58 (this status update).
**Next step:** merge #57 and #58 once approved, then LT3-102 (#13) on branch `feat/lt3-102-repositories` from `main`.

## Where we are

Increment A (foundation) is done. Increment B (durable local data) has started: LT3-101 is merged, LT3-102 to LT3-105 remain. First release: 3 of 18 items done (LT3-003, LT3-101, #48). The cleanup before Increment B is done apart from #41 (PR #57).

The app is in daily use by the owner as a time tracker. The first-release workflow (approval, booking lines, CSV hand-off, RDP) is not built yet; see plan section 16 and `docs/design/first-release/REVIEW.md`.

**Installer:** `dist/LightTrack Setup 3.0.0.exe` built from `main` (`7615165`) on 2026-10-08; the packaged-app harness (9 tests) passed against it. It does not include #57. Rebuild with `npm run electron:build:win` on `main`. Unsigned, so SmartScreen warns on first run ("More info" > "Run anyway"). Data lives in `%APPDATA%\LightTrack` and survives reinstalls.

## Merged on 2026-10-08

- #52 failed requests show an error toast; the preload no longer returns empty fallbacks (closes #45)
- #53 first-release design system on the current screens (closes #44): labels, `.solid`/`.ghost` + `.small`, one input style, visible row actions, real buttons, sentence case, H:MM durations, `--seg-nb`. No bare-key shortcuts: break is Ctrl+Shift+B, manual entry Ctrl+Shift+N. `test/baseline/design-tokens.test.js` checks contrast in both themes.
- #54 browser extension context parsed correctly (closes #49)
- #55 restore from backup removed until LT3-105 (closes #40)
- #56 timeline merge through a new `activities:merge` channel, one store write (closes #39)

Open: #57 removes the Timer's project switcher (closes #41). The owner answered "yes" to a question that offered removal (recommended) or a new channel; this was read as removal. Confirm before merging #57.

Seen, not fixed: the old storage combines two saves with the same app, title and project made within 5 minutes, whatever their times (`lightweight-storage.js`, `canMergeActivities`). LT3-102 replaces this storage.

## Merged on 2026-10-06

- #36 LT3-003 typed IPC contract, #37 dependency audit (`sprintf-js` exception expires **2026-11-05**), #42 edit keeps tags, #43 Win32 window detection through `koffi`, #46 design handoff, #47 LT3-101 SQLite and migrations, #50 Salesforce client per case.

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

1. Merge **#57** (#41, after confirming removal) and **#58** (status).
2. **LT3-102 (#13)** Typed repositories on the LT3-101 schema (`src/main/persistence/`: `database.ts`, `schema.ts`, `sqlite-db.ts`). Acceptance: repositories for raw activity, projects, mapping rules, worklogs, allocations, audit records, profiles and export runs; transactions where several records change together; domain errors for validation, conflict, not-found and persistence failures; performance tests for date-range queries. The app still uses the old JSON storage; the LT3-101 database is not used by the app yet. Then LT3-103 to LT3-105 (#14 to #16): v3 export, import with reconciliation, backup and restore.
3. Increment C (#17 to #21), the CSV hand-off (#22, #23), RDP (#26, #27), #31, #33.

## Working notes

- Gates: `npm run lint`, `npm run typecheck`, `npm run test:ci` (baseline Jest, TS via ts-jest; 165 tests), `npm run build` (into `out/`), `npm run electron:build:win` (production build and installer), `npm run test:app` (harness against `dist/win-unpacked`; set `LIGHTTRACK_EXE` to test another build).
- Quick packaged check without touching `dist/`: `npm run build:prod && npx electron-builder --win --dir --publish never --config.directories.output=<scratch dir>`.
- IPC: add a channel to `src/main/ipc/contract.ts`, register it with `registry.handle`, map it in `src/preload/index.ts` (see CONTRIBUTING). Schema changes: append a migration to `src/main/persistence/schema.ts`.
- The repository stores LF; `core.autocrlf` gives CRLF in some working copies. Git Bash tools hide the `\r`, so check with Node before a scripted edit that matches on newlines.
- TypeScript 6: set `rootDir` explicitly; `module: node16` for main. Use CommonJS packages in main (koffi 2.x, not the ESM-only 3.x types).
- CI runs only on PRs into `main`. A stacked PR gets no CI until it is retargeted; changing the base does not start CI, so rebase on `main` and push (or close and reopen).
- Workflow: one branch and PR per item, CI green before merging, merge commit after the owner approves. Never `git add` the untracked design zip in `docs/`.

## Pickup prompt

> Continue LightTrack v3 in `C:\Projects\Other\LightTrack_v3`. Read `docs/handover/STATUS.md` first and check "Waiting on the owner" for anything I have answered. Ask me to approve merging the open PRs (#57, #58), confirming the #41 removal. Then start the first open item under "Next" (LT3-102, #13): branch from `main`, implement, keep lint, typecheck, `test:ci`, build and the packaged-app harness green, open a PR and report CI. Use `docs/design/first-release` for any UI work. Keep the plain, concise writing style used in the docs. Ask me before merging.
