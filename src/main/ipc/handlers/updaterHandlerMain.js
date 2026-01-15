// updaterHandlerMain.js - Auto-updater IPC Handler for main.js

const { ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const logger = require('../../logger');

class UpdaterHandlerMain {
  constructor(appState) {
    this.appState = appState;
    this.updateStatus = {
      currentVersion: '0.0.0', // Initialize with a placeholder
      updateAvailable: false,
      updateDownloaded: false,
      updateChannel: autoUpdater.channel || 'stable',
      preferences: {
        autoCheck: true,
        autoDownload: false,
        autoInstall: false,
        updateChannel: 'stable'
      }
    };

    // Initialize preferences from store if available
    if (this.appState.store) {
      const storedPreferences = this.appState.store.get('updaterPreferences', {});
      this.updateStatus.preferences = { ...this.updateStatus.preferences, ...storedPreferences };
      autoUpdater.channel = this.updateStatus.preferences.updateChannel;
      autoUpdater.autoDownload = this.updateStatus.preferences.autoDownload;
      autoUpdater.autoInstallOnAppQuit = this.updateStatus.preferences.autoInstall;
    }

    this.setupAutoUpdaterEvents();
  }

  setupAutoUpdaterEvents() {
    autoUpdater.on('checking-for-update', () => {
      logger.info('Checking for update...');
      this.updateStatus.updateAvailable = false;
      this.updateStatus.updateDownloaded = false;
      this.sendUpdaterEvent('checking-for-update');
    });

    autoUpdater.on('update-available', (info) => {
      logger.info('Update available:', info);
      this.updateStatus.updateAvailable = true;
      this.updateStatus.updateDownloaded = false;
      this.sendUpdaterEvent('update-available', info);
    });

    autoUpdater.on('update-not-available', () => {
      logger.info('Update not available.');
      this.updateStatus.updateAvailable = false;
      this.updateStatus.updateDownloaded = false;
      this.sendUpdaterEvent('update-not-available');
    });

    autoUpdater.on('error', (err) => {
      logger.error('Error in autoUpdater:', err);
      this.sendUpdaterEvent('error', err.message);
    });

    autoUpdater.on('download-progress', (progressObj) => {
      logger.debug('Download progress:', progressObj);
      this.sendUpdaterEvent('download-progress', progressObj);
    });

    autoUpdater.on('update-downloaded', (info) => {
      logger.info('Update downloaded:', info);
      this.updateStatus.updateDownloaded = true;
      this.sendUpdaterEvent('update-downloaded', info);
    });
  }

  sendUpdaterEvent(eventName, data = {}) {
    if (this.appState.windows.main && !this.appState.windows.main.isDestroyed()) {
      this.appState.windows.main.webContents.send('updater-event', { eventName, data });
    }
  }

  /**
   * Register all updater IPC handlers
   */
  registerHandlers() {
    logger.info('Registering Updater IPC handlers...');

    // Set current version when handlers are registered (app is ready)
    this.updateStatus.currentVersion = this.appState.app.getVersion();

    ipcMain.handle('updater-check-for-updates', async () => {
      try {
        if (process.env.NODE_ENV === 'development' && !process.env.FORCE_DEV_UPDATE_CONFIG) {
          logger.warn('Skip checkForUpdates because application is not packed and dev update config is not forced');
          return { status: 'skipped', message: 'Development mode' };
        }
        const result = await autoUpdater.checkForUpdates();
        return { status: 'success', updateInfo: result ? result.updateInfo : null };
      } catch (error) {
        logger.error('Failed to check for updates:', error);
        throw new Error('Failed to check for updates: ' + error.message);
      }
    });

    ipcMain.handle('updater-download-update', async () => {
      try {
        await autoUpdater.downloadUpdate();
        return { status: 'success' };
      } catch (error) {
        logger.error('Failed to download update:', error);
        throw new Error('Failed to download update: ' + error.message);
      }
    });

    ipcMain.handle('updater-install-update', async () => {
      try {
        autoUpdater.quitAndInstall();
        return { status: 'success' };
      } catch (error) {
        logger.error('Failed to install update:', error);
        throw new Error('Failed to install update: ' + error.message);
      }
    });

    ipcMain.handle('updater-get-status', () => {
      return this.updateStatus;
    });

    ipcMain.handle('updater-get-preferences', () => {
      return this.updateStatus.preferences;
    });

    ipcMain.handle('updater-save-preferences', (event, preferences) => {
      this.updateStatus.preferences = { ...this.updateStatus.preferences, ...preferences };
      if (this.appState.store) {
        this.appState.store.set('updaterPreferences', this.updateStatus.preferences);
      }
      autoUpdater.channel = this.updateStatus.preferences.updateChannel;
      autoUpdater.autoDownload = this.updateStatus.preferences.autoDownload;
      autoUpdater.autoInstallOnAppQuit = this.updateStatus.preferences.autoInstall;
      return { status: 'success', preferences: this.updateStatus.preferences };
    });

    ipcMain.handle('updater-set-channel', (event, channel) => {
      autoUpdater.channel = channel;
      this.updateStatus.updateChannel = channel;
      this.updateStatus.preferences.updateChannel = channel;
      if (this.appState.store) {
        this.appState.store.set('updaterPreferences', this.updateStatus.preferences);
      }
      return { status: 'success', channel };
    });

    ipcMain.handle('updater-skip-version', (event, version) => {
      // This typically involves setting a flag in preferences to skip a specific version
      // For now, a placeholder:
      logger.info(`Skipping version: ${version}`);
      if (this.appState.store) {
        const skippedVersions = this.appState.store.get('skippedVersions', []);
        if (!skippedVersions.includes(version)) {
          skippedVersions.push(version);
          this.appState.store.set('skippedVersions', skippedVersions);
        }
      }
      return { status: 'success', version };
    });

    logger.info('Updater IPC handlers registered successfully');
  }
}

module.exports = UpdaterHandlerMain;
