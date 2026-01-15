// lightweight-storage.js - Unified lightweight storage for LightTrack
// Consolidates multiple storage systems into a single efficient solution

const Store = require('electron-store');
const { safeStorage, app } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  MAX_ACTIVITIES,
  COMPRESSION_THRESHOLD,
  ACTIVITY_CACHE_TTL_MS
} = require('../../shared/constants');

/**
 * Get or create a per-machine encryption key using OS keychain where available
 */
function getEncryptionKey() {
  // Skip encryption in development for easier debugging
  if (process.env.NODE_ENV !== 'production') {
    return undefined;
  }

  const keyFile = path.join(app.getPath('userData'), '.keyref');

  try {
    // Check if safeStorage is available (OS keychain)
    if (safeStorage.isEncryptionAvailable()) {
      // Try to load existing encrypted key reference
      if (fs.existsSync(keyFile)) {
        const encryptedKey = fs.readFileSync(keyFile);
        const decryptedKey = safeStorage.decryptString(encryptedKey);
        return decryptedKey;
      }

      // Generate a new random key and store it securely
      const newKey = crypto.randomBytes(32).toString('hex');
      const encryptedKey = safeStorage.encryptString(newKey);
      fs.writeFileSync(keyFile, encryptedKey);
      return newKey;
    }

    // Fallback: Use machine-specific derived key (less secure but better than hardcoded)
    const machineId = `${process.platform}-${process.arch}-${app.getPath('userData')}`;
    return crypto.createHash('sha256').update(machineId).digest('hex').substring(0, 32);
  } catch (error) {
    console.error('Failed to get encryption key, falling back to derived key:', error.message);
    // Ultimate fallback
    const fallbackId = `lighttrack-${process.platform}-${app.getPath('userData')}`;
    return crypto.createHash('sha256').update(fallbackId).digest('hex').substring(0, 32);
  }
}

class LightweightStorage {
  constructor(options = {}) {
    this.options = {
      maxActivities: options.maxActivities || MAX_ACTIVITIES,
      compressionThreshold: options.compressionThreshold || COMPRESSION_THRESHOLD,
      autoCleanup: options.autoCleanup !== false,
      ...options
    };

    // Single store instance with per-machine encryption key
    this.store = new Store({
      encryptionKey: getEncryptionKey(),
      defaults: {
        activities: [],
        settings: {
          idleThreshold: 300,
          autoStart: true,
          showNotifications: true,
          promptOnReturn: true,
          autoSaveInterval: 60,
          employeeId: '',
          defaultProject: 'General',
          showFloatingTimer: false,
          floatingTimerOpacity: 0.9,
          showDailySummary: true,
          minActivityDuration: 60,
          consolidateActivities: true,
          smartSamplingEnabled: true,
          mergeGapThreshold: 300,
          trackFocusSessions: true,
          launchAtStartup: false,
          autoStartTracking: false
        },
        projectMappings: {},
        customTags: ['development', 'meeting', 'review', 'planning', 'research'],
        projects: [
          { id: 'general', name: 'General', sapCode: '', costCenter: '', wbsElement: '', isSystem: true },
          { id: 'internal-it', name: 'Internal IT', sapCode: '', costCenter: '', wbsElement: '', isSystem: true }
        ],
        activityTypes: [
          { id: 'development', name: 'Development', isSystem: true },
          { id: 'meeting', name: 'Meeting', isSystem: true },
          { id: 'code-review', name: 'Code Review', isSystem: true },
          { id: 'planning', name: 'Planning', isSystem: true },
          { id: 'research', name: 'Research', isSystem: true },
          { id: 'documentation', name: 'Documentation', isSystem: true },
          { id: 'support', name: 'Support', isSystem: true },
          { id: 'break', name: 'Break', isSystem: true }
        ],
        version: '3.0.0'
      }
    });

    // In-memory cache for performance
    this.activityCache = null;
    this.cacheTimestamp = null;
    this.cacheTTL = ACTIVITY_CACHE_TTL_MS;

    // Initialize
    this.init();
  }

  init() {
    // Migrate from old storage systems if needed
    this.migrateFromOldSystems();

    // Set up auto-cleanup if enabled
    if (this.options.autoCleanup) {
      this.setupAutoCleanup();
    }
  }

