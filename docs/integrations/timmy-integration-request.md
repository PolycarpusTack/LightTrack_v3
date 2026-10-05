# Request to the Timmy team: LightTrack integration

**From:** LightTrack (`PolycarpusTack/LightTrack_v3`)
**About:** Timmy (`bitbucket.org/mediagenix/mgx-tools_timesheets`), checked against `main` at `f3ca8f5` (2026-08-25)
**Date:** 2026-10-05

## Summary

LightTrack is a Windows desktop app that records local work activity and helps people turn it into reviewed weekly worklogs. We would like LightTrack to hand approved worklogs to Timmy as draft (`initial`) entries. People then review, send and release them to SAP in Timmy, as they do today. LightTrack would not call SAP or hold SAP credentials ([ADR 0003](../adr/0003-submit-worklogs-to-sap-through-timmy.md)).

Most of what we need already exists behind Timmy's browser session. The two blocking gaps are authentication for a desktop client and protection against duplicate entries.

## How LightTrack would use Timmy's API

| Step | Existing endpoint | Note |
|---|---|---|
| Create a booking line | `POST /api/timesheets` | `date`, `duration_hours`, `duration_minutes`, `booking_code`, `serviceId`, `status: "initial"` |
| Add Jira keys and comments | `POST /api/timesheets/:id/jira-entries` | One per Jira key; Timmy builds the SAP description as `KEY - comment` lines |
| Reference data | `GET /api/activities`, `/api/sap-work-codes`, `/api/user_codes`, `/api/frequent_codes`, `/api/global_sap_codes`, `/api/sap/projects/search` | Activity types (service products) and booking codes |
| Status | `GET /api/timesheets/week/:date`, `/api/rejected-entries` | Timmy status and SAP rejections |

## What LightTrack needs

### 1. Authentication for a desktop client (blocking)

Requests are authenticated with the load balancer's sign-in (`x-amzn-oidc-data`, verified with `aws-jwt-verify`), and mutating requests need the CSRF double-submit cookie. A desktop app has neither.

Suggested approach: personal API tokens.

- A user creates a token in Timmy, sees it once, and pastes it into LightTrack.
- The token acts only as that user, under the existing rights checks (`withAuth`).
- Tokens are revocable, expire, and are stored hashed.
- Requests send `Authorization: Bearer <token>` on a path the load balancer does not force through sign-in, for example `/api/v1/...`. Token-authenticated requests are exempt from the CSRF check, because no cookie is involved.

An OAuth device-code flow against the same identity provider would also work, if you prefer that.

### 2. Idempotent entry creation (blocking)

LightTrack retries when the network drops, so a repeated request must not create a second booking line.

- Accept an optional `external_id` (LightTrack's worklog ID, a UUID) and `source: "lighttrack"` on `POST /api/timesheets`.
- Make `external_id` unique per user. A repeated POST with the same `external_id` returns the existing entry instead of creating a new one.

### 3. Status by external ID (nice to have)

A way to read back the entries LightTrack created by `external_id`: Timmy status (`initial`, `sentToSAP`, released) and SAP rejection, if any. LightTrack would show "booked", "released" or "rejected" next to the worklog.

## Observation

`tools/logging.ts` logs complete SOAP request and response bodies (`sapRequest`, `sapResponse`), which include work descriptions. Logging only IDs, status and fault text would keep descriptions out of the logs.

Two points from our earlier reading of an older copy (`63bdb10`, 2026-03-13) are already resolved in `main`: SOAP payloads are now built with `xmlbuilder2` and covered by injection tests, and the database moved to PostgreSQL.

## Contact

Questions about this request: the LightTrack repository owner (via the repository's issues).
