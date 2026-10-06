# Contributing

## Repository boundary

This is the canonical LightTrack repository ([ADR 0002](docs/adr/0002-adopt-lighttrack-v3-as-canonical.md)). Work follows the [development plan](docs/LIGHTTRACK_V3_DEVELOPMENT_PLAN.md); pick up or propose items against its backlog and open issues here. `PolycarpusTack/lighttrack` is a reference archive and does not accept new feature work.

## Local baseline

Use Node.js 22 and npm 10 or newer on Windows:

```powershell
npm ci
npm run lint
npm run test:ci
npm run security:audit
npm run electron:build:win
npm run test:app
```

## Building and running

The app runs from `out/`, not `src/`. `npm run build` compiles the main process with TypeScript (`tsconfig.main.json`, JavaScript and TypeScript side by side), bundles the preload with esbuild into `out/preload.js` (sandboxed preloads cannot load local files), type-checks the preload and renderer (`tsconfig.renderer.json`), copies renderer files and bundles `src/renderer/ts` with esbuild into `out/renderer/js/bundle.js`. Type errors fail the build.

- `npm start` and `npm run dev` build first, then launch Electron.
- `npm run electron:build:win` makes a production build and then packages `out/`.
- `npm run test:app` runs the packaged-application harness against `dist/win-unpacked`.

### Adding an IPC channel

1. Add the channel to `src/main/ipc/contract.ts` with its argument tuple, result schema and a one-line description. Use `z.object` for requests (unknown keys are dropped) and `z.looseObject` for stored records.
2. Register the handler in main with `registry.handle(channel, handler)`, never `ipcMain.handle`.
3. Map it in `src/preload/index.ts`.

`test/baseline/ipc-contract.test.js` fails if the three lists differ, and main refuses to start if a contract channel has no handler.

### Changing the database schema

Add a migration to the end of `MIGRATIONS` in `src/main/persistence/schema.ts`, with the next version number. Never edit a migration that has been merged. Do not use `BEGIN` or `COMMIT`; the runner wraps all pending migrations in one transaction. Index every foreign key; `test/baseline/database.test.js` checks it.

New code is TypeScript. When you migrate a JavaScript module, replace it rather than keeping both versions. Renderer modules move into `src/renderer/ts` and are published on `window.LightTrack` from `src/renderer/ts/index.ts` until their legacy callers are migrated too.

`npm run test:legacy` exposes the archived broad test suite. It contains tests for removed modules and is not the supported release gate; do not conceal new failures by adding more tests to that quarantine.

## Privacy and data handling

Do not add screenshots, OCR, keylogging, productivity scoring or unreviewed claims about work inside RDP. Test fixtures must be synthetic and must not contain customer names, real issue keys, credentials or activity titles.

Keep changes focused and include tests for observable behaviour. Export or migration changes must preserve historical values and be reversible where practical.
