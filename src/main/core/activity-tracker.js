const activeWin = require('active-win');
const logger = require('../logger');
const TitleParser = require('./title-parser');
const IdleDetector = require('./idle-detector');
const FocusSessionTracker = require('./focus-session-tracker');
const {
  TRACKING_INTERVAL_MS,
  IDLE_CHECK_INTERVAL_MS,
  WINDOW_CHANGE_DEBOUNCE_MS,
  ACTIVITY_LENIENCY_MS,
  MAX_SAMPLING_INTERVAL_MS,
  SAMPLING_INCREMENT_MS,
  ACTIVE_WINDOW_RETRY_DELAY_MS,
  STABLE_ACTIVITY_COUNT_THRESHOLD,
  ACTIVE_WINDOW_RETRY_COUNT,
  MAX_CHECKSUM_CACHE_SIZE,
  DEFAULT_MIN_ACTIVITY_DURATION_SECONDS,
  IPC_CHANNELS
} = require('../../shared/constants');

/**
 * Get local date string (YYYY-MM-DD) from timestamp
 * Avoids UTC conversion issues that cause activities to appear on wrong day
 */
function getLocalDateString(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Activity Tracker - Production-ready implementation
 * Combines the best of original LightTrack with Phase 2 requirements
 */
class ActivityTracker {
  constructor(storageManager, mainWindow) {
    this.storage = storageManager;
    this.mainWindow = mainWindow;
    this.isTracking = false;
    this.currentActivity = null;
    this.trackingInterval = null;
    this.lastActiveTime = Date.now();
    this.sessionStartTime = null;
    this.idleCheckInterval = null;

    // Mutex/lock for preventing race conditions
    this._isProcessingTrack = false;
    this._isProcessingStop = false;
    this._pendingStop = false;

    // Smart sampling from original
    this.currentCheckInterval = TRACKING_INTERVAL_MS;
    this.stableActivityCount = 0;
    this.lastActivitySignature = '';

    // Title parser for extracting activity info
    this.titleParser = new TitleParser(storageManager);

    // Idle detector for system idle handling
    this.idleDetector = new IdleDetector({
      getStorage: () => this.storage,
      getMainWindow: () => this.mainWindow,
      onIdleStart: (idleStartTime) => this.handleIdleStart(idleStartTime),
      onIdleReturn: (idlePeriod) => this.handleIdleReturn(idlePeriod)
    });

    // Focus session tracker
    this.focusSessionTracker = new FocusSessionTracker({
      getStorage: () => this.storage
    });

    // Duplicate prevention: track recent save checksums
    this.recentSaveChecksums = new Set();
    this.maxChecksumCache = MAX_CHECKSUM_CACHE_SIZE;
    this.lastSaveChecksum = null;

    // Debounce window change detection
    this.pendingWindowChange = null;
    this.windowChangeDebounceMs = WINDOW_CHANGE_DEBOUNCE_MS;

    // Bind methods
    this.track = this.track.bind(this);
    this.adjustSamplingRate = this.adjustSamplingRate.bind(this);
  }

  async start() {
    if (this.isTracking) {
      logger.warn('Tracking already started');
      return;
    }

    // Wait for any pending stop to complete
    if (this._isProcessingStop) {
      const maxWaitMs = 3000;
      const startWait = Date.now();
      while (this._isProcessingStop && (Date.now() - startWait) < maxWaitMs) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    logger.info('Starting activity tracking');

    // Reset mutex flags
    this._isProcessingTrack = false;
    this._isProcessingStop = false;
    this._pendingStop = false;

    this.isTracking = true;
    this.lastActiveTime = Date.now();
    this.sessionStartTime = Date.now();
    this.idleDetector.reset();
    this.currentCheckInterval = TRACKING_INTERVAL_MS;
    this.trackingTimeoutId = null;
    this.idleTimeoutId = null;

    // Start self-adjusting tracking loop (prevents drift)
    this.scheduleNextTrack();

    // Start self-adjusting idle check loop
    this.scheduleNextIdleCheck();

    // Initial track
    await this.track();
  }

  // Self-adjusting setTimeout loop for tracking (prevents drift)
  scheduleNextTrack() {
    if (!this.isTracking) return;

    const startTime = Date.now();
    this.trackingTimeoutId = setTimeout(async () => {
      await this.track();

      // Calculate actual execution time and adjust next interval
      const executionTime = Date.now() - startTime;
      const drift = executionTime - this.currentCheckInterval;

      // Schedule next iteration, compensating for drift
      if (this.isTracking) {
        this.scheduleNextTrack();
      }
    }, this.currentCheckInterval);
  }

  // Self-adjusting setTimeout loop for idle checking
  scheduleNextIdleCheck() {
    if (!this.isTracking) return;

    this.idleTimeoutId = setTimeout(() => {
      this.idleDetector.checkIdle(this.isTracking);

      // Schedule next idle check
      if (this.isTracking) {
        this.scheduleNextIdleCheck();
      }
    }, IDLE_CHECK_INTERVAL_MS);
  }
  async stop() {
    if (!this.isTracking) {
      logger.warn('Tracking already stopped');
      return;
    }

    // Prevent concurrent stop() calls
    if (this._isProcessingStop) {
      logger.warn('Stop already in progress');
      return;
    }

    this._isProcessingStop = true;
    this._pendingStop = true;

    try {
      logger.info('Stopping activity tracking');

      // Wait for any in-progress track() to complete (with timeout)
      const maxWaitMs = 5000;
      const startWait = Date.now();
      while (this._isProcessingTrack && (Date.now() - startWait) < maxWaitMs) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      if (this._isProcessingTrack) {
        logger.warn('Timeout waiting for track() to complete, proceeding with stop');
      }

      this.isTracking = false;
      this.sessionStartTime = null;

      // Clear timeouts (replaced setInterval with setTimeout loops)
      if (this.trackingTimeoutId) {
        clearTimeout(this.trackingTimeoutId);
        this.trackingTimeoutId = null;
      }

      if (this.idleTimeoutId) {
        clearTimeout(this.idleTimeoutId);
        this.idleTimeoutId = null;
      }

      // Save current activity and focus session
      if (this.currentActivity) {
        await this.saveActivity();
        this.currentActivity = null;
      }

      if (this.focusSessionTracker.hasActiveSession()) {
        this.focusSessionTracker.save();
      }
    } finally {
      this._isProcessingStop = false;
      this._pendingStop = false;
    }
  }

  async track() {
    // Mutex: prevent concurrent track() calls
    if (this._isProcessingTrack) {
      logger.debug('Track already in progress, skipping');
      return;
    }

    // Check if stop is pending - abort early
    if (this._pendingStop || !this.isTracking) {
      return;
    }

    this._isProcessingTrack = true;
    const now = Date.now();
    const previousTime = this.lastActiveTime;

    try {
      // Don't track if paused due to idle
      if (this.idleDetector.isPaused()) {
        this.lastActiveTime = now;
        return;
      }

      // Double-check tracking state after acquiring lock
      if (!this.isTracking || this._pendingStop) {
        return;
      }

      const deltaSeconds = Math.floor((now - previousTime) / 1000);
      if (deltaSeconds <= 0) {
        this.lastActiveTime = now;
        return;
      }
      let remainingSeconds = deltaSeconds;
      let assignRemainingToNew = false;

      // Get active window with retry logic
      const window = await this.getActiveWindowWithRetry();
      if (!window) {
        logger.debug('No active window detected');
        if (this.currentActivity) {
          this.applyDuration(remainingSeconds);
        }
        this.lastActiveTime = now;
        return;
      }

      // Check again after async operation
      if (!this.isTracking || this._pendingStop) {
        return;
      }

      // Extract activity information
      const activityData = this.extractActivityInfo(window);

      // Handle midnight rollover before activity matching
      if (this.currentActivity) {
        const midnightInfo = this.getMidnightBoundary(previousTime, now);
        if (midnightInfo) {
          // Credit time up to the first midnight to the old activity
          const secondsBeforeMidnight = Math.floor((midnightInfo.firstMidnight - previousTime) / 1000);
          if (secondsBeforeMidnight > 0) {
            this.applyDuration(secondsBeforeMidnight, midnightInfo.firstMidnight);
            await this.saveActivityToExisting();
          }
          this.currentActivity = null;

          // For multi-day gaps, discard intermediate days (they were idle)
          // Only credit time since the last midnight (today) to the new activity
          if (midnightInfo.isMultiDay) {
            remainingSeconds = Math.floor((now - midnightInfo.lastMidnight) / 1000);
            logger.info(`Multi-day gap detected, discarding ${Math.floor((midnightInfo.lastMidnight - midnightInfo.firstMidnight) / 1000 / 3600)} hours of idle time`);
          } else {
            remainingSeconds = Math.max(0, remainingSeconds - secondsBeforeMidnight);
          }
          assignRemainingToNew = true;
        }
      }

      // Check if we should continue current activity
      let appliedToPrevious = false;
      if (this.currentActivity && this.canContinueActivity(this.currentActivity, activityData)) {
        // Update existing activity
        this.applyDuration(remainingSeconds);
        appliedToPrevious = true;
      } else {
        // Save previous activity if exists
        if (this.currentActivity) {
          this.applyDuration(remainingSeconds);
          await this.saveActivityToExisting();
          appliedToPrevious = true;
        }

        // Check state again after save
        if (!this.isTracking || this._pendingStop) {
          return;
        }

        // Find existing activity for this app+project today, or start new
        this.findOrStartActivity(activityData);

        // Apply elapsed time to new activity if:
        // - Time wasn't already applied to a previous activity
        // - We have time to apply (first sample after start, or after midnight rollover)
        if (!appliedToPrevious && remainingSeconds > 0 && this.currentActivity) {
          const inferredStart = now - (remainingSeconds * 1000);
          const currentStartMs = typeof this.currentActivity.startTime === 'number'
            ? this.currentActivity.startTime
            : new Date(this.currentActivity.startTime).getTime();

          // Adjust start time if the inferred start is earlier
          if (!Number.isNaN(currentStartMs) && currentStartMs > inferredStart) {
            this.currentActivity.startTime = inferredStart;
            this.currentActivity.date = getLocalDateString(inferredStart);
          }
          this.applyDuration(remainingSeconds, now);
        }
      }

      // Update focus session
      this.focusSessionTracker.update(activityData);

      // Adjust sampling rate based on activity stability
      this.adjustSamplingRate();

      // Send update to renderer (check window is still valid)
      if (this.mainWindow && !this.mainWindow.isDestroyed() && this.isTracking) {
        this.mainWindow.webContents.send(IPC_CHANNELS.TRACKING_UPDATE, this.getStatus());
      }

    } catch (error) {
      logger.error('Error tracking activity:', error);
    } finally {
      this._isProcessingTrack = false;
      this.lastActiveTime = now;
    }
  }

  // Retry logic from original implementation
  async getActiveWindowWithRetry(retries = ACTIVE_WINDOW_RETRY_COUNT) {
    try {
      return await activeWin();
    } catch (err) {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, ACTIVE_WINDOW_RETRY_DELAY_MS));
        return this.getActiveWindowWithRetry(retries - 1);
      }
      logger.error('Failed to get active window after retries:', err);
      return null;
    }
  }
  // Extract comprehensive activity information (delegated to TitleParser)
  extractActivityInfo(window) {
    return this.titleParser.parse(window);
  }
  // Determine if we can continue current activity
  canContinueActivity(current, newData) {
    const settings = this.storage.getSettings();

    // Different app = new activity
    if (current.app !== newData.app) {
      return false;
    }

    // If smart sampling is disabled, always check title/project
    if (!settings.smartSamplingEnabled) {
      return current.title === newData.title && current.project === newData.project;
    }

    // For very new activities (< 2 minutes), be lenient
    const activityAge = Date.now() - current.startTime;
    if (activityAge < ACTIVITY_LENIENCY_MS) {
      // Just check app and project
      return current.project === newData.project;
    }

    // Check if consolidation is enabled (default: true)
    const consolidateEnabled = settings.consolidateActivities !== false;
    if (!consolidateEnabled) {
      // No consolidation: require exact title and project match
      return current.title === newData.title && current.project === newData.project;
    }

    // For browsers, check URL if available
    const browserApps = ['chrome', 'firefox', 'safari', 'edge', 'opera', 'brave'];
    if (browserApps.some(browser => current.app.toLowerCase().includes(browser))) {
      if (current.url && newData.url) {
        return current.url === newData.url;
      }
    }

    // Check if it's the same project and similar activity (based on consolidation mode)
    return current.project === newData.project &&
           this.isSimilarActivity(current, newData);
  }

  // Check if activities are similar enough to merge
  isSimilarActivity(activity1, activity2) {
    const settings = this.storage.getSettings();
    const mode = settings.consolidationMode || 'smart';

    // Strict mode: exact title match required
    if (mode === 'strict') {
      return activity1.title === activity2.title;
    }

    // Relaxed mode: same project is enough
    if (mode === 'relaxed') {
      return true; // Already checked project match in canContinueActivity
    }

    // Smart mode (default): intelligent merging
    // Same tickets = same activity
    const tickets1 = activity1.tickets || [];
    const tickets2 = activity2.tickets || [];
    if (tickets1.length > 0 && tickets2.length > 0) {
      return tickets1.some(t => tickets2.includes(t));
    }

    // Check tag overlap (need at least 2 matching tags)
    const tags1 = activity1.tags || [];
    const tags2 = activity2.tags || [];
    const commonTags = tags1.filter(t => tags2.includes(t));
    if (commonTags.length >= 2) {
      return true;
    }

    // Check title similarity (for minor changes like typing)
    const title1 = activity1.title.toLowerCase();
    const title2 = activity2.title.toLowerCase();

    // Improved title cleaning: preserve significant numbers like versions, dates, IDs
    // Only remove isolated single digits and repeated digits (like counters)
    // Keep patterns like: 2024, v1.2.3, ABC-123, Report-2024
    const cleanTitle1 = this.cleanTitleForComparison(title1);
    const cleanTitle2 = this.cleanTitleForComparison(title2);

    return cleanTitle1 === cleanTitle2;
  }

  // Clean title for comparison, preserving significant numbers
  cleanTitleForComparison(title) {
    return title
      // Preserve version numbers (v1.2.3, 1.0.0)
      // Preserve JIRA-style IDs (ABC-123)
      // Preserve dates (2024-01-06, 2024/01/06)
      // Preserve file extensions with numbers (file2.txt)
      // Remove only isolated counters like (1), [2], #3 at end
      .replace(/\s*[\(\[\#]\d{1,2}[\)\]]?\s*$/, '')
      // Remove trailing timestamps like " - 14:30" or ":30:00"
      .replace(/\s*-?\s*\d{1,2}:\d{2}(:\d{2})?\s*$/, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Update existing activity
  updateActivity(deltaSeconds) {
    this.applyDuration(deltaSeconds);
  }

  // Apply time to the current activity with an optional end time override
  applyDuration(deltaSeconds, endTimeMs = Date.now()) {
    if (!this.currentActivity || deltaSeconds <= 0) return;
    this.currentActivity.endTime = endTimeMs;
    this.currentActivity.duration = (this.currentActivity.duration || 0) + deltaSeconds;

    // Update actual duration (non-idle time)
    if (!this.currentActivity.actualDuration) {
      this.currentActivity.actualDuration = 0;
    }
    this.currentActivity.actualDuration += deltaSeconds;
  }

  // Start a new activity
  startNewActivity(activityData, startTimeMs = Date.now()) {
    this.currentActivity = {
      ...activityData,
      id: Date.now().toString(),
      startTime: startTimeMs,
      endTime: startTimeMs,
      duration: 0,
      actualDuration: 0,
      isManual: false,
      date: getLocalDateString(startTimeMs)
    };

    logger.debug('New activity started:', {
      app: activityData.app,
      project: activityData.project
    });
  }

  // Find existing activity for today with same app+project, or start new
  findOrStartActivity(activityData) {
    const today = getLocalDateString();

    // Look for existing activity with same app and project from today
    const existingActivity = this.storage.findActivityByAppAndProject(
      activityData.app,
      activityData.project,
      today
    );

    if (existingActivity) {
      // Resume tracking on existing activity
      this.currentActivity = {
        ...existingActivity,
        // Update title to current (may have changed)
        title: activityData.title,
        // Keep tracking from now
        sessionStartTime: Date.now()
      };

      logger.debug('Resuming existing activity:', {
        id: existingActivity.id,
        app: activityData.app,
        project: activityData.project,
        existingDuration: existingActivity.duration
      });
    } else {
      // No existing activity found, start new one
      this.startNewActivity(activityData);
    }
  }

  // Save current activity duration to existing record (for consolidation)
  async saveActivityToExisting() {
    if (!this.currentActivity) return;

    const settings = this.storage.getSettings();
    const minDuration = settings.minActivityDuration || DEFAULT_MIN_ACTIVITY_DURATION_SECONDS;

    // currentActivity.duration already has the accumulated total
    // (existing duration + time added during this session via updateActivity)
    const totalDuration = this.currentActivity.duration;

    // Only save if total duration exceeds minimum
    if (totalDuration < minDuration) {
      logger.debug(`Activity duration too short (${totalDuration}s), not saving`);
      return;
    }

    // Check for duplicate save (prevents flapping window detection issues)
    if (this.isDuplicateSave(this.currentActivity)) {
      return;
    }

    try {
      // Check if this activity already exists in storage (has been saved before)
      const existingActivity = this.storage.findActivityById(this.currentActivity.id);

      if (existingActivity) {
        // Update existing record - currentActivity.duration already has the total
        await this.storage.updateActivity(this.currentActivity.id, {
          duration: totalDuration,
          actualDuration: totalDuration,
          endTime: this.currentActivity.endTime || Date.now(),
          title: this.currentActivity.title // Update to latest title
        });

        logger.debug('Updated existing activity:', {
          id: this.currentActivity.id,
          app: this.currentActivity.app,
          totalDuration: totalDuration
        });
      } else {
        // First time saving this activity
        this.currentActivity.endTime = this.currentActivity.endTime || Date.now();
        this.currentActivity.actualDuration = totalDuration;
        await this.storage.addActivity(this.currentActivity);

        logger.debug('Saved new activity:', {
          id: this.currentActivity.id,
          app: this.currentActivity.app,
          duration: totalDuration
        });
      }

      // Record checksum after successful save
      this.recordSaveChecksum(this.currentActivity);

    } catch (error) {
      logger.error('Failed to save activity:', error);
    }
  }
  // Adjust sampling rate based on activity stability
  adjustSamplingRate() {
    const settings = this.storage.getSettings();
    if (!settings.smartSamplingEnabled) return;

    const currentSignature = this.getActivitySignature();

    if (currentSignature === this.lastActivitySignature) {
      // Activity is stable
      this.stableActivityCount++;

      // Gradually increase interval (max 60 seconds for stable activities)
      if (this.stableActivityCount > STABLE_ACTIVITY_COUNT_THRESHOLD) {
        const newInterval = Math.min(MAX_SAMPLING_INTERVAL_MS, TRACKING_INTERVAL_MS + (this.stableActivityCount * SAMPLING_INCREMENT_MS));
        if (newInterval !== this.currentCheckInterval) {
          this.currentCheckInterval = newInterval;
          logger.debug(`Adjusted sampling to ${this.currentCheckInterval/1000}s (stable activity)`);
          // Note: setTimeout loop automatically uses new interval on next iteration
        }
      }
    } else {
      // Activity changed - reset to fast sampling
      if (this.currentCheckInterval !== TRACKING_INTERVAL_MS) {
        this.stableActivityCount = 0;
        this.currentCheckInterval = TRACKING_INTERVAL_MS;
        logger.debug('Reset sampling to 5s (activity changed)');
        // Note: setTimeout loop automatically uses new interval on next iteration
      }
    }

    this.lastActivitySignature = currentSignature;
  }

  // Create activity signature for comparison
  getActivitySignature() {
    if (!this.currentActivity) return '';
    return `${this.currentActivity.app}|${this.currentActivity.project}|${this.currentActivity.title}`;
  }

  // Calculate checksum for activity to prevent duplicates
  calculateActivityChecksum(activity) {
    if (!activity) return null;

    // Create a deterministic string from key activity properties
    const checksumData = [
      activity.app || '',
      activity.project || '',
      activity.date || '',
      // Round duration to nearest 10 seconds to handle minor timing variations
      Math.floor((activity.duration || 0) / 10) * 10
    ].join('|');

    // Simple hash function for checksum
    let hash = 0;
    for (let i = 0; i < checksumData.length; i++) {
      const char = checksumData.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  // Check if this save would be a duplicate
  isDuplicateSave(activity) {
    const checksum = this.calculateActivityChecksum(activity);
    if (!checksum) return false;

    // Check if we've recently saved an activity with this checksum
    if (this.recentSaveChecksums.has(checksum)) {
      logger.debug('Duplicate save detected, skipping:', { checksum, app: activity.app });
      return true;
    }

    return false;
  }

  // Record a successful save checksum
  recordSaveChecksum(activity) {
    const checksum = this.calculateActivityChecksum(activity);
    if (!checksum) return;

    this.recentSaveChecksums.add(checksum);
    this.lastSaveChecksum = checksum;

    // Trim cache if it gets too large
    if (this.recentSaveChecksums.size > this.maxChecksumCache) {
      const iterator = this.recentSaveChecksums.values();
      this.recentSaveChecksums.delete(iterator.next().value);
    }
  }

  // Callback: Handle going idle (called by IdleDetector)
  async handleIdleStart(idleStartTime) {
    // Wait for any in-progress track() to complete before modifying state
    const maxWaitMs = 2000;
    const startWait = Date.now();
    while (this._isProcessingTrack && (Date.now() - startWait) < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Mark current activity as having idle time
    if (this.currentActivity) {
      this.currentActivity.isIdle = true;
      this.currentActivity.idleStartTime = idleStartTime;

      // Save the activity before pausing
      await this.saveActivity();
      this.currentActivity = null;
    }
  }

  // Callback: Handle return from idle (called by IdleDetector)
  handleIdleReturn(idlePeriod) {
    // IdleDetector handles all the state and notifications
    // This callback is for any activity-specific handling if needed
    logger.debug('Idle return callback received', { idlePeriod });
  }

  // Save current activity (uses consolidation logic)
  async saveActivity() {
    // Delegate to the consolidation-aware save method
    await this.saveActivityToExisting();
  }

  // Handle idle time decision (called from renderer, delegates to IdleDetector)
  async handleIdleTimeDecision(wasWorking) {
    await this.idleDetector.handleIdleTimeDecision(wasWorking, this.storage);
  }

  // Get comprehensive status
  getStatus() {
    return {
      isTracking: this.isTracking,
      currentActivity: this.currentActivity,
      sessionStartTime: this.sessionStartTime,
      isPaused: this.idleDetector.isPaused(),
      lastActiveTime: this.lastActiveTime,
      lastIdlePeriod: this.idleDetector.getLastIdlePeriod(),
      focusSession: this.focusSessionTracker.getCurrentSession(),
      samplingRate: this.currentCheckInterval / 1000 // in seconds
    };
  }

  // Returns midnight boundary info if previousTime and now cross days
  // For multi-day gaps, returns the first midnight after previousTime
  // and the last midnight before now, to properly handle hibernation/sleep
  getMidnightBoundary(previousTime, now) {
    const previousDate = new Date(previousTime);
    const nowDate = new Date(now);

    // Same calendar day - no midnight crossing
    if (previousDate.toDateString() === nowDate.toDateString()) {
      return null;
    }

    // Get the first midnight after previousTime (end of that day)
    const firstMidnight = new Date(previousDate);
    firstMidnight.setDate(firstMidnight.getDate() + 1);
    firstMidnight.setHours(0, 0, 0, 0);

    // Get the last midnight before now (start of today)
    const lastMidnight = new Date(nowDate);
    lastMidnight.setHours(0, 0, 0, 0);

    return {
      firstMidnight: firstMidnight.getTime(),
      lastMidnight: lastMidnight.getTime(),
      isMultiDay: firstMidnight.getTime() < lastMidnight.getTime()
    };
  }

  // Get current session duration
  getCurrentSessionDuration() {
    if (!this.currentActivity) return 0;
    // Handle startTime being either number (ms) or string (ISO date)
    const startMs = typeof this.currentActivity.startTime === 'number'
      ? this.currentActivity.startTime
      : new Date(this.currentActivity.startTime).getTime();
    if (Number.isNaN(startMs)) return 0;
    return Math.floor((Date.now() - startMs) / 1000);
  }

  // Get today's total tracked time
  async getTodayTotal() {
    try {
      const total = await this.storage.getTodayTotal();

      // Add current session if tracking
      if (this.currentActivity && !this.idleDetector.isPaused()) {
        return total + this.getCurrentSessionDuration();
      }

      return total;
    } catch (error) {
      logger.error('Failed to get today total:', error);
      return 0;
    }
  }

  // Create manual activity
  createManualActivity(activityData) {
    const activity = {
      id: Date.now().toString(),
      app: activityData.app || 'Manual Entry',
      title: activityData.title || activityData.description || 'Manual time entry',
      project: activityData.project || 'General',
      tags: activityData.tags || [],
      startTime: activityData.startTime || Date.now(),
      endTime: activityData.endTime || Date.now(),
      duration: activityData.duration || 0,
      actualDuration: activityData.duration || 0,
      isManual: true,
      billable: activityData.billable !== false,
      tickets: activityData.tickets || [],
      date: getLocalDateString(activityData.startTime || Date.now())
    };

    return this.storage.addActivity(activity);
  }

  // Get focus session statistics (delegates to FocusSessionTracker)
  getFocusStats() {
    return this.focusSessionTracker.getStats();
  }

  /**
   * Process browser activity from browser extension
   * This allows the extension to supplement desktop tracking with browser context
   */
  processBrowserActivity(activity) {
    if (!this.isTracking) return;

    try {
      // Parse the browser activity title for project/ticket extraction
      const parsed = this.titleParser.parse(activity.title, activity.url);

      // If we have a current activity, enrich it with browser context
      if (this.currentActivity) {
        // Add URL if it provides useful context (JIRA, GitHub, etc)
        if (parsed.tickets && parsed.tickets.length > 0) {
          this.currentActivity.tickets = [
            ...new Set([...(this.currentActivity.tickets || []), ...parsed.tickets])
          ];
        }

        // Update project if browser has better info
        if (parsed.project && parsed.project !== 'General' &&
            (!this.currentActivity.project || this.currentActivity.project === 'General')) {
          this.currentActivity.project = parsed.project;
        }
      }

      logger.debug('Browser activity processed', { url: activity.url, parsed });
    } catch (error) {
      logger.error('Error processing browser activity:', error);
    }
  }

  /**
   * Process page context from browser extension (JIRA/GitHub metadata)
   * This provides richer metadata than just window titles
   */
  processPageContext(context) {
    if (!this.isTracking) return;

    try {
      if (context.type === 'jira' && context.data) {
        // JIRA issue detected - update current activity
        if (this.currentActivity && context.data.issueKey) {
          this.currentActivity.tickets = [
            ...new Set([...(this.currentActivity.tickets || []), context.data.issueKey])
          ];

          // Look up project mapping for this JIRA project
          const jiraMappings = this.storage.store.get('jiraProjectMappings', {});
          const projectKey = context.data.projectKey || context.data.issueKey.split('-')[0];
          if (jiraMappings[projectKey]) {
            this.currentActivity.project = jiraMappings[projectKey];
          }
        }
      } else if (context.type === 'github' && context.data) {
        // GitHub context - could map repo to project
        if (this.currentActivity && context.data.repo) {
          const repoKey = `${context.data.owner}/${context.data.repo}`;
          const urlMappings = this.storage.store.get('urlProjectMappings', {});

          // Check if this repo is mapped
          for (const [pattern, project] of Object.entries(urlMappings)) {
            if (repoKey.includes(pattern) || pattern.includes(context.data.repo)) {
              this.currentActivity.project = project;
              break;
            }
          }
        }
      }

      logger.debug('Page context processed', { type: context.type, data: context.data });
    } catch (error) {
      logger.error('Error processing page context:', error);
    }
  }
}

module.exports = ActivityTracker;
