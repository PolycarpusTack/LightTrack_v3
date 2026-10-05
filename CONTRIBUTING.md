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

The app runs from `out/`, not `src/`. `npm run build` compiles the main process and preload with TypeScript (`tsconfig.main.json`, JavaScript and TypeScript side by side), type-checks the renderer (`tsconfig.renderer.json`), copies renderer files and bundles `src/renderer/ts` with esbuild into `out/renderer/js/bundle.js`. Type errors fail the build.

- `npm start` and `npm run dev` build first, then launch Electron.
- `npm run electron:build:win` makes a production build and then packages `out/`.
- `npm run test:app` runs the packaged-application harness against `dist/win-unpacked`.

New code is TypeScript. When you migrate a JavaScript module, replace it rather than keeping both versions. Renderer modules move into `src/renderer/ts` and are published on `window.LightTrack` from `src/renderer/ts/index.ts` until their legacy callers are migrated too.

`npm run test:legacy` exposes the archived broad test suite. It contains tests for removed modules and is not the supported release gate; do not conceal new failures by adding more tests to that quarantine.

## Privacy and data handling

Do not add screenshots, OCR, keylogging, productivity scoring or unreviewed claims about work inside RDP. Test fixtures must be synthetic and must not contain customer names, real issue keys, credentials or activity titles.

Keep changes focused and include tests for observable behaviour. Export or migration changes must preserve historical values and be reversible where practical.
