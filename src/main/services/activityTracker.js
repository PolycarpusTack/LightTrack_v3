// activityTracker.js - Activity Tracking Service
const activeWin = require('active-win');
const { Notification } = require('electron');
const path = require('path');

/**
 * ActivityTracker Service
 * Handles time tracking logic, activity detection, and activity lifecycle
 */
class ActivityTracker {
  constructor(store, storage, doNotTrackManager) {
    this.store = store;
    this.storage = storage;
    this.doNotTrackManager = doNotTrackManager;

    // Tracking state
    this.state = {
      isActive: false,
      currentActivity: null,
      lastActivityTime: Date.now(),
      lastIdleCheck: Date.now(),
      sessionStartTime: null
    };

    // Interval management with proper tracking
    this.intervals = new Map();
    this.timeouts = new Map();

    // Dynamic sampling configuration
    this.currentCheckInterval = 60000; // 1 minute default
    this.stableActivityCount = 0;

    // Asset path for notifications
    this.iconPath = path.join(__dirname, '../../../assets/icon.png');

    // Activity history cache with size limit
    this.activityCache = {
      recent: [],
      maxSize: 100 // Limit recent activities to prevent memory growth
    };
  }

  // ================== Interval Management ==================

  /**
   * Create and track an interval
   */
  createInterval(name, callback, delay) {
    // Clear existing interval if any
    this.clearInterval(name);

    const intervalId = setInterval(callback, delay);
    this.intervals.set(name, intervalId);
    return intervalId;
  }

  /**
   * Clear a tracked interval
   */
  clearInterval(name) {
    const intervalId = this.intervals.get(name);
    if (intervalId) {
      clearInterval(intervalId);
      this.intervals.delete(name);
    }
  }

  /**
   * Create and track a timeout
   */
  createTimeout(name, callback, delay) {
    // Clear existing timeout if any
    this.clearTimeout(name);

    const timeoutId = setTimeout(callback, delay);
    this.timeouts.set(name, timeoutId);
    return timeoutId;
  }

