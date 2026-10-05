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
- Direct dependencies were updated; `npm audit --audit-level=moderate` reports zero vulnerabilities.
- The active `src/main/core` activity and window path is documented; duplicate `services` implementations are not extended.
- Privacy boundaries explicitly reject screenshots, OCR, keystroke logging and claims about remote RDP contents.

## Not yet done

See section 4 of the development plan. In particular, no check launches the packaged application, and the existing smoke test exercises mocks rather than application code.

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
