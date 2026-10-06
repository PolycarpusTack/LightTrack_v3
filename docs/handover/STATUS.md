# LightTrack v3: status and pickup

**Last updated:** 2026-10-06
**Current branch:** `feat/lt3-003-ipc-contract` (LT3-003 complete, PR open, not merged)
**`main`:** `e7c978c`, CI green

## Where we are

Increment A is complete once the LT3-003 PR (#10) is merged. Merged earlier (PRs #1 to #9, #34, #35):

- Windows-only baseline, CI with a packaged-application harness (Playwright for Electron)
- ADR 0002 (this repo is canonical), ADR 0003 (SAP via Timmy), ADR 0004 (SQLite via `sql.js`), ADR 0005 (worklog model)
- Renderer restyled to the Fabrica page-kit tokens, light/dark; CSP-blocked inline styles and handlers fixed
- LT3-002 duplicates removed, LT3-004 extension pairing, LT3-005 app harness, LT3-007 SAP CSV hygiene, LT3-008 secrets/encryption/updates off, LT3-009 scripts, LT3-100 `sql.js` spike, LT3-006 TypeScript toolchain (app builds into `out/`)
- 24 GitHub issues (#10 to #33); the 17 in the first release carry the `first-release` label

The app is usable as a hardened time tracker. The first release (approval workflow, booking lines, RDP, CSV hand-off) is not built yet; see plan section 16.

**Installer for daily use:** `dist/LightTrack Setup 3.0.0.exe`, built from `main` (`e7c978c`) on 2026-10-06; the packaged-app harness passed against it. Unsigned, so Windows SmartScreen warns on first run ("More info" > "Run anyway"). Data lives in `%APPDATA%LightTrack` and survives reinstalls. To rebuild: `npm run electron:build:win` on `main`.

## Owner decisions (all recorded in the plan's decisions table)

First release hands off by CSV; Timmy submission comes after. Worklogs are time blocks with derived daily booking lines. Rounding per user (default 15 min). Full TypeScript including renderer. SQLite file encrypted with the protected key. Retention chosen at first run (default 1 year). Releases stay unsigned; in-app updates off. Jira outbound with review. RDP clients: `mstsc.exe`, Windows App. Salesforce kept for later.

## LT3-003 (#10): done on the branch

- `src/main/ipc/contract.ts`: 69 channels, each with an argument tuple, a result schema and a description. Requests use `z.object` (unknown keys dropped); stored records use `z.looseObject`.
- `src/main/ipc/registry.ts`: every handler goes through `registry.handle`; startup fails if a contract channel has no handler.
- All handlers moved to the registry; 8 unused handlers removed; `src/preload.js` deleted.
- Mapping handlers accept a project name or a project with booking details. The renderer already sent the second form, which main used to reject.
- Tests: `test/baseline/ipc-contract.test.js` (preload, contract and main list the same channels; registry error codes; renderer payloads accepted), plus a harness test that main refuses an invalid request.
- Docs: plan LT3-003 status, SECURITY.md, CONTRIBUTING.md ("Adding an IPC channel").

## Defects found while doing LT3-003 (not fixed; candidates for issues)

1. **Editing an entry wipes its tags.** `activities:update` runs the full activity sanitiser on the partial update, so `tags` becomes `[]` (and `title` `''` when not sent). Data loss; small fix in `activitiesHandlerMain.js`.
2. **Merging activities on the timeline fails.** `timeline.js` calls `lightTrackAPI.saveActivity`, which the preload does not expose.
3. **Restore from backup restores nothing but reports success.** `settings-view.js` calls eight methods the preload does not expose (`saveSettings`, `setProjectMappings`, `restoreTags`, `importActivities` and others), each behind an existence check. Belongs with #16.
4. **Switching project while tracking does nothing.** `app.js` calls `switchProject`, which is not exposed (guarded, so silent).

## Open items for the owner

1. Send `docs/integrations/timmy-integration-request.md` to Timmy's maintainer, Pieter Jan De Keyzer (per Timmy's commit history; confirm he is the right contact).
2. Load the browser extension unpacked in Chrome or Edge and pair it once by hand (not covered by automated tests).
3. Use a build for a while: `tsc` now adds `"use strict"` to the legacy main-process JavaScript; the harness passed, but tray, tracking and idle paths are not covered by it.

## Next

Merge the LT3-003 PR, then Increment B: #12 to #16 (SQLite schema with encryption, repositories, v3 export and import, backup and restore), then Increment C (#17 to #21), the CSV hand-off (#22, #23), RDP (#26, #27), #31, #33.

## Working notes

- Gates: `npm run lint`, `npm run typecheck`, `npm run test:ci` (baseline Jest, TS via ts-jest), `npm run build` (into `out/`), `npm run electron:build:win` (production build + installer), `npm run test:app` (harness against `dist/win-unpacked`; set `LIGHTTRACK_EXE` to test another build).
- For a quick packaged check without touching `dist/`: `npm run build && npx electron-builder --win --dir --publish never --config.directories.output=<scratch dir>`.
- The repository stores LF; `core.autocrlf` gives CRLF in some working copies. Git Bash tools hide the ``, so check with Node before a scripted edit that matches on newlines.
- TypeScript 6: set `rootDir` explicitly; `module: node16` for main.
- Workflow so far: one branch and PR per backlog item, CI green before merging, merges with a merge commit after the owner approves.

## Pickup prompt

> Continue LightTrack v3 in `C:ProjectsOtherLightTrack_v3`. Read `docs/handover/STATUS.md` first. If the LT3-003 PR is still open, check its CI and ask me before merging. Then propose issues for the defects listed in STATUS.md (the tag-wiping edit first) and start Increment B with #12 (SQLite schema with encryption), following `docs/LIGHTTRACK_V3_DEVELOPMENT_PLAN.md` sections 7 and 16. One branch and PR per item; keep `npm run lint`, `npm run typecheck`, `npm run test:ci`, `npm run build` and the packaged-app harness green. Keep the plain, concise writing style used in the docs. Ask me before merging.
