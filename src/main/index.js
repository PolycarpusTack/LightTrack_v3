const { app, ipcMain, globalShortcut } = require('electron');
const logger = require('./logger');

// Import core modules
const StorageManager = require('./core/storage-manager');
const ActivityTracker = require('./core/activity-tracker');
const TrayManager = require('./core/tray-manager');
const WindowManager = require('./core/window-manager');
const autoUpdater = require('./auto-updater');
const UpdaterHandlerMain = require('./ipc/handlers/updaterHandlerMain');
const ActivitiesHandlerMain = require('./ipc/handlers/activitiesHandlerMain');
const SettingsHandlerMain = require('./ipc/handlers/settingsHandlerMain');
const TrackingHandlerMain = require('./ipc/handlers/trackingHandlerMain');
const TagsHandlerMain = require('./ipc/handlers/tagsHandlerMain');
const ProjectsHandlerMain = require('./ipc/handlers/projectsHandlerMain');
const ActivityTypesHandlerMain = require('./ipc/handlers/activityTypesHandlerMain');
const CalendarSyncService = require('./services/calendarSyncService');
const CalendarHandlerMain = require('./ipc/handlers/calendarHandlerMain');
const BrowserExtensionServer = require('./core/browser-extension-server');
const UpgradeManager = require('./core/upgrade-manager');


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

      // Initialize storage and tracker (after app.whenReady for encryption key access)
      this.storage = new StorageManager();
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

      // Instantiate UpdaterHandlerMain
      this.updaterHandler = new UpdaterHandlerMain(this.appState);

      // Register CTRL+Y shortcut to toggle DevTools
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
      this.browserExtensionServer = new BrowserExtensionServer(this.tracker, this.storage);
      this.browserExtensionServer.start();

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
      if (settings.autoStartTracking) {
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
  setupIPC() {
    try {
      // Create safe handler wrapper with validation and structured errors
      const createSafeHandler = (channel, handler) => async (...args) => {
        logger.debug(`IPC: ${channel} called`, { argsCount: args.length });
        try {
          return await handler(...args);
        } catch (error) {
          logger.error(`IPC Error in ${channel}:`, error);
          throw error;
        }
      };

      // Activity validation function
      const validateActivity = (activity) => {
        if (!activity || typeof activity !== 'object') {
          return { valid: false, error: 'Activity must be an object' };
        }

        // Sanitize string fields
        const sanitizeString = (str, maxLength = 500) => {
          if (typeof str !== 'string') return str;
          return str.slice(0, maxLength).replace(/<[^>]*>/g, ''); // Strip HTML tags
        };

        // Validate required fields
        if (activity.title && typeof activity.title !== 'string') {
          return { valid: false, error: 'Title must be a string' };
        }
        if (activity.project && typeof activity.project !== 'string') {
          return { valid: false, error: 'Project must be a string' };
        }
        if (activity.duration !== undefined && (typeof activity.duration !== 'number' || activity.duration < 0)) {
          return { valid: false, error: 'Duration must be a non-negative number' };
        }
        if (activity.startTime && isNaN(new Date(activity.startTime).getTime())) {
          return { valid: false, error: 'Invalid startTime' };
        }

        // Sanitize only the fields that are actually provided (for partial updates)
        const sanitized = {};

        // Copy non-string fields as-is
        if (activity.id !== undefined) sanitized.id = activity.id;
        if (activity.duration !== undefined) sanitized.duration = activity.duration;
        if (activity.actualDuration !== undefined) sanitized.actualDuration = activity.actualDuration;
        if (activity.startTime !== undefined) sanitized.startTime = activity.startTime;
        if (activity.endTime !== undefined) sanitized.endTime = activity.endTime;
        if (activity.date !== undefined) sanitized.date = activity.date;
        if (activity.isManual !== undefined) sanitized.isManual = activity.isManual;
        if (activity.billable !== undefined) sanitized.billable = activity.billable;

        // Sanitize string fields only if provided
        if (activity.title !== undefined) sanitized.title = sanitizeString(activity.title);
        if (activity.project !== undefined) sanitized.project = sanitizeString(activity.project, 100);
        if (activity.app !== undefined) sanitized.app = sanitizeString(activity.app, 100);

        // Sanitize tags only if provided (don't default to empty array)
        if (activity.tags !== undefined) {
          sanitized.tags = Array.isArray(activity.tags)
            ? activity.tags.slice(0, 20).map(t => sanitizeString(t, 50))
            : [];
        }

        // Sanitize tickets only if provided
        if (activity.tickets !== undefined) {
          sanitized.tickets = Array.isArray(activity.tickets)
            ? activity.tickets.slice(0, 20).map(t => sanitizeString(t, 50))
            : [];
        }

        return { valid: true, sanitized };
      };

      // Instantiate and register ActivitiesHandlerMain
      this.activitiesHandler = new ActivitiesHandlerMain(
        this.storage,
        this.appState.store,
        this.appState,
        createSafeHandler,
        validateActivity,
        async () => {
          // Consolidate activities by re-running storage cleanup
          if (this.storage) {
            try {
              const activities = await this.storage.getActivities();
              const cleaned = this.storage.lightweightCleanup(activities);
              this.appState.store.set('activities', cleaned);
              this.storage.activityCache = null; // Invalidate cache
              logger.info(`Consolidated activities: ${activities.length} -> ${cleaned.length}`);
              return { consolidated: activities.length - cleaned.length };
            } catch (error) {
              logger.error('Failed to consolidate activities:', error);
              throw error;
            }
          }
          return { consolidated: 0 };
        }
      );
      this.activitiesHandler.registerHandlers();

      // Instantiate and register SettingsHandlerMain
      this.settingsHandler = new SettingsHandlerMain(
        this.appState.store,
        this.appState,
        () => { /* setupBreakReminders */ },
        () => this.tracker?.stop(),      // Wire to actual tracker
        () => this.tracker?.start()      // Wire to actual tracker
      );
      this.settingsHandler.registerHandlers();

      // Instantiate and register TrackingHandlerMain with actual tracker methods
      this.trackingHandler = new TrackingHandlerMain(
        this.appState,
        // toggleTracking - wire to actual ActivityTracker
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
        // saveCurrentActivity - wire to tracker
        async () => {
          if (this.tracker?.currentActivity) {
            await this.tracker.saveActivity();
          }
        },
        // updateTrayMenu
        () => this.trayManager?.updateMenu(),
        // detectActivity - wire to tracker
        async () => {
          if (this.tracker) {
            await this.tracker.track();
          }
        },
        // handleIdleDecision - delegate to ActivityTracker
        async (wasWorking) => {
          if (this.tracker) {
            await this.tracker.handleIdleTimeDecision(wasWorking);
          }
        }
      );
      this.trackingHandler.registerHandlers();

      // Register Tags IPC handlers
      this.tagsHandler = new TagsHandlerMain(this.storage);
      this.tagsHandler.registerHandlers();

      // Register Projects IPC handlers
      this.projectsHandler = new ProjectsHandlerMain(this.storage);
      this.projectsHandler.registerHandlers();

      // Register Activity Types IPC handlers
      this.activityTypesHandler = new ActivityTypesHandlerMain(this.storage);
      this.activityTypesHandler.registerHandlers();

      // Register Calendar IPC handlers
      this.calendarHandler = new CalendarHandlerMain(this.calendarSyncService);
      this.calendarHandler.registerHandlers();

      // Initialize calendar sync after handlers are ready
      this.calendarSyncService.initialize();

      // Register Updater IPC handlers
      if (this.updaterHandler) {
        this.updaterHandler.registerHandlers();
      }

      // Register upgrade info handler
      ipcMain.handle('upgrade:getInfo', () => {
        return this.upgradeManager?.getInstallationInfo() || null;
      });

      // Register window behavior handler
      ipcMain.handle('window:update-behavior', (event, settings) => {
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

      logger.info('IPC handlers setup complete');
    } catch (error) {
      logger.error('Failed to setup IPC handlers:', error);
    }
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

  autoUpdater.cleanup();
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
