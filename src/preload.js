const { contextBridge, ipcRenderer } = require('electron');

// Store cleanup functions
const cleanupFunctions = new Map();

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('lightTrackAPI', {
  // Tracking controls (idempotent - safe to call multiple times)
  startTracking: async () => {
    try {
      return await ipcRenderer.invoke('tracking:start');
    } catch (error) {
      console.error('Failed to start tracking:', error);
      throw new Error('Failed to start tracking. Please try again.');
    }
  },

  stopTracking: async () => {
    try {
      return await ipcRenderer.invoke('tracking:stop');
    } catch (error) {
      console.error('Failed to stop tracking:', error);
      throw new Error('Failed to stop tracking. Please try again.');
    }
  },

  getTrackingStatus: async () => {
    try {
      return await ipcRenderer.invoke('tracking:get-current');
    } catch (error) {
      console.error('Failed to get tracking status:', error);
      return { isTracking: false, currentActivity: null };
    }
  },

  // Toggle tracking state
  toggleTracking: async () => {
    try {
      return await ipcRenderer.invoke('tracking:toggle');
    } catch (error) {
      console.error('Failed to toggle tracking:', error);
      throw new Error('Failed to toggle tracking. Please try again.');
    }
  },
  // Activities
  getActivities: async (date) => {
    try {
      return await ipcRenderer.invoke('activities:get', date);
    } catch (error) {
      console.error('Failed to get activities:', error);
      return [];
    }
  },

  addActivity: async (activity) => {
    try {
      return await ipcRenderer.invoke('activities:save-manual', activity);
    } catch (error) {
      console.error('Failed to add activity:', error);
      throw new Error('Failed to save activity. Please try again.');
    }
  },

  updateActivity: async (id, updates) => {
    try {
      return await ipcRenderer.invoke('activities:update', id, updates);
    } catch (error) {
      console.error('Failed to update activity:', error);
      throw new Error('Failed to update activity. Please try again.');
    }
  },

  deleteActivity: async (id) => {
    try {
      return await ipcRenderer.invoke('activities:delete', id);
    } catch (error) {
      console.error('Failed to delete activity:', error);
      throw new Error('Failed to delete activity. Please try again.');
    }
  },

  // Settings
  getSettings: async () => {
    try {
      return await ipcRenderer.invoke('settings:get-all');
    } catch (error) {
      console.error('Failed to get settings:', error);
      throw error;
    }
  },

  updateSettings: async (updates) => {
    try {
      return await ipcRenderer.invoke('settings:save', updates);
    } catch (error) {
      console.error('Failed to update settings:', error);
      throw new Error('Failed to save settings. Please try again.');
    }
  },

  // Launch at startup
  setLaunchAtStartup: async (enabled) => {
    try {
      return await ipcRenderer.invoke('settings:set-launch-at-startup', enabled);
    } catch (error) {
      console.error('Failed to set launch at startup:', error);
      throw new Error('Failed to update startup setting. Please try again.');
    }
  },

  getLaunchAtStartup: async () => {
    try {
      return await ipcRenderer.invoke('settings:get-launch-at-startup');
    } catch (error) {
      console.error('Failed to get launch at startup status:', error);
      return { enabled: false };
    }
  },

  // Window behavior settings
  updateWindowBehavior: async (settings) => {
    try {
      return await ipcRenderer.invoke('window:update-behavior', settings);
    } catch (error) {
      console.error('Failed to update window behavior:', error);
      throw new Error('Failed to update window behavior. Please try again.');
    }
  },

  // Project mappings
  getProjectMappings: async () => {
    try {
      return await ipcRenderer.invoke('get-project-mappings');
    } catch (error) {
      console.error('Failed to get project mappings:', error);
      return {};
    }
  },

  addProjectMapping: async (pattern, project) => {
    try {
      return await ipcRenderer.invoke('add-project-mapping', pattern, project);
    } catch (error) {
      console.error('Failed to add project mapping:', error);
      throw new Error('Failed to save project mapping. Please try again.');
    }
  },

  removeProjectMapping: async (pattern) => {
    try {
      return await ipcRenderer.invoke('remove-project-mapping', pattern);
    } catch (error) {
      console.error('Failed to remove project mapping:', error);
      throw new Error('Failed to remove project mapping. Please try again.');
    }
  },

  // URL project mappings
  getUrlMappings: async () => {
    try {
      return await ipcRenderer.invoke('get-url-mappings');
    } catch (error) {
      console.error('Failed to get URL mappings:', error);
      return {};
    }
  },

  addUrlMapping: async (pattern, project) => {
    try {
      return await ipcRenderer.invoke('add-url-mapping', pattern, project);
    } catch (error) {
      console.error('Failed to add URL mapping:', error);
      throw new Error('Failed to save URL mapping. Please try again.');
    }
  },

  removeUrlMapping: async (pattern) => {
    try {
      return await ipcRenderer.invoke('remove-url-mapping', pattern);
    } catch (error) {
      console.error('Failed to remove URL mapping:', error);
      throw new Error('Failed to remove URL mapping. Please try again.');
    }
  },

  // JIRA project mappings
  getJiraMappings: async () => {
    try {
      return await ipcRenderer.invoke('get-jira-mappings');
    } catch (error) {
      console.error('Failed to get JIRA mappings:', error);
      return {};
    }
  },

  addJiraMapping: async (projectKey, project) => {
    try {
      return await ipcRenderer.invoke('add-jira-mapping', projectKey, project);
    } catch (error) {
      console.error('Failed to add JIRA mapping:', error);
      throw new Error('Failed to save JIRA mapping. Please try again.');
    }
  },

  removeJiraMapping: async (projectKey) => {
    try {
      return await ipcRenderer.invoke('remove-jira-mapping', projectKey);
    } catch (error) {
      console.error('Failed to remove JIRA mapping:', error);
      throw new Error('Failed to remove JIRA mapping. Please try again.');
    }
  },

  // Meeting subject mappings (for Outlook/Teams)
  getMeetingMappings: async () => {
    try {
      return await ipcRenderer.invoke('get-meeting-mappings');
    } catch (error) {
      console.error('Failed to get meeting mappings:', error);
      return {};
    }
  },

  addMeetingMapping: async (pattern, mapping) => {
    try {
      return await ipcRenderer.invoke('add-meeting-mapping', pattern, mapping);
    } catch (error) {
      console.error('Failed to add meeting mapping:', error);
      throw new Error('Failed to save meeting mapping. Please try again.');
    }
  },

  removeMeetingMapping: async (pattern) => {
    try {
      return await ipcRenderer.invoke('remove-meeting-mapping', pattern);
    } catch (error) {
      console.error('Failed to remove meeting mapping:', error);
      throw new Error('Failed to remove meeting mapping. Please try again.');
    }
  },

  // Tags
  getTags: async () => {
    try {
      return await ipcRenderer.invoke('tags:getAll');
    } catch (error) {
      console.error('Failed to get tags:', error);
      return { system: [], custom: [], all: [] };
    }
  },

  getUsedTags: async () => {
    try {
      return await ipcRenderer.invoke('tags:getUsed');
    } catch (error) {
      console.error('Failed to get used tags:', error);
      return [];
    }
  },

  addTag: async (tagName) => {
    try {
      return await ipcRenderer.invoke('tags:add', tagName);
    } catch (error) {
      console.error('Failed to add tag:', error);
      throw new Error('Failed to add tag. Please try again.');
    }
  },

  removeTag: async (tagName) => {
    try {
      return await ipcRenderer.invoke('tags:remove', tagName);
    } catch (error) {
      console.error('Failed to remove tag:', error);
      throw new Error('Failed to remove tag. Please try again.');
    }
  },

  updateActivityTags: async (activityId, tags) => {
    try {
      return await ipcRenderer.invoke('tags:updateActivity', activityId, tags);
    } catch (error) {
      console.error('Failed to update activity tags:', error);
      throw new Error('Failed to update tags. Please try again.');
    }
  },

  getActivitiesByTags: async (tags, matchAll = false) => {
    try {
      return await ipcRenderer.invoke('tags:filterActivities', tags, matchAll);
    } catch (error) {
      console.error('Failed to filter activities by tags:', error);
      return [];
    }
  },

  // Projects
  getProjects: async () => {
    try {
      return await ipcRenderer.invoke('projects:getAll');
    } catch (error) {
      console.error('Failed to get projects:', error);
      return { system: [], custom: [], all: [] };
    }
  },

  getProjectById: async (id) => {
    try {
      return await ipcRenderer.invoke('projects:getById', id);
    } catch (error) {
      console.error('Failed to get project by ID:', error);
      return null;
    }
  },

  addProject: async (project) => {
    try {
      return await ipcRenderer.invoke('projects:add', project);
    } catch (error) {
      console.error('Failed to add project:', error);
      throw new Error('Failed to add project. Please try again.');
    }
  },

  updateProject: async (id, updates) => {
    try {
      return await ipcRenderer.invoke('projects:update', id, updates);
    } catch (error) {
      console.error('Failed to update project:', error);
      throw new Error('Failed to update project. Please try again.');
    }
  },

  removeProject: async (id) => {
    try {
      return await ipcRenderer.invoke('projects:remove', id);
    } catch (error) {
      console.error('Failed to remove project:', error);
      throw new Error('Failed to remove project. Please try again.');
    }
  },

  // Activity Types
  getActivityTypes: async () => {
    try {
      return await ipcRenderer.invoke('activityTypes:getAll');
    } catch (error) {
      console.error('Failed to get activity types:', error);
      return { system: [], custom: [], all: [] };
    }
  },

  addActivityType: async (name) => {
    try {
      return await ipcRenderer.invoke('activityTypes:add', name);
    } catch (error) {
      console.error('Failed to add activity type:', error);
      throw new Error('Failed to add activity type. Please try again.');
    }
  },

  removeActivityType: async (id) => {
    try {
      return await ipcRenderer.invoke('activityTypes:remove', id);
    } catch (error) {
      console.error('Failed to remove activity type:', error);
      throw new Error('Failed to remove activity type. Please try again.');
    }
  },

  // Statistics
  getStats: async () => {
    try {
      return await ipcRenderer.invoke('activities:get-stats');
    } catch (error) {
      console.error('Failed to get stats:', error);
      throw error;
    }
  },

  getTodayTotal: async () => {
    try {
      return await ipcRenderer.invoke('get-today-total');
    } catch (error) {
      console.error('Failed to get today total:', error);
      return 0;
    }
  },

  // Data management
  exportData: async () => {
    try {
      return await ipcRenderer.invoke('activities:export');
    } catch (error) {
      console.error('Failed to export data:', error);
      throw new Error('Failed to export data. Please try again.');
    }
  },

  exportToSAP: async (options) => {
    try {
      return await ipcRenderer.invoke('activities:export-sap', options);
    } catch (error) {
      console.error('Failed to export to SAP:', error);
      throw new Error('Failed to export to SAP. Please try again.');
    }
  },

  clearOldActivities: async (days) => {
    try {
      return await ipcRenderer.invoke('clear-old-activities', days);
    } catch (error) {
      console.error('Failed to clear old activities:', error);
      throw new Error('Failed to clear old activities. Please try again.');
    }
  },

  // Idle handling
  handleIdleDecision: async (wasWorking) => {
    try {
      return await ipcRenderer.invoke('handle-idle-decision', wasWorking);
    } catch (error) {
      console.error('Failed to handle idle decision:', error);
      return { success: false };
    }
  },

  // Focus stats
  getFocusStats: async () => {
    try {
      return await ipcRenderer.invoke('get-focus-stats');
    } catch (error) {
      console.error('Failed to get focus stats:', error);
      return {
        totalSessions: 0,
        todaySessions: 0,
        totalFocusTime: 0,
        averageSessionLength: 0,
        averageQuality: 0,
        todayQuality: 0
      };
    }
  },

  // Manual activity
  createManualActivity: async (activityData) => {
    try {
      return await ipcRenderer.invoke('activities:save-manual', activityData);
    } catch (error) {
      console.error('Failed to create manual activity:', error);
      throw new Error('Failed to create manual activity. Please try again.');
    }
  },

  // Add manual entry (alias for createManualActivity)
  addManualEntry: async (activityData) => {
    try {
      return await ipcRenderer.invoke('activities:save-manual', activityData);
    } catch (error) {
      console.error('Failed to add manual entry:', error);
      throw new Error('Failed to add manual entry. Please try again.');
    }
  },

  // Events
  onTrackingUpdate: (callback) => {
    // Validate callback
    if (typeof callback !== 'function') {
      throw new TypeError('Callback must be a function');
    }

    // Create wrapped listener for cleanup
    const wrappedListener = (event, ...args) => {
      try {
        callback(...args);
      } catch (error) {
        console.error('Error in tracking update callback:', error);
      }
    };

    // Register listener
    ipcRenderer.on('tracking-update', wrappedListener);

    // Return cleanup function
    const cleanup = () => {
      ipcRenderer.removeListener('tracking-update', wrappedListener);
      cleanupFunctions.delete(cleanup);
    };

    cleanupFunctions.set(cleanup, true);
    return cleanup;
  },

  onTrackingStatusChanged: (callback) => {
    if (typeof callback !== 'function') {
      throw new TypeError('Callback must be a function');
    }

    const wrappedListener = (event, ...args) => {
      try {
        callback(...args);
      } catch (error) {
        console.error('Error in status changed callback:', error);
      }
    };

    ipcRenderer.on('tracking-status-changed', wrappedListener);

    const cleanup = () => {
      ipcRenderer.removeListener('tracking-status-changed', wrappedListener);
      cleanupFunctions.delete(cleanup);
    };

    cleanupFunctions.set(cleanup, true);
    return cleanup;
  },

  onOpenSettings: (callback) => {
    if (typeof callback !== 'function') {
      throw new TypeError('Callback must be a function');
    }

    const wrappedListener = (event) => {
      try {
        callback();
      } catch (error) {
        console.error('Error in open settings callback:', error);
      }
    };

    ipcRenderer.on('open-settings', wrappedListener);

    const cleanup = () => {
      ipcRenderer.removeListener('open-settings', wrappedListener);
      cleanupFunctions.delete(cleanup);
    };

    cleanupFunctions.set(cleanup, true);
    return cleanup;
  },

  // Auto-updater
  updater: {
    checkForUpdates: async () => {
      try {
        return await ipcRenderer.invoke('updater-check-for-updates');
      } catch (error) {
        console.error('Failed to check for updates:', error);
        throw new Error('Failed to check for updates. Please try again.');
      }
    },

    downloadUpdate: async () => {
      try {
        return await ipcRenderer.invoke('updater-download-update');
      } catch (error) {
        console.error('Failed to download update:', error);
        throw new Error('Failed to download update. Please try again.');
      }
    },

    installUpdate: async () => {
      try {
        return await ipcRenderer.invoke('updater-install-update');
      } catch (error) {
        console.error('Failed to install update:', error);
        throw new Error('Failed to install update. Please try again.');
      }
    },

    getStatus: async () => {
      try {
        return await ipcRenderer.invoke('updater-get-status');
      } catch (error) {
        console.error('Failed to get updater status:', error);
        return {
          currentVersion: '0.0.0',
          updateAvailable: false,
          updateDownloaded: false,
          updateChannel: 'stable',
          preferences: {}
        };
      }
    },

    getPreferences: async () => {
      try {
        return await ipcRenderer.invoke('updater-get-preferences');
      } catch (error) {
        console.error('Failed to get updater preferences:', error);
        return {
          autoCheck: true,
          autoDownload: false,
          autoInstall: false,
          updateChannel: 'stable'
        };
      }
    },

    savePreferences: async (preferences) => {
      try {
        return await ipcRenderer.invoke('updater-save-preferences', preferences);
      } catch (error) {
        console.error('Failed to save updater preferences:', error);
        throw new Error('Failed to save update preferences. Please try again.');
      }
    },

    setChannel: async (channel) => {
      try {
        return await ipcRenderer.invoke('updater-set-channel', channel);
      } catch (error) {
        console.error('Failed to set update channel:', error);
        throw new Error('Failed to set update channel. Please try again.');
      }
    },

    skipVersion: async (version) => {
      try {
        return await ipcRenderer.invoke('updater-skip-version', version);
      } catch (error) {
        console.error('Failed to skip version:', error);
        throw new Error('Failed to skip version. Please try again.');
      }
    },

    onUpdaterEvent: (callback) => {
      if (typeof callback !== 'function') {
        throw new TypeError('Callback must be a function');
      }

      const wrappedListener = (event, data) => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in updater event callback:', error);
        }
      };

      ipcRenderer.on('updater-event', wrappedListener);

      const cleanup = () => {
        ipcRenderer.removeListener('updater-event', wrappedListener);
        cleanupFunctions.delete(cleanup);
      };

      cleanupFunctions.set(cleanup, true);
      return cleanup;
    }
  },

  // Upgrade/Installation info
  upgrade: {
    getInfo: async () => {
      try {
        return await ipcRenderer.invoke('upgrade:getInfo');
      } catch (error) {
        console.error('Failed to get upgrade info:', error);
        return null;
      }
    }
  },

  // Calendar sync (ICS subscription)
  calendar: {
    setUrl: async (url) => {
      try {
        return await ipcRenderer.invoke('calendar:set-url', url);
      } catch (error) {
        console.error('Failed to set calendar URL:', error);
        throw new Error('Failed to set calendar URL. Please try again.');
      }
    },

    getUrl: async () => {
      try {
        return await ipcRenderer.invoke('calendar:get-url');
      } catch (error) {
        console.error('Failed to get calendar URL:', error);
        return '';
      }
    },

    sync: async () => {
      try {
        return await ipcRenderer.invoke('calendar:sync');
      } catch (error) {
        console.error('Failed to sync calendar:', error);
        throw new Error('Failed to sync calendar. Please try again.');
      }
    },

    getMeetings: async (options = {}) => {
      try {
        return await ipcRenderer.invoke('calendar:get-meetings', options);
      } catch (error) {
        console.error('Failed to get meetings:', error);
        return [];
      }
    },

    getTodaysMeetings: async () => {
      try {
        return await ipcRenderer.invoke('calendar:get-today');
      } catch (error) {
        console.error('Failed to get today\'s meetings:', error);
        return [];
      }
    },

    getThisWeeksMeetings: async () => {
      try {
        return await ipcRenderer.invoke('calendar:get-week');
      } catch (error) {
        console.error('Failed to get this week\'s meetings:', error);
        return [];
      }
    },

    getUpcomingMeetings: async () => {
      try {
        return await ipcRenderer.invoke('calendar:get-upcoming');
      } catch (error) {
        console.error('Failed to get upcoming meetings:', error);
        return [];
      }
    },

    getLastSyncTime: async () => {
      try {
        return await ipcRenderer.invoke('calendar:get-last-sync');
      } catch (error) {
        console.error('Failed to get last sync time:', error);
        return null;
      }
    },

    meetingToActivity: async (meeting) => {
      try {
        return await ipcRenderer.invoke('calendar:meeting-to-activity', meeting);
      } catch (error) {
        console.error('Failed to convert meeting to activity:', error);
        throw new Error('Failed to convert meeting. Please try again.');
      }
    },

    matchProject: async (meeting) => {
      try {
        return await ipcRenderer.invoke('calendar:match-project', meeting);
      } catch (error) {
        console.error('Failed to match project:', error);
        return null;
      }
    }
  },

  // Cleanup all listeners
  cleanupAll: () => {
    cleanupFunctions.forEach((_, cleanup) => cleanup());
    cleanupFunctions.clear();
  }
});
