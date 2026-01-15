// windowManager.js - Window Management Service
const { BrowserWindow, Tray, Menu, screen, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * WindowManager Service
 * Handles all window lifecycle management, tray operations, and window state
 */
class WindowManager {
  constructor(app, store) {
    this.app = app;
    this.store = store;

    // Window references
    this.windows = {
      main: null,
      splash: null,
      floatingTimer: null,
      help: null,
      characterSheet: null,
      dialogs: new Set()
    };

    // Tray reference
    this.tray = null;

    // Asset paths
    this.assetPath = path.join(__dirname, '../../../assets');

    // Track event listeners for cleanup
    this.eventListeners = new Map();

    // WeakMap for dialog metadata to prevent memory leaks
    this.dialogMetadata = new WeakMap();

    // Track cleanup handlers
    this.cleanupHandlers = new Set();
  }

  // ================== Helper Methods ==================

  /**
   * Get window by name
   */
  getWindow(name) {
    return this.windows[name] || null;
  }

  /**
   * Check if window exists and is not destroyed
   */
  hasWindow(name) {
    const window = this.windows[name];
    return window && !window.isDestroyed();
  }

  /**
   * Get tray instance
   */
  getTray() {
    return this.tray;
  }

  /**
   * Safely add event listener with tracking for cleanup
   */
  addWindowListener(window, event, handler) {
    if (!window || window.isDestroyed()) return;

    window.on(event, handler);

    // Track listener for cleanup
    const windowId = window.id;
    if (!this.eventListeners.has(windowId)) {
      this.eventListeners.set(windowId, []);
    }
    this.eventListeners.get(windowId).push({ event, handler });
  }

  /**
   * Remove all tracked event listeners for a window
   */
  removeWindowListeners(window) {
    if (!window || window.isDestroyed()) return;

    const windowId = window.id;
    const listeners = this.eventListeners.get(windowId);

    if (listeners) {
      listeners.forEach(({ event, handler }) => {
        try {
          window.removeListener(event, handler);
        } catch (e) {
          // Window may already be destroyed
        }
      });
      this.eventListeners.delete(windowId);
    }
  }

  // ================== Splash Window ==================

  createSplashWindow() {
    this.windows.splash = new BrowserWindow({
      width: 500,
      height: 600,
      frame: false,
      alwaysOnTop: true,
      transparent: true,
      resizable: false,
      center: true,
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../../../preload.js')
      },
      icon: path.join(this.assetPath, 'icon.png')
    });

    this.windows.splash.loadFile('splash.html');

    this.windows.splash.once('ready-to-show', () => {
      this.windows.splash.show();
    });

    const closedHandler = () => {
      this.removeWindowListeners(this.windows.splash);
      this.windows.splash = null;
    };

    this.addWindowListener(this.windows.splash, 'closed', closedHandler);
  }

  closeSplashWindow() {
    if (this.windows.splash && !this.windows.splash.isDestroyed()) {
      this.windows.splash.close();
      this.windows.splash = null;
    }
  }

  // ================== Main Window ==================

  createMainWindow() {
    if (this.windows.main && !this.windows.main.isDestroyed()) {
      this.windows.main.focus();
      return this.windows.main;
    }

    this.windows.main = new BrowserWindow({
      width: 900,
      height: 700,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../../../preload.js')
      },
      icon: path.join(this.assetPath, 'icon.png')
    });

    this.windows.main.loadFile('index.html');

    this.windows.main.once('ready-to-show', () => {
      setTimeout(() => {
        this.closeSplashWindow();
        this.windows.main.show();

        if (process.platform === 'darwin') {
          this.app.dock.show();
        }
        this.windows.main.focus();
      }, 500);
    });

    const closeHandler = (event) => {
      if (!this.app.isQuitting) {
        event.preventDefault();
        this.windows.main.hide();
      }
    };

    const closedHandler = () => {
      this.removeWindowListeners(this.windows.main);
      this.windows.main = null;
    };

    this.addWindowListener(this.windows.main, 'close', closeHandler);
    this.addWindowListener(this.windows.main, 'closed', closedHandler);

    return this.windows.main;
  }

  showMainWindow() {
    if (this.windows.main) {
      if (this.windows.main.isMinimized()) {
        this.windows.main.restore();
      }
      this.windows.main.show();
      this.windows.main.focus();
    } else {
      this.createMainWindow();
    }
  }

  hideMainWindow() {
    if (this.windows.main && !this.windows.main.isDestroyed()) {
      this.windows.main.hide();
    }
  }

  // ================== Dialog Windows ==================

  createDialog(type, data = {}) {
    const dialogWindow = new BrowserWindow({
      width: 500,
      height: 600,
      parent: this.windows.main,
      modal: true,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../../../preload.js')
      },
      icon: path.join(this.assetPath, 'icon.png')
    });

    // Store metadata in WeakMap to prevent memory leaks
    this.dialogMetadata.set(dialogWindow, {
      type,
      createdAt: Date.now(),
      data
    });

    switch (type) {
      case 'manual-entry':
        dialogWindow.loadFile('manual-entry.html');
        break;
      case 'edit-activity':
        dialogWindow.loadFile('edit-activity.html');
        break;
      case 'settings':
        dialogWindow.loadFile('settings-modal.html');
        break;
      default:
        dialogWindow.destroy();
        throw new Error(`Unknown dialog type: ${type}`);
    }

    dialogWindow.once('ready-to-show', () => {
      dialogWindow.show();
      if (data.activityId) {
        dialogWindow.webContents.send('activity-data', data);
      }
    });

    this.windows.dialogs.add(dialogWindow);

    const closedHandler = () => {
      this.removeWindowListeners(dialogWindow);
      this.windows.dialogs.delete(dialogWindow);
      this.dialogMetadata.delete(dialogWindow);
    };

    this.addWindowListener(dialogWindow, 'closed', closedHandler);

    return dialogWindow;
  }

  // ================== Floating Timer ==================

  createFloatingTimer() {
    if (this.windows.floatingTimer && !this.windows.floatingTimer.isDestroyed()) {
      return this.windows.floatingTimer;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width } = primaryDisplay.workAreaSize;

    this.windows.floatingTimer = new BrowserWindow({
      width: 220,
      height: 60,
      minWidth: 180,
      minHeight: 60,
      maxHeight: 200,
      x: width - 230,
      y: 10,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
      transparent: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../../../preload.js')
      }
    });

    this.windows.floatingTimer.loadFile('floating-timer.html');
    this.windows.floatingTimer.setIgnoreMouseEvents(false);

    const opacity = this.store.get('settings.floatingTimerOpacity') || 0.9;
    this.windows.floatingTimer.setOpacity(opacity);

    const blurHandler = () => {
      if (this.windows.floatingTimer && !this.windows.floatingTimer.isDestroyed()) {
        this.windows.floatingTimer.setIgnoreMouseEvents(true, { forward: true });
      }
    };

    const focusHandler = () => {
      if (this.windows.floatingTimer && !this.windows.floatingTimer.isDestroyed()) {
        this.windows.floatingTimer.setIgnoreMouseEvents(false);
      }
    };

    const closedHandler = () => {
      this.removeWindowListeners(this.windows.floatingTimer);
      this.windows.floatingTimer = null;
      this.store.set('settings.showFloatingTimer', false);
    };

    this.addWindowListener(this.windows.floatingTimer, 'blur', blurHandler);
    this.addWindowListener(this.windows.floatingTimer, 'focus', focusHandler);
    this.addWindowListener(this.windows.floatingTimer, 'closed', closedHandler);

    return this.windows.floatingTimer;
  }

  destroyFloatingTimer() {
    if (this.windows.floatingTimer && !this.windows.floatingTimer.isDestroyed()) {
      this.windows.floatingTimer.close();
      this.windows.floatingTimer = null;
    }
  }

  updateFloatingTimer(data) {
    if (!this.windows.floatingTimer || this.windows.floatingTimer.isDestroyed()) {
      return;
    }
    this.windows.floatingTimer.webContents.send('timer-update', data);
  }

  // ================== Character Sheet Window ==================

  createCharacterSheet() {
    if (this.windows.characterSheet && !this.windows.characterSheet.isDestroyed()) {
      this.windows.characterSheet.focus();
      return this.windows.characterSheet;
    }

    this.windows.characterSheet = new BrowserWindow({
      width: 800,
      height: 900,
      parent: this.windows.main,
      modal: false,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../../../preload.js')
      },
      icon: path.join(this.assetPath, 'icon.png')
    });

    this.windows.characterSheet.loadFile('character-sheet.html');

    this.windows.characterSheet.once('ready-to-show', () => {
      this.windows.characterSheet.show();
    });

    const closedHandler = () => {
      this.removeWindowListeners(this.windows.characterSheet);
      this.windows.characterSheet = null;
    };

    this.addWindowListener(this.windows.characterSheet, 'closed', closedHandler);

    return this.windows.characterSheet;
  }

  // ================== Help Window ==================

  createHelpWindow() {
    if (this.windows.help && !this.windows.help.isDestroyed()) {
      this.windows.help.focus();
      return this.windows.help;
    }

    this.windows.help = new BrowserWindow({
      width: 800,
      height: 600,
      parent: this.windows.main,
      modal: false,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../../../preload.js')
      },
      icon: path.join(this.assetPath, 'icon.png')
    });

    this.windows.help.loadFile('help.html');

    this.windows.help.once('ready-to-show', () => {
      this.windows.help.show();
    });

    const closedHandler = () => {
      this.removeWindowListeners(this.windows.help);
      this.windows.help = null;
    };

    this.addWindowListener(this.windows.help, 'closed', closedHandler);

    return this.windows.help;
  }

  // ================== Tray Management ==================

  createTray() {
    try {
      const trayIconPath = path.join(this.assetPath, 'tray-icon.png');

      if (!fs.existsSync(trayIconPath)) {
        const fallbackPath = path.join(this.assetPath, 'icon.png');
        if (fs.existsSync(fallbackPath)) {
          this.tray = new Tray(fallbackPath);
        } else {
          console.error('No icon files found for tray');
          return null;
        }
      } else {
        this.tray = new Tray(trayIconPath);
      }

      // Create handlers for tray events
      const clickHandler = () => {
        this.showMainWindow();
      };

      const doubleClickHandler = () => {
        this.showMainWindow();
      };

      // Single click to show window
      this.tray.on('click', clickHandler);

      // Double-click to show window
      this.tray.on('double-click', doubleClickHandler);

      // Register cleanup handler for tray events
      this.registerCleanupHandler(() => {
        if (this.tray && !this.tray.isDestroyed()) {
          this.tray.removeListener('click', clickHandler);
          this.tray.removeListener('double-click', doubleClickHandler);
        }
      });

      // Mouse wheel events will be handled by the tracking service

      return this.tray;
    } catch (error) {
      console.error('Failed to create tray:', error);
      return null;
    }
  }

  updateTrayMenu(menuItems) {
    if (!this.tray) return;

    const contextMenu = Menu.buildFromTemplate(menuItems);
    this.tray.setContextMenu(contextMenu);
  }

  updateTrayTooltip(tooltip) {
    if (!this.tray) return;
    this.tray.setToolTip(tooltip);
  }

  // ================== Utility Methods ==================

  sendToMainWindow(channel, data) {
    if (this.windows.main && !this.windows.main.isDestroyed()) {
      this.windows.main.webContents.send(channel, data);
    }
  }

  getAllWindows() {
    return {
      main: this.windows.main,
      floatingTimer: this.windows.floatingTimer,
      help: this.windows.help,
      characterSheet: this.windows.characterSheet,
      dialogs: Array.from(this.windows.dialogs)
    };
  }

  closeAllDialogs() {
    this.windows.dialogs.forEach(win => {
      if (!win.isDestroyed()) {
        win.close();
      }
    });
    this.windows.dialogs.clear();
  }

  /**
   * Destroy a specific window and clean up its resources
   */
  destroyWindow(windowName) {
    const window = this.windows[windowName];
    if (window && !window.isDestroyed()) {
      // Remove all event listeners first
      this.removeWindowListeners(window);

      // Clear any pending timers or operations
      window.webContents.session.clearCache();

      // Force close and destroy
      window.destroy();

      // Clear reference
      this.windows[windowName] = null;
    }
  }

  /**
   * Comprehensive cleanup of all resources
   */
  cleanup() {
    // Execute any registered cleanup handlers
    this.cleanupHandlers.forEach(handler => {
      try {
        handler();
      } catch (e) {
        console.error('Cleanup handler error:', e);
      }
    });
    this.cleanupHandlers.clear();

    // Close all dialog windows with proper cleanup
    this.closeAllDialogs();

    // Close other windows with proper cleanup
    Object.keys(this.windows).forEach(key => {
      if (key !== 'dialogs') {
        this.destroyWindow(key);
      }
    });

    // Clear all remaining event listeners
    this.eventListeners.clear();

    // Destroy tray with event cleanup
    if (this.tray) {
      try {
        this.tray.removeAllListeners();
        if (!this.tray.isDestroyed()) {
          this.tray.destroy();
        }
      } catch (e) {
        console.error('Tray cleanup error:', e);
      }
      this.tray = null;
    }

    // Clear WeakMap references
    this.dialogMetadata = new WeakMap();
  }

  /**
   * Register a cleanup handler to be called during cleanup
   */
  registerCleanupHandler(handler) {
    this.cleanupHandlers.add(handler);
  }
}

module.exports = WindowManager;
