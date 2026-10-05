// harness-mode.js - Test harness mode for the application test (LT3-005)
//
// LIGHTTRACK_HARNESS=1 runs LightTrack for automated tests:
// - LIGHTTRACK_USER_DATA must name an absolute directory; it replaces userData before
//   anything else touches the profile, so a test can never use a real profile.
// - The browser-extension server, calendar sync and automatic tracking stay off.
// Harness mode only ever disables features; it does not enable anything.

const path = require('path');

const HARNESS = process.env.LIGHTTRACK_HARNESS === '1';

/**
 * Apply harness mode. Must run before app.requestSingleInstanceLock() and before
 * any storage or logging uses userData.
 * @returns {boolean} true when harness mode is active
 */
function applyHarnessMode(app) {
  if (!HARNESS) return false;

  const dir = process.env.LIGHTTRACK_USER_DATA;
  if (!dir || !path.isAbsolute(dir)) {
    console.error('LIGHTTRACK_HARNESS=1 requires LIGHTTRACK_USER_DATA to be an absolute directory');
    app.exit(2);
    return true;
  }
  app.setPath('userData', dir);
  return true;
}

module.exports = { isHarness: () => HARNESS, applyHarnessMode };
