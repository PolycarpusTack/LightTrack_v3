# LightTrack v3 — In-Repository Development Plan

**Status:** Accepted (ADR 0002)  
**Repository:** `PolycarpusTack/LightTrack_v3`  
**Primary platform:** Windows 11 x64  
**Prepared:** 2026-10-05  
**Planning horizon:** First usable accounting release, followed by integrations and organisation rollout

## 1. Purpose

This plan turns `LightTrack_v3` into the implementation repository for a local-first timesheet-assistance product. It covers the migration from raw local activity to reviewable worklogs that are booked in SAP through Timmy ([ADR 0003](adr/0003-submit-worklogs-to-sap-through-timmy.md)), while preserving the product's privacy boundary:

```text
raw activity -> mapping / enrichment -> draft worklog -> user approval -> submission to Timmy -> SAP booking (in Timmy)
```

LightTrack is not a productivity-scoring or employee-surveillance product. Screenshots, OCR, keystroke logging, leaderboards and unsupported claims about work inside an RDP session are outside scope.

## 2. Planning problem and repository decision

The repository currently contains a working Electron/JavaScript application with:

- active-window capture and idle handling;
- `electron-store` persistence;
- project, tag, calendar and SAP-oriented UI concepts;
- two inactive duplicates under `src/main/services` (`activityTracker.js`, `windowManager.js`) alongside the active `src/main/core` path;
- a large renderer (`index.html` about 1,100 lines, `app.js` about 3,700 lines) plus eleven global-script modules of about 6,800 lines, under a Content Security Policy;
- a preload bridge exposing about 78 named `invoke` methods with no generic passthrough and no runtime DTO validation;
- a repaired Windows build, audit and focused test baseline;
- a broad legacy test suite that references removed modules and cannot currently serve as a release gate.

There is no RDP-specific code, Jira support is limited to regex issue-key parsing and browser-extension context with no API calls, and there is no Salesforce integration.

### Decision gate R0 — resolved

R0 is resolved by [ADR 0002](adr/0002-adopt-lighttrack-v3-as-canonical.md), which supersedes [ADR 0001](adr/0001-canonical-repository-and-migration-boundary.md): `LightTrack_v3` is the canonical repository and is modernised in place. `PolycarpusTack/lighttrack` is kept as a reference archive.

Work proceeds incrementally. A big-bang rewrite would put working capture and export behavior at unnecessary risk.

## 3. Product principles

1. Raw activity is evidence, never an approved time entry.
2. Users review and approve every submitted allocation.
3. Original evidence is immutable; corrections create allocations and audit records.
4. RDP is represented honestly as a lower-confidence `remote_session`.
5. SAP bookings go through Timmy. LightTrack never holds SAP credentials; the CSV export is an offline fallback.
6. Jira and Salesforce provide context; LightTrack does not duplicate their workflows.
7. Capture, review and approval continue to work offline; submissions wait until Timmy is reachable.
8. Privacy controls are designed before integrations broaden the captured data.

### Owner decisions (2026-10-05)

| Topic | Decision | Where |
|---|---|---|
| Canonical repository | `LightTrack_v3` | ADR 0002 |
| SAP route | Through Timmy; no SAP credentials on desktops | ADR 0003 |
| Database | SQLite via `sql.js`, atomic saves, file encrypted with the protected key | ADR 0004 |
| Worklog model | Time blocks; daily booking lines derived | ADR 0005 |
| Rounding | Per-user setting, default nearest 15 minutes, applied to booking lines | ADR 0005, LT3-204 |
| TypeScript | Full adoption, main process and renderer | 6.1, LT3-006 |
| Raw-evidence retention | Chosen by the user at first run, default 1 year | LT3-601 |
| Code signing | Releases stay unsigned; in-app updates stay off; manual installs from GitHub releases | LT3-603 |
| First release hand-off | CSV export of approved booking lines (LT3-302/303); Timmy submission follows after the first release | First release scope, LT3-304 |
| Jira | Outbound worklogs allowed, always with review | LT3-501 |
| RDP clients | `mstsc.exe` and Windows App | LT3-402 |
| Salesforce | Kept, after Jira | LT3-502 |

## 4. Current baseline

### Completed

Every item below exists only as uncommitted working-tree changes (CI workflows, `test/baseline`, `SECURITY.md`, `CONTRIBUTING.md`, `docs/SUPPORTED_PLATFORMS.md`, the ADRs and `package.json` changes). The baseline must be committed before CI runs against it.

- [x] Node 22 baseline (`engines` `node>=22`) and CI/CD workflows on `windows-latest` with Node 22.x.
- [x] Reproducible `npm ci`.
- [x] ESLint gate passes. The ruleset is only `eslint:recommended` and `browser-extension/` is excluded.
- [x] Focused baseline tests: four tests in `test/baseline/core.test.js`. The sandbox check is a string match against source, not a runtime check.
- [x] Dependency audit reports zero vulnerabilities at moderate severity.
- [x] NSIS installer builds successfully.
- [x] `SECURITY.md`, contribution guidance and supported-platform policy.
- [x] Active runtime path identified as `src/main/core`, wired by `src/main/index.js`.
- [x] Repository decision recorded in ADR 0002.
- [x] Renderer restyled to shared design tokens; inline styles removed so the CSP no longer blocks them.

