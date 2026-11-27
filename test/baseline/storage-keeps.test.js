/**
 * A-8: storage does not drop activities silently. Runs the real StorageManager over
 * an in-memory store, and the clear-old handler against the rule its preview uses.
 */
jest.mock('electron', () => ({ app: { getPath: () => '' }, dialog: {}, ipcMain: {}, safeStorage: {} }));
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

const logger = require('../../src/main/logger');
const StorageManager = require('../../src/main/core/storage-manager');
const ActivitiesHandlerMain = require('../../src/main/ipc/handlers/activitiesHandlerMain');
const { IpcRegistry } = require('../../src/main/ipc/registry');
const { validateAndSanitizeActivity } = require('../../src/shared/sanitize');

const DAY = 24 * 60 * 60 * 1000;

function storageWith(activities) {
  const storage = new StorageManager();
  storage.store.set('activities', activities);
  storage.activityCache = null;
  return storage;
}

const short = (id, start) => ({ id, app: 'App ' + id, title: 'Title ' + id, project: 'P', startTime: start, duration: 20 });

describe('storage does not drop activities (A-8)', () => {
  afterEach(() => logger.warn.mockClear());

  test('does not drop a 30-second manual entry', async () => {
    const storage = storageWith([]);
    await storage.saveActivity({ app: 'Call', title: 'Call', project: 'P', startTime: new Date().toISOString(), duration: 30, isManual: true });
    expect(await storage.getActivities()).toHaveLength(1);
  });

  test('does not drop stored short activities when another is saved', async () => {
    const storage = storageWith([short('s1', Date.now() - 2 * DAY), short('s2', Date.now() - DAY)]);
    await storage.saveActivity({ app: 'Code', title: 'Work', project: 'P', startTime: Date.now(), duration: 600 });
    expect((await storage.getActivities()).map(a => a.id)).toEqual(expect.arrayContaining(['s1', 's2']));
  });

  test('does not drop activities past the limit, and warns', async () => {
    const storage = storageWith([short('a', 1), short('b', 2), short('c', 3)].map(a => ({ ...a, duration: 600 })));
    storage.options.maxActivities = 3;
    await storage.saveActivity({ app: 'Code', title: 'Work', project: 'P', startTime: Date.now(), duration: 600 });
    expect(await storage.getActivities()).toHaveLength(4);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('limit'), expect.anything());
  });
});

describe('clear old data does not drop more than its preview (A-8)', () => {
  test('does not drop recent tracked activities; removes exactly what the preview counts', async () => {
    const now = Date.now();
    const activities = [
      { id: 'tracked-old', app: 'A', title: 'a', startTime: now - 40 * DAY, duration: 600 },   // no timestamp
      { id: 'tracked-new', app: 'B', title: 'b', startTime: now - 1 * DAY, duration: 600 },    // no timestamp
      { id: 'manual-old', app: 'C', title: 'c', startTime: new Date(now - 40 * DAY).toISOString(),
        timestamp: new Date(now).toISOString(), duration: 600, isManual: true },              // typed in today
      { id: 'manual-new', app: 'D', title: 'd', startTime: new Date(now - 2 * DAY).toISOString(),
        timestamp: new Date(now).toISOString(), duration: 600, isManual: true }
    ];
    // The dialog's preview: an activity is old when its start is more than 30 days ago.
    const previewCount = 2;

    const storage = storageWith(activities);
    const handlers = new Map();
    const registry = new IpcRegistry({ handle: (channel, fn) => handlers.set(channel, fn) }, { warn() {}, error() {} });
    new ActivitiesHandlerMain(storage, {}, { windows: { main: null } }, validateAndSanitizeActivity, () => null).registerHandlers(registry);

    const result = await handlers.get('clear-old-activities')({}, 30);
    expect(result.cleanedCount).toBe(previewCount);
    expect((await storage.getActivities()).map(a => a.id).sort()).toEqual(['manual-new', 'tracked-new']);
  });
});
