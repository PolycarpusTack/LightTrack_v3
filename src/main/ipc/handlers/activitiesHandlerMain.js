// activitiesHandlerMain.js - Activities IPC Handler for main.js
// Extracted from main.js to improve modularity without breaking existing functionality

const { dialog, app } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../../logger');
const sapCsv = require('../../exports/sap-csv');
const { toActivitiesCsv } = require('../../exports/activities-csv');
const { IpcError } = require('../../../shared/ipc/errors');
const { toWireActivity, toWireActivities } = require('../wire-activity');
const { localDay } = require('../../core/local-day');

/**
 * Activities Handler for main.js
 * Registers all activity-related IPC handlers using the existing pattern
 */
class ActivitiesHandlerMain {
  constructor(storage, store, appState, validateActivity, getTracker = () => null) {
    this.storage = storage;
    this.store = store;
    this.appState = appState;
    this.validateActivity = validateActivity;
    this.getTracker = getTracker;
  }

  /**
   * Register all activities IPC handlers
   */
  registerHandlers(registry) {
    logger.debug('Registering Activities IPC handlers...');

    // Get activities (optionally filtered by date)
    logger.debug('Registering IPC handler: activities:get');
    registry.handle('activities:get', async (event, date) => {
      logger.debug('activities:get handler called', { date });

      // A local day as YYYY-MM-DD is used as given: new Date() reads it as UTC midnight,
      // which is the day before west of UTC (C-5)
      if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return toWireActivities(await this.storage.getActivities({ startDate: date, endDate: date }));
      }

      // A timestamp means its local day
      if (date) {
        const targetDate = new Date(date);
        if (!isNaN(targetDate.getTime())) {
          const dateStr = localDay(targetDate);
          return toWireActivities(await this.storage.getActivities({
            startDate: dateStr,
            endDate: dateStr
          }));
        }
      }

      // No date filter - return all activities
      return toWireActivities(await this.storage.getActivities());
    });

    // Save manual activity
    registry.handle('activities:save-manual', async (event, activity) => {
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
      // File it on the local day it started, not the day it was typed in (A-5).
      if (safeActivity.startTime) {
        safeActivity.date = localDay(safeActivity.startTime);
      }

      safeActivity.actualDuration = safeActivity.duration;
      safeActivity.isManual = true;

      // Save using lightweight storage
      const savedActivity = await this.storage.saveActivity(safeActivity);

      // Refresh UI
      if (this.appState.windows.main && !this.appState.windows.main.isDestroyed()) {
        this.appState.windows.main.webContents.send('activities-updated');
      }

      return toWireActivity(savedActivity);
    });

