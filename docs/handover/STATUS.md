# LightTrack v3: status and pickup

**Last updated:** 2026-11-27
**`main`:** `dc055df`, CI green. Open: #68 (A-8), CI green, waiting for the owner's approval; it carries this status.
**Next step:** once A-8 is merged, story A-9 of `docs/handover/stabilisation-backlog.md` (smoke test: a tracked activity is visible in the packaged app), branch `fix/a-9-tracked-smoke` from `main`, then the Epic A retrospective.

## Where we are

The owner reported on 2026-11-26 that tracking runs but no records appear. A functional audit found the cause and a set of other defects. `docs/handover/stabilisation-backlog.md` fixes them in order: two epics, 20 stories, one PR each, approved by the owner and checked by an independent validation pass. The backlog sits in front of Increment B; LT3-102 (#13) follows it.

**Done: A-1 to A-7; A-8 waits for approval. Next: A-9, then B-1 to B-12 (B-5 is dropped).**

The first-release workflow (approval, booking lines, CSV hand-off, RDP) is still not built; see plan section 16 and `docs/design/first-release/REVIEW.md`.

**Installer:** `dist/LightTrack Setup 3.0.0.exe`, built on 2026-11-26 from `main` at `6753529`. It includes A-1 and A-2 (the fix for the missing records) and #57, but not A-3. It was not run through the harness locally; the same code passed CI on #61. Unsigned, so SmartScreen warns on first run ("More info" > "Run anyway"). Data lives in `%APPDATA%\LightTrack` and survives reinstalls. Rebuild with `npm run electron:build:win` on `main`, and do not switch branches while it builds.

## Merged on 2026-11-27

- **#64 A-4** editing keeps duration and title. The edit dialog sends only the fields that changed and never the title; main replaces the duration with end minus start only when a time moves, and refuses edits to the activity being tracked. A time change on a tracked activity asks for confirmation first. The dialog shows the local date.
- **#63** status after A-1 to A-3.
- **#65 A-5** an activity is filed on the local day it started. Manual entries had no `date`, so the day filter used the save time and filed an entry for yesterday under today. Main now sets `date` from the local start on save and when the start moves, and both today-total paths use the local day. One helper, `src/main/core/local-day.ts`, replaces the copies of the day formatting in main, including four that used the UTC day. Existing entries are not backfilled: an old manual entry for another day stays under the day it was typed in until its start is edited.

- **#66 A-6** the tray and the window agree on tracking. The tray started and stopped the tracker directly while the window's handlers kept a copy in `appState.tracking`, so Stop in the window after a tray stop started tracking again. The copy is gone; the tracking handlers read the tracker on every call. Saving any setting no longer stops and restarts the tracker: the tracker and idle detector read the settings on every check, so no setting needs a restart.

- **#67 A-7** sleep and lock time is not counted. Confirmed first: a 60-minute gap between samples added 60 minutes to the activity. The tracker now pauses and saves on `suspend` and `lock-screen` and counts again from `resume` and `unlock-screen`. A gap over 5 minutes without a power event (`MAX_SAMPLE_GAP_MS`) credits one sampling interval and is logged. After an overnight gap the morning starts a new activity instead of extending yesterday's.

## In review

- **#68 A-8** storage does not drop activities silently. Every save removed all stored activities shorter than the minimum duration (so a manual entry under a minute vanished) and cut the list at 10,000. Both are gone: the minimum applies only when the tracker decides whether to save, and the limit is a logged warning. "Clear old data" deleted by save time, and every tracked activity without one whatever its age; it now uses the dialog's rule (start time, else save time, kept when unreadable), so it removes exactly what the dialog counted. Duplicate removal and consecutive merging on save are unchanged.

The owner confirmed on 2026-11-27 that the records since October appear after installing the 2026-11-26 build.

## Merged on 2026-11-26

- **#59 A-1** dependency audit passes again: 17 advisories to 0. `electron` 44.11.6, `zod` 4.6.7; `glob` and `minimatch` (build and test tools only) are pinned through `overrides` in `package.json`; no audit exceptions remain (`docs/security/dependency-exceptions.md`).
- **#61 A-2** tracked activities appear again. The tracker stores start and end times as numbers and the IPC contract accepts only text, so every `activities:get` reply with a tracked activity was rejected (4,271 times in the owner's log since 2026-10-27). Handlers that return an activity now convert it in `src/main/ipc/wire-activity.ts`. The stored data and the contract are unchanged; the mixed stored format is TD-1 in the backlog and is settled by LT3-102.
- **#62 A-3** a failed load shows "Could not load activities" with Retry in the Timer, Timeline and Analytics. Settings loads its statistics last, so a failure there no longer leaves the other sections unwired.
- **#57** the Timer's project switcher is removed (closes #41). The owner chose removal over building it; story B-5 is dropped.
- **#60** the stabilisation backlog and status. #58 was closed as superseded.

## Still broken until its story lands

- Manual entries made before A-5 for another day stay under the day they were typed in.
- Storage removes short activities on every save and cuts the list at 10,000; clear old data removes more than it shows (A-8, in review).
- Every settings save shows "Failed to save settings" although it saved (B-1). Consolidation and week-start settings do not persist (B-2).
- No idle-return prompt (B-4). Mark break, project Edit in Settings and rule Test rely on `prompt()` (B-6).

## Owner decisions

Recorded in the plan's decisions table, plus those of 2026-11-26:

- First release hands off by CSV; Timmy submission after. Worklogs are time blocks with derived daily booking lines; rounding per user, default 15 min.
- Full TypeScript including renderer. SQLite file encrypted with the protected key. Retention chosen at first run (default 1 year). Releases unsigned; in-app updates off.
- Jira outbound with review. RDP clients: `mstsc.exe`, Windows App.
- First-release UI follows the design handoff. Minimum window width 1024 px, two-column screens stack below about 1100 px.
- Worklog states stored: draft, approved, superseded. "Exported" derived from export runs; "rejected" added with Timmy.
- Salesforce: client remembered per case, one case = one client. API lookup (LT3-502) deferred until a Salesforce admin can create a connected app.
- CSV layout: taken from a sample of the approver's SAP ByDesign import file (pending, see below).
- **2026-11-26:** times are converted where activities leave main; the store is left alone until LT3-102. Sleep and lock time is discarded without a prompt. The project switcher is removed, not built.

## Waiting on the owner

1. **A real Salesforce window title** (a case record page, and the Service Console if used), to confirm the patterns in `src/main/core/salesforce-case.ts`.
2. **A sample CSV** the approver imports into SAP ByDesign. Needed for LT3-302 only.
3. Send `docs/integrations/timmy-integration-request.md` to Timmy's maintainer (Pieter Jan De Keyzer per Timmy's commit history; confirm the contact). Needed after the first release.
4. Pair the browser extension once by hand in Chrome or Edge, and say whether it shows "Not connected" again later. The audit suspects the pairing is lost when the extension's service worker restarts.
5. Report anything odd from daily use, especially tray, idle detection and tracking, which the harness does not cover. Electron moved from 44.5 to 44.11 in A-1.

