# LightTrack v3: stabilisation backlog

Source: functional audit of 2026-11-26 (`main` at `7615165`, installed build of 2026-10-08). This backlog fixes the defects and gaps found, one item and one pull request at a time. It sits in front of Increment B of `docs/LIGHTTRACK_V3_DEVELOPMENT_PLAN.md`; that plan's Definition of Ready (section 9), Definition of Done (section 10) and flow policy (section 11) apply unchanged.

## Readiness decision

```
READINESS: PROCEED
Health Score: Clarity 3 · Feasibility 3 · Completeness 2 = 8/9
Mode: DELIVERY — the app is in daily use and holds real timesheet data
STRIDE: S none · T none · R none · I A-1 (dependency advisories) · D A-1 (zod, undici advisories) · E none
Compliance: no regime specified
Embedded directives found: none
Core Specification: fallback mode table used (core-specification-v1.md not found)
Review: APPROVED (owner, 2026-11-26; assumptions AS-1, AS-2 and AS-6 confirmed)
```

Validation: independent critic pass on 2026-11-26, APPROVED with no blocking findings. Its corrections are applied: package before every harness check, A-4 split into a handler task and a dialog task, A-1 verified by the harness as well, B-11 split, B-12 reworded. Still open from that pass: persona lines for B-7 to B-12 and a deliverables line on a few small tasks; add them when each story is picked up.

Completeness is 2 because the audit read the code and the log but did not run the app; items marked "likely" in the audit carry a pull gate that confirms the defect first.

## Critical gaps

None block the first epic. Three owner decisions are taken as assumptions below (AS-1, AS-2, AS-6); say so if you want a different answer before the item starts.

## Rules for every item

These apply to each task and are not repeated.

- One branch and one PR per story: `fix/<id>-<short-name>`. Merge commit after the owner approves.
- Order of work in a task: failing test, simplest passing code, tidy up.
- Gates before a PR: `npm run lint`, `npm run typecheck`, `npm run test:ci`, `npm run build`, `npm run security:audit`; `npm run test:app` when the story touches startup, the preload or a screen.
- Feature flags: none. These are defect fixes in a single-user desktop app. Rollback is reverting the PR; no story changes the stored data format.
- Forbidden everywhere: loosening a contract schema to `z.any()` or `z.unknown()` to make a response pass; moving a failing test to the legacy quarantine; logging window titles, URLs or tokens; rewriting the user's stored activities in bulk.
- IPC changes follow CONTRIBUTING: contract, `registry.handle`, preload.
- New tests go in `test/baseline/`. Verify commands select tests by name: `npx jest --config jest.baseline.config.js -t "<name>"`. A Verify counts only if at least one test ran; a name that matches nothing still exits 0.
- The harness tests a packaged build, not the source. Wherever a Verify says `npm run test:app`, package first and repackage after every source change: `npm run electron:build:win && npm run test:app -- -g "<name>"`. To leave `dist/` alone, build into a scratch folder (see STATUS, working notes) and set `LIGHTTRACK_EXE`.

## Domain glossary

| Term | Meaning |
|---|---|
| Activity | One stored record of time: app, title, project, start, end, duration. |
| Tracked activity | An activity written by the tracker. One per app, project and day; the tracker resumes it, so start-to-end is a span and `duration` is the time actually counted. |
| Manual entry | An activity the user typed in. Its duration is end minus start. |
| Span | End minus start. Equals duration only for manual entries. |
| Day | The local calendar day an activity belongs to (`date`, `YYYY-MM-DD`). |
| Wire format | The shape an activity has when it crosses IPC: times as ISO text. |
| Tracking state | Whether the tracker is running and what it is tracking. The tracker is the only source. |
| Idle period | Time with no input beyond the idle threshold. |

Synonyms to avoid: "record", "entry" (use activity or manual entry), "session" (reserved for focus sessions).

## Assumptions ledger