### In progress / not yet done

- [x] Packaged application launch check and application test (LT3-005): CI launches the packaged app in an isolated profile and drives a manual entry through SAP export and restart. The mock-only smoke test was removed.
- [x] Windows-only packaging and scripts (LT3-009): macOS/Linux targets and dead scripts removed, `dev` and `build:prod` work in cmd and PowerShell via `scripts/with-env.js`, `.nvmrc` pins Node 22.

### Known baseline debt

| Debt | Strategy | Reason |
|---|---|---|
| Inactive `services/activityTracker.js` and `services/windowManager.js` | Eliminate early | They are loaded only by legacy tests in `test/unit/services/`, so changes risk landing in the inactive path. `services/windowManager.js` also provides windows the active path lacks (splash, floating timer, "character sheet", help) and does not sandbox them. `services/calendarSyncService.js` is active and unique, not a duplicate. |
| Monolithic renderer and implicit globals | Reduce incrementally | Full rewrite has high principal; new features need explicit module boundaries. |
| `electron-store` activity persistence | Replace | It cannot provide relational integrity, indexed queries or auditable transactions. |
| Storage key and secrets at rest | Fix in Phase 0 | `core/lightweight-storage.js` wraps the key with `safeStorage` but falls back to a derivable key; there is no encryption outside production. The calendar ICS URL, often a secret, is stored in plain `electron-store`. |
| Stale legacy tests | Reduce, then eliminate quarantine | They obscure useful failures and refer to removed components. |
| Hard-coded SAP assumptions | Isolate, then replace | Header, quoting, delimiter, line endings and "SAP ByDesign" are fixed in `ipc/handlers/activitiesHandlerMain.js`; grouping, rounding, a `Development` default and raw window titles in Work Description are fixed in `renderer/js/modules/sap-export.js`. The main process trusts renderer-aggregated rows and does not guard against CSV formula injection. A real target specification is still missing. |
| Browser-extension token distribution | Harden before broader use | The endpoint binds to `127.0.0.1` and requires a bearer token, but `GET /status` returns the per-launch token to any caller with an extension-style `Origin` header, which any local process can forge. |
| Auto-update of unsigned releases | Disable until signing exists | `auto-updater.js` configures a feed URL and automatic install while releases are unsigned. |
| Minimal lint coverage | Strengthen incrementally | Only `eslint:recommended` applies and `browser-extension/` is not linted. |

## 5. Delivery strategy

The work is divided into outcome-based increments. Each phase must leave the application usable; higher-level dates are not forecast until the team has at least five completed items of comparable size and stable throughput data.

| Phase | Outcome | Depends on |
|---|---|---|
| R0. Repository decision | Resolved: `LightTrack_v3` is canonical (ADR 0002) | None |
| 0. Stabilize architecture | One runtime path, enforceable security boundaries, safe current export, Windows-only scripts, TypeScript toolchain, trustworthy gates | R0 |
| 1. Persistence foundation | SQLite schema, migrations and transactional repositories | Phase 0 |
| 2. Safe v3 migration | Existing data can be exported, migrated, verified and rolled back | Phase 1 |
| 3. Accounting core | Projects, SAP references, worklogs, allocations, states and audit history | Phase 2 |
| 4. Review workflow | Evidence inbox, timeline, daily/weekly review, rules and approval | Phase 3 |
| 5. SAP export | Versioned profile, validation, preview and immutable export runs | Phase 3 |
| 6. RDP experience | Honest remote-session capture and user allocation | Phase 4 |
| 7. Jira and Salesforce | Optional, consented worklog context | Phases 3–5 |
| 8. Operational maturity | Backup, retention, diagnostics, signing and rollout governance | Phases 5–7 |

Phases 4 and 5 may overlap after the accounting domain is stable. Integration work must not delay the first offline accounting release.

## 6. Architecture target

### 6.1 TypeScript adoption

The whole application moves to TypeScript, main process and renderer (owner decision, 2026-10-05). The Electron shell stays releasable throughout; modules move in vertical slices:

```text
src/
  main/
    capture/
    persistence/
    mapping/
    worklogs/
    exports/
    integrations/
    windows/
    ipc/
  preload/
  renderer/
  shared/
    domain/
    dto/
    errors/
```

New code is TypeScript from LT3-006 onwards. Existing JavaScript is migrated module by module, starting with the main process (IPC contract, persistence, domain) and then the renderer, which gets a bundler and ES modules in place of ordered global scripts. Runtime DTOs are validated before crossing IPC or integration boundaries; types alone are not trusted at runtime.

### 6.2 Active runtime path

`src/main/core` is the migration source because it is used by `src/main/index.js`. The inactive `src/main/services/activityTracker.js` and `src/main/services/windowManager.js` must be removed after their behavior is either covered by tests, ported or deliberately discarded. `src/main/services/calendarSyncService.js` is active and moves to `src/main/integrations/calendar`. There must be one window manager and one capture coordinator.