## Next (in order)

1. **A-8** merge after approval.
2. **A-9**, then the Epic A retrospective. A-9 (harness smoke test with a seeded tracked activity) may be pulled forward.
3. **B-1 to B-12** without B-5, then the Epic B retrospective:
   - B-1 saving settings reports what happened; B-2 every setting persists and main's settings have controls;
   - B-3 Timer and Timeline keep their own lists and refresh after a change; B-4 returning from idle asks what to do with the time;
   - B-6 no control depends on `prompt()`; B-7 the tag editor opens on the clicked row; B-8 project, tag and type controls act once;
   - B-9 SAP export employee ID and history; B-10 complete backup and removable calendar URL; B-11 tray, toasts and help match the app;
   - B-12 harness smoke test for save, edit and manual entry.
4. **LT3-102 (#13)** typed repositories on the LT3-101 schema, then LT3-103 to LT3-105 (#14 to #16), Increment C (#17 to #21), the CSV hand-off (#22, #23), RDP (#26, #27), #31, #33.

## Working notes

- Gates: `npm run lint`, `npm run typecheck`, `npm run test:ci` (baseline Jest, TS via ts-jest; 198 tests), `npm run build` (into `out/`), `npm run security:audit`, `npm run electron:build:win` (production build and installer), `npm run test:app` (harness, 11 tests, against `dist/win-unpacked`; set `LIGHTTRACK_EXE` to test another build).
- The harness tests a packaged build, not the source: repackage after every source change. Without touching `dist/`: `npm run build:prod && npx electron-builder --win --dir --publish never --config.directories.output=<scratch dir>`, then `LIGHTTRACK_EXE=<scratch dir>/win-unpacked/LightTrack.exe npm run test:app`.
- On a busy machine the full harness run can fail in "stores a manual entry" (timeout) and "keeps row actions visible" (it needs that entry). Both pass alone and in CI. Trust CI, and read the error before blaming load.
- Lockfile: CI installs with npm 10 (Node 22). A lockfile written by npm 11 can fail `npm ci` there. After changing dependencies run `npx npm@10 install --package-lock-only`.
- Do not switch branches while a build or packaging run is in progress; it reads the working tree.
- IPC: add a channel to `src/main/ipc/contract.ts`, register it with `registry.handle`, map it in `src/preload/index.ts` (see CONTRIBUTING). A handler that returns an activity passes it through `toWireActivity`. Schema changes: append a migration to `src/main/persistence/schema.ts`.
- The repository stores LF; `core.autocrlf` gives CRLF in some working copies. Git Bash tools hide the `\r`, so check with Node before a scripted edit that matches on newlines.
- TypeScript 6: set `rootDir` explicitly; `module: node16` for main. Use CommonJS packages in main (koffi 2.x, not the ESM-only 3.x types).
- CI runs only on PRs into `main`. A branch cut before a fix on `main` needs `main` merged in before its CI can pass.
- The owner's data file `%APPDATA%\LightTrack\config.json` is encrypted; read `logs/main.log` there for evidence instead.
- Workflow: one branch and PR per story, CI green before merging, merge commit after the owner approves. Never `git add` the untracked design zip in `docs/`.

## Pickup prompt

> Continue LightTrack v3 in `C:\Projects\Other\LightTrack_v3`. Read `docs/handover/STATUS.md` first, then `docs/handover/stabilisation-backlog.md` ("Rules for every item" and the next open story). Check "Waiting on the owner" for anything I have answered. Then start the first open story under "Next": branch from `main`, write the failing test first, implement, keep lint, typecheck, `test:ci`, build, the audit and the packaged-app harness green, open a PR and report CI. One story and one PR at a time. Use `docs/design/first-release` for any UI work. Keep the plain, concise writing style used in the docs. Ask me before merging, and update this file when a story is merged.
