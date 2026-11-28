/**
 * Start-up, quit and navigation guards (C-10).
 */
const path = require('path');
const { fileURLToPath } = require('url');

const samePath = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);

/**
 * Whether the window may navigate to a URL: only the app's own index.html (any hash or
 * query). A malformed URL is refused, never thrown.
 * @param {string} url - The URL the page asked for
 * @param {string} indexPath - Path of the app's index.html
 */
function isAllowedNavigation(url, indexPath) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'file:') return false;
    parsed.hash = '';
    parsed.search = '';
    return samePath(path.resolve(fileURLToPath(parsed)), path.resolve(indexPath));
  } catch {
    return false;
  }
}

/**
 * An event handler that always calls preventDefault and starts `run` only the first
 * time. Used for before-quit, which fires again while the first cleanup is still running.
 * @param {() => Promise<void>|void} run
 */
function runOnce(run) {
  let started = false;
  return event => {
    event?.preventDefault?.();
    if (started) return;
    started = true;
    run();
  };
}

module.exports = { isAllowedNavigation, runOnce };