### 6.3 SQLite ownership

The main process owns the database. Renderer processes never open SQLite directly. Repositories expose narrow application services through an allowlisted preload API.

Required database properties:

- numbered, forward-only migrations;
- foreign keys enabled;
- transactions for state transitions, allocations and export creation;
- indexes on activity/worklog dates, project IDs, states and export membership;
- UTC timestamps plus explicit local date/time-zone information where accounting rules require it;
- tested backup, restore and integrity checks;
- no OAuth secrets or encryption keys stored as plain database fields.

### 6.4 Core entities

| Entity | Essential responsibility |
|---|---|
| `raw_activity` | Immutable captured or manually supplied source evidence |
| `activity_revision` | Redaction or metadata changes without overwriting original evidence |
| `project` | Client/project identity, status, validity and presentation |
| `project_code_version` | Historical SAP booking reference (project element ID, service product ID) with effective dates |
| `mapping_rule` | Ordered, explainable attribution conditions and result |
| `worklog` | User-reviewed time entry and lifecycle state |
| `allocation` | Links one or more worklogs to portions of raw evidence |
| `worklog_audit` | Actor, timestamp, before/after values and reason |
| `export_profile` | Versioned field, format, grouping and validation rules |
| `export_run` | Immutable profile version, selection, hash and generated rows (CSV fallback) |
| `submission` | Immutable record of worklogs sent to Timmy: payload, `external_id`, Timmy entry ID and status |
| `integration_link` | Jira/Salesforce context selected by the user |
| `rdp_default` | Per-connection default project/activity configuration |

## 7. Prioritized backlog

Items are ordered by risk reduction and usable outcomes. Estimates must be added by the delivery team during refinement; they are intentionally not expressed as hours or promises here.

### P0 — repository and architecture safety

#### LT3-001 — Align repository documentation with ADR 0002

**Outcome:** contributors have one authoritative repository decision.

**Status:** acceptance criteria met except issue creation.

Acceptance criteria:

- [x] ADR 0001 is superseded by ADR 0002.
- [x] The README, contribution policy, security policy and implementation-status document agree with the decision.
- [ ] GitHub P0/P1 issues are created in this repository.

#### LT3-002 — Remove duplicate runtime implementations

**Status:** done; decisions recorded in `docs/IMPLEMENTATION_STATUS.md` (LT3-002 retirement record). The application-harness criterion follows LT3-005.

**Outcome:** capture and window behavior have one code path.

Acceptance criteria:

- `src/main/services/activityTracker.js` and `src/main/services/windowManager.js` are removed; runtime imports reference only the `src/main/core` tracker and window manager.
- For each window that only `services/windowManager.js` provides (splash, floating timer, "character sheet", help), a decision to retire it or port it to `core/window-manager.js` is recorded. Ported windows use context isolation, disabled Node integration and sandboxing.
- `src/main/services/calendarSyncService.js`, which is active, moves to `src/main/integrations/calendar` without behaviour change.
- The legacy tests in `test/unit/services/` are deleted. Behaviour still required is covered by tests against the active path or recorded as intentionally retired.
- Lint, baseline tests and the installer build remain green, as does the application harness once LT3-005 lands.

#### LT3-003 — Introduce a typed, allowlisted IPC contract

**Outcome:** renderer access is narrow and validated.

**Dependency:** LT3-006.

The preload bridge currently exposes about 78 named `invoke` methods through `contextBridge`, without a generic passthrough but also without runtime DTO validation.

Acceptance criteria:

- Every exposed preload method maps to a documented IPC channel.
- Request and response DTOs are runtime-validated.
- Unknown channels and invalid payloads are rejected with explicit error types.
- Renderer windows retain context isolation, disabled Node integration and sandboxing.

#### LT3-004 — Harden the browser-extension endpoint

**Status:** done. Pairing with a desktop-shown code (`src/main/integrations/browser/extension-pairing.js`), hashed origin-bound tokens, timing-safe comparison, JSON content-type and schema checks, no titles/URLs/tokens in logs, revocation in Settings, `browser-extension/` linted. Tests: `test/baseline/extension-pairing.test.js`.

**Outcome:** only a paired browser extension can supply browser context.

The endpoint already binds to `127.0.0.1`, requires a bearer token and applies an origin allowlist, rate limiting and size limits. The token is generated per launch and returned by `GET /status` to any request with an extension-style `Origin` header, which any local process can forge.

Acceptance criteria:

- `GET /status` no longer returns the token. The extension obtains its credential through a pairing step: native messaging or a pairing code the user approves in LightTrack.
- Token comparison is timing-safe.
- Requests without the expected content type are rejected.
- Message payloads, including timestamps, are validated against a schema.
- Page titles, full URLs and tokens are absent from logs.
- Existing loopback binding, origin allowlist, rate limiting and size limits are retained.
- `browser-extension/` is included in the lint gate.
- Automated tests cover unpaired, forged-origin, wrong-token, wrong-content-type, oversized and schema-invalid requests.

#### LT3-005 — Replace the synthetic smoke test with an application harness

