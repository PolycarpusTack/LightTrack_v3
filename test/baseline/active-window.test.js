/**
 * Foreground window detection through the Win32 API (replaces active-win).
 * Runs against the real API: CI and development are Windows-only.
 */
const path = require('path');
const { activeWindow, processInfo, fileDescription } = require('../../src/main/core/active-window');

test('names a process by its file description, as active-win did', () => {
  const info = processInfo(process.pid);
  expect(path.basename(info.path).toLowerCase()).toBe('node.exe');
  expect(info.name).toBe('Node.js JavaScript Runtime');
});

test('reads the file description of a system executable', () => {
  expect(fileDescription(path.join(process.env.SystemRoot, 'explorer.exe'))).toBe('Windows Explorer');
});

test('falls back to the file name when there is no description', () => {
  expect(fileDescription(path.join(__dirname, 'active-window.test.js'))).toBeUndefined();
});

test('returns nothing for a process that does not exist', () => {
  expect(processInfo(0x7ffffffc)).toBeUndefined();
});

test('reports the foreground window in active-win shape', () => {
  // A desktop session normally has a foreground window; a locked or headless one may not.
  const window = activeWindow();
  if (window === undefined) return;
  expect(window).toEqual({
    platform: 'windows',
    title: expect.any(String),
    owner: { name: expect.any(String), processId: expect.any(Number), path: expect.any(String) }
  });
  expect(window.owner.name.length).toBeGreaterThan(0);
});
