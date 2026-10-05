# Request to the Timmy team: LightTrack integration

**From:** LightTrack (`PolycarpusTack/LightTrack_v3`)
**About:** Timmy (`mgx-tools_timesheets`)
**Date:** 2026-10-05

## Summary

LightTrack is a Windows desktop app that records local work activity and helps people turn it into reviewed weekly worklogs. We would like LightTrack to hand approved worklogs to Timmy as draft (`initial`) entries, so people review and send them to SAP in Timmy, as they do today. LightTrack would not call SAP or hold SAP credentials ([ADR 0003](../adr/0003-submit-worklogs-to-sap-through-timmy.md)).

For that, we need four things in Timmy. We also noticed three issues in Timmy that are worth fixing regardless.

## What LightTrack needs

### 1. Authentication for a desktop client (blocking)

Timmy identifies users through the AWS load balancer's sign-in (`x-amzn-oidc-data`). A desktop app cannot use that browser session.

Suggested approach: personal API tokens.

- A user creates a token in Timmy, sees it once, and pastes it into LightTrack.
- The token acts only as that user, under the existing rights checks.
- Tokens are revocable, have an expiry, and are stored hashed.
- Requests send `Authorization: Bearer <token>` on a route the load balancer does not force through sign-in, for example `/api/v1/...`.

An OAuth device-code flow against the same identity provider would also work, if you prefer that.

### 2. Idempotent entry creation (blocking)

`POST /api/timesheets` exists and takes `date`, `duration_hours`, `duration_minutes`, `booking_code`, `serviceId`, `jira_id`, `jira_title` and `comment`. LightTrack retries when the network drops, so we need to avoid duplicates:

- Accept an optional `external_id` (LightTrack's worklog ID, a UUID) and `source: "lighttrack"`.
- Make `external_id` unique per user. A repeated POST with the same `external_id` returns the existing entry instead of creating a new one.

### 3. Reference data (needed for project setup)

Read-only endpoints for the lists in `backend/data/activities.json` (service products) and `backend/data/sap-codes.json` (booking codes), ideally with an `ETag` so LightTrack can refresh cheaply. If a user's worklist is available, that list too.

### 4. Entry status (nice to have)

A way to read back the entries LightTrack created, by `external_id`: Timmy status (`initial`, `sentToSAP`, error) and SAP approval status. LightTrack would show "booked" or "rejected" next to the worklog.

## Issues we noticed in Timmy

These came up while reading the code and are independent of LightTrack.

1. **Values are not XML-escaped in SOAP requests.** `server-sap.js` interpolates `description`, `projectId`, `serviceProductId` and `employeeId` into the SOAP envelope as they are. A comment containing `<` or `&` breaks the request, and a crafted comment could add or change SOAP elements. Escaping `& < > " '` before interpolation fixes it.
2. **Full SOAP payloads are logged.** `logger.sapRequest` and `logger.sapResponse` log the complete envelopes, which include work descriptions. Consider logging only IDs, status and fault text.
3. **The database file is rewritten in place on every change.** `saveDatabase()` writes the whole `sql.js` export directly over `foo.db`. A crash or full disk during the write can leave a truncated database. Writing to a temporary file and renaming it over the original avoids that.

## Contact

Questions about this request: the LightTrack repository owner (via the repository's issues).