**Status:** done. `test/app/packaged-app.spec.js` (Playwright for Electron, `npm run test:app`) runs in CI after packaging. Harness mode (`LIGHTTRACK_HARNESS=1` with `LIGHTTRACK_USER_DATA`) isolates the profile and turns off the extension server, calendar sync and auto-tracking. Capture is not started; a manual entry is the stored raw event. The draft-worklog step follows LT3-202.

**Outcome:** CI verifies real application components.

The current `test/integration/smoke.test.js` exercises Jest mocks only and never imports application code.

Acceptance criteria:

- The harness uses Playwright for Electron, or an equivalent driver, on `windows-latest`.
- It launches the packaged application with an isolated `userData` directory.
- The browser-extension server and calendar sync are disabled for the run.
- Capture uses a mocked adapter, or the job provides an interactive desktop session; `active-win` needs a desktop session on CI.
- It initializes storage, saves a mock raw event and exports a fixture file; it creates a draft worklog once LT3-202 exists.
- It verifies the resulting records/file and exits cleanly.
- No production user profile or network service is touched.
- `test/integration/smoke.test.js` is removed.

#### LT3-006 — Add a TypeScript toolchain

**Outcome:** main process, preload and renderer can be written in TypeScript and packaged.

Acceptance criteria:

- TypeScript configurations for main/preload (CommonJS, Node) and renderer (bundled ES modules) with `strict` on; type-check and build steps in `scripts/build.js` and CI.
- The renderer is bundled (for example with Vite or esbuild) so modules replace the ordered global `<script>` tags; the CSP stays `script-src 'self'`.
- JavaScript and TypeScript modules coexist during migration; compiled output is what gets packaged.
- ESLint covers TypeScript files.
- One main-process module and one renderer module are migrated, packaged and exercised by the app harness to prove the path.

#### LT3-007 — SAP export hygiene

**Status:** done. Rows are built by `src/main/exports/sap-csv.js` for both preview and export; covered by `test/baseline/sap-csv.test.js` (golden file included).

**Outcome:** the current SAP CSV export does not leak raw evidence or trust renderer data, pending configurable profiles (LT3-302).

Acceptance criteria:

- Raw window titles are absent from exports by default. Work Description defaults to project and activity type, followed by any Jira keys detected for the row (for example `Project X - Development - PROJ-123, PROJ-456`, ASCII hyphens so the file reads correctly in any encoding); users can edit it per row in the preview. (Owner decision, 2026-10-05.)
- Rows are built in the main process from activity IDs (worklog IDs once they exist); the renderer supplies only the selection and options, not aggregated rows.
- Cells beginning with `=`, `+`, `-`, `@`, tab or carriage return are escaped against formula injection.
- Export request input is validated and invalid requests are rejected with explicit errors.
- A golden-file test covers the current format, including quoting and escaping.

#### LT3-008 — Secrets at rest and update safety

**Status:** done. Calendar URL protected, derived-key fallback replaced by fail-closed handling with one-time migration, in-app updates switched off entirely (the feed URL is not one this project controls). Installed builds now encrypt the data file (`app.isPackaged`); development runs do not (owner decision, 2026-10-05). Verified with a packaged build migrating an unencrypted profile. Tests: `test/baseline/secrets.test.js`.

**Outcome:** secrets are protected by the operating system and unsigned builds are not installed automatically.

Acceptance criteria:

- The calendar ICS URL is stored through `safeStorage`; existing plain values are migrated and removed.
- The derivable-key fallback in `core/lightweight-storage.js` is removed. If `safeStorage` is unavailable, storage fails closed or prompts the user.
- Whether non-production builds encrypt data is decided and documented.
- Automatic update installation is disabled until releases are signed (LT3-603).
- `SECURITY.md` documents secret storage and the update policy.

#### LT3-009 — Windows-only scripts and toolchain pinning

**Status:** done. Unused `conventional-changelog-cli` and `jsdoc` dev dependencies were removed with their scripts; `clean` no longer deletes `node_modules`.

**Outcome:** every npm script works on the supported platform.

Acceptance criteria:

- macOS and Linux build targets, `electron:build:all` and the multi-platform `release` path are removed from `package.json`.
- `dist:*`, `docs:api` and `changelog` are removed or fixed so they no longer refer to missing `scripts/dist/`, `jsdoc.conf.json` and `CHANGELOG.md`.
- `dev` runs in PowerShell and `cmd`, using `cross-env` or a Node launcher script.
- `.nvmrc` pins Node 22, consistent with `engines` and CI.

### P1 — persistence and migration

The application currently persists everything through `electron-store` (`core/lightweight-storage.js`); there is no SQLite dependency yet.

#### LT3-100 — SQLite/Electron packaging spike

**Status:** done. Decision: `sql.js` with atomic saves ([ADR 0004](adr/0004-sqlite-via-sqljs.md)); the packaged app opens, writes and reads a database in CI.

**Outcome:** a documented choice of SQLite driver that packages and runs on Windows.

**First candidate:** `sql.js` (SQLite compiled to WebAssembly, no native module). Writes must be atomic (temporary file, then rename). `better-sqlite3` is evaluated only if `sql.js` falls short on size, write latency or durability.

