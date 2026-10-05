# LightTrack v3: status and pickup

**Last updated:** 2026-10-05, end of day
**Current branch:** `feat/lt3-003-ipc-contract` (work in progress, not merged, no PR yet)
**`main`:** `e7c978c`, CI green

## Where we are

Increment A is complete except LT3-003 (#10), which is in progress. Merged today (PRs #1 to #9, #34, #35):

- Windows-only baseline, CI with a packaged-application harness (Playwright for Electron)
- ADR 0002 (this repo is canonical), ADR 0003 (SAP via Timmy), ADR 0004 (SQLite via `sql.js`), ADR 0005 (worklog model)
- Renderer restyled to the Fabrica page-kit tokens, light/dark; CSP-blocked inline styles and handlers fixed
- LT3-002 duplicates removed, LT3-004 extension pairing, LT3-005 app harness, LT3-007 SAP CSV hygiene, LT3-008 secrets/encryption/updates off, LT3-009 scripts, LT3-100 `sql.js` spike, LT3-006 TypeScript toolchain (app builds into `out/`)
- 24 GitHub issues (#10 to #33); the 17 in the first release carry the `first-release` label

The app is usable as a hardened time tracker. The first release (approval workflow, booking lines, RDP, CSV hand-off) is not built yet; see plan section 16.

## Owner decisions (all recorded in the plan's decisions table)

First release hands off by CSV; Timmy submission comes after. Worklogs are time blocks with derived daily booking lines. Rounding per user (default 15 min). Full TypeScript including renderer. SQLite file encrypted with the protected key. Retention chosen at first run (default 1 year). Releases stay unsigned; in-app updates off. Jira outbound with review. RDP clients: `mstsc.exe`, Windows App. Salesforce kept for later.

## LT3-003 (#10) work in progress

Goal: every preload method maps to a contract channel; requests and responses are validated at runtime in main; unknown channels and invalid payloads are rejected with explicit error codes.

Done on the branch (uncommitted work is committed as WIP):

- `src/shared/ipc/errors.ts`: error codes (`INVALID_REQUEST`, `UNKNOWN_CHANNEL`, `INVALID_RESPONSE`, `NOT_FOUND`, `CONFLICT`, `INTERNAL`), carried across IPC as a `[CODE] message` prefix; `decodeIpcError` for the preload.
- `src/main/ipc/registry.ts`: `IpcRegistry.handle(channel, fn)` validates args (zod tuple) and result, refuses channels outside the contract, maps errors; `missing()` lists contract channels without a handler.
- `src/preload/index.ts`: the whole preload rewritten declaratively with the same public API and per-method fallbacks; channel names typed against the contract. Bundled by esbuild into `out/preload.js` (sandboxed preloads cannot `require` local files).
- Build: `scripts/build.js` bundles the preload; `tsconfig.preload.json` type-checks it; `tsconfig.main.json` no longer compiles `src/preload.js`; `zod` 4.6 added.

Not done yet:

1. **`src/main/ipc/contract.ts`** (does not exist yet, so the branch does not build). It must export `CONTRACT` (channel -> `{ args: z.tuple([...]), result: z.ZodType, doc }`) and the types `Channel`, `Args<C>`, `Result<C>`. Use loose object schemas (`z.looseObject`) for stored records so extra fields pass; validate the fields main relies on.
2. **Channel inventory.** A background agent was writing it to the session scratchpad (`ipc-inventory.md`), which will not survive the session. Regenerate it: for every `ipcMain.handle` in `src/main/index.js` and `src/main/ipc/handlers/*.js`, record args, return shape and renderer call sites (`src/renderer/js/**`). 69 channels are used by the preload.
3. **Retire 8 dead handlers** that the preload never calls: `activities:consolidate`, `activities:get-by-id`, `activities:get-by-range`, `activities:get-count`, `activities:get-paginated`, `activities:get-summary`, `tracking:pause`, `tracking:resume` (confirm nothing else calls them).
4. **Move every `ipcMain.handle(...)` to `registry.handle(...)`**: 5 in `src/main/index.js`, the rest in `src/main/ipc/handlers/*.js` (activities 17, activityTypes 3, calendar 10, projects 5, settings 16, tags 6, tracking 7, updater 8). After registration, fail startup if `registry.missing()` is not empty.
5. **Delete `src/preload.js`** (replaced by `src/preload/index.ts`).
6. **Tests:** a contract test that the preload's channels, the contract and the main registrations are the same set; registry tests (invalid args -> `INVALID_REQUEST`, bad result -> `INVALID_RESPONSE`, unknown channel refused); keep the app harness green (it exercises the preload end to end).
7. **Docs:** plan LT3-003 status; SECURITY.md (IPC contract); CONTRIBUTING (how to add a channel).
8. PR "LT3-003: typed, validated IPC contract", closes #10.

Design notes: argument tuples are strict (no extra args), so check renderer call sites against each schema; the preload passes all renderer arguments through. Validation lives in main (the trust boundary); the preload only maps channels and errors.

## Open items for the owner

1. Send `docs/integrations/timmy-integration-request.md` to Timmy's maintainer, Pieter Jan De Keyzer (per Timmy's commit history; confirm he is the right contact).
2. Load the browser extension unpacked in Chrome or Edge and pair it once by hand (not covered by automated tests).
3. Use a build for a while: `tsc` now adds `"use strict"` to the legacy main-process JavaScript; the harness passed, but tray, tracking and idle paths are not covered by it.

## Next after LT3-003

Increment B: #12 to #16 (SQLite schema with encryption, repositories, v3 export and import, backup and restore), then Increment C (#17 to #21), the CSV hand-off (#22, #23), RDP (#26, #27), #31, #33.

## Working notes

- Gates: `npm run lint`, `npm run typecheck`, `npm run test:ci` (baseline Jest, TS via ts-jest), `npm run build` (into `out/`), `npm run electron:build:win` (production build + installer), `npm run test:app` (harness against `dist/win-unpacked`; set `LIGHTTRACK_EXE` to test another build).
- For a quick packaged check without touching `dist/`: `npm run build && npx electron-builder --win --dir --publish never --config.directories.output=<scratch dir>`.
- Files use CRLF; keep line endings when editing.
- TypeScript 6: set `rootDir` explicitly; `module: node16` for main.
- Workflow so far: one branch and PR per backlog item, CI green before merging, merges with a merge commit after the owner approves.

## Pickup prompt

> Continue LightTrack v3 in `C:\Projects\Other\LightTrack_v3`. Read `docs/handover/STATUS.md` first, then `docs/LIGHTTRACK_V3_DEVELOPMENT_PLAN.md` (sections 3, 7 LT3-003, 16). Check out `feat/lt3-003-ipc-contract` and finish LT3-003 (#10) following the "Not done yet" list in STATUS.md: regenerate the IPC channel inventory, write `src/main/ipc/contract.ts`, retire the 8 dead handlers, move all handlers to the registry, delete `src/preload.js`, add the contract and registry tests, and keep `npm run lint`, `npm run typecheck`, `npm run test:ci`, `npm run build` and the packaged-app harness green. Then update the docs, open the PR (closes #10) and wait for CI. Keep the plain, concise writing style used in the docs. Ask me before merging.
