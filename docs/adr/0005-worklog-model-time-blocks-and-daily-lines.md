# ADR 0005: Worklogs are time blocks; daily booking lines are derived

- Status: Accepted
- Date: 2026-10-05

## Context

LightTrack records evidence over time, while Timmy (and SAP behind it) books one line per day per booking code and activity type ([ADR 0003](0003-submit-worklogs-to-sap-through-timmy.md)). The worklog model has to serve both: editing what happened during the day, and submitting what Timmy expects.

## Decision

- A **worklog** is a time block: start, end, booking reference (project element ID + service product ID), billable flag, optional Jira keys and comment. Users create, edit, split, merge and delete time blocks; raw evidence is allocated to them.
- A **booking line** is derived, never edited directly: for each day, booking code and activity type, the time blocks are summed. Jira keys and comments from the blocks become the line's Jira entries.
- **Rounding** applies to booking lines, not to time blocks. It is a per-user setting with a default of 15 minutes (nearest). The unrounded total stays visible next to the rounded one in review.
- **Approval** happens per day or per week on booking lines. Approving a line freezes the time blocks it was derived from; later changes create superseding blocks and a new line version (LT3-202).
- **Submission** to Timmy sends booking lines, one Timmy timesheet line each, plus one Jira entry per key (LT3-304).

## Consequences

- The data model gains a `booking_line` derivation (a view or materialised table) next to `worklog` (time blocks) and `allocation`.
- Review screens show both levels: blocks for correcting the day, lines for what will be booked.
- Rounding differences are explicit and auditable rather than hidden in edited durations.
- The CSV fallback (LT3-302) exports booking lines.
