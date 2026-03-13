const log = require('electron-log');

log.transports.file.level = 'info';
log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info';

const logger = {
  init() { /* electron-log auto-initializes */ },
  info(message, data = {}) { log.info(message, data); },
  warn(message, data = {}) { log.warn(message, data); },
  error(message, ...args) { log.error(message, ...args); },
  debug(message, data = {}) { log.debug(message, data); }
};

module.exports = logger;