    // Update activity
    registry.handle('activities:update', async (event, activityId, updates) => {
      // The tracker rewrites its current activity on the next save, which would undo the edit.
      const current = this.getTracker()?.currentActivity;
      if (current && String(current.id) === String(activityId)) {
        throw new IpcError('CONFLICT', 'Stop tracking before editing this activity');
      }

      const validation = this.validateActivity(updates || {});
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid activity data');
      }
      // The sanitiser fills title, project, app and tags; keep only the fields sent,
      // so an edit does not clear the others (#38).
      const safeUpdates = Object.fromEntries(
        Object.entries(validation.sanitized).filter(([key]) => key in updates)
      );

      // A tracked activity's duration is the time counted, not its span. Replace it with
      // the span only when the edit actually moves a time (A-4).
      const existing = (await this.storage.getActivities()).find(a => String(a.id) === String(activityId));
      const timeOf = value => (value === undefined || value === null ? NaN : new Date(value).getTime());
      const moved = key => key in safeUpdates && timeOf(safeUpdates[key]) !== timeOf(existing?.[key]);
      if (moved('startTime') || moved('endTime')) {
        const start = timeOf(safeUpdates.startTime ?? existing?.startTime);
        const end = timeOf(safeUpdates.endTime ?? existing?.endTime);
        if (Number.isFinite(start) && Number.isFinite(end)) {
          safeUpdates.duration = Math.max(0, Math.floor((end - start) / 1000));
          safeUpdates.actualDuration = safeUpdates.duration;
        }
        // A moved start moves the activity to that start's local day (A-5).
        if (Number.isFinite(start)) safeUpdates.date = localDay(start);
      } else {
        // Unchanged times: keep the stored duration, whatever the dialog computed.
        delete safeUpdates.duration;
        delete safeUpdates.actualDuration;
      }

      // Update using lightweight storage
      const updatedActivity = await this.storage.updateActivity(activityId, safeUpdates);

      // Refresh UI
      if (this.appState.windows.main && !this.appState.windows.main.isDestroyed()) {
        this.appState.windows.main.webContents.send('activities-updated');
      }

      return toWireActivity(updatedActivity);
    });

    // Delete activity
    registry.handle('activities:delete', async (event, activityId) => {
      // The tracker would add its current activity back, in full, on the next save (C-1).
      const current = this.getTracker()?.currentActivity;
      if (current && String(current.id) === String(activityId)) {
        throw new IpcError('CONFLICT', 'Stop tracking before deleting this activity');
      }
      const result = await this.storage.deleteActivity(activityId);

      if (this.appState.windows.main && !this.appState.windows.main.isDestroyed()) {
        this.appState.windows.main.webContents.send('activities-updated');
      }

      return { deleted: result, id: activityId };
    });

    // Merge activities of one project and day into the earliest (#39)
    registry.handle('activities:merge', async (event, ids) => {
      // The tracker rewrites its current activity on the next save, which would undo the merge.
      const current = this.getTracker()?.currentActivity;
      if (current && ids.some(id => String(id) === String(current.id))) {
        throw new IpcError('CONFLICT', 'Stop tracking before merging the activity that is being tracked');
      }

      const merged = this.storage.mergeActivities(ids);

      if (this.appState.windows.main && !this.appState.windows.main.isDestroyed()) {
        this.appState.windows.main.webContents.send('activities-updated');
      }

      return toWireActivity(merged);
    });

    // Export activities
    registry.handle('activities:export', async () => {
      // Get all activities
      const activities = await this.storage.getActivities() || [];

      if (activities.length === 0) {
        throw new Error('No activities to export');
      }

      // Text cells are quoted and cannot run as formulas; dates are YYYY-MM-DD (C-6)
      const csvData = toActivitiesCsv(activities);

      // Default filename with date
      const today = localDay();
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
    });

    // SAP ByDesign export (LT3-007): rows are built here from stored activities.
    // The renderer sends only the period, employee ID and per-row description edits.
    const loadSapRows = async (request) => {
      const activities = await this.storage.getActivities();
      return sapCsv.buildRows(activities, request);
    };

    registry.handle('activities:preview-sap', async (event, options) => {
      const request = sapCsv.validateRequest(options);
      const rows = await loadSapRows(request);
      return { rows };
    });

    registry.handle('activities:export-sap', async (event, options) => {
      const request = sapCsv.validateRequest(options, { requireEmployeeId: true });
      const rows = await loadSapRows(request);
      if (rows.length === 0) {
        throw new sapCsv.SapExportValidationError('No data to export');
      }

      const csvData = sapCsv.toCsv(rows, request.employeeId);

      const today = localDay();
      const filename = `lighttrack-sap-export-${today}.csv`;
      const defaultPath = path.join(app.getPath('documents'), filename);

      const result = await dialog.showSaveDialog({
        defaultPath,
        title: 'Export to SAP ByDesign',
        filters: [
          { name: 'CSV Files', extensions: ['csv'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (!result.canceled && result.filePath) {
        await fs.writeFile(result.filePath, csvData, 'utf8');
        logger.info('SAP export written', { rows: rows.length });
        return {
          success: true,
          filePath: result.filePath,
          recordCount: rows.length
        };
      }

      return null;
    });

    // Clear old activities
    registry.handle('clear-old-activities', async (event, days) => {
      try {
        const cutoff = Date.now() - (days || 30) * 24 * 60 * 60 * 1000;
        const activities = await this.storage.getActivities();

        // Same rule as the dialog's preview (A-8): old when it started before the cutoff;
        // the save time only when there is no start. Without a readable time it is kept.
        const isOld = activity => {
          const started = new Date(activity.startTime ?? activity.timestamp).getTime();
          return Number.isFinite(started) && started < cutoff;
        };
        const recentActivities = activities.filter(activity => !isOld(activity));

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
    });

    // Get today's total activity time
    registry.handle('get-today-total', async () => {
      try {
        const today = localDay();
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

    logger.debug('Activities IPC handlers registered successfully');
  }
}

module.exports = ActivitiesHandlerMain;