  // Migrate data from old storage systems
  migrateFromOldSystems() {
    try {
      // Check if we need to migrate from ultra-efficiency systems
      const existingActivities = this.store.get('activities', []);
      if (existingActivities.length === 0) {
        // Try to find data in old systems and migrate
        console.log('No existing activities found, checking for migration...');
        // For now, we'll just ensure the structure is correct
      }
    } catch (error) {
      console.error('Error during migration:', error);
    }
  }

  // Activity Management (Core functionality)
  async getActivities(options = {}) {
    try {
      // Check cache first
      if (this.activityCache && this.cacheTimestamp &&
                (Date.now() - this.cacheTimestamp) < this.cacheTTL) {
        return this.filterActivities(this.activityCache, options);
      }

      // Load from store
      let activities = this.store.get('activities', []);

      // Update cache
      this.activityCache = activities;
      this.cacheTimestamp = Date.now();

      return this.filterActivities(activities, options);
    } catch (error) {
      console.error('Error getting activities:', error);
      return [];
    }
  }

  async saveActivity(activity) {
    try {
      const activities = await this.getActivities();

      // Add timestamp if not present
      if (!activity.timestamp) {
        activity.timestamp = new Date().toISOString();
      }

      // Add unique ID if not present
      if (!activity.id) {
        activity.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      }

      // Add to beginning of array (most recent first)
      activities.unshift(activity);

      // Apply lightweight compression/cleanup
      const cleanedActivities = this.lightweightCleanup(activities);

      // Save to store
      this.store.set('activities', cleanedActivities);

      // Invalidate cache
      this.activityCache = null;

      return activity;
    } catch (error) {
      console.error('Error saving activity:', error);
      throw error;
    }
  }

  async updateActivity(id, updates) {
    try {
      const activities = await this.getActivities();
      // Convert to string for comparison to handle both string and number IDs
      const idStr = String(id);
      const index = activities.findIndex(a => String(a.id) === idStr);

      if (index === -1) {
        console.error('Activity not found for update:', id, 'Available IDs:', activities.slice(0, 5).map(a => a.id));
        throw new Error('Activity not found');
      }

      // Update activity
      activities[index] = { ...activities[index], ...updates };

      // Save back
      this.store.set('activities', activities);
      this.activityCache = null;

      return activities[index];
    } catch (error) {
      console.error('Error updating activity:', error);
      throw error;
    }
  }

  async deleteActivity(id) {
    try {
      const activities = await this.getActivities();
      // Convert to string for comparison to handle both string and number IDs
      const idStr = String(id);
      const filteredActivities = activities.filter(a => String(a.id) !== idStr);

      if (filteredActivities.length === activities.length) {
        console.warn('Activity not found for deletion:', id);
      }

      this.store.set('activities', filteredActivities);
      this.activityCache = null;

      return true;
    } catch (error) {
      console.error('Error deleting activity:', error);
      throw error;
    }
  }

