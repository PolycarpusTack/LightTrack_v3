# ADR 0003: Submit approved worklogs to SAP through Timmy

- Status: Accepted
- Date: 2026-10-05

## Context

The development plan assumed SAP would be fed by a file export whose format was still unknown (LT3-304 was blocked on a specification).

Mediagenix already runs Timmy (`bitbucket.org/mediagenix/mgx-tools_timesheets`), a hosted weekly timesheet application behind company sign-in. Timmy books time directly in SAP ByDesign through the `ManageEmployeeTimeIn` SOAP service. Each entry carries an employee ID, an item type code (the employee's company code), a project element ID (booking code), a service product ID (activity type), a date, an ISO 8601 duration and a work description. SAP returns a UUID; Timmy can then release the entry for approval and track rejections. Timmy also enforces read, edit and send-to-SAP rights per user and keeps the SAP credentials server-side.

Timmy is owned by another team.

## Decision

LightTrack does not talk to SAP. Approved LightTrack worklogs are submitted to Timmy as draft (`initial`) entries. Users then review them and send them to SAP in Timmy, under Timmy's rights model.

LightTrack adopts the SAP booking model that Timmy uses: a worklog is booked against a project element ID and a service product ID. The reference lists (activity types and booking codes) are read from Timmy, not copied into this repository.

The CSV export remains as an offline fallback. It is not the primary route, but it is the hand-off for the first release, until Timmy offers desktop authentication and idempotent creation (owner decision, 2026-10-05).

## Consequences

- LT3-304 is no longer blocked on a file specification. It becomes "submit approved worklogs to Timmy" and depends on changes in Timmy (see `docs/integrations/timmy-integration-request.md`): authentication for a desktop client, idempotent creation, reference-data and status endpoints.
- No SAP credentials are stored on desktops.
- LT3-201 models project codes as project element ID + service product ID, with effective dates, instead of WBS element, cost centre and similar fields.
- LT3-302/LT3-303 (configurable export profiles and immutable export runs) shrink to the CSV fallback; submission records take over the audit role for the primary route.
- LightTrack keeps working offline: worklogs stay approved and queued until Timmy is reachable.
- Employee identity and company codes stay in Timmy. LightTrack does not store the employee directory.

## Revisit criteria

Revisit if the Timmy team cannot provide non-browser authentication, or if SAP booking moves out of Timmy.
