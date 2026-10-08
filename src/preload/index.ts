/**
 * Preload bridge (LT3-003).
 *
 * Exposes window.lightTrackAPI. Every method maps to one channel of the IPC contract
 * (src/main/ipc/contract.ts); the Channel type makes an unknown channel a build
 * error, and main validates every request and response. There is no generic
 * invoke passthrough.
 *
 * Bundled by esbuild into out/preload.js: sandboxed preloads cannot require local files.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { Channel } from '../main/ipc/contract';
import { decodeIpcError } from '../shared/ipc/errors';

type Listener = (...args: unknown[]) => void;

/**
 * On failure: throw a fixed user-facing message, or main's message (falling back to the given one).
 * Failures are never replaced by an empty result; the renderer shows the message (#45).
 */
type OnError =
  | { message: string }
  | { useMainMessage: string };

function call(channel: Channel, onError: OnError, label: string) {
  return async (...args: unknown[]): Promise<unknown> => {
    try {
      return await ipcRenderer.invoke(channel, ...args);
    } catch (raw) {
      const error = decodeIpcError(raw, channel);
      console.error(`Failed to ${label}:`, `[${error.code}] ${error.message}`);
      if ('message' in onError) throw new Error(onError.message);
      throw new Error(error.message || onError.useMainMessage);
    }
  };
}

const fail = (message: string): OnError => ({ message });
const failLoad = (what: string): OnError => fail(`Failed to load ${what}.`);

// Store cleanup functions for event listeners
const cleanupFunctions = new Set<() => void>();

function subscribe(event: 'tracking-update' | 'tracking-status-changed' | 'open-settings' | 'updater-event', label: string, passArgs: 'all' | 'none' | 'first') {
  return (callback: Listener): (() => void) => {
    if (typeof callback !== 'function') {
      throw new TypeError('Callback must be a function');
    }
    const wrapped = (_event: IpcRendererEvent, ...args: unknown[]) => {
      try {
        if (passArgs === 'all') callback(...args);
        else if (passArgs === 'first') callback(args[0]);
        else callback();
      } catch (error) {
        console.error(`Error in ${label} callback:`, error);
      }
    };
    ipcRenderer.on(event, wrapped);
    const cleanup = () => {
      ipcRenderer.removeListener(event, wrapped);
      cleanupFunctions.delete(cleanup);
    };
    cleanupFunctions.add(cleanup);
    return cleanup;
  };
}

