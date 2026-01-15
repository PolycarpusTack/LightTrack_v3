/**
 * Projects IPC Handler - Main Process
 * Handles project management operations
 */
const { ipcMain } = require('electron');
const logger = require('../../logger');
const { validateAndSanitizeProject, sanitizeString, sanitizeProjectName, sanitizeSapCode } = require('../../../shared/sanitize');

class ProjectsHandlerMain {
  constructor(storage) {
    this.storage = storage;
  }

  registerHandlers() {
    logger.debug('Registering Projects IPC handlers...');

    // Get all projects (system + custom)
    ipcMain.handle('projects:getAll', async () => {
      try {
        return this.storage.getProjects();
      } catch (error) {
        logger.error('Failed to get projects:', error);
        throw error;
      }
    });

    // Get project by ID
    ipcMain.handle('projects:getById', async (event, id) => {
      try {
        // Sanitize ID input
        const sanitizedId = sanitizeString(id, 100);
        if (!sanitizedId) {
          throw new Error('Invalid project ID');
        }
        return this.storage.getProjectById(sanitizedId);
      } catch (error) {
        logger.error('Failed to get project by ID:', error);
        throw error;
      }
    });

    // Add a custom project
    ipcMain.handle('projects:add', async (event, project) => {
      try {
        // Validate and sanitize project input
        const result = validateAndSanitizeProject(project);
        if (!result.valid) {
          throw new Error(result.error);
        }
        return this.storage.addProject(result.sanitized);
      } catch (error) {
        logger.error('Failed to add project:', error);
        throw error;
      }
    });

    // Update a project
    ipcMain.handle('projects:update', async (event, id, updates) => {
      try {
        // Sanitize ID
        const sanitizedId = sanitizeString(id, 100);
        if (!sanitizedId) {
          throw new Error('Invalid project ID');
        }

        // For updates, only validate fields that are actually provided
        // Don't force a name when updating only SAP fields
        const sanitizedUpdates = {};

        if (updates.name !== undefined) {
          const sanitizedName = sanitizeProjectName(updates.name);
          if (!sanitizedName) {
            throw new Error('Invalid project name');
          }
          sanitizedUpdates.name = sanitizedName;
        }

        if (updates.sapCode !== undefined) {
          sanitizedUpdates.sapCode = sanitizeSapCode(updates.sapCode);
        }

        if (updates.costCenter !== undefined) {
          sanitizedUpdates.costCenter = sanitizeSapCode(updates.costCenter);
        }

        if (updates.wbsElement !== undefined) {
          sanitizedUpdates.wbsElement = sanitizeSapCode(updates.wbsElement);
        }

        // At least one field must be updated
        if (Object.keys(sanitizedUpdates).length === 0) {
          throw new Error('No valid fields to update');
        }

        return this.storage.updateProject(sanitizedId, sanitizedUpdates);
      } catch (error) {
        logger.error('Failed to update project:', error);
        throw error;
      }
    });

    // Remove a custom project
    ipcMain.handle('projects:remove', async (event, id) => {
      try {
        // Sanitize ID input
        const sanitizedId = sanitizeString(id, 100);
        if (!sanitizedId) {
          throw new Error('Invalid project ID');
        }
        return this.storage.removeProject(sanitizedId);
      } catch (error) {
        logger.error('Failed to remove project:', error);
        throw error;
      }
    });

    logger.debug('Projects IPC handlers registered successfully');
  }
}

module.exports = ProjectsHandlerMain;
