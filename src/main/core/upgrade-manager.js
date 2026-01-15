/**
 * Upgrade Manager - Handles app upgrades, migrations, and version transitions
 * Detects previous installations and performs necessary data migrations
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const logger = require('../logger');

// Version history for migrations
const MIGRATIONS = {
  // '2.0.0': migrateFrom2To3,
  // Add more migrations as needed
};

class UpgradeManager {
  constructor(storage) {
    this.storage = storage;
    this.appPath = app.getAppPath();
    this.userDataPath = app.getPath('userData');
    this.upgradeMarkerPath = path.join(this.appPath, 'upgrade-marker.json');
    this.versionFilePath = path.join(this.userDataPath, '.version');
  }

  /**
   * Check for upgrades and run necessary migrations
   * Call this on app startup before loading main window
   */
  async checkAndMigrate() {
    try {
      const currentVersion = app.getVersion();
      const previousVersion = this.getPreviousVersion();
      const upgradeInfo = this.getUpgradeMarker();

      logger.info(`Version check: current=${currentVersion}, previous=${previousVersion}`);

      // First-time installation
      if (!previousVersion && !upgradeInfo) {
        logger.info('Fresh installation detected');
        await this.handleFreshInstall(currentVersion);
        return { type: 'fresh', version: currentVersion };
      }

      // Upgrade detected via installer marker
      if (upgradeInfo) {
        logger.info(`Upgrade detected via installer: ${upgradeInfo.previousVersion} -> ${currentVersion}`);
        await this.handleUpgrade(upgradeInfo.previousVersion, currentVersion, upgradeInfo);
        this.cleanupUpgradeMarker();
        return { type: 'upgrade', from: upgradeInfo.previousVersion, to: currentVersion };
      }

      // Version changed (manual update or auto-update)
      if (previousVersion && previousVersion !== currentVersion) {
        logger.info(`Version change detected: ${previousVersion} -> ${currentVersion}`);
        await this.handleUpgrade(previousVersion, currentVersion);
        return { type: 'upgrade', from: previousVersion, to: currentVersion };
      }

      // Same version, no action needed
      return { type: 'none', version: currentVersion };

    } catch (error) {
      logger.error('Error during upgrade check:', error);
      // Don't throw - allow app to continue even if upgrade check fails
      return { type: 'error', error: error.message };
    }
  }

  /**
   * Get upgrade marker created by installer
   */
  getUpgradeMarker() {
    try {
      // Check both app path and install directory
      const paths = [
        this.upgradeMarkerPath,
        path.join(path.dirname(this.appPath), 'upgrade-marker.json'),
        path.join(process.resourcesPath || '', '..', 'upgrade-marker.json')
      ];

      for (const markerPath of paths) {
        if (fs.existsSync(markerPath)) {
          const content = fs.readFileSync(markerPath, 'utf8');
          return JSON.parse(content);
        }
      }
      return null;
    } catch (error) {
      logger.warn('Could not read upgrade marker:', error.message);
      return null;
    }
  }

  /**
   * Clean up upgrade marker after processing
   */
  cleanupUpgradeMarker() {
    try {
      const paths = [
        this.upgradeMarkerPath,
        path.join(path.dirname(this.appPath), 'upgrade-marker.json'),
        path.join(process.resourcesPath || '', '..', 'upgrade-marker.json')
      ];

      for (const markerPath of paths) {
        if (fs.existsSync(markerPath)) {
          fs.unlinkSync(markerPath);
          logger.info(`Cleaned up upgrade marker: ${markerPath}`);
        }
      }
    } catch (error) {
      logger.warn('Could not cleanup upgrade marker:', error.message);
    }
  }

  /**
   * Get previously recorded version
   */
  getPreviousVersion() {
    try {
      if (fs.existsSync(this.versionFilePath)) {
        return fs.readFileSync(this.versionFilePath, 'utf8').trim();
      }

      // Also check storage for version
      const storedVersion = this.storage?.store?.get('appVersion');
      return storedVersion || null;
    } catch (error) {
      logger.warn('Could not read previous version:', error.message);
      return null;
    }
  }

  /**
   * Save current version
   */
  saveCurrentVersion(version) {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.versionFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.versionFilePath, version);

      // Also save to storage
      if (this.storage?.store) {
        this.storage.store.set('appVersion', version);
      }

      logger.info(`Saved current version: ${version}`);
    } catch (error) {
      logger.error('Could not save current version:', error);
    }
  }

  /**
   * Handle fresh installation
   */
  async handleFreshInstall(version) {
    logger.info('Setting up fresh installation...');

    // Initialize default settings if needed
    await this.initializeDefaults();

    // Save version
    this.saveCurrentVersion(version);

    logger.info('Fresh installation complete');
  }

  /**
   * Handle upgrade from previous version
   */
  async handleUpgrade(fromVersion, toVersion, upgradeInfo = null) {
    logger.info(`Upgrading from ${fromVersion} to ${toVersion}...`);

    // Run any necessary migrations
    await this.runMigrations(fromVersion, toVersion);

    // Restore from backup if upgrade mode
    if (upgradeInfo?.upgradeMode === '1') {
      await this.restoreFromBackup();
    }

    // Update version
    this.saveCurrentVersion(toVersion);

    logger.info('Upgrade complete');
  }

  /**
   * Run migrations between versions
   */
  async runMigrations(fromVersion, toVersion) {
    const versionsToMigrate = Object.keys(MIGRATIONS)
      .filter(v => this.compareVersions(v, fromVersion) > 0 && this.compareVersions(v, toVersion) <= 0)
      .sort(this.compareVersions);

    for (const version of versionsToMigrate) {
      logger.info(`Running migration for version ${version}...`);
      try {
        await MIGRATIONS[version](this.storage);
        logger.info(`Migration ${version} completed`);
      } catch (error) {
        logger.error(`Migration ${version} failed:`, error);
        // Continue with other migrations
      }
    }
  }

  /**
   * Compare two version strings
   * Returns: -1 if a < b, 0 if a == b, 1 if a > b
   */
  compareVersions(a, b) {
    const partsA = (a || '0.0.0').split('.').map(Number);
    const partsB = (b || '0.0.0').split('.').map(Number);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const numA = partsA[i] || 0;
      const numB = partsB[i] || 0;
      if (numA < numB) return -1;
      if (numA > numB) return 1;
    }
    return 0;
  }

  /**
   * Initialize default settings for fresh install
   */
  async initializeDefaults() {
    if (!this.storage) return;

    const defaults = {
      'settings.trackingEnabled': true,
      'settings.idleThreshold': 300,
      'settings.startWithSystem': false,
      'settings.minimizeToTray': true,
      'settings.showNotifications': true
    };

    for (const [key, value] of Object.entries(defaults)) {
      if (this.storage.store.get(key) === undefined) {
        this.storage.store.set(key, value);
      }
    }
  }

  /**
   * Restore settings from backup (created during upgrade)
   */
  async restoreFromBackup() {
    const backupDir = path.join(this.userDataPath, 'backup');

    try {
      // Restore config if backup exists and current is missing/empty
      const configBackup = path.join(backupDir, 'config.json.bak');
      const currentConfig = path.join(this.userDataPath, 'config.json');

      if (fs.existsSync(configBackup)) {
        const backupStats = fs.statSync(configBackup);
        const currentExists = fs.existsSync(currentConfig);
        const currentStats = currentExists ? fs.statSync(currentConfig) : null;

        // Restore if backup is larger (more data) or current doesn't exist
        if (!currentExists || (currentStats && backupStats.size > currentStats.size)) {
          fs.copyFileSync(configBackup, currentConfig);
          logger.info('Restored config from backup');
        }
      }

      // Similar for activities
      const activitiesBackup = path.join(backupDir, 'activities.json.bak');
      const currentActivities = path.join(this.userDataPath, 'activities.json');

      if (fs.existsSync(activitiesBackup) && !fs.existsSync(currentActivities)) {
        fs.copyFileSync(activitiesBackup, currentActivities);
        logger.info('Restored activities from backup');
      }

    } catch (error) {
      logger.error('Error restoring from backup:', error);
    }
  }

  /**
   * Check if this appears to be a previous installation (data exists)
   */
  hasPreviousData() {
    const dataFiles = [
      path.join(this.userDataPath, 'config.json'),
      path.join(this.userDataPath, 'activities.json'),
      path.join(this.userDataPath, 'lighttrack.json')
    ];

    return dataFiles.some(f => fs.existsSync(f));
  }

  /**
   * Get installation info for display
   */
  getInstallationInfo() {
    return {
      currentVersion: app.getVersion(),
      previousVersion: this.getPreviousVersion(),
      userDataPath: this.userDataPath,
      hasPreviousData: this.hasPreviousData(),
      upgradeMarker: this.getUpgradeMarker()
    };
  }
}

module.exports = UpgradeManager;
