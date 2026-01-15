/**
 * IdleDetector - Handles system idle detection and idle time management
 * Extracted from ActivityTracker to improve maintainability and testability
 */
const { powerMonitor } = require('electron');
const logger = require('../logger');
const {
  DEFAULT_IDLE_THRESHOLD_SECONDS,
  IDLE_WARNING_SECONDS,
  IDLE_ACTIVITY_THRESHOLD_SECONDS,
  MIN_IDLE_MINUTES_FOR_PROMPT,
  IPC_CHANNELS
} = require('../../shared/constants');

class IdleDetector {
  constructor(options = {}) {
    // Callbacks for integration with ActivityTracker
    this.getStorage = options.getStorage || (() => null);
    this.getMainWindow = options.getMainWindow || (() => null);
    this.onIdleStart = options.onIdleStart || (() => {});
    this.onIdleReturn = options.onIdleReturn || (() => {});

    // Idle state
    this.pausedDueToIdle = false;
    this.idleStartTime = null;
    this.idleWarningShown = false;
    this.lastIdlePeriod = null;

    // Bind methods
    this.checkIdle = this.checkIdle.bind(this);
  }

  /**
   * Check system idle state and handle transitions
   * @param {boolean} isTracking - Whether tracking is currently active
   */
  checkIdle(isTracking) {
    const systemIdleSeconds = powerMonitor.getSystemIdleTime();
    const storage = this.getStorage();
    const settings = storage?.getSettings() || {};
    const idleThreshold = settings.idleThreshold || DEFAULT_IDLE_THRESHOLD_SECONDS;
    const warningTime = IDLE_WARNING_SECONDS;

    // Clear idle warning if user is active
    if (systemIdleSeconds < IDLE_ACTIVITY_THRESHOLD_SECONDS) {
      this.idleWarningShown = false;

      // Handle return from idle
      if (this.pausedDueToIdle) {
        this.handleIdleReturn();
      }
      return;
    }

    // Show warning before going idle
    if (systemIdleSeconds >= (idleThreshold - warningTime) &&
        !this.idleWarningShown &&
        isTracking &&
        !this.pausedDueToIdle) {
      this.idleWarningShown = true;

      // Send idle warning to renderer
      const mainWindow = this.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.IDLE_WARNING, {
          secondsUntilIdle: warningTime
        });
      }

      logger.info('Idle warning shown');
    }

    // Check if we should pause due to idle
    if (systemIdleSeconds >= idleThreshold && !this.pausedDueToIdle) {
      this.handleIdleStart(systemIdleSeconds);
    }
  }

  /**
   * Handle going idle
   * @param {number} idleSeconds - How long the system has been idle
   */
  handleIdleStart(idleSeconds) {
    logger.info('User idle detected, pausing tracking');
    this.pausedDueToIdle = true;
    this.idleStartTime = new Date(Date.now() - (idleSeconds * 1000)).toISOString();

    // Notify ActivityTracker to handle the idle start
    this.onIdleStart(this.idleStartTime);

    // Notify renderer
    const mainWindow = this.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.TRACKING_PAUSED, {
        reason: 'idle',
        idleStartTime: this.idleStartTime
      });
    }
  }

  /**
   * Handle return from idle
   */
  handleIdleReturn() {
    if (!this.pausedDueToIdle) return;

    logger.info('User active again, resuming tracking');
    this.pausedDueToIdle = false;

    const idleEnd = new Date();
    const idleDuration = Math.floor((idleEnd - new Date(this.idleStartTime)) / 1000);
    const idleMinutes = Math.floor(idleDuration / 60);

    // Store idle period for potential user prompt
    this.lastIdlePeriod = {
      start: this.idleStartTime,
      end: idleEnd.toISOString(),
      duration: idleDuration,
      minutes: idleMinutes
    };

    // Notify ActivityTracker
    this.onIdleReturn(this.lastIdlePeriod);

    // Notify renderer to potentially show idle prompt
    const mainWindow = this.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed() && idleMinutes > MIN_IDLE_MINUTES_FOR_PROMPT) {
      mainWindow.webContents.send(IPC_CHANNELS.IDLE_RETURN, this.lastIdlePeriod);
    }

    this.idleStartTime = null;
    this.idleWarningShown = false;
  }

  /**
   * Handle idle time decision (called from renderer via ActivityTracker)
   * @param {boolean} wasWorking - Whether the idle time should count as work
   * @param {Object} storage - Storage manager for updating activities
   */
  async handleIdleTimeDecision(wasWorking, storage) {
    if (!this.lastIdlePeriod) return;

    // Find the last saved activity that might need updating
    const activities = await storage.getActivities(new Date());
    const lastActivity = Array.isArray(activities) ? activities[0] : null;

    if (lastActivity && lastActivity.idleStartTime === this.lastIdlePeriod.start) {
      if (wasWorking) {
        // User says it was work time - update the activity
        const additionalDuration = this.lastIdlePeriod.duration;
        await storage.updateActivity(lastActivity.id, {
          duration: lastActivity.duration + additionalDuration,
          actualDuration: (lastActivity.actualDuration || lastActivity.duration) + additionalDuration,
          idlePeriods: [] // Clear idle periods since it was work
        });
        logger.info('Idle time counted as work');
      } else {
        // Create idle period record
        const idlePeriods = lastActivity.idlePeriods || [];
        idlePeriods.push({
          ...this.lastIdlePeriod,
          excluded: true
        });
        await storage.updateActivity(lastActivity.id, { idlePeriods });
        logger.info('Idle time excluded from work');
      }
    }

    this.lastIdlePeriod = null;
  }

  /**
   * Check if currently paused due to idle
   * @returns {boolean}
   */
  isPaused() {
    return this.pausedDueToIdle;
  }

  /**
   * Get the last idle period info
   * @returns {Object|null}
   */
  getLastIdlePeriod() {
    return this.lastIdlePeriod;
  }

  /**
   * Reset idle state (called when tracking stops)
   */
  reset() {
    this.pausedDueToIdle = false;
    this.idleStartTime = null;
    this.idleWarningShown = false;
  }
}

module.exports = IdleDetector;
