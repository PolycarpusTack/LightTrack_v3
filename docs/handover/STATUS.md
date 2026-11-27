# LightTrack v3: status and pickup

**Last updated:** 2026-11-27
**`main`:** `83df89b`, CI green. Open: the C-4 PR, which carries this status.
**Next step:** once C-4 is merged, story B-8 of `docs/handover/stabilisation-backlog.md` (project, tag and activity-type controls act once), branch from `main`.

## Where we are

The owner reported on 2026-11-26 that tracking runs but no records appear. A functional audit found the cause and a set of other defects. `docs/handover/stabilisation-backlog.md` fixes them in order: three epics, 30 stories, one PR each (Epic C added on 2026-11-27 from an outside code review), approved by the owner and checked by an independent validation pass. The backlog sits in front of Increment B; LT3-102 (#13) follows it.

**Done: Epic A (A-1 to A-9) and its retrospective, B-1 to B-4, B-6, B-7, C-1 to C-3; C-4 waits for approval. Next: B-8 to B-12, then C-5 to C-10 (B-5 is dropped).**

The first-release workflow (approval, booking lines, CSV hand-off, RDP) is still not built; see plan section 16 and `docs/design/first-release/REVIEW.md`.

**Installer:** `dist/LightTrack Setup 3.0.0.exe`, built on 2026-11-26 from `main` at `6753529`. It includes A-1 and A-2 (the fix for the missing records) and #57, but not A-3. It was not run through the harness locally; the same code passed CI on #61. Unsigned, so SmartScreen warns on first run ("More info" > "Run anyway"). Data lives in `%APPDATA%\LightTrack` and survives reinstalls. Rebuild with `npm run electron:build:win` on `main`, and do not switch branches while it builds.

## Merged on 2026-11-27

- **#64 A-4** editing keeps duration and title. The edit dialog sends only the fields that changed and never the title; main replaces the duration with end minus start only when a time moves, and refuses edits to the activity being tracked. A time change on a tracked activity asks for confirmation first. The dialog shows the local date.
- **#63** status after A-1 to A-3.
- **#65 A-5** an activity is filed on the local day it started. Manual entries had no `date`, so the day filter used the save time and filed an entry for yesterday under today. Main now sets `date` from the local start on save and when the start moves, and both today-total paths use the local day. One helper, `src/main/core/local-day.ts`, replaces the copies of the day formatting in main, including four that used the UTC day. Existing entries are not backfilled: an old manual entry for another day stays under the day it was typed in until its start is edited.

- **#66 A-6** the tray and the window agree on tracking. The tray started and stopped the tracker directly while the window's handlers kept a copy in `appState.tracking`, so Stop in the window after a tray stop started tracking again. The copy is gone; the tracking handlers read the tracker on every call. Saving any setting no longer stops and restarts the tracker: the tracker and idle detector read the settings on every check, so no setting needs a restart.

- **#67 A-7** sleep and lock time is not counted. Confirmed first: a 60-minute gap between samples added 60 minutes to the activity. The tracker now pauses and saves on `suspend` and `lock-screen` and counts again from `resume` and `unlock-screen`. A gap over 5 minutes without a power event (`MAX_SAMPLE_GAP_MS`) credits one sampling interval and is logged. After an overnight gap the morning starts a new activity instead of extending yesterday's.

- **#68 A-8** storage does not drop activities silently. Every save removed all stored activities shorter than the minimum duration (so a manual entry under a minute vanished) and cut the list at 10,000. Both are gone: the minimum applies only when the tracker decides whether to save, and the limit is a logged warning. "Clear old data" deleted by save time, and every tracked activity without one whatever its age; it now uses the dialog's rule (start time, else save time, kept when unreadable), so it removes exactly what the dialog counted. Duplicate removal and consecutive merging on save are unchanged.

- **#69 A-9** the harness seeds a tracked activity with numeric times into a fresh profile and checks that the Timer lists it with its duration and that the log has no "invalid response". It fails against a build without the A-2 fix. Epic A is complete.
- **#70 B-1** saving settings reports what happened. The window expected the save to answer `true`; main answers `{ success, errors }`, so every save showed "Failed to save settings" although it saved. The window now shows "Settings saved", or main's reasons when it refuses a value (for example "Work day end time must be after start time").
- **#71 B-2** every setting on the screen persists. The IPC contract dropped `consolidateActivities`, `consolidationMode` and `weekStartDay` without an error, and the screen neither sent nor read them, so they reset on restart. They are now in the Settings schema (mode and week day checked), saved and loaded. Settings has fields for the idle threshold (30 to 1800 s) and the shortest tracked activity saved (10 to 600 s); main refuses values outside those ranges, and a refused value is replaced by the stored one so it does not block the next save.
- **#72 B-3** the Timer and Timeline keep their own lists and refresh after a change. Both views wrote one shared list, and a save or delete reloaded only the Timer's day without redrawing the Timeline, so the Timeline kept showing the old row and the next edit there said "Activity not found". The Timeline now keeps its own list; after a save, edit, delete or clear the Timer reloads, and so does the Timeline or Analytics when it is on screen. The window also listens for `activities-updated` from main.
- **#73 B-4** returning from idle asks what to do with the time. Main paused and sent `tracking-paused` and `idle-return`, but the preload passed neither on, so no prompt appeared; and the decision looked for the paused activity by its idle start time, which a record that was saved before or had resumed did not carry, so "count as work" added nothing. Main now remembers the paused activity by id and applies the answer to it, also to the open copy when tracking has resumed on that record, then reports `activities-updated`. After 5 minutes or more away (was: more than 1) the window asks "Count as work" or "Leave out"; Escape leaves it out. Shorter absences are left out without asking. While paused the timer shows "Paused".
- **#74 B-6** no control depends on `prompt()`. Confirmed first: in the packaged app `prompt()` throws "prompt() is not supported", so Mark break (button and Ctrl+Shift+B), project Edit in Settings and rule Test did nothing. The six calls are replaced by one shared dialog with labelled fields, Save and Cancel (`openFormDialog` in `modals.js`); Cancel and Escape save nothing. System projects show their name greyed out, as they cannot be renamed. The rule Test buttons also had no handler: it was attached to the Projects nav button, which carries the same `data-view`, instead of the view. `confirm()` still asks before removals; it works in Electron.
- **#75 B-7** the tag editor opens on the row that was clicked. It looked the activity up in the Timer's list, so a Timeline row for another day said "Activity not found", and it attached to the first row with that id in the page, which for today is the hidden Timer row. Ticking a tag on the Timer also reached the row's click handler and opened the Edit dialog. The editor now gets the clicked row and uses the list of the view on screen, and the Timer row ignores clicks inside the editor. Saving tags also left main's five-second read cache in place, so a reload straight after showed the old tags; the cache is now cleared.
- **#76** backlog: Epic C (C-1 to C-10), B-11-T0 and TD-3, from an outside code review checked against the code. The owner chose to pull C-1 to C-4 (time lost or put on the wrong project) in front of B-8 to B-12.
- **#77 C-1** editing or deleting the tracked activity says why, and tracking leaves manual entries alone. The preload replaced main's "Stop tracking before editing this activity" with a fixed message, so A-4's refusal never reached the screen; it now passes a `CONFLICT` reason through, and keeps the fixed message for other failures. Deleting the tracked activity is refused, as the next save would add it back in full. The tracker no longer resumes a manual entry with the same app, project and day.
- **#78 C-2** every tracked second is stored. The duplicate-save check remembered app, project, day and duration rounded to 10 s, for any activity and without expiry, so a return of a few seconds to a saved activity, or a second Salesforce case with the same app and project, was not saved. It now skips a save only when the same activity was last saved with the same project, duration and title. Each tick also dropped its fraction of a second (about 0.6 % of tracked time at 30 ms per tick); the next tick now starts where the credited seconds end.
- **#79 C-3** saving does not merge stored activities (owner's choice (a)). Every save merged neighbouring stored activities with the same app, title and project whose save times were within five minutes. The store is newest first, so the result ran from the later start to the earlier end, and the older id was lost (two Mark breaks in a row, for example). The merge is removed; the tracker already keeps one activity per app, project and day, and the "Consolidate similar activities" setting still controls that. Duplicates on save are now found by id; save time plus title also matched two different entries with the same title (TD-3, resolved). Already stored activities are unchanged.

## In review

- **C-4** my rules win over guesses, and match the way the tester says. The title parser guessed first: any title with "review", "sync" or "call" became "Meetings", and an IDE window took its folder name, and every JIRA, URL and app rule then stopped because a project was set. Guesses are now kept aside and used only when no rule matched. App and meeting rules compiled the raw text as a regular expression, so `/re/i` never fired and `*Outlook*` or `C++` were skipped without notice; one matcher in `src/shared/rule-pattern.ts` now serves tracking, the Test button and the matched-rule note. URL, app and meeting rules also set cost center and WBS element.

The owner confirmed on 2026-11-27 that the records since October appear after installing the 2026-11-26 build.

## Epic A retrospective (2026-11-27)

- **Delivered:** A-1 to A-9 (#59, #61, #62, #64 to #69), one PR each, all with a test that failed first. Tracked activities show again (confirmed by the owner on real data), and the harness now fails if they stop showing.
- **Worked:** confirming each defect before fixing it (A-7 measured 60 minutes credited for a 60-minute gap); seeding tracked activities through a plain `config.json` in a fresh profile, with no test-only IPC; checking a new harness test against a build with the fix taken out (A-9).
- **Went wrong:** the first A-7 cap would have let yesterday's activity grow into the morning; a dedicated test caught it before the PR. Scripted edits to CRLF files missed silently until they were made line-ending-safe. A throwaway build without the A-2 fix failed to build, and the harness still started it, so the owner saw a JavaScript error dialog.
- **Changes for Epic B:** check that a throwaway build succeeded before starting it, and say beforehand when one will run. Renderer stories get a harness test that fails first, as B-1 does, since the renderer has no unit tests (TD-2).
- **Backlog:** no change to Epic B. AS-1 and AS-2 held. TD-1 (mixed time formats) still goes to LT3-102.

## Merged on 2026-11-26

- **#59 A-1** dependency audit passes again: 17 advisories to 0. `electron` 44.11.6, `zod` 4.6.7; `glob` and `minimatch` (build and test tools only) are pinned through `overrides` in `package.json`; no audit exceptions remain (`docs/security/dependency-exceptions.md`).
- **#61 A-2** tracked activities appear again. The tracker stores start and end times as numbers and the IPC contract accepts only text, so every `activities:get` reply with a tracked activity was rejected (4,271 times in the owner's log since 2026-10-27). Handlers that return an activity now convert it in `src/main/ipc/wire-activity.ts`. The stored data and the contract are unchanged; the mixed stored format is TD-1 in the backlog and is settled by LT3-102.
- **#62 A-3** a failed load shows "Could not load activities" with Retry in the Timer, Timeline and Analytics. Settings loads its statistics last, so a failure there no longer leaves the other sections unwired.
- **#57** the Timer's project switcher is removed (closes #41). The owner chose removal over building it; story B-5 is dropped.
- **#60** the stabilisation backlog and status. #58 was closed as superseded.

## Still broken until its story lands

- Manual entries made before A-5 for another day stay under the day they were typed in.

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
- **2026-11-27:** Epic C is added from the outside review. C-1 to C-4 go before B-8 to B-12. C-3 takes option (a): storage stops merging activities on save.

## Waiting on the owner

1. **A real Salesforce window title** (a case record page, and the Service Console if used), to confirm the patterns in `src/main/core/salesforce-case.ts`.
2. **A sample CSV** the approver imports into SAP ByDesign. Needed for LT3-302 only.
3. Send `docs/integrations/timmy-integration-request.md` to Timmy's maintainer (Pieter Jan De Keyzer per Timmy's commit history; confirm the contact). Needed after the first release.
4. Pair the browser extension once by hand in Chrome or Edge, and say whether it shows "Not connected" again later. The audit suspects the pairing is lost when the extension's service worker restarts.
5. **B-4 in an installed build:** stay away from the keyboard for over 5 minutes while tracking. The timer should show "Paused", and on return a dialog should offer "Count as work" and "Leave out". Say whether the activity's time matches your answer. The harness cannot check this because it keeps tracking off.
6. Report anything odd from daily use, especially tray, idle detection and tracking, which the harness does not cover. Electron moved from 44.5 to 44.11 in A-1.

## Next (in order)

1. **C-4** merge after approval.
2. **B-8 to B-12**, then the Epic B retrospective:
   - B-8 project, tag and type controls act once;
   - B-9 SAP export employee ID and history; B-10 complete backup and removable calendar URL; B-11 tray, toasts and help match the app;
   - B-12 harness smoke test for save, edit and manual entry.
3. **C-5 to C-10**, then the Epic C retrospective: day west of UTC; CSV formulas; calendar URL and IPv6; recurring meetings; settings checks; start-up guards and clean-up.
4. **LT3-102 (#13)** typed repositories on the LT3-101 schema, then LT3-103 to LT3-105 (#14 to #16), Increment C (#17 to #21), the CSV hand-off (#22, #23), RDP (#26, #27), #31, #33.

## Working notes

- Gates: `npm run lint`, `npm run typecheck`, `npm run test:ci` (baseline Jest, TS via ts-jest; 227 tests), `npm run build` (into `out/`), `npm run security:audit`, `npm run electron:build:win` (production build and installer), `npm run test:app` (harness, 19 tests, against `dist/win-unpacked`; set `LIGHTTRACK_EXE` to test another build).
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