This is the largest packaging risk in the plan and is scheduled in Increment A, before any schema work.

Acceptance criteria:

- Candidate drivers are built against the project's Electron version and packaged in the NSIS installer on `windows-latest`.
- The packaged application opens, writes and reads a database in an isolated profile.
- The decision and its rebuild/packaging steps are recorded in an ADR.

#### LT3-101 — Add SQLite and migration infrastructure

**Dependency:** LT3-100, LT3-006.

Acceptance criteria:

- A fresh database applies all migrations in one transaction-safe sequence.
- Reopening an up-to-date database is idempotent.
- Migration failure leaves the prior database recoverable.
- Foreign keys and required indexes are verified by automated tests.

#### LT3-102 — Implement typed repositories

Acceptance criteria:

- Repositories exist for raw activity, projects, mapping rules, worklogs, allocations, audit records, profiles and export runs.
- Repository operations use transactions where multiple records must change atomically.
- Domain errors distinguish validation, conflict, not-found and persistence failures.
- Date-range queries have representative performance tests.

#### LT3-103 — Build a complete v3 export

Acceptance criteria:

- Export includes activities, mappings, projects, tags, settings relevant to migration and current schema version.
- Export never includes OAuth tokens, encryption keys or browser authentication tokens.
- A manifest contains counts and cryptographic hashes.
- Export can be created while integrations are offline.

#### LT3-104 — Import and verify v3 data

Acceptance criteria:

- Import is repeatable without duplicating source records.
- Source IDs, timestamps, durations, project allocations and SAP fields are preserved.
- Invalid records are reported without silently dropping valid records.
- Counts and hashes are reconciled against the export manifest.
- The original v3 store is retained until verification succeeds.

#### LT3-105 — Backup and restore SQLite

Acceptance criteria:

- Backup captures a consistent database snapshot and version manifest.
- Restore verifies integrity and compatibility before replacing active data.
- Failed restore leaves the current database unchanged.
- Recovery steps are documented and tested.

### P1 — accounting core

#### LT3-201 — Implement project and SAP reference master

**Model (ADR 0003):** a booking reference is a project element ID (Timmy `booking_code`, e.g. `PRD178-…`) plus a service product ID (Timmy `serviceId`, e.g. `P0940003` = Development). WBS element, cost centre and similar fields from the current export are not part of the SAP booking and are retired.

Acceptance criteria:

- Projects support client, name, status, validity dates and colour, and map to a project element ID and a default service product ID.
- Activity types are the SAP service products; booking codes and activity types are read from Timmy (request item 3) and cached for offline use. They are not copied into this repository.
- Code versions keep effective dates so approved and submitted worklogs retain the values they were booked with.
- Unknown, inactive or expired booking codes prevent approval and submission.
- Until Timmy provides the reference endpoints, codes can be entered manually with the same validation.

#### LT3-202 — Implement worklog lifecycle

Acceptance criteria:

- Valid states are `draft`, `approved`, `exported`, `rejected` and `superseded`.
- Invalid state transitions are rejected.
- Approval snapshots required project/SAP values.
- Changes to allocation, duration, context or state create audit records.
- Exported worklogs are not edited in place; corrections create superseding worklogs.

#### LT3-203 — Implement allocation and split/merge behavior

Acceptance criteria:

- One raw activity may be allocated across multiple worklogs.
- Allocated seconds cannot exceed available raw duration without an explicit manual adjustment.
- Split, merge and delete operations are transactional and audited.
- Overlap and gap warnings distinguish evidence gaps from approved manual time.

#### LT3-204 — Implement manual entry and weekly review

Acceptance criteria:

- Users can create, edit, pause/resume, split, merge and delete draft time.
- Daily, weekly and inbox views share the same underlying worklog data.
- Bulk edits and copy-previous-week actions show a preview before saving.
- Billable/non-billable and internal/client classifications are accounting fields, not performance scores.
- Booking lines are derived per day, booking code and activity type (ADR 0005) and rounded by a per-user setting (default nearest 15 minutes); review shows rounded and unrounded totals.

### P1 — mapping and SAP export

#### LT3-301 — Implement ordered, explainable mapping rules

Acceptance criteria:

- Conditions support application, title, local URL/domain, Jira key, Salesforce context, calendar meeting and RDP label.
- Rules have priority, enabled state and deterministic ordering.
- A test action explains which condition matched and which higher-priority rules did not.
- Historic evidence can be tested without changing existing worklogs.
- A manual correction can optionally create a proposed rule.

#### LT3-302 — Implement configurable export profiles

**Scope:** the hand-off for the first release (owner decision, 2026-10-05). Exports approved booking lines (ADR 0005), not raw activity.

Acceptance criteria:

- A profile versions ordered fields, constants, source mappings, date format, decimal separator, delimiter, encoding, line endings, rounding and grouping.
- Required fields and accounting rules are validated before export.
- Preview shows exact output rows and validation messages.
- Raw titles and RDP metadata are excluded unless explicitly mapped.

#### LT3-303 — Implement immutable export runs

