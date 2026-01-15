// settingsHandlerMain.js - Settings IPC Handler for main.js
// Extracted from main.js to improve modularity without breaking existing functionality

const { ipcMain, app } = require('electron');
const logger = require('../../logger');
const {
  sanitizePattern,
  sanitizeProjectName,
  sanitizeSapCode,
  sanitizeString
} = require('../../../shared/sanitize');

/**
 * Settings Handler for main.js
 * Registers all settings-related IPC handlers using the existing pattern
 */
class SettingsHandlerMain {
  constructor(store, appState, setupBreakReminders, stopTracking, startTracking) {
    this.store = store;
    this.appState = appState;
    this.setupBreakReminders = setupBreakReminders;
    this.stopTracking = stopTracking;
    this.startTracking = startTracking;
  }

  /**
   * Register all settings IPC handlers
   */
  registerHandlers() {
    logger.debug('Registering Settings IPC handlers...');

    // Get all settings
    ipcMain.handle('settings:get-all', () => {
      const settings = this.store.get('settings', {});
      return {
        ...settings,
        projectMappings: this.store.get('projectMappings'),
        patternStrings: this.store.get('patternStrings'),
        customTags: this.store.get('customTags'),
        pomodoroSettings: this.store.get('pomodoroSettings'),
        breakReminders: this.store.get('breakReminders')
      };
    });

    // Save settings with validation
    ipcMain.handle('settings:save', async (event, settings) => {
      try {
        // Validate settings
        const errors = this.validateSettings(settings);
        if (errors.length > 0) {
          return { success: false, errors };
        }

        const current = this.store.get('settings', {});
        const next = { ...current, ...settings };
        this.store.set('settings', next);

        // Apply settings that need immediate action
        // Restart tracking only if it was active (to apply new settings)
        if (this.appState.tracking.isActive) {
          // Stop tracking and wait for it to complete
          await this.stopTracking();
          // Small delay to ensure state settles
          await new Promise(resolve => setTimeout(resolve, 100));
          // Restart tracking with new settings
          await this.startTracking();
        }

        this.setupBreakReminders();
        return { success: true };
      } catch (error) {
        logger.error('Failed to save settings:', error);
        return { success: false, errors: [error.message] };
      }
    });

    // Set launch at startup (login item)
    ipcMain.handle('settings:set-launch-at-startup', (event, enabled) => {
      try {
        app.setLoginItemSettings({
          openAtLogin: enabled,
          openAsHidden: false
        });
        logger.info(`Launch at startup ${enabled ? 'enabled' : 'disabled'}`);
        return { success: true };
      } catch (error) {
        logger.error('Failed to set launch at startup:', error);
        return { success: false, error: error.message };
      }
    });

    // Get launch at startup status
    ipcMain.handle('settings:get-launch-at-startup', () => {
      try {
        const settings = app.getLoginItemSettings();
        return { enabled: settings.openAtLogin };
      } catch (error) {
        logger.error('Failed to get launch at startup status:', error);
        return { enabled: false };
      }
    });

    // Get project mappings
    ipcMain.handle('get-project-mappings', () => {
      return this.store.get('projectMappings', {});
    });

    // Add project mapping
    ipcMain.handle('add-project-mapping', (event, pattern, project, meta = {}) => {
      // Sanitize inputs
      const sanitizedPattern = sanitizePattern(pattern);
      const sanitizedProject = sanitizeProjectName(project);

      if (!sanitizedPattern || !sanitizedProject) {
        throw new Error('Invalid pattern or project name');
      }

      const mappings = this.store.get('projectMappings', {});
      mappings[sanitizedPattern] = {
        project: sanitizedProject,
        sapCode: sanitizeSapCode(meta.sapCode || ''),
        costCenter: sanitizeSapCode(meta.costCenter || ''),
        wbsElement: sanitizeSapCode(meta.wbsElement || '')
      };
      this.store.set('projectMappings', mappings);
      return mappings;
    });

    // Remove project mapping
    ipcMain.handle('remove-project-mapping', (event, pattern) => {
      const sanitizedPattern = sanitizePattern(pattern);
      if (!sanitizedPattern) {
        throw new Error('Invalid pattern');
      }
      const mappings = this.store.get('projectMappings', {});
      delete mappings[sanitizedPattern];
      this.store.set('projectMappings', mappings);
      return mappings;
    });

    // Get URL project mappings
    ipcMain.handle('get-url-mappings', () => {
      return this.store.get('urlProjectMappings', {});
    });

    // Add URL project mapping
    ipcMain.handle('add-url-mapping', (event, pattern, project) => {
      const sanitizedPattern = sanitizePattern(pattern);
      const sanitizedProject = sanitizeProjectName(project);

      if (!sanitizedPattern || !sanitizedProject) {
        throw new Error('Invalid URL pattern or project name');
      }

      const mappings = this.store.get('urlProjectMappings', {});
      mappings[sanitizedPattern] = sanitizedProject;
      this.store.set('urlProjectMappings', mappings);
      return mappings;
    });

    // Remove URL project mapping
    ipcMain.handle('remove-url-mapping', (event, pattern) => {
      const sanitizedPattern = sanitizePattern(pattern);
      if (!sanitizedPattern) {
        throw new Error('Invalid URL pattern');
      }
      const mappings = this.store.get('urlProjectMappings', {});
      delete mappings[sanitizedPattern];
      this.store.set('urlProjectMappings', mappings);
      return mappings;
    });

    // Get JIRA project mappings (project key -> project name)
    ipcMain.handle('get-jira-mappings', () => {
      return this.store.get('jiraProjectMappings', {});
    });

    // Add JIRA project mapping
    ipcMain.handle('add-jira-mapping', (event, projectKey, project) => {
      // Sanitize JIRA key (alphanumeric, uppercase)
      const sanitizedKey = sanitizeString(projectKey, 20).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const sanitizedProject = sanitizeProjectName(project);

      if (!sanitizedKey || !sanitizedProject) {
        throw new Error('Invalid JIRA project key or project name');
      }

      const mappings = this.store.get('jiraProjectMappings', {});
      mappings[sanitizedKey] = sanitizedProject;
      this.store.set('jiraProjectMappings', mappings);
      return mappings;
    });

    // Remove JIRA project mapping
    ipcMain.handle('remove-jira-mapping', (event, projectKey) => {
      const sanitizedKey = sanitizeString(projectKey, 20).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!sanitizedKey) {
        throw new Error('Invalid JIRA project key');
      }
      const mappings = this.store.get('jiraProjectMappings', {});
      delete mappings[sanitizedKey];
      this.store.set('jiraProjectMappings', mappings);
      return mappings;
    });

