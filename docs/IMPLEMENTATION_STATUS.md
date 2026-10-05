# Requirements implementation status

This file records how the 2026-10-05 requirements and development plan apply to this repository.

## Repository decision

[ADR 0002](adr/0002-adopt-lighttrack-v3-as-canonical.md) makes `LightTrack_v3` the canonical repository and supersedes ADR 0001. The [development plan](LIGHTTRACK_V3_DEVELOPMENT_PLAN.md) is executed here incrementally. `PolycarpusTack/lighttrack` is kept as a reference archive.

## Completed in LightTrack v3

These changes exist in the working tree and must be committed before CI runs against them.

- Windows-only support policy, contribution guidance and security policy are documented.
- CI uses Node 22 and supported GitHub Actions on `windows-latest`.
- `npm ci`, lint, focused baseline tests, dependency audit, application build and unsigned NSIS packaging form the release gate.
- The stale NSIS include was removed.
- npm scripts are Windows-only and shell-independent; `.nvmrc` pins Node 22 (LT3-009).
- SAP export rows are built in the main process without raw titles and with formula-injection escaping (LT3-007).
- The calendar URL is stored protected, the data-file key has no guessable fallback, and in-app updates are off until releases are signed (LT3-008).
- Direct dependencies were updated; `npm audit --audit-level=moderate` reports zero vulnerabilities.
- Duplicate `services` tracker and window manager removed; `src/main/core` is the only capture and window path (LT3-002, see below).
- Privacy boundaries explicitly reject screenshots, OCR, keystroke logging and claims about remote RDP contents.

## Not yet done

See section 4 of the development plan. In particular, no check launches the packaged application, and the existing smoke test exercises mocks rather than application code.

## LT3-002 retirement record

The inactive `src/main/services/activityTracker.js` and `src/main/services/windowManager.js` were removed together with their legacy tests (`test/unit/services/`). The active path is `src/main/core`. Calendar sync, which was active, moved unchanged to `src/main/integrations/calendar/calendar-sync-service.js`.

Behaviour that only the removed files had, and what happened to it:

| Behaviour | Decision | Reason |
|---|---|---|
| Splash, floating-timer, help and "character sheet" windows | Retired | Their pages (`splash.html`, `floating-timer.html`, `help.html`, `character-sheet.html`) do not exist in the repository and no IPC channel opens them. The renderer already has an in-page splash, floating timer and help dialog. |
| Separate dialog windows (manual entry, edit activity, settings) | Retired | Their pages do not exist; the renderer uses in-page modals. |
| Per-project `billable` flag read from project mappings | Retired | The active path marks time non-billable from title patterns and manual edits. A versioned billing flag returns with the project master (LT3-201). |
| Structural validation of an activity before saving | Retired | Validation moves to the IPC contract (LT3-003) and the repositories (LT3-102). |
| "Activity saved" notification with experience points | Retired | Gamification is out of scope for the product. |

Project detection from Jira keys and URL mappings, non-billable patterns, activity merging, idle handling, browser context and save de-duplication are already provided by `core/activity-tracker.js` and `core/title-parser.js`.

## Planned in this repository

The following work, previously assigned to `PolycarpusTack/lighttrack`, is now planned here:

- SQLite schema, migrations and v3 import.
- TypeScript domain models for projects, SAP references, mapping rules, worklogs, allocations, export profiles and immutable export runs.
- Approval states, audit history, weekly review and unassigned-activity inbox.
- First-class RDP events and allocation workflow.
- Jira, Salesforce, calendar and browser enrichment under explicit consent.
- Backup/restore, retention controls and organisation deployment.

## Inputs still required

- An anonymised SAP target file or exact column-level import specification.
- The authoritative project-master source and applicable SAP identifiers.
- The RDP clients used in practice and whether IT can deploy a remote-side collector.
- Jira outbound-worklog policy and Salesforce connected-app/privacy approvals.
- A code-signing certificate and release-channel policy.

GitHub P0/P1 issues are created in this repository.
