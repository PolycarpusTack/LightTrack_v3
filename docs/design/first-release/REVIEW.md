# Review of the first-release design handoff

**Date:** 2026-10-06
**Handoff:** this folder (`README.md`, `LT First Release.dc.html`, `LightTrack UX Audit.dc.html`, `screenshots/`). Open the `.dc.html` files in a browser; they load React from unpkg and are not part of the app.

## Verdict

Adopt it as the reference for the first-release UI. It follows plan sections 3 and 16 and ADR 0005: users correct time blocks, booking lines are derived and rounded per line, a day is approved before export, and the CSV export is recorded. The audit findings checked against the code are accurate (10px `--ink-faint` labels, hover-only `.activity-actions`, bare Space toggling tracking, and the four defects now tracked as #38 to #41).

## How it is applied

| Part | When | Backlog |
|---|---|---|
| Audit P0 defects | Now | #38 (PR #42), #39, #40, #41 |
| System-level styles (labels, two button kinds, one input style, `:focus-visible`, visible row actions, real buttons, sentence case, H:MM durations, `--seg-nb`) | Now, on the current screens, one PR | #44 |
| Failed IPC calls shown to the user (no silent fallbacks) | With the style pass; the preload's fallbacks need to change | #45 |
| Day and Week screens | After the worklog model exists | LT3-202, LT3-203, LT3-204 |
| Export screen and export history | With the CSV hand-off | LT3-302, LT3-303 |
| Rules screen | With ordered rules | LT3-301 |
| First run | With retention and manual booking codes | LT3-601, LT3-201 |
| Remote-session blocks | With RDP | LT3-402, LT3-403 |
| New navigation (Day, Week, Export, Rules) | When Day and Export exist; until then the current screens stay | LT3-202 |

The new screens need Increment B (database, repositories, import) and the worklog items first. Building them earlier would mean building them on the `electron-store` model that LT3-104 retires.

## Owner decisions (2026-10-06)

- Window: minimum 1024 px, two-column screens stack below about 1100 px (item 3 below).
- Worklog states: exported is derived from export runs; rejected comes with Timmy (item 2).
- CSV layout: from a sample of the approver's SAP ByDesign import file, which the owner provides (item 1).

## Differences from current decisions

1. **CSV layout.** The design shows `EmployeeID;Date;ProjectElement;ServiceProduct;Hours;Comment` with `;` and decimal comma. The current export (LT3-007, `src/main/exports/sap-csv.ts`) writes ten comma-separated columns with a decimal point. The handoff calls its layout a placeholder. The real layout must come from the SAP ByDesign import the approver uses; it becomes export profile v1 in LT3-302.
2. **Worklog states.** The design lists `draft | approved | exported | rejected | superseded`. The schema in LT3-101 has `draft | approved | superseded`; "exported" follows from membership of an export run, and "rejected" needs an approver inside the product, which the first release does not have (the approver receives the summary). Recommendation: keep exported as derived and add `rejected` with Timmy (LT3-304).
3. **Minimum window width.** The design asks for 1280 px; the app allows 800 px today. Recommendation: keep a 1024 px minimum and stack the two-column layouts into one column below about 1100 px, so the app stays usable on a laptop at 150 % scaling.
4. **Removed views.** Timer, Timeline, Analytics and Projects leave the main navigation. Personal statistics can return as an opt-in Reports view, in line with the "no productivity scoring" principle.
5. **Activity-type codes.** `P0940003` and the other codes in the mock-ups are placeholders; real codes come from Timmy reference data or the manual list (LT3-201).
