// activitiesHandlerMain.js - Activities IPC Handler for main.js
// Extracted from main.js to improve modularity without breaking existing functionality

const { ipcMain, dialog, app } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../../logger');

/**
 * Activities Handler for main.js
 * Registers all activity-related IPC handlers using the existing pattern
 */
class ActivitiesHandlerMain {
  constructor(storage, store, appState, createSafeHandler, validateActivity, consolidateAllActivities) {
    this.storage = storage;
    this.store = store;
    this.appState = appState;
    this.createSafeHandler = createSafeHandler;
    this.validateActivity = validateActivity;
    this.consolidateAllActivities = consolidateAllActivities;
  }

  /**
   * Register all activities IPC handlers
   */
  registerHandlers() {
    logger.debug('Registering Activities IPC handlers...');

    // Get activities (optionally filtered by date)
    logger.debug('Registering IPC handler: activities:get');
    ipcMain.handle('activities:get', this.createSafeHandler('activities:get', async (event, date) => {
      logger.debug('activities:get handler called', { date });

      // If a date is provided, filter activities for that day
      if (date) {
        const targetDate = new Date(date);
        if (!isNaN(targetDate.getTime())) {
          // Use local date string to match how activities are stored
          const year = targetDate.getFullYear();
          const month = String(targetDate.getMonth() + 1).padStart(2, '0');
          const day = String(targetDate.getDate()).padStart(2, '0');
          const dateStr = `${year}-${month}-${day}`;
          return await this.storage.getActivities({
            startDate: dateStr,
            endDate: dateStr
          });
        }
      }

      // No date filter - return all activities
      return await this.storage.getActivities();
    }));

    // Save manual activity
    ipcMain.handle('activities:save-manual', this.createSafeHandler('activities:save-manual', async (event, activity) => {
      // Validate input
      const validation = this.validateActivity(activity);
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid activity data');
      }
      const safeActivity = validation.sanitized;

      // Calculate duration from start/end times if provided
      if (safeActivity.startTime && safeActivity.endTime) {
        const start = new Date(safeActivity.startTime);
        const end = new Date(safeActivity.endTime);
        safeActivity.duration = Math.floor((end - start) / 1000);
      }

      safeActivity.actualDuration = safeActivity.duration;
      safeActivity.isManual = true;

      // Save using lightweight storage
      const savedActivity = await this.storage.saveActivity(safeActivity);

      // Refresh UI
      if (this.appState.windows.main && !this.appState.windows.main.isDestroyed()) {
        this.appState.windows.main.webContents.send('activities-updated');
      }

      return savedActivity;
    }));

