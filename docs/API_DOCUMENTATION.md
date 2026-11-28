# LightTrack IPC reference

Generated from `src/main/ipc/contract.ts` and `src/preload/index.ts`. Do not edit by hand; regenerate with:

```
UPDATE_IPC_REFERENCE=1 npx jest --config jest.baseline.config.js -t "ipc reference"
```

Every request and reply is checked against its schema in the contract. A refused request fails with
`[INVALID_REQUEST]`; other errors carry a code in the same `[CODE] message` form. How to add a channel is in CONTRIBUTING.

## Window API (`window.lightTrackAPI`)

| Method | Channel | What it does |
|---|---|---|
| `startTracking` | `tracking:start` | Start tracking; no-op when already tracking |
| `stopTracking` | `tracking:stop` | Stop tracking; no-op when already stopped |
| `getTrackingStatus` | `tracking:get-current` | Current tracking state |
| `toggleTracking` | `tracking:toggle` | Toggle tracking |
| `getActivities` | `activities:get` | Activities for a day (YYYY-MM-DD or ISO), or all |
| `addActivity` | `activities:save-manual` | Save a manual activity |
| `updateActivity` | `activities:update` | Update an activity |
| `deleteActivity` | `activities:delete` | Delete an activity |
| `mergeActivities` | `activities:merge` | Merge activities of one project and day into the earliest |
| `createManualActivity` | `activities:save-manual` | Save a manual activity |
| `addManualEntry` | `activities:save-manual` | Save a manual activity |
| `getSettings` | `settings:get-all` | All settings |
| `updateSettings` | `settings:save` | Merge and save settings |
| `setLaunchAtStartup` | `settings:set-launch-at-startup` | Launch LightTrack at sign-in |
| `getLaunchAtStartup` | `settings:get-launch-at-startup` | Whether LightTrack launches at sign-in |
| `updateWindowBehavior` | `window:update-behavior` | Close and minimise behaviour of the main window |
| `getProjectMappings` | `get-project-mappings` | Window title pattern -> project |
| `addProjectMapping` | `add-project-mapping` | Add or replace a title mapping |
| `removeProjectMapping` | `remove-project-mapping` | Remove a title mapping |
| `getUrlMappings` | `get-url-mappings` | URL pattern -> project |
| `addUrlMapping` | `add-url-mapping` | Add or replace a URL mapping |
| `removeUrlMapping` | `remove-url-mapping` | Remove a URL mapping |
| `getJiraMappings` | `get-jira-mappings` | Jira project key -> project |
| `addJiraMapping` | `add-jira-mapping` | Add or replace a Jira mapping |
| `removeJiraMapping` | `remove-jira-mapping` | Remove a Jira mapping |
| `getMeetingMappings` | `get-meeting-mappings` | Meeting subject pattern -> project |
| `addMeetingMapping` | `add-meeting-mapping` | Add or replace a meeting mapping |
| `removeMeetingMapping` | `remove-meeting-mapping` | Remove a meeting mapping |
| `salesforce.getCaseMappings` | `salesforce:get-case-mappings` | Salesforce case number -> project |
| `salesforce.assignCase` | `salesforce:assign-case` | Remember the project for a case and move its activities to it |
| `salesforce.removeCaseMapping` | `salesforce:remove-case-mapping` | Forget the project for a case |
| `getTags` | `tags:getAll` | System and custom tags |
| `getUsedTags` | `tags:getUsed` | Tags used on activities |
| `addTag` | `tags:add` | Add a custom tag |
| `removeTag` | `tags:remove` | Remove a custom tag |
| `updateActivityTags` | `tags:updateActivity` | Replace an activity's tags |
| `getActivitiesByTags` | `tags:filterActivities` | Activities with any (or all) of the tags |
| `getProjects` | `projects:getAll` | System and custom projects |
| `getProjectById` | `projects:getById` | One project |
| `addProject` | `projects:add` | Add a custom project |
| `updateProject` | `projects:update` | Update a project |
| `removeProject` | `projects:remove` | Remove a custom project |
| `getActivityTypes` | `activityTypes:getAll` | System and custom activity types |
| `addActivityType` | `activityTypes:add` | Add a custom activity type |
| `removeActivityType` | `activityTypes:remove` | Remove a custom activity type |
| `getTodayTotal` | `get-today-total` | Today's tracked seconds |
| `exportData` | `activities:export` | Export all activities to CSV; returns the path, or null when cancelled |
| `previewSAPExport` | `activities:preview-sap` | SAP CSV preview rows |
| `exportToSAP` | `activities:export-sap` | Write the SAP CSV; null when cancelled |
| `clearOldActivities` | `clear-old-activities` | Delete activities older than N days (default 30) |
| `handleIdleDecision` | `handle-idle-decision` | Count (true) or exclude (false) the last idle period |
| `browserExtension.getStatus` | `browser-extension:get-status` | Number of paired extensions |
| `browserExtension.revokeAll` | `browser-extension:revoke-all` | Disconnect all extensions |
| `updater.checkForUpdates` | `updater-check-for-updates` | Check for updates |
| `updater.downloadUpdate` | `updater-download-update` | Download an update |
| `updater.installUpdate` | `updater-install-update` | Install a downloaded update |
| `updater.getStatus` | `updater-get-status` | Updater status |
| `updater.getPreferences` | `updater-get-preferences` | Updater preferences |
| `updater.savePreferences` | `updater-save-preferences` | Save updater preferences |
| `updater.setChannel` | `updater-set-channel` | Set the update channel |
| `updater.skipVersion` | `updater-skip-version` | Skip a version |
| `upgrade.getInfo` | `upgrade:getInfo` | Installation and upgrade details |
| `calendar.setUrl` | `calendar:set-url` | Set (or clear with "") the ICS URL and sync |
| `calendar.getUrl` | `calendar:get-url` | Masked ICS URL, or "" |
| `calendar.sync` | `calendar:sync` | Sync the calendar now |
| `calendar.getMeetings` | `calendar:get-meetings` | Synced meetings |
| `calendar.getTodaysMeetings` | `calendar:get-today` | Today's meetings |
| `calendar.getThisWeeksMeetings` | `calendar:get-week` | This week's meetings |
| `calendar.getUpcomingMeetings` | `calendar:get-upcoming` | Meetings in the next 24 hours |
| `calendar.getLastSyncTime` | `calendar:get-last-sync` | Time of the last sync |
| `calendar.meetingToActivity` | `calendar:meeting-to-activity` | Activity draft for a meeting |
| `calendar.matchProject` | `calendar:match-project` | Project mapped to a meeting, if any |
| `openExternal` | `shell:open-external` | Open an http(s) URL in the default browser |

## Channels without a window method

None: every channel in the contract has a window method.

## Events from main

Each method takes a callback and returns a function that removes it.

| Method | Event |
|---|---|
| `onTrackingUpdate` | `tracking-update` |
| `onTrackingStatusChanged` | `tracking-status-changed` |
| `onOpenSettings` | `open-settings` |
| `onActivitiesUpdated` | `activities-updated` |
| `onTrackingPaused` | `tracking-paused` |
| `onIdleReturn` | `idle-return` |
| `updater.onUpdaterEvent` | `updater-event` |
