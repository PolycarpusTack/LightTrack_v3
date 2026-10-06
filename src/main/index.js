const { app, ipcMain, globalShortcut, shell, dialog } = require('electron');
const { applyHarnessMode, isHarness } = require('./harness-mode');

// Test harness (LT3-005): isolate userData before anything reads it.
applyHarnessMode(app);
const logger = require('./logger');

// Import core modules
const StorageManager = require('./core/storage-manager');
const ActivityTracker = require('./core/activity-tracker');
const TrayManager = require('./core/tray-manager');
const WindowManager = require('./core/window-manager');
const AutoUpdater = require('./auto-updater');
const UpdaterHandlerMain = require('./ipc/handlers/updaterHandlerMain');
const ActivitiesHandlerMain = require('./ipc/handlers/activitiesHandlerMain');
const SettingsHandlerMain = require('./ipc/handlers/settingsHandlerMain');
const TrackingHandlerMain = require('./ipc/handlers/trackingHandlerMain');
const TagsHandlerMain = require('./ipc/handlers/tagsHandlerMain');
const ProjectsHandlerMain = require('./ipc/handlers/projectsHandlerMain');
const ActivityTypesHandlerMain = require('./ipc/handlers/activityTypesHandlerMain');
const CalendarSyncService = require('./integrations/calendar/calendar-sync-service');
const CalendarHandlerMain = require('./ipc/handlers/calendarHandlerMain');
const BrowserExtensionServer = require('./core/browser-extension-server');
const { ExtensionPairing } = require('./integrations/browser/extension-pairing');
const UpgradeManager = require('./core/upgrade-manager');
const { validateAndSanitizeActivity } = require('../shared/sanitize');
const { IpcRegistry } = require('./ipc/registry');
const { IpcError } = require('../shared/ipc/errors');


class LightTrackApp {
  constructor() {
    this.windowManager = null;
    this.trayManager = null;
    this.storage = null;
    this.tracker = null;
    this.calendarSyncService = null;
    this.browserExtensionServer = null;
    this.upgradeManager = null;
    this.isQuitting = false;

    // Define appState here
    this.appState = {
      windows: {
        main: null,
        floatingTimer: null
      },
      tracking: {
        isActive: false,
        currentActivity: null,
        sessionStartTime: null,
        lastActivityTime: null
      },
      intervals: {
        tracking: null,
        breakReminder: null
      },
      store: null,
      app: app
    };

    this.updaterHandler = null;

    // Bind methods
    this.setupIPC = this.setupIPC.bind(this);
  }

  /**
   * Get the main window (convenience accessor)
   */
  get mainWindow() {
    return this.windowManager?.getWindow() || null;
  }

  async init() {
    try {
      // Initialize logger first
      logger.init();
      logger.info('LightTrack starting...', { version: app.getVersion() });

      // Disable GPU acceleration for better performance
      app.disableHardwareAcceleration();

      // Handle app errors
      process.on('uncaughtException', (error) => {
        logger.error('Uncaught exception:', error);
      });

      process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled rejection at:', promise, 'reason:', reason);
      });

      // Wait for app to be ready before initializing storage
      // (required for app.getPath() and safeStorage to work correctly)
      await app.whenReady();

      // Initialize storage and tracker (after app.whenReady for encryption key access).
      // If the data key cannot be unlocked, stop here rather than open an empty store (LT3-008).
      try {
        this.storage = new StorageManager();
      } catch (error) {
        if (error.name === 'StorageKeyError') {
          logger.error('Storage key unavailable:', error.message);
          dialog.showErrorBox('LightTrack cannot open its data', error.message);
          app.exit(1);
          return;
        }
        throw error;
      }
      this.appState.store = this.storage.store;

      // Check for upgrades and run migrations before loading main UI
      this.upgradeManager = new UpgradeManager(this.storage);
      const upgradeResult = await this.upgradeManager.checkAndMigrate();
      if (upgradeResult.type === 'fresh') {
        logger.info('Fresh installation setup complete');
      } else if (upgradeResult.type === 'upgrade') {
        logger.info(`Upgrade from ${upgradeResult.from} to ${upgradeResult.to} complete`);
      } else if (upgradeResult.type === 'error') {
        logger.warn('Upgrade check encountered error:', upgradeResult.error);
      }

      // Initialize calendar sync service
      this.calendarSyncService = new CalendarSyncService(this.storage.store);

      this.tracker = null; // Will be initialized after window creation

      // Initialize auto-updater
      this.autoUpdater = new AutoUpdater();
      this.autoUpdater.initialize();

      // Instantiate UpdaterHandlerMain
      this.updaterHandler = new UpdaterHandlerMain(this.appState);

