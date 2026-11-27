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
    // The activity that was open when tracking paused; the decision applies to it (B-4)
    this.pausedActivityId = null;

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
      minutes: idleMinutes,
      activityId: this.pausedActivityId
    };
    this.pausedActivityId = null;

    // Notify ActivityTracker
    this.onIdleReturn(this.lastIdlePeriod);

    // Notify renderer to potentially show idle prompt
    const mainWindow = this.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed() && idleMinutes >= MIN_IDLE_MINUTES_FOR_PROMPT) {
      mainWindow.webContents.send(IPC_CHANNELS.IDLE_RETURN, this.lastIdlePeriod);
    }

    this.idleStartTime = null;
    this.idleWarningShown = false;
  }

  /** Remember the activity that was open when tracking paused for idle. */
  setPausedActivity(activityId) {
    this.pausedActivityId = activityId ?? null;
  }

  /**
   * Apply the user's answer to the last idle period (B-4). The period belongs to the
   * activity that was paused, found by id: tracking may have resumed on that same
   * record since, and then the open copy gets the time too, so its next save keeps it.
   * @param {boolean} wasWorking - Whether the idle time should count as work
   * @param {Object} storage - Storage manager for updating activities
   * @param {Object|null} currentActivity - the tracker's open activity
   * @returns {Promise<boolean>} true when an activity was changed
   */
  async handleIdleTimeDecision(wasWorking, storage, currentActivity = null) {
    const period = this.lastIdlePeriod;
    this.lastIdlePeriod = null;
    if (!period) return false;

    const stored = period.activityId != null ? storage.findActivityById(period.activityId) : null;
    if (!stored) {
      logger.warn('Idle decision: the paused activity is not stored; nothing changed', { counted: wasWorking });
      return false;
    }
    const isOpen = currentActivity && String(currentActivity.id) === String(stored.id);

    if (wasWorking) {
      const add = period.duration;
      const idleEnd = Date.parse(period.end);
      const storedEnd = typeof stored.endTime === 'number' ? stored.endTime : Date.parse(stored.endTime);
      const updates = {
        duration: (stored.duration || 0) + add,
        actualDuration: (stored.actualDuration || stored.duration || 0) + add
      };
      if (!Number.isFinite(storedEnd) || storedEnd < idleEnd) updates.endTime = idleEnd;
      await storage.updateActivity(stored.id, updates);
      if (isOpen) {
        currentActivity.duration = (currentActivity.duration || 0) + add;
        currentActivity.actualDuration = (currentActivity.actualDuration || 0) + add;
      }
      logger.info('Idle time counted as work', { seconds: add });
    } else {
      const idlePeriods = [...(stored.idlePeriods || []), { start: period.start, end: period.end, duration: period.duration, excluded: true }];
      await storage.updateActivity(stored.id, { idlePeriods });
      if (isOpen) currentActivity.idlePeriods = idlePeriods;
      logger.info('Idle time excluded from work', { seconds: period.duration });
    }
    return true;
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
    this.pausedActivityId = null;
    this.idleWarningShown = false;
  }
}

module.exports = IdleDetector;
