# ADR 0002: Adopt LightTrack_v3 as the canonical repository

- Status: Accepted
- Date: 2026-10-05
- Supersedes: [ADR 0001](0001-canonical-repository-and-migration-boundary.md)

## Context

ADR 0001 named `PolycarpusTack/lighttrack` as the canonical target and limited this repository to security, build/release, export and migration fixes. Since then, `LightTrack_v3` has a working Electron application and a repaired Windows build, dependency-audit and focused test baseline.

Maintaining two codebases would split effort and leave users on an application that only receives maintenance fixes. The [development plan](../LIGHTTRACK_V3_DEVELOPMENT_PLAN.md) describes how the planned accounting domain, SQLite persistence and TypeScript boundaries can be introduced into this repository incrementally.

## Decision

`LightTrack_v3` is the canonical LightTrack repository. It is modernised in place by executing the development plan incrementally. There is no big-bang rewrite: each increment leaves the application installable and usable.

New product features, including the accounting core, RDP, Jira, Salesforce and organisation-deployment work, are implemented here.

## Consequences

- `PolycarpusTack/lighttrack` becomes a reference and archive. Ideas or code may be ported from it deliberately, but it receives no new feature work.
- GitHub issues for the plan's backlog are created in this repository.
- The migration boundary in ADR 0001 no longer applies. Feature work is no longer frozen here.
- The supported platform remains Windows 11 x64, as recorded in `docs/SUPPORTED_PLATFORMS.md`.
- `src/main/core` remains the active runtime path; the inactive duplicates under `src/main/services` are retired as part of the plan rather than expanded.
- `electron-store` remains the persistence layer until the SQLite migration in the plan is delivered and verified; existing user data must be migrated, not discarded.
- The legacy Jest suite stays quarantined as `npm run test:legacy` and is not a release gate.

## Revisit criteria

Revisit if incremental modernisation cannot keep the application releasable, or if the SQLite/Electron packaging spike shows that the planned persistence design cannot be delivered on this codebase.