**Scope:** part of the first release, recording each CSV hand-off. Submissions to Timmy are recorded by LT3-304 later.

Acceptance criteria:

- Export creation stores profile version, filters, worklog IDs, row count, generated time and SHA-256 file hash.
- A worklog cannot be accidentally exported twice under the same business operation.
- Changes after export require an explicit corrected-export flow.
- Recreating an unchanged export produces the same logical rows.

#### LT3-304 — Submit approved worklogs to Timmy

**Timing:** after the first release; it waits for the Timmy changes. Timmy's maintainer, judging by its commit history, is Pieter Jan De Keyzer.

**Dependency:** Timmy changes listed in `docs/integrations/timmy-integration-request.md`: desktop authentication and idempotent creation (blocking), reference data, entry status.

Acceptance criteria:

- Approved worklogs are sent to Timmy's `POST /api/timesheets` as `initial` booking lines (date, duration in hours and minutes, booking code, service product ID, `external_id` = the worklog ID), followed by one `POST /api/timesheets/:id/jira-entries` per Jira key with its comment; Timmy builds the SAP description from those.
- Retries never create duplicates: the same `external_id` returns the existing Timmy entry.
- Each submission is recorded immutably (payload, Timmy entry ID, time, result). A submitted worklog cannot be edited in place; corrections follow the superseding flow (LT3-202).
- The Timmy token is stored with Windows data protection, can be revoked from Settings and is never logged.
- Without a connection, approved worklogs stay queued and LightTrack keeps working.
- Where Timmy offers it, Timmy status (`initial`, `sentToSAP`, released) and SAP rejections are shown next to each submitted worklog.
- Contract tests run against a fake Timmy server.

### P2 — capture review and RDP

#### LT3-401 — Normalize raw activity capture

Acceptance criteria:

- Events record source type, application, redacted title, local URL/domain when permitted, start/end, duration, idle state and confidence.
- Only consecutive equivalent events are consolidated.
- Context switches remain distinct.
- Ignore/redaction rules run before persistence and are testable.

#### LT3-402 — Detect and represent RDP sessions

Acceptance criteria:

- Recognized `mstsc.exe` and Windows App windows create `remote_session` events. These are the clients in use (owner, 2026-10-05); RemoteApp and third-party clients are out of scope until needed.
- Events include locally visible connection label, local active/idle state and source confidence.
- UI text states: **remote session — contents not visible locally**.
- No remote process, URL, Jira or Salesforce context is inferred.

#### LT3-403 — Add RDP allocation workflow

Acceptance criteria:

- Exit, extended idle or configured interval can trigger an assignment prompt.
- Users can keep the current project through an RDP session via action and shortcut.
- Connection labels may have default project/activity mappings.
- Defaults are suggestions and remain editable before approval.
- Foreground/background, idle, disconnect/reconnect and reallocation scenarios are tested.

### P3 — optional context integrations

#### LT3-501 — Jira linking and issue-key evidence

Acceptance criteria:

- Credentials use OS-protected storage and can be revoked.
- Assigned/recent issues can be searched and linked.
- Locally visible Jira keys are mapping evidence, not elapsed-time proof.
- Network failure never blocks local capture, review or export.
- Outbound Jira worklogs are in scope (owner decision, 2026-10-05) and always require a payload review and explicit confirmation.

#### LT3-502 — Salesforce record context

Acceptance criteria:

- OAuth tokens use OS-protected storage and disconnect revokes local access.
- Allowed Cases, Accounts, Opportunities and Knowledge Articles can be searched and linked.
- Record-to-project mappings are organisation-configurable.
- Selected records provide context only and do not establish duration.
- Event Monitoring remains disabled until entitlement and privacy approval are documented.

#### LT3-503 — Calendar and local-browser adapters

Acceptance criteria:

- Calendar import is opt-in and exposes sync scope/status.
- Browser URL/title capture requires explicit extension permission and an authenticated local endpoint.
- A visible capture indicator and one-click pause are always available.
- Remote-browser work remains RDP evidence unless an approved remote-side adapter exists.

### P4 — operational maturity

#### LT3-601 — Retention and full data controls

Acceptance criteria:

- Users configure raw-evidence retention independently from export history. First run asks for a retention period (default 1 year); it can be changed later in Settings.
- Full data export and delete actions show scope and require confirmation.
- Deletion is auditable without retaining the deleted sensitive content.

#### LT3-602 — Diagnostics and privacy-safe support

Acceptance criteria:

- Logs use structured events and redact titles, tokens, connection labels and record identifiers.
- A support bundle preview shows exactly what will be included.
- Users explicitly approve bundle creation.

#### LT3-603 — Release and rollback

**Decision (2026-10-05):** releases stay unsigned. In-app updates stay off (`src/main/update-policy.js`); users install new versions from GitHub releases. Revisit if a signing certificate becomes available.

Acceptance criteria:

- The release workflow publishes the unsigned installer to GitHub releases with checksums (SHA-256) and release notes.
- The update policy (manual installs, how to verify the checksum, SmartScreen warning) is documented.
- Rollback guidance covers application and schema compatibility.
- CI continues to produce clearly labelled unsigned test installers for pull requests.

