/**
 * C-10: the window may only navigate to the app's own index.html, a malformed URL is
 * refused without throwing, quit cleanup runs once, and the tracker always talks to the
 * current main window.
 */
const path = require('path');
const { pathToFileURL } = require('url');

const mockWindows = [];
jest.mock('electron', () => ({
  app: {}, dialog: {}, ipcMain: {}, Notification: function () {},
  powerMonitor: { on() {}, getSystemIdleTime: () => 0 },
  BrowserWindow: function BrowserWindow() {
    const handlers = {};
    const win = {
      handlers,
      loadFile() {}, loadURL() {}, once() {}, on() {}, show() {}, isDestroyed: () => false,
      webContents: { on: (name, fn) => { handlers[name] = fn; }, setWindowOpenHandler() {}, send: jest.fn() }
    };
    mockWindows.push(win);
    return win;
  }
}));
jest.mock('../../src/main/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const { isAllowedNavigation, runOnce } = require('../../src/main/core/app-lifecycle');
const WindowManager = require('../../src/main/core/window-manager');
const ActivityTracker = require('../../src/main/core/activity-tracker');

const INDEX = path.join(__dirname, '..', '..', 'src', 'renderer', 'index.html');
const indexUrl = pathToFileURL(INDEX).href;

describe('navigation guard (C-10)', () => {
  test('navigation guard: only the app\u2019s own index.html is allowed', () => {
    expect(isAllowedNavigation(indexUrl, INDEX)).toBe(true);
    expect(isAllowedNavigation(`${indexUrl}#settings`, INDEX)).toBe(true);
    expect(isAllowedNavigation(pathToFileURL(path.join(path.dirname(INDEX), 'other.html')).href, INDEX)).toBe(false);
    expect(isAllowedNavigation('file:///C:/Windows/win.ini', INDEX)).toBe(false);
    expect(isAllowedNavigation('https://example.test/', INDEX)).toBe(false);
    expect(isAllowedNavigation('data:text/html,<p>x</p>', INDEX)).toBe(false);
    expect(isAllowedNavigation('http://[', INDEX)).toBe(false);
    expect(isAllowedNavigation(undefined, INDEX)).toBe(false);
  });

  test('navigation guard: the window blocks a malformed URL instead of throwing', () => {
    new WindowManager().create();
    const win = mockWindows[mockWindows.length - 1];
    const block = url => {
      const event = { preventDefault: jest.fn() };
      expect(() => win.handlers['will-navigate'](event, url)).not.toThrow();
      return event.preventDefault.mock.calls.length > 0;
    };
    expect(block('http://[')).toBe(true);
    expect(block('file:///C:/Windows/win.ini')).toBe(true);
    expect(block(indexUrl)).toBe(false);
  });

  test('navigation guard: quit cleanup runs once however often quit is asked for', async () => {
    let runs = 0;
    let release;
    const handler = runOnce(() => new Promise(resolve => { runs += 1; release = resolve; }));
    const first = { preventDefault: jest.fn() };
    const second = { preventDefault: jest.fn() };
    handler(first);
    handler(second);
    expect(runs).toBe(1);
    expect(first.preventDefault).toHaveBeenCalled();
    expect(second.preventDefault).toHaveBeenCalled();
    release();
  });

  test('navigation guard: the tracker sends to the current main window', () => {
    let current = null;
    const tracker = new ActivityTracker({ getSettings: () => ({}) }, () => current);
    expect(tracker.mainWindow).toBeNull();
    current = { isDestroyed: () => false, webContents: { send: jest.fn() } };
    expect(tracker.mainWindow).toBe(current);
    expect(tracker.idleDetector.getMainWindow()).toBe(current);
  });
});
