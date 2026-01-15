/**
 * Tags IPC Handler - Main Process
 * Handles tag management operations
 */
const { ipcMain } = require('electron');
const logger = require('../../logger');

class TagsHandlerMain {
  constructor(storage) {
    this.storage = storage;
  }

  registerHandlers() {
    logger.debug('Registering Tags IPC handlers...');

    // Get all tags (system + custom)
    ipcMain.handle('tags:getAll', async () => {
      try {
        return this.storage.getTags();
      } catch (error) {
        logger.error('Failed to get tags:', error);
        throw error;
      }
    });

    // Get tags actually used in activities
    ipcMain.handle('tags:getUsed', async () => {
      try {
        return this.storage.getUsedTags();
      } catch (error) {
        logger.error('Failed to get used tags:', error);
        throw error;
      }
    });

    // Add a custom tag
    ipcMain.handle('tags:add', async (event, tagName) => {
      try {
        return this.storage.addTag(tagName);
      } catch (error) {
        logger.error('Failed to add tag:', error);
        throw error;
      }
    });

    // Remove a custom tag
    ipcMain.handle('tags:remove', async (event, tagName) => {
      try {
        return this.storage.removeTag(tagName);
      } catch (error) {
        logger.error('Failed to remove tag:', error);
        throw error;
      }
    });

    // Update tags on an activity
    ipcMain.handle('tags:updateActivity', async (event, activityId, tags) => {
      try {
        return this.storage.updateActivityTags(activityId, tags);
      } catch (error) {
        logger.error('Failed to update activity tags:', error);
        throw error;
      }
    });

    // Get activities filtered by tags
    ipcMain.handle('tags:filterActivities', async (event, tags, matchAll = false) => {
      try {
        return this.storage.getActivitiesByTags(tags, matchAll);
      } catch (error) {
        logger.error('Failed to filter activities by tags:', error);
        throw error;
      }
    });

    logger.debug('Tags IPC handlers registered successfully');
  }
}

module.exports = TagsHandlerMain;
