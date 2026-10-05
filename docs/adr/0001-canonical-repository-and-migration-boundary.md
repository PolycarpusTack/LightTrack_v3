# ADR 0001: Canonical repository and migration boundary

- Status: Superseded by [ADR 0002](0002-adopt-lighttrack-v3-as-canonical.md)
- Date: 2026-10-05

## Context

`LightTrack_v3` is a working Electron/JavaScript feature reference, but its renderer, storage and test architecture are not a safe base for the planned SQLite and TypeScript accounting domain. The product roadmap names `PolycarpusTack/lighttrack` as the target implementation.

## Decision

`PolycarpusTack/lighttrack` is the canonical target for new product features once it builds, launches, persists data and passes a thin Windows end-to-end test. This repository remains the migration source and behavioural reference.

Allowed changes here are limited to security, build/release, data export, migration tooling and defects that prevent users from retrieving their data. New accounting, RDP, Jira, Salesforce and organisation-deployment features belong in the target repository.

Before this repository is retired, the target must import a full v3 data export and preserve source identifiers, timestamps, allocations, project/SAP values and meaningful edit history.

## Consequences

- The existing `electron-store` data remains supported for export and migration, not treated as the future persistence layer.
- Duplicate `core` and `services` implementations are not expanded. The active path is `src/main/core`, as wired by `src/main/index.js`.
- The legacy Jest suite is retained as `npm run test:legacy`; its stale failures are visible but do not define the supported v3 release gate.
- The supported gate is Windows-only and covers locked install, lint, focused baseline tests, audit, build and unsigned installer creation.
- SAP profile work waits for an anonymised sample or formal field specification.

## Revisit criteria

Revisit only if the target repository cannot meet its clean-build, launch, persistence and Windows smoke-test criteria.
