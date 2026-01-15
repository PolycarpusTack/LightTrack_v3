const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const logger = require('../logger');

/**
 * TrayManager - Handles system tray icon and menu
 * Extracted from LightTrackApp to improve maintainability
 */
class TrayManager {
  constructor(options = {}) {
    this.tray = null;
    this.options = options;

    // Callbacks for integration with main app
    this.getMainWindow = options.getMainWindow || (() => null);
    this.getTracker = options.getTracker || (() => null);
    this.onShowWindow = options.onShowWindow || (() => {});
    this.onToggleTracking = options.onToggleTracking || (async () => {});
    this.onOpenSettings = options.onOpenSettings || (() => {});
    this.onQuit = options.onQuit || (() => {});
  }

  /**
   * Create the system tray icon
   */
  create() {
    try {
      const iconPath = path.join(__dirname, '..', '..', '..', 'assets', 'icon.png');
      const trayIcon = nativeImage.createFromPath(iconPath);

      // Resize icon for tray (16x16 on Windows, 22x22 on macOS)
      const trayIconResized = trayIcon.resize({
        width: process.platform === 'darwin' ? 22 : 16,
        height: process.platform === 'darwin' ? 22 : 16
      });

      this.tray = new Tray(trayIconResized);
      this.updateMenu();

      // Tray click behavior - toggle window visibility
      this.tray.on('click', () => {
        const mainWindow = this.getMainWindow();
        if (mainWindow) {
          if (mainWindow.isVisible()) {
            mainWindow.hide();
          } else {
            mainWindow.show();
          }
        }
      });

      logger.info('System tray created');
    } catch (error) {
      logger.error('Failed to create tray:', error);
      // Tray is optional, don't quit on error
    }
  }

  /**
   * Update the tray context menu
   */
  updateMenu() {
    if (!this.tray) return;

    const tracker = this.getTracker();
    const isTracking = tracker?.isTracking || false;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show LightTrack',
        click: () => this.onShowWindow()
      },
      { type: 'separator' },
      {
        label: isTracking ? 'Stop Tracking' : 'Start Tracking',
        click: async () => {
          await this.onToggleTracking();
          this.updateMenu();
        }
      },
      {
        label: 'Today\'s Total',
        enabled: false,
        id: 'today-total'
      },
      { type: 'separator' },
      {
        label: 'Settings',
        click: () => this.onOpenSettings()
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => this.onQuit()
      }
    ]);

    this.tray.setContextMenu(contextMenu);
    this.tray.setToolTip(`LightTrack ${isTracking ? '- Tracking' : '- Stopped'}`);

    // Update today's total
    this.updateTotal();
  }

  /**
   * Update the tray tooltip with today's total time
   */
  async updateTotal() {
    try {
      const tracker = this.getTracker();
      if (!this.tray || !tracker) {
        return;
      }

      const totalSeconds = await tracker.getTodayTotal();
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const totalStr = `Today's Total: ${hours}h ${minutes}m`;

      this.tray.setToolTip(`LightTrack ${tracker.isTracking ? '- Tracking' : '- Stopped'} | ${totalStr}`);
    } catch (error) {
      logger.error('Failed to update tray total:', error);
    }
  }

  /**
   * Destroy the tray icon
   */
  destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

module.exports = TrayManager;