      // Register CTRL+Y shortcut to toggle DevTools (development only)
      if (process.env.NODE_ENV === 'development') {
        globalShortcut.register('CommandOrControl+Y', () => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            if (this.mainWindow.webContents.isDevToolsOpened()) {
              this.mainWindow.webContents.closeDevTools();
            } else {
              this.mainWindow.webContents.openDevTools();
            }
          }
        });
        logger.info('Registered CommandOrControl+Y shortcut for DevTools');
      }

      // Initialize WindowManager
      this.windowManager = new WindowManager({
        isQuitting: () => this.isQuitting,
        onWindowClosed: () => {
          this.appState.windows.main = null;
        },
        getSettings: () => this.storage.getSettings()
      });

      // Load initial window behavior settings
      const savedSettings = this.storage.getSettings();
      this.windowManager.updateBehavior({
        closeBehavior: savedSettings.closeBehavior || 'minimize',
        minimizeToTray: savedSettings.minimizeToTray !== false
      });

      this.windowManager.create();

      // Set main window in appState
      this.appState.windows.main = this.mainWindow;

      // Initialize tracker after window creation
      this.tracker = new ActivityTracker(this.storage, this.mainWindow);

      // Initialize browser extension server for web browser integration
      // Pairing (LT3-004): the code is shown here, in the desktop app, never sent to the browser.
      this.extensionPairing = new ExtensionPairing({
        store: this.storage.store,
        showCode: (code, pairingId) => this.showExtensionPairingCode(code, pairingId)
      });
      this.browserExtensionServer = new BrowserExtensionServer(this.tracker, this.storage, {
        pairing: this.extensionPairing,
        log: logger
      });
      if (!isHarness()) {
        this.browserExtensionServer.start();
      }

      // Initialize TrayManager
      this.trayManager = new TrayManager({
        getMainWindow: () => this.mainWindow,
        getTracker: () => this.tracker,
        onShowWindow: () => {
          if (!this.mainWindow) {
            this.windowManager.create();
            this.appState.windows.main = this.mainWindow;
          } else {
            this.windowManager.show();
          }
        },
        onToggleTracking: async () => {
          if (!this.tracker) return;
          if (this.tracker.isTracking) {
            await this.tracker.stop();
          } else {
            await this.tracker.start();
          }
          // Notify renderer
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('tracking-status-changed', this.tracker.isTracking);
          }
        },
        onOpenSettings: () => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.show();
            this.mainWindow.webContents.send('open-settings');
          }
        },
        onQuit: () => {
          this.isQuitting = true;
          app.quit();
        }
      });
      this.trayManager.create();

      this.setupIPC();

      // Check if auto-start tracking is enabled
      await this.checkAutoStartTracking();

      logger.info('LightTrack initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize app:', error);
      app.quit();
    }
  }

  /**
   * Check settings and start tracking automatically if enabled
   */
  async checkAutoStartTracking() {
    try {
      const settings = this.storage.getSettings();
      if (settings.autoStartTracking && !isHarness()) {
        logger.info('Auto-start tracking enabled, starting tracker...');
        await this.tracker.start();
        this.appState.tracking.isActive = true;
        this.appState.tracking.sessionStartTime = this.tracker.sessionStartTime;
        this.appState.tracking.lastActivityTime = this.tracker.lastActiveTime;
        this.appState.tracking.samplingRate = this.tracker.currentCheckInterval / 1000;

        // Notify renderer if window exists
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('tracking-status-changed', true);
        }
      }
    } catch (error) {
      logger.error('Failed to check auto-start tracking:', error);
    }
  }
  /**
   * Show a browser-extension pairing code to the person at this computer (LT3-004).
   * Choosing Deny cancels the pairing request.
   */
  showExtensionPairingCode(code, pairingId) {
    const parent = this.mainWindow && !this.mainWindow.isDestroyed() ? this.mainWindow : undefined;
    if (parent) {
      if (parent.isMinimized()) parent.restore();
      parent.show();
      parent.focus();
    }
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    dialog.showMessageBox(parent, {
      type: 'info',
      title: 'Pair browser extension',
      message: `Pairing code: ${spaced}`,
      detail: 'Type this code in the LightTrack browser extension to connect it. The code expires in two minutes. ' +
        'If you did not start pairing from the extension, choose Deny.',
      buttons: ['OK', 'Deny'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    }).then(({ response }) => {
      if (response === 1) this.extensionPairing?.cancel(pairingId);
    }).catch(() => {});
  }

  /**
   * Register every renderer-facing IPC handler through the registry (LT3-003).
   * Throws when a handler is missing or outside the contract; initialize() then quits.
   */
  setupIPC() {
    const registry = new IpcRegistry(ipcMain, logger);

    new ActivitiesHandlerMain(this.storage, this.appState.store, this.appState, validateAndSanitizeActivity)
      .registerHandlers(registry);

    new SettingsHandlerMain(
      this.appState.store,
      this.appState,
      () => { /* setupBreakReminders */ },
      () => this.tracker?.stop(),
      () => this.tracker?.start()
    ).registerHandlers(registry);

    new TrackingHandlerMain(
      this.appState,
      // toggleTracking
      async () => {
        if (!this.tracker) {
          throw new Error('Tracker not initialized');
        }
        if (this.tracker.isTracking) {
          await this.tracker.stop();
          this.appState.tracking.isActive = false;
          this.appState.tracking.currentActivity = null;
          this.appState.tracking.sessionStartTime = null;
          this.appState.tracking.lastActivityTime = null;
          this.appState.tracking.samplingRate = null;
        } else {
          await this.tracker.start();
          this.appState.tracking.isActive = true;
          this.appState.tracking.currentActivity = this.tracker.currentActivity;
          this.appState.tracking.sessionStartTime = this.tracker.sessionStartTime;
          this.appState.tracking.lastActivityTime = this.tracker.lastActiveTime;
          this.appState.tracking.samplingRate = this.tracker.currentCheckInterval / 1000;
        }
        this.trayManager?.updateMenu();
        return {
          isTracking: this.tracker.isTracking,
          currentActivity: this.tracker.currentActivity
        };
      },
      // handleIdleDecision
      async (wasWorking) => {
        if (this.tracker) {
          await this.tracker.handleIdleTimeDecision(wasWorking);
        }
      }
    ).registerHandlers(registry);

    new TagsHandlerMain(this.storage).registerHandlers(registry);
    new ProjectsHandlerMain(this.storage).registerHandlers(registry);
    new ActivityTypesHandlerMain(this.storage).registerHandlers(registry);
    new CalendarHandlerMain(this.calendarSyncService).registerHandlers(registry);
    this.updaterHandler.registerHandlers(registry);

    // Initialize calendar sync after handlers are ready (no network in harness runs)
    if (!isHarness()) {
      this.calendarSyncService.initialize();
    }

    registry.handle('browser-extension:get-status', () => ({
      paired: this.extensionPairing ? this.extensionPairing.pairedCount() : 0
    }));
    registry.handle('browser-extension:revoke-all', () => {
      this.extensionPairing?.revokeAll();
      logger.info('Browser extension pairings revoked');
      return { paired: 0 };
    });

    // Only http and https URLs open in the system browser
    registry.handle('shell:open-external', (event, url) => {
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        throw new IpcError('INVALID_REQUEST', 'Invalid URL', 'shell:open-external');
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new IpcError('INVALID_REQUEST', 'Only http and https URLs are allowed', 'shell:open-external');
      }
      return shell.openExternal(url);
    });

    registry.handle('upgrade:getInfo', () => {
      return this.upgradeManager?.getInstallationInfo() || null;
    });

    registry.handle('window:update-behavior', (event, settings) => {
      if (this.windowManager) {
        this.windowManager.updateBehavior(settings);
        // Also save to storage for persistence
        this.storage.updateSettings({
          closeBehavior: settings.closeBehavior,
          minimizeToTray: settings.minimizeToTray
        });
      }
      return { success: true };
    });

    const missing = registry.missing();
    if (missing.length > 0) {
      throw new Error(`IPC contract channels without a handler: ${missing.join(', ')}`);
    }
    logger.info(`IPC handlers registered: ${registry.registeredChannels().length}`);
  }

  // Periodic updates
  startPeriodicUpdates() {
    // Update tray total every minute
    this.periodicUpdateInterval = setInterval(() => {
      if (this.tracker?.isTracking) {
        this.trayManager?.updateTotal();
      }
    }, 60000);
  }

  // Cleanup resources before quit
  async cleanup() {
    // Clear periodic updates interval
    if (this.periodicUpdateInterval) {
      clearInterval(this.periodicUpdateInterval);
      this.periodicUpdateInterval = null;
    }

    // Stop tracker and save current activity
    if (this.tracker?.isTracking) {
      await this.tracker.stop();
    }

    // Stop browser extension server
    this.browserExtensionServer?.stop();

    // Cleanup calendar sync
    this.calendarSyncService?.cleanup();
  }
}

// Initialize app
const lightTrackApp = new LightTrackApp();
lightTrackApp.init();

// Handle app lifecycle
app.on('window-all-closed', () => {
  logger.info('All windows closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async (event) => {
  lightTrackApp.isQuitting = true;

  // Prevent immediate quit to allow async cleanup
  event.preventDefault();

  try {
    await lightTrackApp.cleanup();
  } catch (error) {
    logger.error('Error during cleanup:', error);
  }

  lightTrackApp.autoUpdater?.cleanup();
  globalShortcut.unregisterAll();

  // Now actually quit
  app.exit(0);
});

app.on('activate', () => {
  // macOS: Re-create window when dock icon is clicked
  if (!lightTrackApp.mainWindow) {
    lightTrackApp.windowManager?.create();
  }
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  logger.warn('Another instance is already running');
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance
    if (lightTrackApp.mainWindow) {
      if (lightTrackApp.mainWindow.isMinimized()) {
        lightTrackApp.mainWindow.restore();
      }
      lightTrackApp.mainWindow.focus();
    }
  });

  // Start periodic updates after init
  app.whenReady().then(() => {
    lightTrackApp.startPeriodicUpdates();
  });
}