contextBridge.exposeInMainWorld('lightTrackAPI', {
  // Tracking
  startTracking: call('tracking:start', fail('Failed to start tracking. Please try again.'), 'start tracking'),
  stopTracking: call('tracking:stop', fail('Failed to stop tracking. Please try again.'), 'stop tracking'),
  getTrackingStatus: call('tracking:get-current', failLoad('the tracking status'), 'get tracking status'),
  toggleTracking: call('tracking:toggle', fail('Failed to toggle tracking. Please try again.'), 'toggle tracking'),

  // Activities
  getActivities: call('activities:get', failLoad('activities'), 'get activities'),
  addActivity: call('activities:save-manual', fail('Failed to save activity. Please try again.'), 'add activity'),
  updateActivity: call('activities:update', fail('Failed to update activity. Please try again.'), 'update activity'),
  deleteActivity: call('activities:delete', fail('Failed to delete activity. Please try again.'), 'delete activity'),
  createManualActivity: call('activities:save-manual', fail('Failed to create manual activity. Please try again.'), 'create manual activity'),
  addManualEntry: call('activities:save-manual', fail('Failed to add manual entry. Please try again.'), 'add manual entry'),

  // Settings
  getSettings: call('settings:get-all', { useMainMessage: 'Failed to load settings.' }, 'get settings'),
  updateSettings: call('settings:save', fail('Failed to save settings. Please try again.'), 'update settings'),
  setLaunchAtStartup: call('settings:set-launch-at-startup', fail('Failed to update startup setting. Please try again.'), 'set launch at startup'),
  getLaunchAtStartup: call('settings:get-launch-at-startup', failLoad('the startup setting'), 'get launch at startup status'),
  updateWindowBehavior: call('window:update-behavior', fail('Failed to update window behavior. Please try again.'), 'update window behavior'),

  // Mappings
  getProjectMappings: call('get-project-mappings', failLoad('app rules'), 'get project mappings'),
  addProjectMapping: call('add-project-mapping', fail('Failed to save project mapping. Please try again.'), 'add project mapping'),
  removeProjectMapping: call('remove-project-mapping', fail('Failed to remove project mapping. Please try again.'), 'remove project mapping'),
  getUrlMappings: call('get-url-mappings', failLoad('URL rules'), 'get URL mappings'),
  addUrlMapping: call('add-url-mapping', fail('Failed to save URL mapping. Please try again.'), 'add URL mapping'),
  removeUrlMapping: call('remove-url-mapping', fail('Failed to remove URL mapping. Please try again.'), 'remove URL mapping'),
  getJiraMappings: call('get-jira-mappings', failLoad('Jira rules'), 'get Jira mappings'),
  addJiraMapping: call('add-jira-mapping', fail('Failed to save JIRA mapping. Please try again.'), 'add Jira mapping'),
  removeJiraMapping: call('remove-jira-mapping', fail('Failed to remove JIRA mapping. Please try again.'), 'remove Jira mapping'),
  getMeetingMappings: call('get-meeting-mappings', failLoad('meeting rules'), 'get meeting mappings'),
  addMeetingMapping: call('add-meeting-mapping', fail('Failed to save meeting mapping. Please try again.'), 'add meeting mapping'),
  removeMeetingMapping: call('remove-meeting-mapping', fail('Failed to remove meeting mapping. Please try again.'), 'remove meeting mapping'),

  // Salesforce case memory (#48)
  salesforce: {
    getCaseMappings: call('salesforce:get-case-mappings', { useMainMessage: 'Failed to load Salesforce cases.' }, 'get Salesforce cases'),
    assignCase: call('salesforce:assign-case', { useMainMessage: 'Failed to save the Salesforce case.' }, 'assign Salesforce case'),
    removeCaseMapping: call('salesforce:remove-case-mapping', { useMainMessage: 'Failed to remove the Salesforce case.' }, 'remove Salesforce case')
  },

  // Tags
  getTags: call('tags:getAll', failLoad('tags'), 'get tags'),
  getUsedTags: call('tags:getUsed', failLoad('tags'), 'get used tags'),
  addTag: call('tags:add', fail('Failed to add tag. Please try again.'), 'add tag'),
  removeTag: call('tags:remove', fail('Failed to remove tag. Please try again.'), 'remove tag'),
  updateActivityTags: call('tags:updateActivity', fail('Failed to update tags. Please try again.'), 'update activity tags'),
  getActivitiesByTags: (tags: unknown, matchAll: unknown = false) =>
    call('tags:filterActivities', failLoad('activities'), 'filter activities by tags')(tags, matchAll),

  // Projects
  getProjects: call('projects:getAll', failLoad('projects'), 'get projects'),
  getProjectById: call('projects:getById', failLoad('the project'), 'get project by ID'),
  addProject: call('projects:add', fail('Failed to add project. Please try again.'), 'add project'),
  updateProject: call('projects:update', fail('Failed to update project. Please try again.'), 'update project'),
  removeProject: call('projects:remove', fail('Failed to remove project. Please try again.'), 'remove project'),

  // Activity types
  getActivityTypes: call('activityTypes:getAll', failLoad('activity types'), 'get activity types'),
  addActivityType: call('activityTypes:add', fail('Failed to add activity type. Please try again.'), 'add activity type'),
  removeActivityType: call('activityTypes:remove', fail('Failed to remove activity type. Please try again.'), 'remove activity type'),

  // Statistics
  getStats: call('activities:get-stats', { useMainMessage: 'Failed to load statistics.' }, 'get stats'),
  getTodayTotal: call('get-today-total', failLoad("today's total"), 'get today total'),
  getFocusStats: call('get-focus-stats', failLoad('focus statistics'), 'get focus stats'),

  // Data management and exports
  exportData: call('activities:export', fail('Failed to export data. Please try again.'), 'export data'),
  // SAP export errors keep main's message (e.g. a validation error).
  previewSAPExport: call('activities:preview-sap', { useMainMessage: 'Failed to load the SAP preview.' }, 'load SAP preview'),
  exportToSAP: call('activities:export-sap', { useMainMessage: 'Failed to export to SAP. Please try again.' }, 'export to SAP'),
  clearOldActivities: call('clear-old-activities', fail('Failed to clear old activities. Please try again.'), 'clear old activities'),

  // Idle handling
  handleIdleDecision: call('handle-idle-decision', fail('Failed to apply the idle decision. Please try again.'), 'handle idle decision'),

  // Browser extension pairing (LT3-004)
  browserExtension: {
    getStatus: call('browser-extension:get-status', { useMainMessage: 'Failed to load extension status.' }, 'get extension status'),
    revokeAll: call('browser-extension:revoke-all', { useMainMessage: 'Failed to disconnect extensions.' }, 'revoke extensions')
  },

  // Events
  onTrackingUpdate: subscribe('tracking-update', 'tracking update', 'all'),
  onTrackingStatusChanged: subscribe('tracking-status-changed', 'status changed', 'all'),
  onOpenSettings: subscribe('open-settings', 'open settings', 'none'),

  // Auto-updater (in-app updates are disabled; see src/main/update-policy.js)
  updater: {
    checkForUpdates: call('updater-check-for-updates', fail('Failed to check for updates. Please try again.'), 'check for updates'),
    downloadUpdate: call('updater-download-update', fail('Failed to download update. Please try again.'), 'download update'),
    installUpdate: call('updater-install-update', fail('Failed to install update. Please try again.'), 'install update'),
    getStatus: call('updater-get-status', failLoad('the update status'), 'get updater status'),
    getPreferences: call('updater-get-preferences', failLoad('update preferences'), 'get updater preferences'),
    savePreferences: call('updater-save-preferences', fail('Failed to save update preferences. Please try again.'), 'save updater preferences'),
    setChannel: call('updater-set-channel', fail('Failed to set update channel. Please try again.'), 'set update channel'),
    skipVersion: call('updater-skip-version', fail('Failed to skip version. Please try again.'), 'skip version'),
    onUpdaterEvent: subscribe('updater-event', 'updater event', 'first')
  },

  // Upgrade/installation info
  upgrade: {
    getInfo: call('upgrade:getInfo', failLoad('installation details'), 'get upgrade info')
  },

  // Calendar sync (ICS subscription)
  calendar: {
    setUrl: call('calendar:set-url', fail('Failed to set calendar URL. Please try again.'), 'set calendar URL'),
    getUrl: call('calendar:get-url', failLoad('the calendar URL'), 'get calendar URL'),
    sync: call('calendar:sync', fail('Failed to sync calendar. Please try again.'), 'sync calendar'),
    getMeetings: (options: unknown = {}) => call('calendar:get-meetings', failLoad('meetings'), 'get meetings')(options),
    getTodaysMeetings: call('calendar:get-today', failLoad('meetings'), "get today's meetings"),
    getThisWeeksMeetings: call('calendar:get-week', failLoad('meetings'), "get this week's meetings"),
    getUpcomingMeetings: call('calendar:get-upcoming', failLoad('meetings'), 'get upcoming meetings'),
    getLastSyncTime: call('calendar:get-last-sync', failLoad('the last sync time'), 'get last sync time'),
    meetingToActivity: call('calendar:meeting-to-activity', fail('Failed to convert meeting. Please try again.'), 'convert meeting to activity'),
    matchProject: call('calendar:match-project', failLoad('the meeting project'), 'match project')
  },

  // Open an external URL in the system browser
  openExternal: call('shell:open-external', fail('Failed to open URL. Please try again.'), 'open external URL'),

  // Remove all event listeners
  cleanupAll: () => {
    for (const cleanup of [...cleanupFunctions]) cleanup();
    cleanupFunctions.clear();
  }
});
