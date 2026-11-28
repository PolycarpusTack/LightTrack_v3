// settingsHandlerMain.js - Settings IPC Handler for main.js
// Extracted from main.js to improve modularity without breaking existing functionality

const { app } = require('electron');
const logger = require('../../logger');
const {
  sanitizePattern,
  sanitizeString,
  sanitizeMappingValue
} = require('../../../shared/sanitize');

/**
 * Settings Handler for main.js
 * Registers all settings-related IPC handlers using the existing pattern
 */
// 00:00 to 23:59 (C-9)
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

class SettingsHandlerMain {
  constructor(store, appState, setupBreakReminders) {
    this.store = store;
    this.appState = appState;
    this.setupBreakReminders = setupBreakReminders;
  }

  /**
   * Register all settings IPC handlers
   */
  registerHandlers(registry) {
    logger.debug('Registering Settings IPC handlers...');

    // Get all settings
    registry.handle('settings:get-all', () => {
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
    registry.handle('settings:save', async (event, settings) => {
      try {
        // A null or missing value leaves the stored setting as it is (C-9)
        const sent = Object.fromEntries(
          Object.entries(settings || {}).filter(([, value]) => value !== null && value !== undefined)
        );
        const current = this.store.get('settings', {});
        const next = { ...current, ...sent };

        // Checked against what will be stored, not only against what was sent (C-9)
        const errors = this.validateSettings(sent, next);
        if (errors.length > 0) {
          return { success: false, errors };
        }

        this.store.set('settings', next);

        // No restart: the tracker and idle detector read the settings on every check,
        // and a restart would end the session and reset idle detection (A-6).
        this.setupBreakReminders();
        return { success: true };
      } catch (error) {
        logger.error('Failed to save settings:', error);
        return { success: false, errors: [error.message] };
      }
    });

    // Set launch at startup (login item)
    registry.handle('settings:set-launch-at-startup', (event, enabled) => {
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
    registry.handle('settings:get-launch-at-startup', () => {
      try {
        const settings = app.getLoginItemSettings();
        return { enabled: settings.openAtLogin };
      } catch (error) {
        logger.error('Failed to get launch at startup status:', error);
        return { enabled: false };
      }
    });

    // Get project mappings
    registry.handle('get-project-mappings', () => {
      return this.store.get('projectMappings', {});
    });

    // Add project mapping
    registry.handle('add-project-mapping', (event, pattern, mapping) => {
      const sanitizedPattern = sanitizePattern(pattern);
      const sanitizedMapping = sanitizeMappingValue(mapping);

      if (!sanitizedPattern || !sanitizedMapping) {
        throw new Error('Invalid pattern or project name');
      }

      const mappings = this.store.get('projectMappings', {});
      mappings[sanitizedPattern] = sanitizedMapping;
      this.store.set('projectMappings', mappings);
      return mappings;
    });

    // Remove project mapping
    registry.handle('remove-project-mapping', (event, pattern) => {
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
    registry.handle('get-url-mappings', () => {
      return this.store.get('urlProjectMappings', {});
    });

    // Add URL project mapping
    registry.handle('add-url-mapping', (event, pattern, mapping) => {
      const sanitizedPattern = sanitizePattern(pattern);
      const sanitizedProject = sanitizeMappingValue(mapping);

      if (!sanitizedPattern || !sanitizedProject) {
        throw new Error('Invalid URL pattern or project name');
      }

      const mappings = this.store.get('urlProjectMappings', {});
      mappings[sanitizedPattern] = sanitizedProject;
      this.store.set('urlProjectMappings', mappings);
      return mappings;
    });

    // Remove URL project mapping
    registry.handle('remove-url-mapping', (event, pattern) => {
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
    registry.handle('get-jira-mappings', () => {
      return this.store.get('jiraProjectMappings', {});
    });

    // Add JIRA project mapping
    registry.handle('add-jira-mapping', (event, projectKey, mapping) => {
      // Sanitize JIRA key (alphanumeric, uppercase)
      const sanitizedKey = sanitizeString(projectKey, 20).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const sanitizedProject = sanitizeMappingValue(mapping);

      if (!sanitizedKey || !sanitizedProject) {
        throw new Error('Invalid JIRA project key or project name');
      }

      const mappings = this.store.get('jiraProjectMappings', {});
      mappings[sanitizedKey] = sanitizedProject;
      this.store.set('jiraProjectMappings', mappings);
      return mappings;
    });

    // Remove JIRA project mapping
    registry.handle('remove-jira-mapping', (event, projectKey) => {
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
    registry.handle('get-meeting-mappings', () => {
      return this.store.get('meetingMappings', {});
    });

    // Add meeting subject mapping
    registry.handle('add-meeting-mapping', (event, pattern, mapping) => {
      const sanitizedPattern = sanitizePattern(pattern);
      if (!sanitizedPattern) {
        throw new Error('Invalid meeting pattern');
      }

      const sanitizedMapping = sanitizeMappingValue(mapping);
      if (!sanitizedMapping) {
        throw new Error('Invalid project name');
      }

      const mappings = this.store.get('meetingMappings', {});
      mappings[sanitizedPattern] = sanitizedMapping;
      this.store.set('meetingMappings', mappings);
      return mappings;
    });

    // Remove meeting subject mapping
    registry.handle('remove-meeting-mapping', (event, pattern) => {
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
   * Validate settings before saving. Ranges are checked for the values sent, so an old
   * stored value cannot block an unrelated save; the work day is checked as it will be
   * stored, so sending only one of its times cannot get round the check (C-9).
   * @param {Object} settings - The values sent, without null or undefined
   * @param {Object} [merged] - The stored settings with those values applied
   */
  validateSettings(settings, merged = settings) {
    const errors = [];

    // Validate workday times: HH:MM, and the end after the start
    const timeErrors = [];
    if (settings.workDayStart !== undefined && !TIME_OF_DAY.test(String(settings.workDayStart))) {
      timeErrors.push('Work day start must be a time as HH:MM');
    }
    if (settings.workDayEnd !== undefined && !TIME_OF_DAY.test(String(settings.workDayEnd))) {
      timeErrors.push('Work day end must be a time as HH:MM');
    }
    errors.push(...timeErrors);
    const timeSent = settings.workDayStart !== undefined || settings.workDayEnd !== undefined;
    if (timeSent && !timeErrors.length && TIME_OF_DAY.test(String(merged.workDayStart)) && TIME_OF_DAY.test(String(merged.workDayEnd))) {
      if (this.parseTime(merged.workDayStart) >= this.parseTime(merged.workDayEnd)) {
        errors.push('Work day end time must be after start time');
      }
    }

    // Validate break reminder interval (5 minutes to 8 hours)
    if (settings.breakReminderInterval !== undefined) {
      const interval = Number(settings.breakReminderInterval);
      if (isNaN(interval) || interval < 5 || interval > 480) {
        errors.push('Break reminder interval must be between 5 and 480 minutes');
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