## 8. First three delivery increments

These are proposed outcomes, not date commitments. The team should size the Ready items and select only what fits demonstrated capacity.

### Increment A — trustworthy foundation

**Goal:** “Developers can change LightTrack through one secure runtime path and CI exercises the real packaged application.”

Prerequisite: the working-tree baseline is committed so CI runs against it.

Candidate items:

- LT3-001 remaining issue creation;
- LT3-002 duplicate implementation removal;
- LT3-003 typed IPC contract spike plus first migrated slice;
- LT3-004 browser-extension pairing and validation;
- LT3-005 application harness;
- LT3-006 TypeScript toolchain;
- LT3-007 SAP export hygiene;
- LT3-008 secrets at rest and update safety;
- LT3-009 Windows-only scripts and `.nvmrc`;
- LT3-100 SQLite/Electron packaging spike.

Exit criteria:

- one tracker/window path;
- real packaged smoke test;
- no raw titles or unescaped formula cells in SAP exports;
- no derivable storage key and no automatic install of unsigned updates;
- SQLite driver selected and proven in the packaged application;
- no regression in installer, audit or launch;
- top Phase 1 items refined and estimated.

### Increment B — durable local data

**Goal:** “A user’s existing activity can be moved into a transactional database and recovered safely.”

Candidate items:

- LT3-101 SQLite migrations;
- LT3-102 raw-activity repository slice;
- LT3-103 v3 export;
- LT3-104 import/reconciliation;
- LT3-105 backup/restore foundation.

Exit criteria:

- fresh and migrated databases pass integrity checks;
- no source data is silently lost;
- rollback is proven with test fixtures.

### Increment C — approvable worklogs

**Goal:** “A user can turn local evidence into an approved, SAP-valid weekly worklog.”

Candidate items:

- LT3-201 project/SAP master;
- LT3-202 worklog states and audit;
- LT3-203 allocations;
- LT3-204 weekly review;
- LT3-301 deterministic mapping.

Exit criteria:

- evidence remains immutable;
- draft worklogs can be corrected and approved;
- invalid SAP reference data blocks approval;
- complete audit history is visible.

## 9. Definition of Ready

An item may enter implementation when:

- [ ] its user or operational outcome is clear;
- [ ] acceptance criteria are specific and testable;
- [ ] it is small enough to complete within one iteration;
- [ ] external dependencies are resolved or explicitly planned;
- [ ] privacy/security implications have been reviewed;
- [ ] migration and rollback impact is understood;
- [ ] the team has estimated it relative to agreed anchor items;
- [ ] test fixtures and required business examples are available.

Items dependent on an SAP specification, OAuth approval, code-signing material or privacy approval are not Ready until that input exists. Use time-boxed spikes to answer unknown technical questions; a spike produces a documented decision, not production code.

## 10. Definition of Done

Every completed item must meet all applicable conditions:

- [ ] acceptance criteria verified;
- [ ] code reviewed and merged through the canonical branch;
- [ ] unit and integration tests added at the appropriate boundary;
- [ ] Windows application and installer gates pass;
- [ ] lint and dependency audit pass without hidden suppression;
- [ ] IPC and persisted input is validated;
- [ ] privacy and security requirements are tested;
- [ ] migrations are forward-tested and recovery is demonstrated;
- [ ] user/developer documentation is updated;
- [ ] diagnostics contain no sensitive values;
- [ ] no known regression is moved into the legacy-test quarantine;
- [ ] the increment is potentially releasable.

## 11. Flow policy

A lightweight Kanban policy is recommended while the architecture is changing:

```text
Discovery -> Ready -> In progress -> Review -> Verify on Windows -> Done
```

- WIP limit: at most two implementation items per active engineer, preferably one.
- Expedite lane: security vulnerability or release-blocking data-loss defect only; maximum one.
- Blocked items remain visible and record the dependency and next review date.
- Reserve roughly 10% of capacity for refinement.
- Track unplanned work; if it exceeds 20% of an iteration, address the systemic cause.
- Review cycle time and throughput after each iteration. Do not convert early estimates into fixed delivery promises.

## 12. Test strategy

The test pyramid for the modernization is:

1. **Domain unit tests:** state transitions, allocation arithmetic, rule ordering, validation and rounding.
2. **Repository integration tests:** real temporary SQLite database, migrations, transactions, indexes and backup/restore.
3. **IPC contract tests:** DTO validation, allowlists and error mapping.
4. **Application smoke tests:** packaged Electron app with isolated user data and mocked capture/integration adapters.
5. **Focused Windows E2E tests:** capture, review, approval, export and RDP scenarios.
6. **Golden-file tests:** exact SAP output bytes for each profile version.

The current legacy Jest suite remains diagnostic until its tests are either repaired against supported modules or deleted with documented replacement coverage. No new work may be added only to the quarantine.

## 13. Security and privacy workstream

Security and privacy are Definition-of-Done concerns, not a final phase.

