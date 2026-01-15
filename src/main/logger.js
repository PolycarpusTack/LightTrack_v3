/**
 * Simple logger for LightTrack
 */

const isDev = process.env.NODE_ENV === 'development';

const logger = {
  init() {
    // No-op for simple logger
  },

  info(message, data = {}) {
    console.log(`[INFO] ${message}`, Object.keys(data).length ? data : '');
  },

  warn(message, data = {}) {
    console.warn(`[WARN] ${message}`, Object.keys(data).length ? data : '');
  },

  error(message, ...args) {
    console.error(`[ERROR] ${message}`, ...args);
  },

  debug(message, data = {}) {
    if (isDev) {
      console.debug(`[DEBUG] ${message}`, Object.keys(data).length ? data : '');
    }
  }
};

module.exports = logger;
