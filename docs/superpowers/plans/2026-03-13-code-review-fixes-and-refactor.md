# Code Review Fixes & Refactoring Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 10 important issues from the code review and refactor app.js (8200+ lines) into maintainable modules.

**Architecture:** Three parallel workstreams: (A) security/validation cleanup, (B) bug fixes and infrastructure, (C) renderer refactoring. Each workstream produces independently testable changes.

**Tech Stack:** Electron, Node.js, vanilla JS (renderer), electron-store, electron-log

---

## Chunk 1: Security & Validation Cleanup (Issues 7, 8, 9, 10, 11, 15)

### Task 1: Remove unused security modules and dead code

**Files:**
- Delete: `src/security/security-config.js` (338 lines, unused)
- Delete: `src/security/input-validator.js` (334 lines, unused)
- Delete: `src/security/csp-generator.js` (202 lines, unused)
- Delete: `src/main/ipc/router.js` (402 lines, unused - Issue #16)

- [ ] **Step 1:** Verify no imports reference these files

```bash
grep -r "security-config\|security/security-config" src/ --include="*.js" | grep -v node_modules
grep -r "input-validator\|security/input-validator" src/ --include="*.js" | grep -v node_modules
grep -r "csp-generator\|security/csp-generator" src/ --include="*.js" | grep -v node_modules
grep -r "ipc/router\|IPCRouter" src/ --include="*.js" | grep -v node_modules
```

Expected: Only self-references within the files themselves (security-config.js imports input-validator and csp-generator).

- [ ] **Step 2:** Delete the unused files

- [ ] **Step 3:** Commit

```bash
git add -A src/security/security-config.js src/security/input-validator.js src/security/csp-generator.js src/main/ipc/router.js
git commit -m "chore: remove unused security modules and IPC router (dead code)"
```

### Task 2: Consolidate duplicate activity validation (Issue #15)

The activity validation exists in 3 places: `index.js` inline (lines 238-298), `input-validator.js` (being deleted), and `shared/sanitize.js`. Consolidate to use only `shared/sanitize.js`.

**Files:**
- Modify: `src/main/index.js` — remove inline `validateActivity()` and `sanitizeString()`, use `shared/sanitize.js` instead

- [ ] **Step 1:** In `src/main/index.js`, add import for sanitize.js at top:

```javascript
const { validateAndSanitizeActivity } = require('../shared/sanitize');
```

- [ ] **Step 2:** Remove the inline `sanitizeString` function (around line 246-249) and `validateActivity` function (around lines 240-298). Replace usage in the `activities:save-manual` handler to use `validateAndSanitizeActivity()` from sanitize.js.

- [ ] **Step 3:** Verify the app still starts correctly

- [ ] **Step 4:** Commit

---

## Chunk 2: Bug Fixes & Infrastructure (Issues 6, 12, 13, 14, 19, 20)

### Task 3: Fix AutoUpdater unconditional initialization (Issue #12)

**Files:**
- Modify: `src/main/auto-updater.js` — lazy initialization, don't call `this.init()` in constructor

- [ ] **Step 1:** Change AutoUpdater to use lazy init pattern:

In constructor, remove `this.init()` call. Add a public `initialize()` method that does what `init()` does. Change the module export from `new AutoUpdater()` to just the class:

```javascript
// Before (line 487):
module.exports = new AutoUpdater();

// After:
module.exports = AutoUpdater;
```

- [ ] **Step 2:** Update `src/main/index.js` to instantiate and initialize explicitly:

```javascript
// Change import usage to instantiate only when needed
const AutoUpdater = require('./auto-updater');
// In init():
this.autoUpdater = new AutoUpdater();
this.autoUpdater.initialize();
```

- [ ] **Step 3:** Update `src/main/ipc/handlers/updaterHandlerMain.js` to receive the autoUpdater instance instead of requiring the module.

- [ ] **Step 4:** Commit

### Task 4: Fix rate limit map memory leak (Issue #13)

**Files:**
- Modify: `src/main/core/browser-extension-server.js` — clean stale rate limit entries

- [ ] **Step 1:** In `isRateLimited()`, when the window resets, also clean up old entries:

```javascript
isRateLimited(endpoint) {
  const now = Date.now();
  const key = endpoint;

  if (!this.requestCounts.has(key)) {
    this.requestCounts.set(key, { count: 1, windowStart: now });
    return false;
  }

  const data = this.requestCounts.get(key);
  if (now - data.windowStart > RATE_WINDOW_MS) {
    data.count = 1;
    data.windowStart = now;
    // Periodically clean up stale entries
    if (this.requestCounts.size > 100) {
      for (const [k, v] of this.requestCounts) {
        if (now - v.windowStart > RATE_WINDOW_MS) {
          this.requestCounts.delete(k);
        }
      }
    }
    return false;
  }

  data.count++;
  return data.count > RATE_LIMIT;
}
```

- [ ] **Step 2:** Commit

### Task 5: Stop browser extension server on cleanup (Issue #14)

**Files:**
- Modify: `src/main/index.js` — add `browserExtensionServer.stop()` to `cleanup()`

- [ ] **Step 1:** In the `cleanup()` method, add:

```javascript
// Stop browser extension server
if (this.browserExtensionServer) {
  this.browserExtensionServer.stop();
}
```

- [ ] **Step 2:** Commit

### Task 6: Standardize activity ID generation (Issue #19)

**Files:**
- Create: `src/shared/generate-id.js` — single ID generation utility
- Modify: `src/main/core/activity-tracker.js` (lines 496, 806)
- Modify: `src/main/core/focus-session-tracker.js` (line 80)
- Modify: `src/main/services/activityTracker.js` (lines 230, 673)

- [ ] **Step 1:** Create `src/shared/generate-id.js`:

```javascript
/**
 * Generate a collision-resistant ID using timestamp + random suffix.
 * @returns {string} Unique ID string
 */
function generateId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

module.exports = { generateId };
```

- [ ] **Step 2:** Replace all `Date.now().toString()` ID assignments across the 5 files with `generateId()`. Import at top of each file.

- [ ] **Step 3:** Commit

### Task 7: Upgrade logger to use electron-log (Issue #20)

**Files:**
- Modify: `src/main/logger.js` — use electron-log for file persistence

- [ ] **Step 1:** Rewrite logger.js to wrap electron-log:

```javascript
const log = require('electron-log');

log.transports.file.level = 'info';
log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info';

const logger = {
  init() { /* electron-log auto-initializes */ },
  info(message, data = {}) { log.info(message, data); },
  warn(message, data = {}) { log.warn(message, data); },
  error(message, ...args) { log.error(message, ...args); },
  debug(message, data = {}) { log.debug(message, data); }
};

module.exports = logger;
```

- [ ] **Step 2:** Commit

---

## Chunk 3: Renderer Refactoring — Break app.js into modules

### Task 8: Extract dashboard module from app.js

**Files:**
- Create: `src/renderer/js/modules/dashboard.js` — weekly focus score, streak, mini timeline, goals, daily summary
- Modify: `src/renderer/js/app.js` — remove extracted code, call module functions

Extract these functions (~500 lines):
- `updateWeeklyFocusScore()` (lines 1974-2086)
- `updateStreak()` (lines 2087-2175)
- `updateMiniTimeline()` (lines 2176-2246)
- `updateGoals()` (lines 2247-2327)
- `calculateDailySummaryStats()`, `updateDailySummary()`, `initDailySummary()` (lines 1180-1316)
- `getBarFillClass()` (lines 1180-1195)

- [ ] **Step 1:** Create `src/renderer/js/modules/dashboard.js` as a module under `window.LightTrack.Dashboard`
- [ ] **Step 2:** Remove extracted functions from app.js, replace with calls to the module
- [ ] **Step 3:** Add `<script src="js/modules/dashboard.js"></script>` to index.html before app.js
- [ ] **Step 4:** Commit

### Task 9: Extract timeline module from app.js

**Files:**
- Create: `src/renderer/js/modules/timeline.js` — timeline view, activity rendering, selection
- Modify: `src/renderer/js/app.js` — remove extracted code

Extract these functions (~700 lines):
- `loadTimelineView()` (lines 2597-2700)
- `renderActivityItem()` (lines 2700-2800)
- `renderGroupedActivities()` (lines 2800-2916)
- `toggleActivitySelection()`, `mergeSelectedActivities()` (lines 2917-3067)
- `getWorkDayStartMinutes()`, `renderTimelineBar()` (lines 3120-3228)

- [ ] **Step 1:** Create `src/renderer/js/modules/timeline.js` as `window.LightTrack.Timeline`
- [ ] **Step 2:** Remove from app.js, wire up module calls
- [ ] **Step 3:** Add script tag to index.html
- [ ] **Step 4:** Commit

### Task 10: Extract analytics module from app.js

**Files:**
- Create: `src/renderer/js/modules/analytics.js` — analytics calculations, view rendering
- Modify: `src/renderer/js/app.js` — remove extracted code

Extract these functions (~1700 lines):
- `getCachedActivities()`, `calculateAnalyticsStats()`, `getTrendIndicator()` (lines 3229-3545)
- Analytics view rendering and date range handling (lines 3546-4950)

- [ ] **Step 1:** Create `src/renderer/js/modules/analytics.js` as `window.LightTrack.Analytics`
- [ ] **Step 2:** Remove from app.js
- [ ] **Step 3:** Add script tag to index.html
- [ ] **Step 4:** Commit

### Task 11: Extract settings module from app.js

**Files:**
- Create: `src/renderer/js/modules/settings.js` — settings view, mappings (URL, JIRA, meeting), backup/restore, calendar
- Modify: `src/renderer/js/app.js` — remove extracted code

Extract these functions (~2000 lines):
- URL mappings (lines 4951-5189)
- JIRA mappings (lines 5190-5428)
- Meeting mappings (lines 5429-5706)
- Settings view: `loadSettings()`, `saveSettings()` (lines 5707-6187)
- Backup & Restore (lines 6188-6389)
- Calendar sync (lines 6390-6658)

- [ ] **Step 1:** Create `src/renderer/js/modules/settings.js` as `window.LightTrack.Settings`
- [ ] **Step 2:** Remove from app.js
- [ ] **Step 3:** Add script tag to index.html
- [ ] **Step 4:** Commit

### Task 12: Extract modals and entity management from app.js

**Files:**
- Create: `src/renderer/js/modules/modals.js` — modal system, tag system, project management, activity types
- Modify: `src/renderer/js/app.js` — remove extracted code

Extract these functions (~1200 lines):
- Modal system (lines 7028-7297)
- Tag system & editor & manager (lines 7298-7827)
- Project management (lines 7828-8044)
- Activity types (lines 8045-8211)
- Snake game easter egg (lines 6659-7027)

- [ ] **Step 1:** Create `src/renderer/js/modules/modals.js` as `window.LightTrack.Modals`
- [ ] **Step 2:** Remove from app.js
- [ ] **Step 3:** Add script tag to index.html
- [ ] **Step 4:** Update window.* exports at end of app.js to reference module functions
- [ ] **Step 5:** Commit

After all extractions, app.js should be ~2000 lines containing core initialization, tracking controls, activity list, event listeners, and the module compatibility layer.