| ID | Assumption | Impact | Check |
|---|---|---|---|
| AS-1 | Times are converted to ISO text where activities leave main (wire format). The store keeps what it has; the tracker keeps writing numbers until LT3-102 defines the SQLite schema. | High | A-2 test with a tracker-shaped activity. Recorded as TD-1. |
| AS-2 | Time while the computer sleeps or the screen is locked is discarded, without a prompt. | Med | Owner confirms before A-7 starts. |
| AS-3 | Advisories are closed by upgrading. A dev-only advisory with no fixed version gets a dated exception in `docs/security/dependency-exceptions.json`. | Med | A-1 lists each advisory and its resolution in the PR. |
| AS-4 | The idle prompt offers two choices, count or exclude, as main already implements. | Low | B-4 acceptance. |
| AS-5 | Controls with no backend are implemented when small (SAP export history) and removed otherwise (extension "Open LightTrack"). | Low | B-9, Not yet specified. |
| AS-6 | Switch project applies to the activity being tracked and holds until the app in front changes or tracking stops. It does not create a rule. | Med | Owner confirms before B-5 starts. |
| AS-7 | The audit's "likely" findings are real. | Med | Pull gates on A-7, B-6. |

## Technical debt

- **TD-1: Activity store — mixed time formats.** Tracked activities hold numbers, manual entries hold ISO text. Cause: tracker and manual path written separately. Principal: one migration. Interest: every reader must accept both. Servicing: LT3-102 (#13) defines one format in SQLite. Origin: A-2.
- **TD-2: Renderer — no automated tests for `app.js` and the modules.** Interest: screen defects are found by hand. Servicing: the harness stories A-9 and B-12 cover the main flows; the rest waits for the renderer TypeScript work.

## Backlog

Sequence: A-1 to A-9, then B-1 to B-12. Each story unblocks the next unless stated. Two epics, 21 stories.

---

## EPIC A — Tracked time is shown and stays correct

- **Objective:** activities the tracker records appear in the app and are not distorted by loading, editing, the tray, sleep or storage clean-up.
- **Tracer bullet:** yes. A-2 runs tracker → store → IPC → Timer list.
- **Mode:** DELIVERY
- **Definition of Done:** the log shows no `invalid response` for `activities:get` during a day of use; the harness sees a tracked activity in the Timer list (A-9); CI is green including the audit.
- **Business value:** the owner can use the app as a time tracker again. Measure: `activities:get` rejections per day, 4,271 over the last month, target 0.
- **Risks:** Med — an Electron upgrade in A-1 changes runtime behaviour; mitigation: `npm run test:app` against a packaged build in that PR. Med — fixes touch the only copy of the user's data; mitigation: no story rewrites stored activities, and the owner copies `%APPDATA%\LightTrack\config.json` before installing a new build.
- **SLO:** `activities:get` — rejected responses = 0 over one working day.
- **ADRs:** none new. AS-1 defers the time format to LT3-102.
- **Smoke test story:** A-9.
- **Runbook:** `docs/TROUBLESHOOTING.md`, updated in A-3 with "activities do not appear: check `logs/main.log` for `invalid response`".

### A-1 — PREP: the dependency audit passes again

As the maintainer I want CI green so that every later PR can merge on its own merits.
Value: High. Priority: H, every merge needs it. Size: M. DoR: READY.

```gherkin
Scenario: audit passes
  When I run "npm run security:audit"
  Then it exits 0
  And no exception in dependency-exceptions.json is expired or unused

Scenario: upgraded runtime still works
  Given the dependencies are upgraded
  When I run the packaged-app harness
  Then all harness tests pass
```

**A-1-T1** · Hat: PREPARATORY · Tier: X · Run: AFK
- Goal: upgrade or except each of the 17 advisories (electron, undici, zod, handlebars, fast-uri, glob, minimatch) and remove the unused `sprintf-js` exception.
- Deliverables: updated `package.json` and lockfile; exceptions file with dated entries only where no fix exists; `dependency-exceptions.md` explaining each.
- Verify: `npm run security:audit` exits 0, red before; and the full harness passes against a build made with the upgraded dependencies.
- Do not touch: application code, unless an upgrade forces a change; then stop and report it.
- Shortcuts: Allowed: dated exceptions for dev-only packages with no fixed version. Forbidden: exceptions for runtime packages (electron, zod, sql.js, koffi) without the owner's approval; `npm audit fix --force`.
- Pull gate: none. Unblocks: A-2. Confidence: Med (the Electron fix version is UNKNOWN until checked).

### A-2 — Tracked activities appear in the app

As the owner I want to see what was tracked so that I can review and book my day.
Value: High. Priority: H, the reported defect. Size: S. DoR: READY.

```gherkin
Scenario: a tracked activity is listed
  Given the store holds an activity whose startTime and endTime are numbers
  When the renderer asks for today's activities
  Then the response is accepted
  And startTime and endTime are ISO text for the same instants

Scenario: a manual entry is unchanged
  Given the store holds an activity whose times are ISO text
  When the renderer asks for activities
  Then its times are returned as stored

Scenario: an unreadable time does not hide the day
  Given one activity has a startTime that is not a date
  When the renderer asks for activities
  Then the other activities are returned
  And that activity is returned with startTime null and a warning is logged without its title
```

**A-2-T1** · Hat: FEATURE · Tier: X · Run: AFK
- Goal: convert activities to the wire format on every channel that returns one.
- Required interfaces: `Activity` in the IPC contract (unchanged: times are text or null).
- Deliverables: tests using an activity built the way `ActivityTracker.startNewActivity` builds it; a `toWireActivity` function; applied in `activities:get`, `activities:save-manual`, `activities:update`, `activities:merge`, `tags:updateActivity`, `tags:filterActivities`.
- Abstraction check: one function, six call sites; extract now, this is past the third occurrence.
- Verify: `npx jest --config jest.baseline.config.js -t "wire format"`, red before.
- Do not touch: the tracker's stored format and `lightweight-storage.js` (TD-1, LT3-102); the `Activity` schema.
- Shortcuts: Allowed: none needed. Forbidden: widening `startTime` to accept numbers in the contract.
- Idempotency: read path only.
- Pull gate: A-1 merged. Unblocks: A-3, A-4, A-9. Confidence: High. TD created: TD-1.

### A-3 — A failed load says so on the screen

As the owner I want a visible error where the list should be so that an empty list always means "nothing tracked".
Value: Med. Priority: H, it hid the A-2 defect for seven weeks. Size: S. DoR: READY.

```gherkin
Scenario: activities fail to load
  Given the activities request fails
  When the Timer, Timeline or Analytics view loads
  Then the list area shows "Could not load activities" with a Retry button
  And it does not show "No activities yet today" or "Loading..."

Scenario: settings sections load independently
  Given the activities request fails
  When I open Settings
  Then the export, clear-data and backup buttons work
  And tags, projects, activity types, calendar and browser extension sections are filled
  And only the statistics card shows an error
```

**A-3-T1** · Hat: FEATURE · Tier: V · Run: AFK
- Goal: render an error state in the three list areas, and load Settings statistics last in their own try/catch.
- Deliverables: harness test that forces the failure and reads the list text; changes in the Timer, Timeline, Analytics and Settings loaders; troubleshooting note.
- Verify: `npm run test:app -- -g "load failure"`, red before.
- Do not touch: the toast module (B-11 owns toast behaviour); preload error messages.
- Shortcuts: Allowed: one shared error-state helper. Forbidden: falling back to an empty list.
- Pull gate: A-2 merged. Unblocks: A-4. Confidence: High.

### A-4 — Editing an activity keeps its duration and title

As the owner I want to change a project without my hours changing so that edits do not corrupt the day.
Value: High. Priority: H, silent data change. Size: M. DoR: READY.

```gherkin
Scenario: change only the project of a tracked activity
  Given a tracked activity of 3h spanning 09:00 to 17:00 titled "Design review"
  When I change its project and save
  Then its duration is still 3h and its title is still "Design review"

Scenario: change the times of a manual entry
  Given a manual entry from 09:00 to 10:00
  When I set the end to 11:00 and save
  Then its duration is 2h

Scenario: change the times of a tracked activity
  Given a tracked activity
  When I change its start or end
  Then the dialog shows that the duration will become the new span and asks me to confirm

Scenario: edit the activity being tracked
  When I save an edit to the activity the tracker is updating
  Then the edit is refused with "Stop tracking before editing this activity"

Scenario: an activity started just after midnight
  Given an activity started at 00:10 local time
  When I open it for editing
  Then the date field shows that local day
```

**A-4-T1** · Hat: FEATURE · Tier: V · Run: AFK
- Goal: in main, refuse edits to the tracked activity as merge does, and recompute duration only when the update carries a changed time.
- Deliverables: handler tests (scenarios 2 and 4, and "an update without times keeps the duration"); `CONFLICT` guard in `activities:update`.
- Verify: `npx jest --config jest.baseline.config.js -t "edit keeps"`, red before.
- Do not touch: the merge handler; the edit dialog (A-4-T2).
- Shortcuts: none.
- Idempotency: key is the activity id; the same edit twice gives the same activity.
- Pull gate: A-2 merged. Unblocks: A-4-T2. Confidence: High.

**A-4-T2** · Hat: FEATURE · Tier: X · Run: AFK
- Goal: in the edit dialog, send only the fields the user changed, warn before a time change replaces a tracked duration, and show the local date.
- Deliverables: harness test for scenarios 1, 3 and 5; dialog compares against the activity it opened.
- Verify: `npm run test:app -- -g "edit keeps duration"`, red before.
- Do not touch: the Salesforce case option in the dialog; the handler (A-4-T1).
- Shortcuts: Allowed: `confirm()` for the span warning (it works in Electron). Forbidden: sending `title` from the app field.
- Pull gate: A-4-T1. Both tasks ship in one PR. Unblocks: A-5. Confidence: High.

### A-5 — An activity is filed on the day it started

As the owner I want an entry I add for yesterday to appear under yesterday so that days add up.
Value: High. Priority: H. Size: S. DoR: READY.

```gherkin
Scenario: manual entry for another day
  When I add a manual entry starting yesterday at 14:00
  Then it is returned for yesterday and not for today

Scenario: moving an activity to another day
  Given an activity filed under Monday
  When I change its start to Tuesday
  Then it is returned for Tuesday only

Scenario: today's total near midnight
  Given the local time is 00:30
  When today's total is requested
  Then it counts activities of the local day, not the UTC day
```

**A-5-T1** · Hat: FEATURE · Tier: V · Run: AFK
- Goal: set `date` from the local start time on save and on any update that changes the start; use the local day in both today-total paths.
- Deliverables: handler and storage tests; one local-day helper used by the handlers and `StorageManager`.
- Abstraction check: local-day formatting exists in four places; extract one helper in main.
- Verify: `npx jest --config jest.baseline.config.js -t "filed on"`, red before.
- Do not touch: existing stored activities (no backfill); `filterActivities` precedence.
- Shortcuts: Allowed: none. Forbidden: `toISOString().split('T')[0]` for a day.
- Pull gate: A-4 merged (same handler). Unblocks: A-6. Confidence: High.

### A-6 — The tray and the window agree on tracking

As the owner I want Stop to stop, whichever control I last used, so that tracking never restarts behind my back.
Value: High. Priority: H. Size: M. DoR: READY.

```gherkin
Scenario: stop from the tray, then from the window
  Given tracking was started in the window
  When I stop it from the tray and then press Stop in the window
  Then tracking stays stopped

Scenario: status after auto-start
  Given tracking started automatically at launch
  When the window asks for the tracking status
  Then it reports the activity the tracker currently holds

Scenario: saving a setting while tracking
  When I save the employee ID while tracking
  Then tracking is not stopped and restarted
```

**A-6-T1** · Hat: FEATURE · Tier: X · Run: AFK
- Goal: make the tracker the only source of tracking state; remove the copy in `appState.tracking`.
- Deliverables: tests for start, stop, toggle and status with a fake tracker toggled from outside the handler.
- Verify: `npx jest --config jest.baseline.config.js -t "tracking state"`, red before.
- Do not touch: tracker internals; tray menu layout.
- Shortcuts: none.
- Pull gate: none beyond A-5. Unblocks: A-6-T2. Confidence: High.

**A-6-T2** · Hat: FEATURE · Tier: V · Run: AFK
- Goal: stop restarting the tracker on every settings save; restart only when a tracking setting changed.
- Deliverables: test that a save with unchanged tracking settings calls neither stop nor start.
- Verify: `npx jest --config jest.baseline.config.js -t "settings save does not restart"`, red before.
- Do not touch: the settings schema (B-2).
- Pull gate: A-6-T1. Unblocks: A-7. Confidence: High.

### A-7 — Sleep and lock time is not counted

As the owner I want time with the lid closed left out so that an activity does not grow by a lunch break.
Value: High. Priority: M, likely but not observed. Size: M. DoR: READY once AS-2 is confirmed.

```gherkin
Scenario: computer sleeps for an hour
  Given an activity is being tracked
  When the computer suspends for 60 minutes and resumes
  Then at most one sampling interval is added to the activity

Scenario: screen locked
  When the screen is locked for 20 minutes
  Then that time is not added to any activity

Scenario: a long gap with no power event
  Given no suspend event was received
  When a sample arrives more than 5 minutes after the previous one
  Then only one sampling interval is credited and the gap is logged
```

**A-7-T1** · Hat: FEATURE · Tier: X · Run: AFK
- Goal: save and pause on suspend and lock, resume on resume and unlock, and cap the time one sample can credit.
- Deliverables: tracker tests with a fake clock and fake power events; power-event wiring; a named constant for the cap.
- Verify: `npx jest --config jest.baseline.config.js -t "sleep"`, red before.
- Do not touch: idle detection thresholds and the idle prompt (B-4); the midnight rollover logic.
- Shortcuts: Allowed: no user prompt for the gap. Forbidden: crediting the gap to the next activity.
- Pull gate: confirm the defect first with a test that advances the fake clock by an hour; if it already credits one interval, close the story with that test only. AS-2 confirmed.
- Unblocks: A-8. Confidence: Med.

### A-8 — Storage does not drop activities silently

As the owner I want nothing removed unless I asked so that old or short entries do not vanish.
Value: Med. Priority: M. Size: S. DoR: READY.

```gherkin
Scenario: a short manual entry
  When I add a manual entry of 30 seconds
  Then it is stored

Scenario: saving does not remove other activities
  Given stored activities shorter than the minimum duration
  When any activity is saved
  Then those activities are still stored

Scenario: the activity limit
  Given the store holds the maximum number of activities
  When another is saved
  Then nothing is deleted and a warning is logged

Scenario: clear old data matches its preview
  Given the dialog says N activities will be removed
  When I confirm
  Then exactly N are removed
```

**A-8-T1** · Hat: FEATURE · Tier: V · Run: AFK
- Goal: apply the minimum duration only when the tracker decides whether to save; remove the truncation; make clear-old use the same date rule as its preview.
- Deliverables: storage tests for the first three scenarios; a handler test for clear-old, which lives in the `clear-old-activities` handler.
- Verify: `npx jest --config jest.baseline.config.js -t "does not drop"`, red before.
- Do not touch: consecutive-activity merging; retention (LT3-601, #31).
- Shortcuts: Allowed: keep the limit as a logged warning. Forbidden: deleting anything on save.
- Pull gate: A-5 merged. Unblocks: A-9. Confidence: High.

### A-9 — Smoke: a tracked activity is visible in the packaged app

As the maintainer I want the harness to catch a repeat of A-2 so that the tests fail when records stop appearing.
Value: Med. Priority: M. Size: S. DoR: READY.

```gherkin
Scenario: seeded tracked activity
  Given the harness user data holds a tracked activity for today with numeric times
  When the packaged app starts
  Then the Timer list shows that activity with its duration
  And the log contains no "invalid response"
```

**A-9-T1** · Hat: FEATURE · Tier: V · Run: AFK
- Goal: add the seeded-activity check to the packaged-app harness.
- Verify: `npm run test:app -- -g "tracked activity is listed"`.
- Do not touch: harness isolation of user data (LT3-005).
- Deliverables: one harness test. It creates its own temporary user-data folder and writes a plain `config.json` there before the first launch; a plain file is only adopted when no key file exists yet, so the shared harness profile cannot be used.
- Shortcuts: Allowed: seeding through that data folder. Forbidden: a test-only IPC channel.
- Pull gate: A-2, A-3 merged. It may be pulled forward to run straight after A-3, which then protects A-4 to A-8. Unblocks: END OF EPIC A; then retrospective and B-1.

---

## EPIC B — The screens do what they say

- **Objective:** every control on the Timer, Timeline and Settings screens either works or is gone.
- **Tracer bullet:** no.
- **Mode:** DELIVERY
- **Definition of Done:** no control in the app calls a missing API or `prompt()`; every setting shown survives a restart; the harness covers save, edit and manual entry (B-12).
- **Checks the harness cannot make:** the harness keeps tracking off, so the idle prompt (B-4) and the project switcher (B-5) are checked in main by tests and on screen by the owner in an installed build. Those two stories are HITL for that last step.
- **Business value:** the owner can trust what the screen reports. Measure: stories of this epic still open, 12 at the start, target 0.
- **Risks:** Low — renderer has no unit tests (TD-2); mitigation: harness checks per story where a flow changes.
- **SLO:** none new.
- **ADRs:** none.
- **Smoke test story:** B-12.
- **Runbook:** `docs/TROUBLESHOOTING.md`.
- **UI:** new dialogs and states follow `docs/design/first-release/README.md`: flat surfaces, one accent, plain labels.

### B-1 — Saving settings reports what happened

As the owner I want "Settings saved" when they are saved, and the reason when they are not.
Value: Med. Priority: H, every save shows a false error. Size: S. DoR: READY.

```gherkin
Scenario: successful save
  When I change a setting
  Then I see "Settings saved"

Scenario: invalid value
  When I set the work day end before its start
  Then I see "Work day end time must be after start time"
```

**B-1-T1** · Hat: FEATURE · Tier: V · Run: AFK
- Goal: read `success` and `errors` from the save result.
- Verify: `npm run test:app -- -g "settings saved"`, red before.
- Do not touch: the settings schema (B-2).
- Pull gate: A-6 merged. Unblocks: B-2. Confidence: High.

### B-2 — Every setting on the screen persists, and main's settings have controls

As the owner I want the consolidation, week start, idle and minimum-duration settings to take effect.
Value: Med. Priority: M. Size: M. DoR: READY.

```gherkin
Scenario Outline: a setting survives a restart
  When I set <setting> to <value> and restart the app
  Then <setting> shows <value>
  Examples:
    | setting                | value   |
    | consolidate activities | off     |
    | consolidation mode     | strict  |
    | week starts on         | Sunday  |
    | idle threshold         | 600 s   |
    | minimum duration       | 30 s    |

Scenario: out-of-range value
  When I set the idle threshold to 10 seconds
  Then the save is refused with the allowed range
```

**B-2-T1** · Hat: FEATURE · Tier: X · Run: AFK
- Goal: add `consolidateActivities`, `consolidationMode` and `weekStartDay` to the Settings schema, the save payload and the load; add controls for idle threshold and minimum activity duration.
- Deliverables: contract tests for the new keys; settings screen changes; a harness test that sets a value, restarts the app and reads it back.
- Verify: `npx jest --config jest.baseline.config.js -t "settings round trip"`, red before; then `npm run test:app -- -g "setting survives restart"`.
- Do not touch: `smartSamplingEnabled`, `trackFocusSessions`, `mergeGapThreshold`, retention settings (no control planned; LT3-601 owns retention).
- Shortcuts: Forbidden: making the Settings schema loose.
- Pull gate: B-1 merged. Unblocks: B-3. Confidence: High.

### B-3 — Timer and Timeline each keep their own list and refresh after a change

As the owner I want an edit or delete to show at once on the screen I am on.
Value: Med. Priority: M. Size: M. DoR: READY.

```gherkin
Scenario: edit on the Timeline for another day
  Given the Timeline shows last Monday
  When I open an activity, change it and save
  Then the dialog opens without "Activity not found"
  And the Timeline row shows the change

Scenario: delete on the Timeline
  When I delete a row on the Timeline
  Then the row disappears

Scenario: change made by main
  When main reports that activities changed
  Then the visible view reloads its list
```

**B-3-T1** · Hat: FEATURE · Tier: X · Run: AFK
- Goal: give the Timeline its own activity list; refresh the active view after a write; subscribe to `activities-updated` through the preload.
- Verify: `npm run test:app -- -g "timeline refreshes"`, red before.
- Do not touch: timeline rendering and keyboard handling; merge logic.
- Pull gate: A-4 merged. Unblocks: B-4, B-7. Confidence: Med.

### B-4 — Returning from idle asks what to do with the time

As the owner I want to say whether I was working while away so that meetings away from the desk can be counted.
Value: Med. Priority: M. Size: M. DoR: READY.

```gherkin
Scenario: back after 12 minutes
  Given tracking paused after the idle threshold
  When I return after 12 minutes
  Then a prompt offers "Count as work" and "Leave out"

Scenario: count as work
  When I choose "Count as work"
  Then the idle period is added to the activity that was paused

Scenario: timer while paused
  While tracking is paused for idle
  Then the timer shows "Paused" and does not advance

Scenario: short absence
  When I return after 2 minutes
  Then no prompt is shown
```

**B-4-T1** · Hat: FEATURE · Tier: X · Run: AFK
- Goal: pass `tracking-paused` and `idle-return` through the preload, show the prompt, call the existing idle decision channel; make the decision find the paused activity by id.
- Deliverables: idle-decision tests in main (the current match on `idleStartTime` fails for a resumed activity); prompt in the renderer.
- Verify: `npx jest --config jest.baseline.config.js -t "idle decision"`, red before.
- Do not touch: sleep and lock handling (A-7); the idle threshold setting (B-2).
- Shortcuts: Allowed: leave `idle-warning` unsubscribed. Forbidden: `prompt()` or `confirm()` for this dialog.
- Pull gate: A-7 and B-3 merged. Unblocks: B-5. Confidence: Med.

### B-5 — Switch project while tracking (#41)

As the owner I want to move the running activity to another project.
Value: Med. Priority: M. Size: M. DoR: HOLD.

Gap: PR #57 (open since 2026-10-08) closes #41 the other way, by removing the switcher, on the grounds that the first-release Day screen replaces the Timer. The owner must choose: merge #57 and drop this story, or close #57 and build it as below.

```gherkin
Scenario: switch while tracking
  Given an activity is tracked under "General"
  When I switch to "Atlas"
  Then the tracked activity's project is "Atlas" and the badge shows "Atlas" on the next update

Scenario: the app in front changes
  Given I switched to "Atlas"
  When another app comes to the front
  Then that app is tracked under its own project

Scenario: not tracking
  When I open the switcher while stopped
  Then it is disabled

Scenario: the list of projects
  When I open the switcher
  Then it lists all projects, not only today's
```

**B-5-T1** · Hat: FEATURE · Tier: X · Run: AFK
- Goal: add a `tracking:switch-project` channel and a tracker override for the current activity.
- Required interfaces: new contract entry: one project name argument, tracking state result.
- Verify: `npx jest --config jest.baseline.config.js -t "switch project"`, red before.
- Do not touch: mapping rules (LT3-301, #21); Salesforce case memory.
- Idempotency: switching to the current project is a no-op.
- Pull gate: A-6 merged; AS-6 confirmed. Closes #41. Unblocks: B-6. Confidence: Med.

### B-6 — No control depends on `prompt()`

As the owner I want Mark break, project Edit and rule Test to open a real dialog.
Value: Med. Priority: M. Size: M. DoR: READY.

```gherkin
Scenario Outline: the control opens a dialog
  When I use <control>
  Then a dialog with labelled fields, Save and Cancel opens
  Examples:
    | control                 |
    | Mark break              |
    | Ctrl+Shift+B            |
    | Settings > Project Edit |
    | Rule Test               |

Scenario: cancel
  When I cancel the dialog
  Then nothing is saved
```

**B-6-T1** · Hat: FEATURE · Tier: X · Run: AFK
- Goal: replace the six `prompt()` calls with dialogs built on the existing modal pattern.
- Verify: `npm run test:app -- -g "no prompt"` (the test fails if `window.prompt` is called), red before.
- Do not touch: project storage rules (system projects cannot be renamed).
- Shortcuts: Allowed: one shared small-form dialog. Forbidden: new dependencies.
- Pull gate: confirm in the packaged app that `prompt()` does nothing; if it works, close the story with the harness test only. Unblocks: B-7. Confidence: Med.

### B-7 — The tag editor opens on the row I clicked

Value: Low. Priority: M. Size: S. DoR: READY.

```gherkin
Scenario: tags on the Timeline
  When I choose Tags on a Timeline row
  Then the editor appears under that row

Scenario: ticking a tag on the Timer
  When I tick a tag in the editor
  Then the Edit dialog does not open
```

**B-7-T1** · Hat: FEATURE · Tier: V · Run: AFK
- Goal: pass the clicked row to the tag editor and ignore clicks inside it in the row handler.
- Verify: `npm run test:app -- -g "tag editor"`, red before.
- Do not touch: tag storage and sanitising.
- Pull gate: B-3 merged. Unblocks: B-8. Confidence: High.

### B-8 — Project, tag and activity-type controls act once

Value: Low. Priority: M. Size: S. DoR: READY.

```gherkin
Scenario: new project after visiting Settings
  Given I opened Settings earlier
  When I add a project from "+ New project"
  Then the project is added

Scenario: add a tag after opening Settings three times
  When I add a tag
  Then one tag is added and one confirmation is shown on removal
```

**B-8-T1** · Hat: FEATURE · Tier: V · Run: AFK
- Goal: make the Settings field ids unique and guard the tag and activity-type managers against repeated wiring, as the project manager is.
- Verify: `npm run test:app -- -g "acts once"`, red before.
- Do not touch: the project dialog markup in `index.html` beyond ids.
- Pull gate: B-6 merged (same project controls). Unblocks: B-9. Confidence: High.

### B-9 — SAP export: employee ID and history

Value: Low. Priority: L. Size: S. DoR: READY.

```gherkin
Scenario: typed but not saved employee ID
  Given I typed an employee ID and did not press Save
  When I export
  Then the export uses the typed ID

Scenario: history
  When an export completes
  Then the export history lists it with date, period and row count
```

**B-9-T1** · Hat: FEATURE · Tier: V · Run: AFK
- Goal: read the employee ID field at export time; call the existing history functions after an export and on load.
- Verify: `npm run test:app -- -g "export history"`, red before.
- Do not touch: `sap-csv.ts` and the CSV layout (LT3-302, #22); immutable export runs (LT3-303, #23) replace this history later.
- Shortcuts: Allowed: history stays in renderer storage. Forbidden: storing row contents in it.
- Pull gate: none. Unblocks: B-10. Confidence: High.

### B-10 — Backup is complete and the calendar URL can be removed

Value: Low. Priority: L. Size: S. DoR: READY.

```gherkin
Scenario: backup summary
  When I create a backup
  Then the summary shows the number of projects and tags
  And the file includes Salesforce case mappings

Scenario: remove the calendar
  When I choose Remove next to the calendar URL
  Then the URL is cleared and meetings are no longer shown
```

**B-10-T1** · Hat: FEATURE · Tier: V · Run: AFK
- Goal: use the `all` lists for counts, add case mappings to the backup, add a Remove control for the calendar URL.
- Verify: `npm run test:app -- -g "backup summary"`, red before.
- Do not touch: restore (removed in #40; LT3-105, #16 owns it).
- Pull gate: A-3 merged. Unblocks: B-11. Confidence: High.

### B-11 — Tray, toasts and help match the app

Value: Low. Priority: L. Size: S. DoR: READY.

```gherkin
Scenario: tray Settings
  When I choose Settings in the tray menu
  Then the window opens on the Settings view

Scenario: two errors at once
  When two requests fail together
  Then both messages are shown

Scenario: help
  Then the help view describes no shortcut or feature that is absent from an installed build
```

Three small tasks, one PR.

**B-11-T1** · Hat: FEATURE · Tier: V · Run: AFK
- Goal: subscribe to `open-settings`, and show today's total in the tray menu item.
- Verify: `npm run test:app -- -g "tray settings"` (the test sends `open-settings` from main), red before.
- Do not touch: the updater events. Unblocks: B-11-T2.

**B-11-T2** · Hat: FEATURE · Tier: V · Run: AFK
- Goal: stack toasts and honour their duration.
- Verify: `npm run test:app -- -g "two errors"`, red before.
- Do not touch: the error states from A-3. Unblocks: B-11-T3.

**B-11-T3** · Hat: FEATURE · Tier: V · Run: HITL
- Goal: correct `help.js` and delete the unused `help.md`.
- Verify: the owner reads the help view in an installed build and finds no shortcut or feature that is absent.
- Do not touch: the manual in `docs/`. Unblocks: B-12. Confidence: High.

### B-12 — Smoke: save, edit and manual entry in the packaged app

Value: Med. Priority: M. Size: S. DoR: READY.

```gherkin
Scenario: the main flows
  Given the packaged app with a seeded tracked activity
  When I change a setting, change the activity's project, and add a manual entry for yesterday
  Then "Settings saved" is shown
  And the activity keeps its duration
  And the manual entry is listed under yesterday
```

**B-12-T1** · Hat: FEATURE · Tier: V · Run: AFK
- Goal: add the three flows to the packaged-app harness.
- Verify: `npm run test:app -- -g "main flows"`.
- Do not touch: harness isolation (LT3-005).
- Pull gate: B-1, A-4, A-5 merged. Unblocks: END OF EPIC B; then retrospective, update `docs/handover/STATUS.md`, return to LT3-102 (#13).

---

## Not yet specified

- **Browser extension keeps its pairing after the service worker restarts.** Hangs on a check in a real browser (also item 4 under "Waiting on the owner"). Graduates after the owner pairs once and reports whether "Not connected" returns.
- **Extension: "Open LightTrack", Firefox claim, GitLab and Azure DevOps context.** Hangs on whether the extension is in the first release. Graduates with the B retrospective.
- **Break reminders in main.** They run in the renderer only, so not when the window is hidden. Hangs on whether reminders are wanted at all.
- **Updates screen.** In-app updates are off by policy; the unused updater API stays until LT3-603 (#33).
- **Restore, import, retention.** Already LT3-104 (#15), LT3-105 (#16), LT3-601 (#31).
- **Tracked activity as real time blocks** instead of one resumed span per app, project and day. LT3-401 (#25).
- **Minimum window width 1024 px** (owner decision; the window still allows 800) and the removed `crashed` window event. Small; fold into the design work of Increment C unless they bite sooner.
