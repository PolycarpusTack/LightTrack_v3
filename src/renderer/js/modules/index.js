/**
 * LightTrack Module Loader
 *
 * This file coordinates loading of all LightTrack modules.
 * Modules are loaded in dependency order and exposed via the
 * global window.LightTrack namespace.
 *
 * Module Structure:
 * - utils.js        - Common utility functions
 * - charts.js       - Chart rendering (bar, pie)
 * - notifications.js - Toast notifications and dialogs
 * - sap-export.js   - SAP ByDesign export functionality
 *
 * Usage:
 * The main app.js can use modules like:
 *   window.LightTrack.Utils.formatTime(seconds)
 *   window.LightTrack.ChartRenderer.drawBarChart(...)
 *   window.LightTrack.UI.showNotification(...)
 *   window.LightTrack.SAPExport.init()
 *
 * Backward Compatibility:
 * For gradual migration, the modules can coexist with inline
 * functions in app.js. Once migration is complete, the inline
 * versions can be removed.
 */

window.LightTrack = window.LightTrack || {};

// Module loading status
window.LightTrack._loaded = {
  utils: false,
  charts: false,
  notifications: false,
  sapExport: false
};

// Check if all modules are loaded
window.LightTrack.isReady = function() {
  return Object.values(window.LightTrack._loaded).every(Boolean);
};

// Initialize modules that need setup
window.LightTrack.initModules = function() {
  console.log('[LightTrack] Modules loaded:', Object.keys(window.LightTrack._loaded).filter(k => window.LightTrack._loaded[k]).join(', '));
};

// Mark modules as loaded when their files load
document.addEventListener('DOMContentLoaded', function() {
  // Check which modules are available
  if (window.LightTrack.Utils) window.LightTrack._loaded.utils = true;
  if (window.LightTrack.ChartRenderer) window.LightTrack._loaded.charts = true;
  if (window.LightTrack.UI) window.LightTrack._loaded.notifications = true;
  if (window.LightTrack.SAPExport) window.LightTrack._loaded.sapExport = true;

  window.LightTrack.initModules();
});

/**
 * Shorthand aliases for commonly used functions
 * These provide convenient access without the full namespace
 */
window.LightTrack.shortcuts = {
  // Bind shortcuts after modules load
  bind: function() {
    const LT = window.LightTrack;

    // Notification shortcut
    window.notify = function(msg, type) {
      return LT.UI?.showNotification?.(msg, type);
    };

    // Format time shortcut
    window.formatTime = function(seconds) {
      return LT.Utils?.formatTime?.(seconds);
    };

    // Format duration shortcut
    window.formatDuration = function(seconds) {
      return LT.Utils?.formatDuration?.(seconds);
    };
  }
};
