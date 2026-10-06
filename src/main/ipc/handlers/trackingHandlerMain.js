// trackingHandlerMain.js - Tracking IPC Handler for main.js
// Extracted from main.js to improve modularity without breaking existing functionality

const logger = require('../../logger');

/**
 * Tracking Handler for main.js
 * Registers all tracking-related IPC handlers using the existing pattern
 */
class TrackingHandlerMain {
  constructor(appState, toggleTracking, handleIdleDecision) {
    logger.debug('TrackingHandlerMain constructor called');
    logger.debug('appState:', { exists: !!appState, hasTracking: !!(appState && appState.tracking) });

    this.appState = appState;
    this.toggleTracking = toggleTracking;
    this.handleIdleDecision = handleIdleDecision;
  }

  /**
   * Register all tracking IPC handlers
   */
  registerHandlers(registry) {
    logger.debug('Registering Tracking IPC handlers...');

    // Toggle tracking
    registry.handle('tracking:toggle', async () => {
      // Ensure appState exists
      if (!this.appState || !this.appState.tracking) {
        logger.error('TrackingHandlerMain: appState not properly initialized');
        return { isActive: false };
      }

      const result = await this.toggleTracking();
      return result || {
        isActive: this.appState.tracking.isActive,
        currentActivity: this.appState.tracking.currentActivity
      };
    });

    // Start tracking (idempotent - no-op if already active)
    registry.handle('tracking:start', async () => {
      if (!this.appState || !this.appState.tracking) {
        logger.error('TrackingHandlerMain: appState not properly initialized');
        return { isActive: false, wasAlreadyActive: false };
      }

      // If already tracking, return current state without toggling
      if (this.appState.tracking.isActive) {
        return {
          isActive: true,
          wasAlreadyActive: true,
          currentActivity: this.appState.tracking.currentActivity
        };
      }

      // Not tracking, so toggle to start
      const result = await this.toggleTracking();
      return {
        ...(result || { isActive: this.appState.tracking.isActive }),
        wasAlreadyActive: false,
        currentActivity: this.appState.tracking.currentActivity
      };
    });

    // Stop tracking (idempotent - no-op if already stopped)
    registry.handle('tracking:stop', async () => {
      if (!this.appState || !this.appState.tracking) {
        logger.error('TrackingHandlerMain: appState not properly initialized');
        return { isActive: false, wasAlreadyStopped: true };
      }

      // If not tracking, return current state without toggling
      if (!this.appState.tracking.isActive) {
        return {
          isActive: false,
          wasAlreadyStopped: true,
          currentActivity: null
        };
      }

      // Currently tracking, so toggle to stop
      const result = await this.toggleTracking();
      return {
        ...(result || { isActive: this.appState.tracking.isActive }),
        wasAlreadyStopped: false,
        currentActivity: null
      };
    });

    // Get current activity
    registry.handle('tracking:get-current', () => {
      // Ensure appState and tracking exist
      if (!this.appState || !this.appState.tracking) {
        logger.error('TrackingHandlerMain: appState or appState.tracking is null/undefined');
        return {
          isActive: false,
          currentActivity: null,
          sessionStartTime: null,
          lastActivityTime: null,
          samplingRate: 5
        };
      }

      return {
        isActive: this.appState.tracking.isActive || false,
        currentActivity: this.appState.tracking.currentActivity || null,
        sessionStartTime: this.appState.tracking.sessionStartTime || null,
        lastActivityTime: this.appState.tracking.lastActivityTime || null,
        samplingRate: this.appState.tracking.samplingRate || 5
      };
    });

    // Handle idle decision
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
