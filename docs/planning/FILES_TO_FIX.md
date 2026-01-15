# Files to Fix

This file will document issues found during the investigation of non-working menus, along with proposed solutions.

## `src/preload.js` and `src/main/ipc/handlers/*.js` - IPC Channel Mismatch

**Problem:** There is a significant mismatch between the IPC channels exposed by `src/preload.js` (used by the frontend) and the channels handled by `ipcMain.handle` in the backend (`src/main/ipc/handlers/`). This is likely the primary reason why many frontend functionalities, including menu items, are not working.

**Proposed Solution:** Align the IPC channel names and ensure that every `ipcRenderer.invoke` call in `src/preload.js` has a corresponding `ipcMain.handle` registration in the main process. This will involve either renaming channels in `preload.js` to match existing backend handlers, or creating new backend handlers for channels that are currently unhandled.

### Specific Mismatches and Missing Handlers:

*   **`preload.js` channel: `start-tracking`**
    *   **Issue:** No direct `ipcMain.handle` found.
    *   **Action:** Investigate if `tracking:toggle` can be used, or if a new handler for `start-tracking` needs to be created.
*   **`preload.js` channel: `stop-tracking`**
    *   **Issue:** No direct `ipcMain.handle` found.
    *   **Action:** Investigate if `tracking:toggle` can be used, or if a new handler for `stop-tracking` needs to be created.
*   **`preload.js` channel: `get-tracking-status`**
    *   **Issue:** Backend has `tracking:get-current`, but the channel name is different.
    *   **Action:** Rename `get-tracking-status` in `preload.js` to `tracking:get-current` or create an alias.
*   **`preload.js` channel: `get-activities`**
    *   **Issue:** Backend has `activities:get`, but the channel name is different.
    *   **Action:** Rename `get-activities` in `preload.js` to `activities:get`.
*   **`preload.js` channel: `add-activity`**
    *   **Issue:** Backend has `activities:save-manual`. While functionally similar, the channel name is different and `add-activity` implies a general add.
    *   **Action:** Rename `add-activity` in `preload.js` to `activities:save-manual` if it's only for manual activities, or create a new general `add-activity` handler if needed.
*   **`preload.js` channel: `get-settings`**
    *   **Issue:** Backend has `settings:get-all`, but the channel name is different.
    *   **Action:** Rename `get-settings` in `preload.js` to `settings:get-all`.
*   **`preload.js` channel: `update-settings`**
    *   **Issue:** Backend has `settings:save` and `settings:update-single`. The channel name is different and granularity might differ.
    *   **Action:** Rename `update-settings` in `preload.js` to `settings:save` and ensure the payload matches, or create a new `update-settings` handler.
*   **`preload.js` channel: `get-project-mappings`**
    *   **Issue:** No direct `ipcMain.handle` found.
    *   **Action:** Create a new backend handler for `get-project-mappings`.
*   **`preload.js` channel: `add-project-mapping`**
    *   **Issue:** No direct `ipcMain.handle` found.
    *   **Action:** Create a new backend handler for `add-project-mapping`.
*   **`preload.js` channel: `get-today-total`**
    *   **Issue:** No direct `ipcMain.handle` found.
    *   **Action:** Create a new backend handler for `get-today-total`.
*   **`preload.js` channel: `clear-old-activities`**
    *   **Issue:** No direct `ipcMain.handle` found.
    *   **Action:** Create a new backend handler for `clear-old-activities`.
*   **`preload.js` channel: `handle-idle-decision`**
    *   **Issue:** No direct `ipcMain.handle` found.
    *   **Action:** Create a new backend handler for `handle-idle-decision`.
*   **`preload.js` channel: `get-focus-stats`**
    *   **Issue:** No direct `ipcMain.handle` found.
    *   **Action:** Create a new backend handler for `get-focus-stats`.
*   **`preload.js` channel: `create-manual-activity`**
    *   **Issue:** Backend has `activities:save-manual`. Functionally the same, but different channel name.
    *   **Action:** Rename `create-manual-activity` in `preload.js` to `activities:save-manual`.
*   **All `updater-*` channels (e.g., `updater-check-for-updates`, `updater-download-update`, etc.)**
    *   **Issue:** No direct `ipcMain.handle` found for any of these.
    *   **Action:** Create new backend handlers for all `updater-*` channels.