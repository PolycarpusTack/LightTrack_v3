# Dependency audit exceptions

An exception requires the advisory identifier, affected dependency path, runtime/build-time exposure, mitigation, owner, approval date and expiry date. Exceptions must be reviewed before expiry and may not be implemented by suppressing the audit command.

`npm run security:audit` (`scripts/audit.js`) fails on every advisory of moderate severity or higher that is not listed in `dependency-exceptions.json`. An exception covers one advisory in one package and stops counting on its expiry date. Add each exception to both files.

## Current exceptions

None.

## Overrides

`package.json` pins two build and test tools to fixed releases, because their parent packages have not moved yet:

- `glob` 9 to 14.0.1 is replaced by 14.0.6 (GHSA-3g3m-2fjr-6pw4). Parents: `jest`, `test-exclude`.
- `minimatch` 9 and 10 are replaced by 11.0.9 (GHSA-g3hv-75wg-m249) under `app-builder-lib`, `@electron/universal`, `test-exclude` and `@typescript-eslint/typescript-estree`.

Neither package is in the installed app (`npm ls glob minimatch --omit=dev` is empty). Remove an override once the parent package depends on a fixed version itself.

## History

- 2026-11-26: the `sprintf-js` exception (GHSA-hp3w-g68c-fv3c) was removed. It lapsed on 2026-11-05 and the audit no longer reports the advisory.