  /**
   * Clear a tracked timeout
   */
  clearTimeout(name) {
    const timeoutId = this.timeouts.get(name);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.timeouts.delete(name);
    }
  }

  /**
   * Clear all intervals and timeouts
   */
  clearAllTimers() {
    // Clear all intervals
    this.intervals.forEach((intervalId, name) => {
      clearInterval(intervalId);
    });
    this.intervals.clear();

    // Clear all timeouts
    this.timeouts.forEach((timeoutId, name) => {
      clearTimeout(timeoutId);
    });
    this.timeouts.clear();
  }

  // ================== Core Tracking Methods ==================

  toggleTracking() {
    if (this.state.isActive) {
      this.stopTracking();
    } else {
      this.startTracking();
    }
    return this.state.isActive;
  }

  startTracking() {
    this.state.isActive = true;
    global.isTracking = true; // For ultra-lightweight features compatibility
    this.state.lastActivityTime = Date.now();
    this.state.sessionStartTime = new Date().toISOString();

    // Reset sampling rate on start
    this.currentCheckInterval = 60000;
    this.stableActivityCount = 0;

    // Start tracking interval with dynamic rate
    this.createInterval('tracking', () => this.detectActivity(), this.currentCheckInterval);
    this.detectActivity(); // Initial detection

    // Start auto-save interval
    const autoSaveSeconds = this.store.get('settings.autoSaveInterval') || 60;
    this.createInterval('autoSave', () => {
      this.autoSaveCurrentActivity();
    }, autoSaveSeconds * 1000);

    if (this.store.get('settings.showNotifications')) {
      new Notification('LightTrack', {
        body: 'Time tracking started',
        icon: this.iconPath
      });
    }
  }

  stopTracking() {
    this.state.isActive = false;
    global.isTracking = false;

    // Clear all intervals using managed approach
    this.clearInterval('tracking');
    this.clearInterval('autoSave');

    // Clear any other timers
    this.clearAllTimers();

    this.saveCurrentActivity();
    this.state.currentActivity = null;

    if (this.store.get('settings.showNotifications')) {
      new Notification('LightTrack', {
        body: 'Time tracking paused',
        icon: this.iconPath
      });
    }
  }

  // ================== Activity Detection ==================

  async detectActivity() {
    if (!this.state.isActive) return;

    try {
      const windowInfo = await this.getActiveWindowInfo();
      if (!windowInfo) return;

      // Handle window change
      if (this.hasWindowChanged(windowInfo)) {
        this.saveCurrentActivity();
        this.startNewActivity(windowInfo);
      } else if (this.state.currentActivity) {
        this.updateCurrentActivity();
      }

      // Handle idle detection
      this.handleIdleDetection();

    } catch (error) {
      console.error('Error detecting activity:', error);
    }
  }

  async getActiveWindowInfo() {
    try {
      const win = await activeWin();
      if (!win || !win.title) return null;

      // Check Do Not Track
      const doNotTrackInfo = this.doNotTrackManager ?
        await this.doNotTrackManager.checkWindow(win) :
        { doNotTrack: false };

      return {
        app: win.owner ? win.owner.name : 'Unknown',
        title: win.title,
        ...doNotTrackInfo
      };
    } catch (error) {
      console.error('Error getting active window:', error);
      return null;
    }
  }

  hasWindowChanged(windowInfo) {
    if (!this.state.currentActivity) return true;

    return this.state.currentActivity.app !== windowInfo.app ||
           this.state.currentActivity.title !== windowInfo.title;
  }

  // ================== Activity Management ==================

  startNewActivity(windowInfo) {
    const extracted = this.extractActivityMetadata(windowInfo);
    const projectName = this.determineProject(windowInfo, extracted);
    const projectConfig = this.getProjectConfig(projectName);

    this.state.currentActivity = {
      id: Date.now().toString(),
      startTime: new Date().toISOString(),
      app: windowInfo.app,
      title: windowInfo.title,
      project: projectName,
      tickets: extracted.tickets,
      tags: extracted.tags,
      duration: 0,
      billable: this.determineBillable(extracted.tags, projectConfig),
      sapCode: projectConfig.sapCode || '',
      costCenter: projectConfig.costCenter || '',
      poNumber: projectConfig.poNumber || '',
      wbsElement: projectConfig.wbsElement || '',
      lastUpdate: new Date().toISOString(),
      metadata: extracted.metadata,
      idlePeriods: [],
      doNotTrack: windowInfo.doNotTrack || false,
      doNotTrackCategory: windowInfo.doNotTrackCategory || null,
      doNotTrackReason: windowInfo.doNotTrackReason || null
    };
  }

  updateCurrentActivity() {
    if (!this.state.currentActivity) return;

    const now = Date.now();
    const startTime = new Date(this.state.currentActivity.startTime).getTime();
    this.state.currentActivity.duration = Math.floor((now - startTime) / 1000);
    this.state.currentActivity.lastUpdate = new Date().toISOString();
    this.state.lastActivityTime = now;
  }

  saveCurrentActivity(showNotification = false) {
    const activity = this.state.currentActivity;

    if (!this.shouldSaveActivity(activity)) return;

    // Set end time and calculate durations
    activity.endTime = new Date().toISOString();
    this.calculateActualDuration(activity);

    // Try to merge with previous activity if enabled
    if (this.tryMergeActivity(activity, showNotification)) {
      return; // Activity was merged
    }

    // Save activity to store
    this.saveActivityToStore(activity);

    // Show notification if requested
    if (showNotification && this.store.get('settings.showNotifications')) {
      this.showActivitySavedNotification(activity);
    }
  }

  autoSaveCurrentActivity() {
    const activity = this.state.currentActivity;
    if (!activity) return;

    const minDuration = this.store.get('settings.minActivityDuration') || 60;
    if (activity.duration < minDuration) return;

    this.updateCurrentActivity();
  }

  // ================== Helper Methods ==================

  extractActivityMetadata(windowInfo) {
    // This would normally use a pattern extractor service
    // For now, simplified implementation
    const tickets = [];
    const tags = [];
    const metadata = {};

    // Extract ticket numbers (e.g., JIRA-1234)
    const ticketMatch = windowInfo.title.match(/[A-Z]+-\d+/g);
    if (ticketMatch) {
      tickets.push(...ticketMatch);
    }

    // Extract common tags
    if (windowInfo.title.toLowerCase().includes('meeting')) {
      tags.push('meeting');
    }
    if (windowInfo.title.toLowerCase().includes('review')) {
      tags.push('review');
    }

    return { tickets, tags, metadata };
  }

  determineProject(windowInfo, extracted) {
    // Check JIRA ticket in URL or title first (highest priority)
    const jiraProject = this.detectJiraProject(windowInfo);
    if (jiraProject) {
      return jiraProject;
    }

    // Check URL mappings for browser activities
    if (windowInfo.url) {
      const urlMappings = this.store.get('urlProjectMappings') || {};
      for (const [pattern, project] of Object.entries(urlMappings)) {
        if (windowInfo.url.includes(pattern)) {
          return project;
        }
      }
    }

    // Check extracted project
    if (extracted.project) {
      return extracted.project;
    }

    // Default project
    return this.store.get('settings.defaultProject') || 'Uncategorized';
  }

  /**
   * Detect JIRA project from URL or window title
   * Looks for patterns like PROJ-123 and maps PROJ to a project name
   */
  detectJiraProject(windowInfo) {
    const jiraMappings = this.store.get('jiraProjectMappings') || {};
    if (Object.keys(jiraMappings).length === 0) {
      return null;
    }

    // JIRA ticket pattern: PROJECT-123
    const ticketPattern = /\b([A-Z][A-Z0-9]{1,9})-\d+\b/g;

    // Check URL first (more reliable)
    if (windowInfo.url) {
      const urlMatches = windowInfo.url.toUpperCase().match(ticketPattern);
      if (urlMatches) {
        for (const match of urlMatches) {
          const projectKey = match.split('-')[0];
          if (jiraMappings[projectKey]) {
            return jiraMappings[projectKey];
          }
        }
      }
    }

    // Check window title
    if (windowInfo.title) {
      const titleMatches = windowInfo.title.toUpperCase().match(ticketPattern);
      if (titleMatches) {
        for (const match of titleMatches) {
          const projectKey = match.split('-')[0];
          if (jiraMappings[projectKey]) {
            return jiraMappings[projectKey];
          }
        }
      }
    }

    return null;
  }

  getProjectConfig(projectName) {
    const projectMappings = this.store.get('projectMappings') || {};
    return projectMappings[projectName] || {};
  }

  determineBillable(tags, projectConfig) {
    if (tags.includes('break')) return false;
    if (projectConfig.billable !== undefined) return projectConfig.billable;
    return true;
  }

  shouldSaveActivity(activity) {
    if (!activity) return false;

    const minDuration = this.store.get('settings.minActivityDuration') || 60;
    if (activity.duration < minDuration) {
      return false;
    }

    if (!this.validateActivity(activity)) {
      return false;
    }

    return true;
  }

  validateActivity(activity) {
    try {
      if (!activity.id || !activity.startTime) return false;
      if (!Date.parse(activity.startTime)) return false;
      if (activity.endTime && !Date.parse(activity.endTime)) return false;
      if (typeof activity.duration !== 'number' || activity.duration < 0) return false;
      if (activity.tickets && !Array.isArray(activity.tickets)) return false;
      if (activity.tags && !Array.isArray(activity.tags)) return false;
      return true;
    } catch (error) {
      return false;
    }
  }

  calculateActualDuration(activity) {
    if (activity.idlePeriods && activity.idlePeriods.length > 0) {
      let excludedTime = 0;
      activity.idlePeriods.forEach(period => {
        if (period.excluded && period.end) {
          const start = new Date(period.start).getTime();
          const end = new Date(period.end).getTime();
          excludedTime += (end - start) / 1000;
        }
      });
      activity.actualDuration = activity.duration - excludedTime;
    } else {
      activity.actualDuration = activity.duration;
    }
  }

  tryMergeActivity(activity, showNotification) {
    if (!this.store.get('settings.consolidateActivities')) return false;

    const merged = this.tryMergeWithPrevious(activity);
    if (merged && showNotification && this.store.get('settings.showNotifications')) {
      new Notification('Activity Updated', {
        body: `Merged with previous: ${activity.project || activity.app}`,
        icon: this.iconPath
      });
    }
    return merged;
  }

  tryMergeWithPrevious(newActivity) {
    const activities = this.storage.getActivities() || [];
    if (activities.length === 0) return false;

    const lookbackCount = Math.min(3, activities.length);

    for (let i = activities.length - 1; i >= activities.length - lookbackCount; i--) {
      const candidate = activities[i];

      if (this.shouldMergeActivities(candidate, newActivity)) {
        // Merge the activities
        candidate.endTime = newActivity.endTime;
        const mergedStart = new Date(candidate.startTime);
        const mergedEnd = new Date(candidate.endTime);
        candidate.duration = Math.floor((mergedEnd - mergedStart) / 1000);
        candidate.actualDuration = candidate.duration;
        candidate.mergedCount = (candidate.mergedCount || 1) + 1;

        // Update metadata
        if (newActivity.title && newActivity.title.length > (candidate.title || '').length) {
          candidate.title = newActivity.title;
        }
        if (newActivity.tickets && newActivity.tickets.length > 0) {
          candidate.tickets = [...new Set([...(candidate.tickets || []), ...newActivity.tickets])];
        }
        if (newActivity.tags && newActivity.tags.length > 0) {
          candidate.tags = [...new Set([...(candidate.tags || []), ...newActivity.tags])];
        }

        this.storage.setActivities(activities);
        this.state.currentActivity = candidate;
        return true;
      }
    }

    return false;
  }

  shouldMergeActivities(activity1, activity2) {
    if (!activity1 || !activity2) return false;

    // Different apps - check for quick switches
    if (activity1.app !== activity2.app) {
      const duration2 = activity2.actualDuration || activity2.duration || 0;
      if (duration2 < 30) return false;
      return false;
    }

    // Check time gap
    const mergeGapThreshold = this.store.get('settings.mergeGapThreshold') || 300;
    const gap = new Date(activity2.startTime) - new Date(activity1.endTime);
    if (gap > mergeGapThreshold * 1000) return false;

    // Check project compatibility
    if (activity1.project !== activity2.project) {
      if (!activity1.project || !activity2.project ||
          activity1.project === 'Uncategorized' ||
          activity2.project === 'Uncategorized') {
        // Can merge uncategorized
      } else {
        return false;
      }
    }

    // Check billable status
    if (activity1.billable !== activity2.billable) {
      const duration2 = activity2.actualDuration || activity2.duration || 0;
      if (duration2 > 300) return false;
    }

    return true;
  }

  saveActivityToStore(activity) {
    const activities = this.storage.getActivities() || [];
    activities.push(activity);

    // Apply retention policy
    const retentionDays = this.store.get('settings.dataRetention') || 90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const filteredActivities = activities.filter(a =>
      new Date(a.startTime) > cutoffDate
    );

    this.storage.setActivities(filteredActivities);

    // Update activity cache with size limit
    this.addToActivityCache(activity);
  }

  /**
   * Add activity to cache with size management
   */
  addToActivityCache(activity) {
    this.activityCache.recent.push({
      id: activity.id,
      app: activity.app,
      project: activity.project,
      startTime: activity.startTime
    });

    // Trim cache if it exceeds max size
    if (this.activityCache.recent.length > this.activityCache.maxSize) {
      // Remove oldest entries
      this.activityCache.recent = this.activityCache.recent.slice(-this.activityCache.maxSize);
    }
  }

  showActivitySavedNotification(activity) {
    try {
      const expGained = Math.floor(activity.duration / 60);
      new Notification('Activity Saved', {
        body: `Saved: ${activity.project || activity.app} (${this.formatDuration(activity.actualDuration)}) +${expGained} XP`,
        icon: this.iconPath
      });
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }

  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  // ================== Idle Detection ==================

  handleIdleDetection() {
    const idleThresholdSeconds = this.store.get('settings.idleThreshold') || 180;
    const now = Date.now();
    const timeSinceLastActivity = (now - this.state.lastActivityTime) / 1000;

    if (timeSinceLastActivity > idleThresholdSeconds) {
      this.handleIdleTime(timeSinceLastActivity);
    }
  }

  handleIdleTime(idleSeconds) {
    if (!this.state.currentActivity) return;

    const idleStartTime = new Date(Date.now() - idleSeconds * 1000).toISOString();

    // Add idle period to current activity
    if (!this.state.currentActivity.idlePeriods) {
      this.state.currentActivity.idlePeriods = [];
    }

    // Check if we're already in an idle period
    const lastIdlePeriod = this.state.currentActivity.idlePeriods[this.state.currentActivity.idlePeriods.length - 1];
    if (lastIdlePeriod && !lastIdlePeriod.end) {
      // Still in the same idle period
      return;
    }

    // Start new idle period
    this.state.currentActivity.idlePeriods.push({
      start: idleStartTime,
      duration: idleSeconds,
      excluded: true
    });

    if (this.store.get('settings.pauseOnIdle')) {
      this.stopTracking();
      if (this.store.get('settings.showNotifications')) {
        new Notification('LightTrack - Idle Detected', {
          body: 'Tracking paused due to inactivity',
          icon: this.iconPath
        });
      }
    }
  }

  // ================== Public API ==================

  getCurrentActivity() {
    return this.state.currentActivity;
  }

  getTrackingState() {
    return {
      isActive: this.state.isActive,
      currentActivity: this.state.currentActivity,
      sessionStartTime: this.state.sessionStartTime
    };
  }

  handleBrowserActivity(browserActivity) {
    // Handle activity from browser extension
    if (!this.state.isActive) return;

    const extracted = this.extractActivityMetadata(browserActivity);

    if (this.state.currentActivity &&
        this.state.currentActivity.app === browserActivity.app &&
        this.state.currentActivity.url === browserActivity.url) {
      // Same browser activity - just update
      this.updateCurrentActivity();
    } else if (this.state.currentActivity) {
      // Different activity - save current and start new
      this.saveCurrentActivity();
      this.startBrowserActivity(browserActivity, extracted);
    } else {
      // No current activity - start new
      this.startBrowserActivity(browserActivity, extracted);
    }
  }

  startBrowserActivity(browserInfo, extracted) {
    const projectName = this.determineProject(browserInfo, extracted);
    const projectConfig = this.getProjectConfig(projectName);

    this.state.currentActivity = {
      id: Date.now().toString(),
      startTime: new Date().toISOString(),
      app: browserInfo.app,
      title: browserInfo.title,
      url: browserInfo.url,
      project: projectName,
      tickets: extracted.tickets,
      tags: extracted.tags || [],
      duration: 0,
      billable: projectConfig.billable !== undefined ? projectConfig.billable : true,
      sapCode: projectConfig.sapCode || '',
      costCenter: projectConfig.costCenter || '',
      poNumber: projectConfig.poNumber || '',
      wbsElement: projectConfig.wbsElement || '',
      lastUpdate: new Date().toISOString(),
      metadata: { ...extracted.metadata, source: 'browser-extension' }
    };
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats() {
    return {
      cacheSize: this.activityCache.recent.length,
      activeIntervals: this.intervals.size,
      activeTimeouts: this.timeouts.size,
      hasCurrentActivity: !!this.state.currentActivity
    };
  }

  /**
   * Clear activity cache
   */
  clearActivityCache() {
    this.activityCache.recent = [];
  }

  /**
   * Comprehensive cleanup
   */
  cleanup() {
    // Stop tracking if active
    if (this.state.isActive) {
      this.stopTracking();
    }

    // Clear all timers
    this.clearAllTimers();

    // Clear activity cache
    this.clearActivityCache();

    // Clear state
    this.state = {
      isActive: false,
      currentActivity: null,
      lastActivityTime: Date.now(),
      lastIdleCheck: Date.now(),
      sessionStartTime: null
    };

    // Clear global flag
    global.isTracking = false;
  }
}

module.exports = ActivityTracker;
