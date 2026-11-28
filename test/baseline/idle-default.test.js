/**
 * Follow-up from Epic C: a new install detects idle after the same 180 s the Settings
 * screen and the idle detector use. Stored settings are not changed.
 */
jest.mock('electron', () => ({ app: { getPath: () => '', getAppPath: () => '' }, dialog: {}, ipcMain: {}, safeStorage: {} }));
jest.mock('../../src/main/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../src/main/core/storage-key', () => ({ resolveStorageKey: () => undefined }));
jest.mock('electron-store', () => class MemoryStore {
  constructor(options = {}) { this.data = JSON.parse(JSON.stringify(options.defaults || {})); }
  get(key, fallback) {
    const value = key.split('.').reduce((node, part) => (node && part in node ? node[part] : undefined), this.data);
    return value === undefined ? fallback : value;
  }
  set(key, value) { this.data[key] = value; }
});

const { DEFAULT_IDLE_THRESHOLD_SECONDS } = require('../../src/shared/constants');
const StorageManager = require('../../src/main/core/storage-manager');
const UpgradeManager = require('../../src/main/core/upgrade-manager');

describe('idle default', () => {
  test('idle default: one value, 180 s', () => {
    expect(DEFAULT_IDLE_THRESHOLD_SECONDS).toBe(180);
  });

  test('idle default: a new store uses it', () => {
    expect(new StorageManager().store.get('settings').idleThreshold).toBe(DEFAULT_IDLE_THRESHOLD_SECONDS);
  });

  test('idle default: a fresh install writes it, and a stored value is kept', async () => {
    const data = {};
    const storage = { store: { get: key => data[key], set: (key, value) => { data[key] = value; } } };
    await new UpgradeManager(storage).initializeDefaults();
    expect(data['settings.idleThreshold']).toBe(DEFAULT_IDLE_THRESHOLD_SECONDS);

    data['settings.idleThreshold'] = 300;
    await new UpgradeManager(storage).initializeDefaults();
    expect(data['settings.idleThreshold']).toBe(300);
  });
});
