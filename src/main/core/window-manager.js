const { BrowserWindow, dialog } = require('electron');
const path = require('path');
const logger = require('../logger');

/**
 * WindowManager - Handles main window creation and lifecycle
 * Extracted from LightTrackApp to improve maintainability
 */
class WindowManager {
  constructor(options = {}) {
    this.mainWindow = null;
    this.options = options;

    // Callbacks for integration with main app
    this.isQuitting = options.isQuitting || (() => false);
    this.onWindowClosed = options.onWindowClosed || (() => {});
    this.getSettings = options.getSettings || (() => ({}));

    // Window behavior settings (defaults)
    this.closeBehavior = 'minimize'; // 'minimize' or 'close'
    this.minimizeToTray = true;
  }

  /**
   * Update window behavior settings
   * @param {Object} settings - { closeBehavior, minimizeToTray }
   */
  updateBehavior(settings) {
    if (settings.closeBehavior !== undefined) {
      this.closeBehavior = settings.closeBehavior;
    }
    if (settings.minimizeToTray !== undefined) {
      this.minimizeToTray = settings.minimizeToTray;
    }
    logger.info('Window behavior updated:', { closeBehavior: this.closeBehavior, minimizeToTray: this.minimizeToTray });
  }

  /**
   * Create the main application window
   * @returns {BrowserWindow} The created window
   */
  create() {
    try {
      const windowOptions = {
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
          preload: path.join(__dirname, '..', '..', 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true
        },
        backgroundColor: '#0f172a',
        show: false,
        icon: path.join(__dirname, '..', '..', '..', 'assets', 'icon.png')
      };

      // Platform-specific window options
      if (process.platform === 'darwin') {
        windowOptions.titleBarStyle = 'hiddenInset';
      } else {
        windowOptions.frame = true;
      }

      this.mainWindow = new BrowserWindow(windowOptions);

      // Load the index.html
      const indexPath = path.join(__dirname, '..', '..', 'renderer', 'index.html');
      this.mainWindow.loadFile(indexPath);

      // Handle load errors
      this.mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        logger.error('Failed to load page:', {
          errorCode,
          errorDescription,
          validatedURL,
          indexPath
        });

        // Try to load a simple error page
        this.mainWindow.loadURL(`data:text/html,
          <html>
            <body style="background: #0f172a; color: #f1f5f9; font-family: sans-serif; padding: 20px;">
              <h1>Failed to load LightTrack</h1>
              <p>Error: ${errorDescription}</p>
              <p>Path: ${indexPath}</p>
            </body>
          </html>
        `);
      });

      // Window event handlers
      this.mainWindow.once('ready-to-show', () => {
        this.mainWindow.show();
        logger.info('Main window shown');
      });

      this.mainWindow.on('close', (event) => {
        // If app is quitting, allow close
        if (this.isQuitting()) {
          return;
        }

        // Handle based on close behavior setting
        if (this.closeBehavior === 'minimize') {
          event.preventDefault();
          if (this.minimizeToTray) {
            // Hide to system tray
            this.mainWindow.hide();
          } else {
            // Minimize to taskbar
            this.mainWindow.minimize();
          }
        }
        // If closeBehavior === 'close', allow the window to close normally
      });

      // Handle minimize event - optionally hide to tray instead
      this.mainWindow.on('minimize', (event) => {
        if (this.minimizeToTray && !this.isQuitting()) {
          event.preventDefault();
          this.mainWindow.hide();
        }
      });

      this.mainWindow.on('closed', () => {
        this.mainWindow = null;
        this.onWindowClosed();
        logger.info('Main window closed');
      });

      // Handle window crashes
      this.mainWindow.webContents.on('crashed', (event, killed) => {
        logger.error('Window crashed:', { killed });
        if (!killed) {
          this.handleError(new Error('Renderer process crashed'));
        }
      });

      // Log renderer console messages in development
      if (process.env.NODE_ENV === 'development') {
        this.mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
          logger.debug(`Renderer console: [${level}] ${message}`);
        });
      }

      return this.mainWindow;
    } catch (error) {
      logger.error('Failed to create window:', error);
      this.handleError(error);
      return null;
    }
  }

  /**
   * Handle window creation/runtime errors
   * @param {Error} error - The error that occurred
   */
  handleError(error) {
    dialog.showErrorBox(
      'LightTrack Error',
      `Failed to create application window.\n\n${error.message}\n\nPlease restart the application.`
    );
  }

  /**
   * Get the current main window
   * @returns {BrowserWindow|null}
   */
  getWindow() {
    return this.mainWindow;
  }

  /**
   * Show the main window
   */
  show() {
    if (this.mainWindow) {
      this.mainWindow.show();
    }
  }

  /**
   * Hide the main window
   */
  hide() {
    if (this.mainWindow) {
      this.mainWindow.hide();
    }
  }

  /**
   * Check if window exists and is visible
   * @returns {boolean}
   */
  isVisible() {
    return this.mainWindow?.isVisible() || false;
  }

  /**
   * Send IPC message to renderer
   * @param {string} channel - IPC channel name
   * @param {...any} args - Arguments to send
   */
  send(channel, ...args) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args);
    }
  }
}

module.exports = WindowManager;