  // Lightweight cleanup and optimization
  lightweightCleanup(activities) {
    let cleaned = [...activities];

    // 1. Remove duplicates
    const seen = new Set();
    cleaned = cleaned.filter(activity => {
      const key = `${activity.timestamp}-${activity.title || activity.name || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 2. Merge similar consecutive activities (lightweight version)
    if (this.store.get('settings.consolidateActivities', true)) {
      cleaned = this.mergeConsecutiveActivities(cleaned);
    }

    // 3. Limit total activities for performance
    if (cleaned.length > this.options.maxActivities) {
      cleaned = cleaned.slice(0, this.options.maxActivities);
    }

    // 4. Remove very short activities if setting is enabled
    const minDuration = this.store.get('settings.minActivityDuration', 60);
    cleaned = cleaned.filter(activity =>
      !activity.duration || activity.duration >= minDuration
    );

    return cleaned;
  }

  // Simple activity merging
  mergeConsecutiveActivities(activities) {
    if (activities.length <= 1) return activities;

    const merged = [];
    let current = activities[0];

    for (let i = 1; i < activities.length; i++) {
      const next = activities[i];

      // Check if activities can be merged (same name, within threshold)
      if (this.canMergeActivities(current, next)) {
        // Merge activities
        current = {
          ...current,
          duration: (current.duration || 0) + (next.duration || 0),
          endTime: next.endTime || current.endTime
        };
      } else {
        merged.push(current);
        current = next;
      }
    }

    merged.push(current);
    return merged;
  }

  canMergeActivities(activity1, activity2) {
    // Use app + title + project as the merge key (not 'name' which is often undefined)
    // All three must match AND be defined to merge
    const key1App = activity1.app;
    const key1Title = activity1.title;
    const key1Project = activity1.project;
    const key2App = activity2.app;
    const key2Title = activity2.title;
    const key2Project = activity2.project;

    // Don't merge if any key field is undefined/null
    if (!key1App || !key2App) return false;
    if (key1App !== key2App) return false;
    if (key1Title !== key2Title) return false;
    if (key1Project !== key2Project) return false;

    const threshold = this.store.get('settings.mergeGapThreshold', 300); // 5 minutes
    const time1 = new Date(activity1.timestamp || activity1.startTime).getTime();
    const time2 = new Date(activity2.timestamp || activity2.startTime).getTime();

    return Math.abs(time1 - time2) <= threshold * 1000;
  }

  // Filter activities based on options
  filterActivities(activities, options) {
    let filtered = [...activities];

    if (options.startDate || options.endDate) {
      // Use local time for date comparison to match how activities are stored
      const startDateStr = options.startDate || '1970-01-01';
      const endDateStr = options.endDate || '9999-12-31';

      filtered = filtered.filter(activity => {
        // Get activity's local date string for comparison
        let activityDateStr;
        if (activity.date) {
          // Already a date string (YYYY-MM-DD)
          activityDateStr = activity.date;
        } else {
          // Convert timestamp to local date string
          const ts = activity.timestamp || activity.startTime;
          if (!ts) return false;
          const d = new Date(ts);
          activityDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
        return activityDateStr >= startDateStr && activityDateStr <= endDateStr;
      });
    }

    if (options.project) {
      filtered = filtered.filter(activity =>
        activity.project === options.project
      );
    }

    if (options.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  // Settings Management
  getSettings() {
    return this.store.get('settings', {});
  }

  updateSettings(updates) {
    const currentSettings = this.getSettings();
    const newSettings = { ...currentSettings, ...updates };
    this.store.set('settings', newSettings);
    return newSettings;
  }

  getSetting(key, defaultValue) {
    return this.store.get(`settings.${key}`, defaultValue);
  }

  setSetting(key, value) {
    this.store.set(`settings.${key}`, value);
  }

  // Project mappings
  getProjectMappings() {
    return this.store.get('projectMappings', {});
  }

  setProjectMappings(mappings) {
    this.store.set('projectMappings', mappings);
  }

  // Auto-cleanup setup
  setupAutoCleanup() {
    // Check if auto-cleanup is enabled (default: disabled to protect user data)
    const settings = this.store.get('settings', {});
    if (!settings.autoCleanupEnabled) {
      console.log('Auto-cleanup disabled - user data preserved indefinitely');
      return;
    }

    // Clean up old activities periodically (daily)
    const cleanupInterval = 24 * 60 * 60 * 1000; // 24 hours

    setInterval(() => {
      this.performAutoCleanup();
    }, cleanupInterval);
  }

  async performAutoCleanup() {
    try {
      // Double-check setting is still enabled
      const settings = this.store.get('settings', {});
      if (!settings.autoCleanupEnabled) {
        return;
      }

      const retentionDays = settings.dataRetentionDays || 90; // Default 90 days if enabled
      const activities = await this.getActivities();
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      // Keep activities newer than retention period
      const recentActivities = activities.filter(activity =>
        new Date(activity.timestamp || activity.startTime) > cutoffDate
      );

      if (recentActivities.length !== activities.length) {
        const deletedCount = activities.length - recentActivities.length;
        this.store.set('activities', recentActivities);
        this.activityCache = null;
        console.log(`Auto-cleanup: Removed ${deletedCount} activities older than ${retentionDays} days`);
      }
    } catch (error) {
      console.error('Error during auto-cleanup:', error);
    }
  }

  // Export data
  async exportData(options = {}) {
    const activities = await this.getActivities(options);
    const settings = this.getSettings();
    const projectMappings = this.getProjectMappings();

    return {
      activities,
      settings,
      projectMappings,
      exportedAt: new Date().toISOString(),
      version: '3.0.0'
    };
  }

  // Get storage statistics
  getStats() {
    const activities = this.store.get('activities', []);
    return {
      totalActivities: activities.length,
      cacheHit: this.activityCache !== null,
      storageSize: JSON.stringify(this.store.store).length,
      lastCacheUpdate: this.cacheTimestamp
    };
  }

  // Clear all data (with confirmation)
  clearAllData() {
    this.store.clear();
    this.activityCache = null;
    this.cacheTimestamp = null;
  }
}

module.exports = LightweightStorage;
