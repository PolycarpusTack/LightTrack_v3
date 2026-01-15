const LightweightStorage = require('./lightweight-storage');
const logger = require('../logger');

/**
 * Storage Manager - Extends the existing LightweightStorage with Phase 2 enhancements
 * This preserves all existing functionality while adding new features
 */
class StorageManager extends LightweightStorage {
  constructor() {
    super({
      maxActivities: 10000,
      compressionThreshold: 1000,
      autoCleanup: true
    });

    logger.info('Storage manager initialized with existing lightweight storage');
  }

  // Override/enhance existing methods with logging
  async addActivity(activity) {
    try {
      const result = await super.saveActivity(activity);
      logger.debug('Activity added via storage manager:', activity.id);
      return result;
    } catch (error) {
      logger.error('Failed to add activity:', error);
      throw error;
    }
  }

  // Additional Phase 2 methods that don't exist in lightweight storage
  getProjectMappings() {
    try {
      return this.store.get('projectMappings', {});
    } catch (error) {
      logger.error('Failed to get project mappings:', error);
      return {};
    }
  }

  addProjectMapping(pattern, project) {
    try {
      const mappings = this.getProjectMappings();
      mappings[pattern] = project;
      this.store.set('projectMappings', mappings);
      logger.info('Project mapping added:', { pattern, project });
      return mappings;
    } catch (error) {
      logger.error('Failed to add project mapping:', error);
      throw error;
    }
  }

  removeProjectMapping(pattern) {
    try {
      const mappings = this.getProjectMappings();
      delete mappings[pattern];
      this.store.set('projectMappings', mappings);
      logger.info('Project mapping removed:', pattern);
      return mappings;
    } catch (error) {
      logger.error('Failed to remove project mapping:', error);
      throw error;
    }
  }

  // ============ TAG MANAGEMENT ============

  /**
   * Get all available tags (system + custom)
   */
  getTags() {
    try {
      const systemTags = ['meeting', 'development', 'feature', 'bugfix', 'break', 'jira', 'github'];
      const customTags = this.store.get('customTags', []);
      return {
        system: systemTags,
        custom: customTags,
        all: [...systemTags, ...customTags]
      };
    } catch (error) {
      logger.error('Failed to get tags:', error);
      return { system: [], custom: [], all: [] };
    }
  }

  /**
   * Add a custom tag
   */
  addTag(tagName) {
    try {
      const normalizedTag = tagName.toLowerCase().trim();
      if (!normalizedTag) return null;

      const customTags = this.store.get('customTags', []);
      if (!customTags.includes(normalizedTag)) {
        customTags.push(normalizedTag);
        this.store.set('customTags', customTags);
        logger.info('Custom tag added:', normalizedTag);
      }
      return this.getTags();
    } catch (error) {
      logger.error('Failed to add tag:', error);
      throw error;
    }
  }

  /**
   * Remove a custom tag
   */
  removeTag(tagName) {
    try {
      const normalizedTag = tagName.toLowerCase().trim();
      const customTags = this.store.get('customTags', []);
      const index = customTags.indexOf(normalizedTag);
      if (index > -1) {
        customTags.splice(index, 1);
        this.store.set('customTags', customTags);
        logger.info('Custom tag removed:', normalizedTag);
      }
      return this.getTags();
    } catch (error) {
      logger.error('Failed to remove tag:', error);
      throw error;
    }
  }

  /**
   * Get all unique tags used in activities
   */
  getUsedTags() {
    try {
      const activities = this.store.get('activities', []);
      const tagSet = new Set();
      activities.forEach(activity => {
        if (Array.isArray(activity.tags)) {
          activity.tags.forEach(tag => tagSet.add(tag));
        }
      });
      return Array.from(tagSet).sort();
    } catch (error) {
      logger.error('Failed to get used tags:', error);
      return [];
    }
  }

  /**
   * Update tags on an activity
   */
  updateActivityTags(activityId, tags) {
    try {
      const activities = this.store.get('activities', []);
      // Convert to string for comparison to handle both string and number IDs
      const idStr = String(activityId);
      const index = activities.findIndex(a => String(a.id) === idStr);
      if (index > -1) {
        activities[index].tags = Array.isArray(tags) ? tags : [];
        this.store.set('activities', activities);
        logger.info('Activity tags updated:', { id: activityId, tags });
        return activities[index];
      }
      logger.warn('Activity not found for tag update:', activityId);
      return null;
    } catch (error) {
      logger.error('Failed to update activity tags:', error);
      throw error;
    }
  }

  /**
   * Get activities filtered by tags
   */
  getActivitiesByTags(tags, matchAll = false) {
    try {
      const activities = this.store.get('activities', []);
      if (!Array.isArray(tags) || tags.length === 0) {
        return activities;
      }

      return activities.filter(activity => {
        const activityTags = activity.tags || [];
        if (matchAll) {
          // All specified tags must be present
          return tags.every(tag => activityTags.includes(tag));
        } else {
          // Any of the specified tags must be present
          return tags.some(tag => activityTags.includes(tag));
        }
      });
    } catch (error) {
      logger.error('Failed to get activities by tags:', error);
      return [];
    }
  }

