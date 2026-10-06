# Dependency audit exceptions

An exception requires the advisory identifier, affected dependency path, runtime/build-time exposure, mitigation, owner, approval date and expiry date. Exceptions must be reviewed before expiry and may not be implemented by suppressing the audit command.

`npm run security:audit` (`scripts/audit.js`) fails on every advisory of moderate severity or higher that is not listed in `dependency-exceptions.json`. An exception covers one advisory in one package and stops counting on its expiry date. Add each exception to both files.

## GHSA-hp3w-g68c-fv3c: `sprintf-js` (moderate)

- **Advisory:** denial of service through unbounded precision specifiers. Affects all versions; no fixed release yet.
- **Dependency paths:**
  - `electron-builder` > `app-builder-lib` > `@electron/get` > `global-agent` > `roarr` > `sprintf-js@1.1.3`
  - `ts-jest` > `@jest/transform` > `babel-plugin-istanbul` > `@istanbuljs/load-nyc-config` > `js-yaml` > `argparse` > `sprintf-js@1.0.3`
- **Exposure:** build and test time only. `npm ls sprintf-js --omit=dev` is empty, so it is not in the installed app. The format strings come from the tools themselves, not from user input.
- **Mitigation:** none needed at runtime. Remove the exception when a fixed `sprintf-js` or updated parent packages are available.
- **Owner:** repository owner (PolycarpusTack)
- **Approved:** 2026-10-06
- **Expires:** 2026-11-05
