# ADR 0004: SQLite through sql.js, with atomic saves

- Status: Accepted
- Date: 2026-10-05
- Backlog item: LT3-100 (SQLite/Electron packaging spike)

## Context

The plan moves persistence from `electron-store` to SQLite (LT3-101 onwards). Native drivers such as `better-sqlite3` must be rebuilt for each Electron version and packaged per architecture, which was the largest packaging risk in the plan.

`sql.js` is SQLite compiled to WebAssembly (MIT licence). It has no native module. It keeps the database in memory and writes the whole file when saving.

## What the spike showed

- **Packaging.** The packaged application loads `sql-wasm.wasm` from inside `app.asar`, creates a database, writes in a transaction, saves and reads it back (`test/app/packaged-app.spec.js`, run in CI). Only `sql-wasm.js` and `sql-wasm.wasm` (about 700 KB) are packaged; debug builds, browser builds, workers, asm.js fallbacks and zips are excluded in `package.json` (`build.files`).
- **Durability.** `src/main/persistence/sqlite-db.js` saves atomically: write a temporary file, `fsync`, rename over the database. A simulated crash before the rename leaves the previous file intact (`test/baseline/sqlite-db.test.js`).
- **Integrity.** Foreign keys are on and enforced; transactions roll back on error.
- **Performance** (`scripts/bench-sqljs.js`, Node 22, developer laptop, activity-like rows of about 250 bytes):

  | Rows | Insert (one transaction) | Save (whole file) | File size | Reopen | One-week query | Process memory |
  |---|---|---|---|---|---|---|
  | 10,000 (about a year) | 138 ms | 16–20 ms | 2.4 MB | 5 ms | 6 ms | 95 MB |
  | 50,000 (about four years) | 608 ms | 46–58 ms | 12 MB | 19 ms | 2 ms | 126 MB |
  | 200,000 (worst case) | 3.6 s | 180–194 ms | 50 MB | 89 ms | 2 ms | 276 MB |

## Decision

Use `sql.js` for the LightTrack database, owned by the main process, with atomic saves through `SqliteDb.save()`. `better-sqlite3` is not needed.

## Consequences

- No native module to rebuild for Electron upgrades; the installer grows by about 700 KB.
- Every save rewrites the whole file. Saves happen after each committed transaction (approval, allocation, export, import), not per captured sample; capture writes are batched. At four years of data a save takes about 50 ms.
- The whole database is held in memory. Retention controls (LT3-601) keep raw evidence bounded; above roughly 200,000 rows, revisit.
- The database file is not encrypted by SQLite itself. Encryption at rest for the SQLite file is decided together with LT3-101 (for example, encrypting the exported bytes with the protected key from LT3-008 before the atomic write).

## Revisit criteria

Revisit if save latency exceeds 250 ms in normal use, if memory use becomes a problem on supported machines, or if incremental writes become necessary.