    // Get meeting subject mappings (for Outlook/Teams meeting subjects)
    ipcMain.handle('get-meeting-mappings', () => {
      return this.store.get('meetingMappings', {});
    });

    // Add meeting subject mapping
    ipcMain.handle('add-meeting-mapping', (event, pattern, mapping) => {
      const sanitizedPattern = sanitizePattern(pattern);
      if (!sanitizedPattern) {
        throw new Error('Invalid meeting pattern');
      }

      // Sanitize mapping fields
      const sanitizedMapping = {
        project: sanitizeProjectName(mapping?.project || ''),
        activity: sanitizeString(mapping?.activity || '', 100),
        tags: Array.isArray(mapping?.tags)
          ? mapping.tags.map(t => sanitizeString(t, 50)).filter(Boolean).slice(0, 20)
          : []
      };

      const mappings = this.store.get('meetingMappings', {});
      mappings[sanitizedPattern] = sanitizedMapping;
      this.store.set('meetingMappings', mappings);
      return mappings;
    });

    // Remove meeting subject mapping
    ipcMain.handle('remove-meeting-mapping', (event, pattern) => {
      const sanitizedPattern = sanitizePattern(pattern);
      if (!sanitizedPattern) {
        throw new Error('Invalid meeting pattern');
      }
      const mappings = this.store.get('meetingMappings', {});
      delete mappings[sanitizedPattern];
      this.store.set('meetingMappings', mappings);
      return mappings;
    });

    logger.debug('Settings IPC handlers registered successfully');
  }

  /**
   * Validate settings before saving
   */
  validateSettings(settings) {
    const errors = [];

    // Validate workday times
    if (settings.workDayStart && settings.workDayEnd) {
      const start = this.parseTime(settings.workDayStart);
      const end = this.parseTime(settings.workDayEnd);
      if (start >= end) {
        errors.push('Work day end time must be after start time');
      }
    }

    // Validate idle threshold (30 seconds to 30 minutes)
    if (settings.idleThreshold !== undefined) {
      const idle = Number(settings.idleThreshold);
      if (isNaN(idle) || idle < 30 || idle > 1800) {
        errors.push('Idle threshold must be between 30 and 1800 seconds');
      }
    }

    // Validate deep work target (1-16 hours)
    if (settings.deepWorkTarget !== undefined) {
      const target = Number(settings.deepWorkTarget);
      if (isNaN(target) || target < 1 || target > 16) {
        errors.push('Deep work target must be between 1 and 16 hours');
      }
    }

    // Validate breaks target (1-20)
    if (settings.breaksTarget !== undefined) {
      const breaks = Number(settings.breaksTarget);
      if (isNaN(breaks) || breaks < 1 || breaks > 20) {
        errors.push('Breaks target must be between 1 and 20');
      }
    }

    // Validate min activity duration (10-600 seconds)
    if (settings.minActivityDuration !== undefined) {
      const minDur = Number(settings.minActivityDuration);
      if (isNaN(minDur) || minDur < 10 || minDur > 600) {
        errors.push('Minimum activity duration must be between 10 and 600 seconds');
      }
    }

    return errors;
  }

  /**
   * Parse time string (HH:MM) to minutes from midnight
   */
  parseTime(timeStr) {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return (hours || 0) * 60 + (minutes || 0);
  }
}

module.exports = SettingsHandlerMain;
