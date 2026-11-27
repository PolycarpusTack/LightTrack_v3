// trackingHandlerMain.js - Tracking IPC handlers
//
// The tracker is the only source of tracking state (A-6). The tray starts and stops
// the tracker directly, so these handlers read it on every call and keep no copy.

const logger = require('../../logger');
const { toWireActivity } = require('../wire-activity');

const DEFAULT_SAMPLING_SECONDS = 5;

class TrackingHandlerMain {
  /**
   * @param {() => object|null} getTracker - the activity tracker, or null before it exists
   * @param {() => void} onChanged - called after a handler started or stopped tracking
   * @param {(wasWorking: boolean) => Promise<void>} handleIdleDecision
   */
  constructor(getTracker, onChanged, handleIdleDecision) {
    this.getTracker = getTracker;
    this.onChanged = onChanged || (() => {});
    this.handleIdleDecision = handleIdleDecision;
  }

  /** The tracker, or an error the renderer can show. */
  tracker() {
    const tracker = this.getTracker();
    if (!tracker) throw new Error('Tracker not initialized');
    return tracker;
  }

  /** Tracking state as the tracker holds it now. */
  state() {
    const tracker = this.getTracker();
    const isActive = Boolean(tracker?.isTracking);
    return {
      isActive,
      isTracking: isActive,
      currentActivity: isActive ? toWireActivity(tracker.currentActivity || null) : null,
      sessionStartTime: isActive ? tracker.sessionStartTime || null : null,
      lastActivityTime: isActive ? tracker.lastActiveTime || null : null,
      samplingRate: tracker?.currentCheckInterval ? tracker.currentCheckInterval / 1000 : DEFAULT_SAMPLING_SECONDS
    };
  }

  registerHandlers(registry) {
    logger.debug('Registering Tracking IPC handlers...');

    registry.handle('tracking:toggle', async () => {
      const tracker = this.tracker();
      if (tracker.isTracking) {
        await tracker.stop();
      } else {
        await tracker.start();
      }
      this.onChanged();
      return this.state();
    });

    // Idempotent: no-op when the tracker is already running
    registry.handle('tracking:start', async () => {
      const tracker = this.tracker();
      if (tracker.isTracking) {
        return { ...this.state(), wasAlreadyActive: true };
      }
      await tracker.start();
      this.onChanged();
      return { ...this.state(), wasAlreadyActive: false };
    });

    // Idempotent: no-op when the tracker is already stopped
    registry.handle('tracking:stop', async () => {
      const tracker = this.tracker();
      if (!tracker.isTracking) {
        return { ...this.state(), wasAlreadyStopped: true };
      }
      await tracker.stop();
      this.onChanged();
      return { ...this.state(), wasAlreadyStopped: false };
    });

    registry.handle('tracking:get-current', () => this.state());

    registry.handle('handle-idle-decision', async (event, wasWorking) => {
      logger.debug(`Idle decision: wasWorking = ${wasWorking}`);
      if (this.handleIdleDecision) {
        await this.handleIdleDecision(wasWorking);
        return { success: true, action: wasWorking ? 'counted' : 'excluded' };
      }
      return { success: false, action: 'no-op' };
    });

    logger.debug('Tracking IPC handlers registered successfully');
  }
}

module.exports = TrackingHandlerMain;