- Use OS-protected storage for OAuth tokens and encryption keys.
- Never treat `electron-store` encryption as a security boundary.
- Pair local integrations explicitly; never hand loopback credentials to unauthenticated callers.
- Do not install updates automatically until releases are signed.
- Escape spreadsheet formula prefixes in every CSV export.
- Apply redaction before persistence where possible.
- Keep raw evidence out of exports by default.
- Provide visible capture state and immediate pause.
- Complete a privacy impact review before deployment beyond the owner/developer.
- Document purpose, access, retention, transparency and correction/grievance routes.

## 14. Risks and uncertainty

| Risk | Impact | Response |
|---|---|---|
| Work continues in the archived `PolycarpusTack/lighttrack` | Work splits across two codebases | ADR 0002 records the decision; issues are created only in this repository. |
| Baseline remains uncommitted | CI never runs the repaired gates | Commit the working-tree baseline before Increment A work starts. |
| SQLite native dependency complicates Electron packaging | Installer failures | Run LT3-100 in Increment A and package on Windows before schema work. |
| Unsigned releases are auto-installed | Users receive untrusted binaries | Disable automatic install (LT3-008) until signing exists (LT3-603). |
| Packaged-app harness cannot capture on hosted CI | Flaky or skipped smoke test | Mock the capture adapter or provide a desktop session; `active-win` needs one. |
| v3 data shapes contain undocumented variants | Migration data loss | Inventory anonymised exports and use reconciliation manifests. |
| SAP rules arrive late or change | Export rework | Keep profiles versioned and delay golden format commitment until specification exists. |
| Renderer modernization becomes a rewrite | Long period without usable value | Migrate vertical slices and keep the shell releasable. |
| Legacy test repair consumes unlimited effort | Delayed product outcomes | Replace tests based on risk and supported behavior, not test-count preservation. |
| RDP labels are inconsistent across clients | Poor defaults | Capture labelled fixtures for `mstsc`, Windows App and RemoteApp before implementation. |
| Integration permissions/privacy are unresolved | Blocked Jira/Salesforce work | Keep integrations behind consented adapters and outside the first offline release. |

There is no defensible calendar forecast yet: team capacity, historical throughput, item sizes and external-input dates are unknown. After five to ten completed, similarly sized backlog items, use observed throughput and cycle-time percentiles to forecast ranges rather than a single promised date.

## 15. Required inputs and owners

| Input | Needed by | Proposed owner |
|---|---|---|
| Canonical repository decision | R0 (resolved by ADR 0002) | Repository/product owner |
| Timmy: desktop authentication and idempotent create (`docs/integrations/timmy-integration-request.md`) | LT3-304 | Timmy team |
| Timmy: reference-data and entry-status endpoints | LT3-201, LT3-304 | Timmy team |
| Project-master source (decided: Timmy reference lists) and refresh cadence | LT3-201 | Timmy team / master-data owner |
| Representative v3 exports | LT3-103/104 | Current LightTrack users |
| RDP client inventory (decided: `mstsc.exe`, Windows App) and labelled examples | LT3-402 | Windows/IT owner |
| Jira policy (decided: outbound worklogs with review) | LT3-501 | Product/Jira owner |
| Salesforce record scope and connected-app approval | LT3-502 | Salesforce/privacy owner |
| Code-signing certificate and release policy | LT3-603 | Release/security owner |
| Team availability and historical throughput | Iteration planning | Delivery team |

## 16. First release scope

The first release ships with the CSV export as the hand-off (owner decision, 2026-10-05). GitHub issues in scope carry the `first-release` label.

| Area | Items |
|---|---|
| Foundation | LT3-003 typed IPC contract |
| Durable data | LT3-101 to LT3-105 |
| Approvable worklogs | LT3-201 to LT3-204, LT3-301 |
| Hand-off | LT3-302, LT3-303 (CSV of approved booking lines) |
| RDP | LT3-402, LT3-403 |
| Release basics | LT3-601 (retention chosen at first run), LT3-603 (unsigned release process) |

After the first release: LT3-304 (Timmy), LT3-401, LT3-501 to LT3-503, LT3-602.

## 17. Immediate next actions

1. Commit the working-tree baseline (CI, `test/baseline`, policies, ADRs, `package.json` changes) so CI runs against it.
2. Create GitHub issues in this repository for LT3-002 through LT3-009 and LT3-100 through LT3-105; this completes LT3-001.
3. Refine LT3-002, LT3-005, LT3-007 and LT3-008 to Ready. No packaged-app launch check exists yet; LT3-005 establishes it.
4. Run the LT3-100 SQLite/Electron packaging spike in Increment A before selecting a database driver.
5. Obtain an anonymised v3 export and document every observed source data shape.
6. Send `docs/integrations/timmy-integration-request.md` to the Timmy team (maintainer: Pieter Jan De Keyzer, per the commit history); LT3-304 follows the first release.
7. Begin measuring throughput and cycle time so later release forecasts can be evidence-based.

The first usable release is achieved when a Windows user can install LightTrack, distinguish local and RDP evidence, allocate time to a valid SAP-coded project, review and approve a weekly worklog, and export the approved booking lines as a validated, recorded CSV, while capture and review remain fully functional offline. Submission to Timmy follows in a later release.
