// update-policy.js - Whether in-app updates may run (LT3-008)
//
// Updates stay off until releases are code-signed and served from a feed this
// project controls (LT3-603). Until then, electron-updater could download and run
// an unsigned installer from the configured URL, so the app does not check,
// download or install updates. Users update by installing a new release manually.

const UPDATES_ENABLED = false;
const DISABLED_REASON = 'In-app updates are disabled until releases are signed. Install new versions manually.';

module.exports = { UPDATES_ENABLED, DISABLED_REASON };
