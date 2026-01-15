/**
 * Activity Types IPC Handler - Main Process
 * Handles activity type management operations
 */
const { ipcMain } = require('electron');
const logger = require('../../logger');
const { sanitizeActivityTypeName, sanitizeString } = require('../../../shared/sanitize');

class ActivityTypesHandlerMain {
  constructor(storage) {
    this.storage = storage;
  }

  registerHandlers() {
    logger.debug('Registering Activity Types IPC handlers...');

    // Get all activity types (system + custom)
    ipcMain.handle('activityTypes:getAll', async () => {
      try {
        return this.storage.getActivityTypes();
      } catch (error) {
        logger.error('Failed to get activity types:', error);
        throw error;
      }
    });

    // Add a custom activity type
    ipcMain.handle('activityTypes:add', async (event, name) => {
      try {
        // Sanitize activity type name
        const sanitizedName = sanitizeActivityTypeName(name);
        if (!sanitizedName || sanitizedName.length < 2) {
          throw new Error('Activity type name must be at least 2 characters');
        }
        return this.storage.addActivityType(sanitizedName);
      } catch (error) {
        logger.error('Failed to add activity type:', error);
        throw error;
      }
    });

    // Remove a custom activity type
    ipcMain.handle('activityTypes:remove', async (event, id) => {
      try {
        // Sanitize ID input
        const sanitizedId = sanitizeString(id, 100);
        if (!sanitizedId) {
          throw new Error('Invalid activity type ID');
        }
        return this.storage.removeActivityType(sanitizedId);
      } catch (error) {
        logger.error('Failed to remove activity type:', error);
        throw error;
      }
    });

    logger.debug('Activity Types IPC handlers registered successfully');
  }
}

module.exports = ActivityTypesHandlerMain;
