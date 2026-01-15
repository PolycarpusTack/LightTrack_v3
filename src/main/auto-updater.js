/**
 * @module main/auto-updater
 * @description Auto-updater for LightTrack application
 */

const { autoUpdater } = require('electron-updater');
const { app, dialog, BrowserWindow, shell, Notification } = require('electron');
const log = require('electron-log');
const path = require('path');
const fs = require('fs');

class AutoUpdater {
  constructor() {
    this.updateAvailable = false;
    this.updateDownloaded = false;
    this.currentVersion = app.getVersion();
    this.updateCheckInterval = null;
    this.updateChannel = 'stable';
    this.manifestUrl = 'https://releases.lighttrack.app/update-manifest.json';

    this.init();
  }

  /**
   * Initialize auto-updater
   */
  init() {
    // Configure logging
    log.transports.file.level = 'info';
    autoUpdater.logger = log;

    // Configure update server
    this.configureUpdateServer();

    // Set up event handlers
    this.setupEventHandlers();

    // Load user preferences
    this.loadPreferences();

    // Start update checks if enabled
    if (this.shouldCheckForUpdates()) {
      this.startPeriodicChecks();
    }
  }

  /**
   * Configure update server
   */
  configureUpdateServer() {
    if (process.env.NODE_ENV === 'development') {
      // Don't check for updates in development
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = false;
      return;
    }

    // Configure for production
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: `https://releases.lighttrack.app/${this.updateChannel}`,
      channel: this.updateChannel
    });

    autoUpdater.autoDownload = false; // Manual download control
    autoUpdater.autoInstallOnAppQuit = true;
  }

  /**
   * Set up event handlers
   */
  setupEventHandlers() {
    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for updates...');
      this.notifyRenderer('update-checking');
    });

    autoUpdater.on('update-available', (info) => {
      log.info('Update available:', info);
      this.updateAvailable = true;
      this.handleUpdateAvailable(info);
    });

    autoUpdater.on('update-not-available', (info) => {
      log.info('Update not available:', info);
      this.updateAvailable = false;
      this.notifyRenderer('update-not-available', info);
    });

    autoUpdater.on('error', (error) => {
      log.error('Update error:', error);
      this.notifyRenderer('update-error', { error: error.message });
    });

    autoUpdater.on('download-progress', (progress) => {
      log.info('Download progress:', progress);
      this.notifyRenderer('update-download-progress', progress);
    });

    autoUpdater.on('update-downloaded', (info) => {
      log.info('Update downloaded:', info);
      this.updateDownloaded = true;
      this.handleUpdateDownloaded(info);
    });
  }

  /**
   * Check for updates manually
   */
  async checkForUpdates() {
    if (process.env.NODE_ENV === 'development') {
      log.info('Skipping update check in development');
      return { available: false };
    }

    try {
      log.info('Manual update check triggered');
      const result = await autoUpdater.checkForUpdates();
      return {
        available: this.updateAvailable,
        info: result?.updateInfo
      };
    } catch (error) {
      log.error('Failed to check for updates:', error);
      throw error;
    }
  }

  /**
   * Download available update
   */
  async downloadUpdate() {
    if (!this.updateAvailable) {
      throw new Error('No update available to download');
    }

    try {
      log.info('Starting update download');
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      log.error('Failed to download update:', error);
      throw error;
    }
  }

  /**
   * Install downloaded update
   */
  async installUpdate() {
    if (!this.updateDownloaded) {
      throw new Error('No update downloaded to install');
    }

    try {
      log.info('Installing update');
      autoUpdater.quitAndInstall();
      return { success: true };
    } catch (error) {
      log.error('Failed to install update:', error);
      throw error;
    }
  }

  /**
   * Handle update available
   */
  async handleUpdateAvailable(info) {
    const preferences = this.getPreferences();

    if (preferences.autoDownload) {
      // Automatically download if enabled
      this.downloadUpdate();
    } else {
      // Show notification
      this.showUpdateNotification(info);
    }

    this.notifyRenderer('update-available', info);
  }

  /**
   * Handle update downloaded
   */
  async handleUpdateDownloaded(info) {
    const preferences = this.getPreferences();

    if (preferences.autoInstall) {
      // Show restart dialog
      this.showRestartDialog(info);
    } else {
      // Just notify that download is ready
      this.showUpdateReadyNotification(info);
    }

    this.notifyRenderer('update-downloaded', info);
  }

  /**
   * Show update notification
   */
  showUpdateNotification(info) {
    const mainWindow = BrowserWindow.getFocusedWindow() ||
                      BrowserWindow.getAllWindows()[0];

    if (!mainWindow) return;

    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `LightTrack ${info.version} is available`,
      detail: this.formatUpdateDetails(info),
      buttons: ['Download Now', 'Download Later', 'View Release Notes'],
      defaultId: 0,
      cancelId: 1
    }).then((result) => {
      switch (result.response) {
        case 0: // Download Now
          this.downloadUpdate();
          break;
        case 2: // View Release Notes
          shell.openExternal(info.releaseNotesUrl || 'https://lighttrack.app/releases');
          break;
      }
    });
  }

  /**
   * Show restart dialog
   */
  showRestartDialog(info) {
    const mainWindow = BrowserWindow.getFocusedWindow() ||
                      BrowserWindow.getAllWindows()[0];

    if (!mainWindow) return;

    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `LightTrack ${info.version} is ready to install`,
      detail: 'The application will restart to complete the update.',
      buttons: ['Restart Now', 'Restart Later'],
      defaultId: 0,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        this.installUpdate();
      }
    });
  }

  /**
   * Show update ready notification
   */
  showUpdateReadyNotification(info) {
    const mainWindow = BrowserWindow.getFocusedWindow() ||
                      BrowserWindow.getAllWindows()[0];

    if (!mainWindow) return;

    // Use system notification
    new Notification({
      title: 'Update Ready',
      body: `LightTrack ${info.version} is ready to install. Restart when convenient.`,
      icon: path.join(__dirname, '../assets/icon.png')
    }).show();
  }

  /**
   * Format update details
   */
  formatUpdateDetails(info) {
    const details = [];

    details.push(`Current version: ${this.currentVersion}`);
    details.push(`New version: ${info.version}`);

    if (info.releaseDate) {
      details.push(`Release date: ${new Date(info.releaseDate).toLocaleDateString()}`);
    }

    if (info.files && info.files.length > 0) {
      const size = info.files[0].size;
      if (size) {
        details.push(`Download size: ${this.formatBytes(size)}`);
      }
    }

    if (info.releaseNotes) {
      details.push('\nWhat\'s new:');
      details.push(info.releaseNotes);
    }

    return details.join('\n');
  }

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Start periodic update checks
   */
  startPeriodicChecks() {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
    }

    // Check for updates every 4 hours
    this.updateCheckInterval = setInterval(() => {
      this.checkForUpdates();
    }, 4 * 60 * 60 * 1000);

    // Initial check after 30 seconds
    setTimeout(() => {
      this.checkForUpdates();
    }, 30000);
  }

  /**
   * Stop periodic update checks
   */
  stopPeriodicChecks() {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
      this.updateCheckInterval = null;
    }
  }

  /**
   * Load user preferences
   */
  loadPreferences() {
    try {
      const prefsPath = this.getPreferencesPath();
      if (fs.existsSync(prefsPath)) {
        const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
        this.updateChannel = prefs.updateChannel || 'stable';

        // Reconfigure if channel changed
        this.configureUpdateServer();
      }
    } catch (error) {
      log.error('Failed to load update preferences:', error);
    }
  }

  /**
   * Save user preferences
   */
  savePreferences(preferences) {
    try {
      const prefsPath = this.getPreferencesPath();
      const existingPrefs = this.getPreferences();
      const newPrefs = { ...existingPrefs, ...preferences };

      fs.writeFileSync(prefsPath, JSON.stringify(newPrefs, null, 2));

      // Update channel if changed
      if (preferences.updateChannel && preferences.updateChannel !== this.updateChannel) {
        this.updateChannel = preferences.updateChannel;
        this.configureUpdateServer();
      }

      // Restart/stop periodic checks based on preferences
      if (preferences.hasOwnProperty('autoCheck')) {
        if (preferences.autoCheck) {
          this.startPeriodicChecks();
        } else {
          this.stopPeriodicChecks();
        }
      }

      return { success: true };
    } catch (error) {
      log.error('Failed to save update preferences:', error);
      throw error;
    }
  }

  /**
   * Get user preferences
   */
  getPreferences() {
    const defaults = {
      autoCheck: true,
      autoDownload: false,
      autoInstall: false,
      updateChannel: 'stable',
      skipVersion: null
    };

    try {
      const prefsPath = this.getPreferencesPath();
      if (fs.existsSync(prefsPath)) {
        const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
        return { ...defaults, ...prefs };
      }
    } catch (error) {
      log.error('Failed to read preferences:', error);
    }

    return defaults;
  }

  /**
   * Get preferences file path
   */
  getPreferencesPath() {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'update-preferences.json');
  }

  /**
   * Check if should check for updates
   */
  shouldCheckForUpdates() {
    if (process.env.NODE_ENV === 'development') {
      return false;
    }

    const preferences = this.getPreferences();
    return preferences.autoCheck;
  }

  /**
   * Notify renderer process
   */
  notifyRenderer(event, data = {}) {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      window.webContents.send('updater-event', { event, data });
    });
  }

  /**
   * Get update status
   */
  getStatus() {
    return {
      currentVersion: this.currentVersion,
      updateAvailable: this.updateAvailable,
      updateDownloaded: this.updateDownloaded,
      updateChannel: this.updateChannel,
      preferences: this.getPreferences()
    };
  }

  /**
   * Set update channel
   */
  setUpdateChannel(channel) {
    if (!['stable', 'beta', 'alpha'].includes(channel)) {
      throw new Error('Invalid update channel');
    }

    this.savePreferences({ updateChannel: channel });
    return { success: true };
  }

  /**
   * Skip specific version
   */
  skipVersion(version) {
    this.savePreferences({ skipVersion: version });
    return { success: true };
  }

  /**
   * Cleanup
   */
  cleanup() {
    this.stopPeriodicChecks();
  }
}

// Export singleton
module.exports = new AutoUpdater();