  // ============ PROJECT MANAGEMENT ============

  /**
   * Get all projects (system + custom)
   */
  getProjects() {
    try {
      const allProjects = this.store.get('projects', []);
      const systemProjects = allProjects.filter(p => p.isSystem);
      const customProjects = allProjects.filter(p => !p.isSystem);
      return {
        system: systemProjects,
        custom: customProjects,
        all: allProjects
      };
    } catch (error) {
      logger.error('Failed to get projects:', error);
      return { system: [], custom: [], all: [] };
    }
  }

  /**
   * Get a project by ID
   */
  getProjectById(id) {
    try {
      const allProjects = this.store.get('projects', []);
      return allProjects.find(p => p.id === id) || null;
    } catch (error) {
      logger.error('Failed to get project by ID:', error);
      return null;
    }
  }

  /**
   * Add a custom project
   */
  addProject(project) {
    try {
      if (!project.name || typeof project.name !== 'string') {
        throw new Error('Project name is required');
      }

      const normalizedName = project.name.trim();
      if (!normalizedName) {
        throw new Error('Project name cannot be empty');
      }

      const allProjects = this.store.get('projects', []);

      // Check for duplicate name
      if (allProjects.some(p => p.name.toLowerCase() === normalizedName.toLowerCase())) {
        throw new Error('A project with this name already exists');
      }

      const newProject = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        name: normalizedName,
        sapCode: (project.sapCode || '').trim(),
        costCenter: (project.costCenter || '').trim(),
        wbsElement: (project.wbsElement || '').trim(),
        isSystem: false
      };

      allProjects.push(newProject);
      this.store.set('projects', allProjects);
      logger.info('Custom project added:', newProject.name);
      return this.getProjects();
    } catch (error) {
      logger.error('Failed to add project:', error);
      throw error;
    }
  }

  /**
   * Update a project (only custom projects can have name changed, system projects can update SAP fields)
   */
  updateProject(id, updates) {
    try {
      const allProjects = this.store.get('projects', []);
      const index = allProjects.findIndex(p => p.id === id);

      if (index === -1) {
        throw new Error('Project not found');
      }

      const project = allProjects[index];

      // If trying to update name on a system project, reject
      if (project.isSystem && updates.name && updates.name !== project.name) {
        throw new Error('Cannot rename system projects');
      }

      // Check for duplicate name if name is being changed
      if (updates.name && updates.name !== project.name) {
        const normalizedName = updates.name.trim();
        if (allProjects.some(p => p.id !== id && p.name.toLowerCase() === normalizedName.toLowerCase())) {
          throw new Error('A project with this name already exists');
        }
        updates.name = normalizedName;
      }

      // Update allowed fields
      allProjects[index] = {
        ...project,
        name: updates.name || project.name,
        sapCode: updates.sapCode !== undefined ? updates.sapCode.trim() : project.sapCode,
        costCenter: updates.costCenter !== undefined ? updates.costCenter.trim() : project.costCenter,
        wbsElement: updates.wbsElement !== undefined ? updates.wbsElement.trim() : project.wbsElement
      };

      this.store.set('projects', allProjects);
      logger.info('Project updated:', allProjects[index].name);
      return this.getProjects();
    } catch (error) {
      logger.error('Failed to update project:', error);
      throw error;
    }
  }

  /**
   * Remove a custom project (system projects cannot be removed)
   */
  removeProject(id) {
    try {
      const allProjects = this.store.get('projects', []);
      const project = allProjects.find(p => p.id === id);

      if (!project) {
        throw new Error('Project not found');
      }

      if (project.isSystem) {
        throw new Error('Cannot remove system projects');
      }

      const filteredProjects = allProjects.filter(p => p.id !== id);
      this.store.set('projects', filteredProjects);
      logger.info('Custom project removed:', project.name);
      return this.getProjects();
    } catch (error) {
      logger.error('Failed to remove project:', error);
      throw error;
    }
  }

  // ============ ACTIVITY TYPE MANAGEMENT ============

  /**
   * Get all activity types (system + custom)
   */
  getActivityTypes() {
    try {
      const allTypes = this.store.get('activityTypes', []);
      const systemTypes = allTypes.filter(t => t.isSystem);
      const customTypes = allTypes.filter(t => !t.isSystem);
      return {
        system: systemTypes,
        custom: customTypes,
        all: allTypes
      };
    } catch (error) {
      logger.error('Failed to get activity types:', error);
      return { system: [], custom: [], all: [] };
    }
  }

  /**
   * Add a custom activity type
   */
  addActivityType(name) {
    try {
      if (!name || typeof name !== 'string') {
        throw new Error('Activity type name is required');
      }

      const normalizedName = name.trim();
      if (!normalizedName) {
        throw new Error('Activity type name cannot be empty');
      }

      const allTypes = this.store.get('activityTypes', []);

      // Check for duplicate name (case-insensitive)
      if (allTypes.some(t => t.name.toLowerCase() === normalizedName.toLowerCase())) {
        throw new Error('An activity type with this name already exists');
      }

      const newType = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        name: normalizedName,
        isSystem: false
      };

      allTypes.push(newType);
      this.store.set('activityTypes', allTypes);
      logger.info('Custom activity type added:', newType.name);
      return this.getActivityTypes();
    } catch (error) {
      logger.error('Failed to add activity type:', error);
      throw error;
    }
  }

  /**
   * Remove a custom activity type (system types cannot be removed)
   */
  removeActivityType(id) {
    try {
      const allTypes = this.store.get('activityTypes', []);
      const activityType = allTypes.find(t => t.id === id);

      if (!activityType) {
        throw new Error('Activity type not found');
      }

      if (activityType.isSystem) {
        throw new Error('Cannot remove system activity types');
      }

      const filteredTypes = allTypes.filter(t => t.id !== id);
      this.store.set('activityTypes', filteredTypes);
      logger.info('Custom activity type removed:', activityType.name);
      return this.getActivityTypes();
    } catch (error) {
      logger.error('Failed to remove activity type:', error);
      throw error;
    }
  }

  // Export compatibility method
  async exportData() {
    try {
      return {
        activities: await this.getActivities(),
        settings: this.getSettings(),
        stats: await this.getStats(),
        projectMappings: this.getProjectMappings(),
        exportDate: new Date().toISOString(),
        version: this.store.get('version', '3.0.0')
      };
    } catch (error) {
      logger.error('Failed to export data:', error);
      throw error;
    }
  }

  // Get statistics
  async getStats() {
    try {
      const activities = await super.getActivities({});
      const now = new Date();
      // Use local date for consistency
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const weekAgoDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const weekAgo = `${weekAgoDate.getFullYear()}-${String(weekAgoDate.getMonth() + 1).padStart(2, '0')}-${String(weekAgoDate.getDate()).padStart(2, '0')}`;

      // Helper to get local date string from timestamp
      const getLocalDate = (ts) => {
        if (!ts) return null;
        const d = new Date(ts);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      };

      const todayActivities = activities.filter(a => {
        const actDate = a.date || getLocalDate(a.timestamp || a.startTime);
        return actDate === today;
      });

      const weekActivities = activities.filter(a => {
        const actDate = a.date || getLocalDate(a.timestamp || a.startTime);
        return actDate && actDate >= weekAgo;
      });

      return {
        totalActivities: activities.length,
        todayActivities: todayActivities.length,
        weekActivities: weekActivities.length,
        totalTime: activities.reduce((sum, a) => sum + (a.duration || 0), 0),
        todayTime: todayActivities.reduce((sum, a) => sum + (a.duration || 0), 0),
        weekTime: weekActivities.reduce((sum, a) => sum + (a.duration || 0), 0)
      };
    } catch (error) {
      logger.error('Failed to get stats:', error);
      return {
        totalActivities: 0,
        todayActivities: 0,
        weekActivities: 0,
        totalTime: 0,
        todayTime: 0,
        weekTime: 0
      };
    }
  }

  // Calculate today's total time
  async getTodayTotal() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const activities = await this.getActivities({
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
  }

  // Override getActivities to handle date parameter
  getActivities(date = null) {
    if (date instanceof Date || typeof date === 'string') {
      // Convert single date to date range
      const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
      return super.getActivities({
        startDate: dateStr,
        endDate: dateStr
      });
    }
    return super.getActivities(date || {});
  }

  // Find activity by app and project for a specific date (for consolidation)
  findActivityByAppAndProject(app, project, date) {
    try {
      const activities = this.store.get('activities', []);

      // Find the first activity that matches app, project, and date
      const match = activities.find(activity => {
        const activityDate = activity.date ||
          (activity.timestamp ? new Date(activity.timestamp).toISOString().split('T')[0] : null) ||
          (activity.startTime ? new Date(activity.startTime).toISOString().split('T')[0] : null);

        return activity.app === app &&
               activity.project === project &&
               activityDate === date;
      });

      if (match) {
        logger.debug('Found existing activity for consolidation:', {
          id: match.id,
          app: match.app,
          project: match.project,
          duration: match.duration
        });
      }

      return match || null;
    } catch (error) {
      logger.error('Failed to find activity by app and project:', error);
      return null;
    }
  }

  // Find activity by ID
  findActivityById(id) {
    try {
      const activities = this.store.get('activities', []);
      return activities.find(activity => activity.id === id) || null;
    } catch (error) {
      logger.error('Failed to find activity by ID:', error);
      return null;
    }
  }
}

module.exports = StorageManager;