    // Update activity
    ipcMain.handle('activities:update', this.createSafeHandler('activities:update', async (event, activityId, updates) => {
      const validation = this.validateActivity(updates || {});
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid activity data');
      }
      const safeUpdates = validation.sanitized;

      // Recalculate duration if times changed
      if (safeUpdates.startTime && safeUpdates.endTime) {
        const start = new Date(safeUpdates.startTime);
        const end = new Date(safeUpdates.endTime);
        safeUpdates.duration = Math.floor((end - start) / 1000);
        safeUpdates.actualDuration = safeUpdates.duration;
      }

      // Update using lightweight storage
      const updatedActivity = await this.storage.updateActivity(activityId, safeUpdates);

      // Refresh UI
      if (this.appState.windows.main && !this.appState.windows.main.isDestroyed()) {
        this.appState.windows.main.webContents.send('activities-updated');
      }

      return updatedActivity;
    }));

    // Delete activity
    ipcMain.handle('activities:delete', this.createSafeHandler('activities:delete', async (event, activityId) => {
      const result = await this.storage.deleteActivity(activityId);

      if (this.appState.windows.main && !this.appState.windows.main.isDestroyed()) {
        this.appState.windows.main.webContents.send('activities-updated');
      }

      return { deleted: result, id: activityId };
    }));

    // Get activity by ID
    ipcMain.handle('activities:get-by-id', this.createSafeHandler('activities:get-by-id', async (event, activityId) => {
      const activities = await this.storage.getActivities() || [];
      // Convert to string for comparison to handle both string and number IDs
      const idStr = String(activityId);
      const activity = activities.find(a => String(a.id) === idStr);
      if (!activity) {
        throw new Error('Activity not found');
      }
      return activity;
    }));

    // Export activities
    ipcMain.handle('activities:export', this.createSafeHandler('activities:export', async () => {
      // Get all activities
      const activities = await this.storage.getActivities() || [];

      if (activities.length === 0) {
        throw new Error('No activities to export');
      }

      // Generate CSV
      const headers = ['Date', 'Start Time', 'End Time', 'Duration (min)', 'App', 'Title', 'Project', 'Billable'];
      const rows = activities.map(a => {
        const startDate = a.startTime ? new Date(a.startTime) : new Date();
        const endDate = a.endTime ? new Date(a.endTime) : new Date();
        return [
          startDate.toLocaleDateString(),
          startDate.toLocaleTimeString(),
          endDate.toLocaleTimeString(),
          Math.round((a.duration || 0) / 60),
          `"${(a.app || '').replace(/"/g, '""')}"`,
          `"${(a.title || '').replace(/"/g, '""')}"`,
          `"${(a.project || 'General').replace(/"/g, '""')}"`,
          a.billable !== false ? 'Yes' : 'No'
        ].join(',');
      });

      const csvData = [headers.join(','), ...rows].join('\n');

      // Default filename with date
      const today = new Date().toISOString().split('T')[0];
      const filename = `lighttrack-export-${today}.csv`;
      const documentsPath = app.getPath('documents');
      const defaultPath = path.join(documentsPath, filename);

      // Show save dialog
      const result = await dialog.showSaveDialog({
        defaultPath: defaultPath,
        filters: [
          { name: 'CSV Files', extensions: ['csv'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (!result.canceled && result.filePath) {
        await fs.writeFile(result.filePath, csvData, 'utf8');
        return result.filePath;
      }

      return null;
    }));

    // Export activities to SAP ByDesign format
    ipcMain.handle('activities:export-sap', this.createSafeHandler('activities:export-sap', async (event, options = {}) => {
      const { employeeId, data } = options;

      if (!data || data.length === 0) {
        throw new Error('No data to export');
      }

      // Generate SAP CSV with proper headers
      const headers = [
        'Employee ID',
        'Date',
        'Project',
        'Activity Type',
        'Hours',
        'SAP Code',
        'Cost Center',
        'WBS Element',
        'Work Description',
        'Billable'
      ];

      const rows = data.map(row => [
        `"${(employeeId || '').replace(/"/g, '""')}"`,
        row.date,
        `"${(row.project || '').replace(/"/g, '""')}"`,
        `"${(row.activityType || 'Development').replace(/"/g, '""')}"`,
        row.hours.toFixed(2),
        `"${(row.sapCode || '').replace(/"/g, '""')}"`,
        `"${(row.costCenter || '').replace(/"/g, '""')}"`,
        `"${(row.wbsElement || '').replace(/"/g, '""')}"`,
        `"${(row.workDescription || '').replace(/"/g, '""')}"`,
        row.billable
      ].join(','));

      const csvData = [headers.join(','), ...rows].join('\n');

      // Generate filename with date range
      const today = new Date().toISOString().split('T')[0];
      const filename = `lighttrack-sap-export-${today}.csv`;
      const documentsPath = app.getPath('documents');
      const defaultPath = path.join(documentsPath, filename);

      // Show save dialog
      const result = await dialog.showSaveDialog({
        defaultPath: defaultPath,
        title: 'Export to SAP ByDesign',
        filters: [
          { name: 'CSV Files', extensions: ['csv'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (!result.canceled && result.filePath) {
        await fs.writeFile(result.filePath, csvData, 'utf8');
        return {
          success: true,
          filePath: result.filePath,
          recordCount: data.length
        };
      }

      return null;
    }));

    // Clear old activities
    ipcMain.handle('clear-old-activities', this.createSafeHandler('clear-old-activities', async (event, days) => {
      try {
        const thirtyDaysAgo = new Date(Date.now() - (days || 30) * 24 * 60 * 60 * 1000);
        const activities = await this.storage.getActivities();

        const recentActivities = activities.filter(activity =>
          new Date(activity.timestamp) > thirtyDaysAgo
        );

        if (recentActivities.length !== activities.length) {
          this.storage.store.set('activities', recentActivities);
          // Invalidate cache if it exists
          if (this.storage.activityCache) {
            this.storage.activityCache = null;
          }
          logger.info(`Cleaned up ${activities.length - recentActivities.length} old activities`);
        }
        return { success: true, cleanedCount: activities.length - recentActivities.length };
      } catch (error) {
        logger.error('Failed to clear old activities:', error);
        throw error;
      }
    }));

    // Get activity summary
    ipcMain.handle('activities:get-summary', this.createSafeHandler('activities:get-summary', async (event, date) => {
      // Validate date input
      let targetDate;
      if (date) {
        targetDate = new Date(date);
        if (isNaN(targetDate.getTime())) {
          throw new Error('Invalid date format');
        }
      } else {
        targetDate = new Date();
      }
      const activities = await this.storage.getActivities() || [];
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Filter activities for the day
      const dayActivities = activities.filter(a => {
        const activityDate = new Date(a.startTime);
        return activityDate >= startOfDay && activityDate <= endOfDay;
      });

      // Group by hour and project
      const hourlyStats = {};

      dayActivities.forEach(activity => {
        const hour = new Date(activity.startTime).getHours();
        const key = `${hour}:00`;

        if (!hourlyStats[key]) {
          hourlyStats[key] = {
            projects: {},
            totalDuration: 0,
            activityCount: 0
          };
        }

        const project = activity.project || 'Uncategorized';
        if (!hourlyStats[key].projects[project]) {
          hourlyStats[key].projects[project] = {
            duration: 0,
            apps: new Set(),
            count: 0,
            mergedCount: 0
          };
        }

        const duration = activity.actualDuration || activity.duration || 0;
        hourlyStats[key].projects[project].duration += duration;
        hourlyStats[key].projects[project].apps.add(activity.app);
        hourlyStats[key].projects[project].count++;
        hourlyStats[key].projects[project].mergedCount += (activity.mergedCount || 1);
        hourlyStats[key].totalDuration += duration;
        hourlyStats[key].activityCount++;
      });

      // Convert Sets to Arrays for serialization
      Object.keys(hourlyStats).forEach(hour => {
        Object.keys(hourlyStats[hour].projects).forEach(project => {
          hourlyStats[hour].projects[project].apps =
            Array.from(hourlyStats[hour].projects[project].apps);
        });
      });

      // Calculate focus time
      const focusSessions = this.store.get('focusSessions') || [];
      const dayFocusSessions = focusSessions.filter(s => {
        const sessionDate = new Date(s.date);
        return sessionDate >= startOfDay && sessionDate <= endOfDay;
      });
      const focusDuration = dayFocusSessions.reduce((sum, s) => sum + s.duration, 0);

      return {
        date: targetDate.toISOString().split('T')[0],
        totalActivities: dayActivities.length,
        totalDuration: dayActivities.reduce((sum, a) => sum + (a.actualDuration || a.duration || 0), 0),
        focusDuration,
        hourlyStats
      };
    }));

    // Consolidate activities
    ipcMain.handle('activities:consolidate', this.createSafeHandler('activities:consolidate', () => {
      const result = this.consolidateAllActivities();

      // Refresh UI if main window exists
      if (this.appState.windows.main && !this.appState.windows.main.isDestroyed()) {
        this.appState.windows.main.webContents.send('activities-updated');
      }

      return result;
    }));

    // Get activity stats
    ipcMain.handle('activities:get-stats', async () => {
      try {
        // Get all activities without filters
        const activities = await this.storage.getActivities() || [];

        // Ensure activities is an array
        const activitiesArray = Array.isArray(activities) ? activities : [];

        const today = new Date();
        const todayStart = new Date(today);
        todayStart.setHours(0, 0, 0, 0);

        const todayActivities = activitiesArray.filter(a => {
          if (!a || !a.startTime) return false;
          const activityDate = new Date(a.startTime);
          return activityDate >= todayStart;
        });

        const totalDuration = todayActivities.reduce((sum, a) => sum + (a.actualDuration || a.duration || 0), 0);
        const averageSessionLength = todayActivities.length > 0 ? totalDuration / todayActivities.length : 0;

        return {
          total: activitiesArray.length,
          today: todayActivities.length,
          totalDuration,
          averageSessionLength
        };
      } catch (error) {
        logger.error('Error in activities:get-stats:', error);
        return {
          total: 0,
          today: 0,
          totalDuration: 0,
          averageSessionLength: 0
        };
      }
    });

    // Get today's total activity time
    ipcMain.handle('get-today-total', async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const activities = await this.storage.getActivities({
          startDate: today,
          endDate: today
        });

        return activities.reduce((total, activity) => {
          return total + (activity.duration || 0);
        }, 0);
      } catch (error) {
        logger.error('Failed to get today total:', error);
        return 0;
      }
    });

    // Get focus stats
    ipcMain.handle('get-focus-stats', async () => {
      try {
        const focusSessions = this.store.get('focusSessions') || [];
        const totalSessions = focusSessions.length;
        const totalFocusTime = focusSessions.reduce((sum, s) => sum + s.duration, 0);

        const today = new Date();
        const todayStart = new Date(today);
        todayStart.setHours(0, 0, 0, 0);

        const todaySessions = focusSessions.filter(s => {
          const sessionDate = new Date(s.date);
          return sessionDate >= todayStart;
        });

        const todayFocusTime = todaySessions.reduce((sum, s) => sum + s.duration, 0);

        const averageSessionLength = totalSessions > 0 ? totalFocusTime / totalSessions : 0;
        const averageQuality = focusSessions.length > 0 ? focusSessions.reduce((sum, s) => sum + s.quality, 0) / focusSessions.length : 0;
        const todayQuality = todaySessions.length > 0 ? todaySessions.reduce((sum, s) => sum + s.quality, 0) / todaySessions.length : 0;

        return {
          totalSessions,
          todaySessions: todaySessions.length,
          totalFocusTime,
          todayFocusTime,
          averageSessionLength,
          averageQuality,
          todayQuality
        };
      } catch (error) {
        logger.error('Failed to get focus stats:', error);
        return {
          totalSessions: 0,
          todaySessions: 0,
          totalFocusTime: 0,
          todayFocusTime: 0,
          averageSessionLength: 0,
          averageQuality: 0,
          todayQuality: 0
        };
      }
    });

    // Get paginated activities
    ipcMain.handle('activities:get-paginated', this.createSafeHandler('activities:get-paginated', async (event, options) => {
      const { page = 1, limit = 50, sortBy = 'startTime', sortOrder = 'desc', filter = {} } = options;
      const offset = (page - 1) * limit;

      let activities = await this.storage.getActivities() || [];

      // Apply filters
      if (filter.project) {
        activities = activities.filter(a => a.project === filter.project);
      }
      if (filter.app) {
        activities = activities.filter(a => a.app === filter.app);
      }
      if (filter.startDate) {
        const startDate = new Date(filter.startDate);
        activities = activities.filter(a => new Date(a.startTime) >= startDate);
      }
      if (filter.endDate) {
        const endDate = new Date(filter.endDate);
        activities = activities.filter(a => new Date(a.startTime) <= endDate);
      }

      // Sort
      activities.sort((a, b) => {
        const aVal = a[sortBy];
        const bVal = b[sortBy];
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortOrder === 'desc' ? -comparison : comparison;
      });

      const totalCount = activities.length;
      const paginatedActivities = activities.slice(offset, offset + limit);

      return {
        activities: paginatedActivities,
        totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit)
      };
    }));

    // Get activity count
    ipcMain.handle('activities:get-count', this.createSafeHandler('activities:get-count', async (event, filter) => {
      let activities = await this.storage.getActivities() || [];

      if (filter) {
        if (filter.project) {
          activities = activities.filter(a => a.project === filter.project);
        }
        if (filter.app) {
          activities = activities.filter(a => a.app === filter.app);
        }
        if (filter.startDate) {
          const startDate = new Date(filter.startDate);
          activities = activities.filter(a => new Date(a.startTime) >= startDate);
        }
        if (filter.endDate) {
          const endDate = new Date(filter.endDate);
          activities = activities.filter(a => new Date(a.startTime) <= endDate);
        }
      }

      return activities.length;
    }));

    // Get activities by range
    ipcMain.handle('activities:get-by-range', this.createSafeHandler('activities:get-by-range', async (event, offset, limit, sortBy, sortOrder) => {
      let activities = await this.storage.getActivities() || [];

      // Sort activities
      if (sortBy) {
        activities.sort((a, b) => {
          const aVal = a[sortBy];
          const bVal = b[sortBy];
          const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
          return sortOrder === 'desc' ? -comparison : comparison;
        });
      }

      // Apply pagination
      const paginatedActivities = activities.slice(offset, offset + limit);

      return {
        activities: paginatedActivities,
        totalCount: activities.length
      };
    }));

    logger.debug('Activities IPC handlers registered successfully');
  }
}

module.exports = ActivitiesHandlerMain;
