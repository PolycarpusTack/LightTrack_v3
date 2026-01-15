// trackingHandlerMain.js - Tracking IPC Handler for main.js
// Extracted from main.js to improve modularity without breaking existing functionality

const { ipcMain } = require('electron');
const logger = require('../../logger');

/**
 * Tracking Handler for main.js
 * Registers all tracking-related IPC handlers using the existing pattern
 */
class TrackingHandlerMain {
  constructor(appState, toggleTracking, saveCurrentActivity, updateTrayMenu, detectActivity, handleIdleDecision) {
    logger.debug('TrackingHandlerMain constructor called');
    logger.debug('appState:', { exists: !!appState, hasTracking: !!(appState && appState.tracking) });

    this.appState = appState;
    this.toggleTracking = toggleTracking;
    this.saveCurrentActivity = saveCurrentActivity;
    this.updateTrayMenu = updateTrayMenu;
    this.detectActivity = detectActivity;
    this.handleIdleDecision = handleIdleDecision;
  }

  /**
   * Register all tracking IPC handlers
   */
  registerHandlers() {
    logger.debug('Registering Tracking IPC handlers...');

    // Toggle tracking
    ipcMain.handle('tracking:toggle', async () => {
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
    ipcMain.handle('tracking:start', async () => {
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
    ipcMain.handle('tracking:stop', async () => {
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
    ipcMain.handle('tracking:get-current', () => {
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

    // Pause tracking - DISABLED
    // ipcMain.handle('tracking:pause', (event, reason) => {
    //   if (this.appState.tracking.isActive && this.appState.tracking.currentActivity) {
    //     this.saveCurrentActivity();
    //     this.appState.tracking.isActive = false;
    //     this.appState.tracking.pauseReason = reason || 'manual';
    //     if (this.appState.intervals.tracking) {
    //       clearInterval(this.appState.intervals.tracking);
    //       this.appState.intervals.tracking = null;
    //     }
    //     this.updateTrayMenu();
    //     return true;
    //   }
    //   return false;
    // });

    // Resume tracking - DISABLED
    // ipcMain.handle('tracking:resume', () => {
    //   if (!this.appState.tracking.isActive) {
    //     this.appState.tracking.isActive = true;
    //     this.appState.tracking.lastActivityTime = Date.now();
    //     this.appState.intervals.tracking = setInterval(this.detectActivity, 60000);
    //     this.appState.tracking.pauseReason = null;
    //     this.updateTrayMenu();
    //     return true;
    //   }
    //   return false;
    // });

    // Handle idle decision
    ipcMain.handle('handle-idle-decision', async (event, wasWorking) => {
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
