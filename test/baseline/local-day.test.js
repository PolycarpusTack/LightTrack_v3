/**
 * A-5: an activity is filed on the local day it started.
 * Pinned to a zone east of UTC so the local day and the UTC day differ around midnight.
 */
const ORIGINAL_TZ = process.env.TZ;
process.env.TZ = 'Europe/Brussels';

jest.mock('electron', () => ({ app: { getPath: () => '' }, dialog: {}, ipcMain: {}, safeStorage: {} }));
jest.mock('../../src/main/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../src/main/core/storage-key', () => ({ resolveStorageKey: () => undefined }));
jest.mock('electron-store', () => class MemoryStore {
  constructor(options = {}) { this.data = JSON.parse(JSON.stringify(options.defaults || {})); }
  get(key, fallback) { return key in this.data ? this.data[key] : fallback; }
  set(key, value) { this.data[key] = value; }
});

const StorageManager = require('../../src/main/core/storage-manager');
const ActivitiesHandlerMain = require('../../src/main/ipc/handlers/activitiesHandlerMain');
const { IpcRegistry } = require('../../src/main/ipc/registry');
const { validateAndSanitizeActivity } = require('../../src/shared/sanitize');

afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ; else process.env.TZ = ORIGINAL_TZ;
});

function setup() {
  const storage = new StorageManager();
  storage.options.autoCleanup = false;
  const handlers = new Map();
  const registry = new IpcRegistry({ handle: (channel, fn) => handlers.set(channel, fn) }, { warn() {}, error() {} });
  new ActivitiesHandlerMain(storage, {}, { windows: { main: null } }, validateAndSanitizeActivity, () => null)
    .registerHandlers(registry);
  const invoke = (channel, ...args) => handlers.get(channel)({}, ...args);
  return { storage, invoke };
}

const local = (day, time) => new Date(`${day}T${time}:00`).toISOString();

describe('activities filed on their local day (A-5)', () => {
  afterEach(() => jest.useRealTimers());

  test('a manual entry is filed on the day it started, not today', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-20T10:00:00'), doNotFake: ['setTimeout', 'setInterval', 'setImmediate', 'nextTick'] });
    const { invoke } = setup();
    const saved = await invoke('activities:save-manual', {
      project: 'P', app: 'Workshop', title: 'Workshop', startTime: local('2026-11-19', '14:00'), endTime: local('2026-11-19', '15:00')
    });
    expect(saved.date).toBe('2026-11-19');
    const ids = list => list.map(a => a.id);
    expect(ids(await invoke('activities:get', local('2026-11-19', '12:00')))).toContain(saved.id);
    expect(ids(await invoke('activities:get', local('2026-11-20', '12:00')))).not.toContain(saved.id);
  });

  test('an activity moved to another start day is filed on that day only', async () => {
    const { invoke } = setup();
    const saved = await invoke('activities:save-manual', {
      project: 'P', app: 'Review', title: 'Review', startTime: local('2026-11-16', '09:00'), endTime: local('2026-11-16', '10:00')
    });
    const moved = await invoke('activities:update', saved.id, {
      startTime: local('2026-11-17', '09:00'), endTime: local('2026-11-17', '10:00')
    });
    expect(moved.date).toBe('2026-11-17');
    expect((await invoke('activities:get', local('2026-11-16', '12:00'))).map(a => a.id)).not.toContain(saved.id);
    expect((await invoke('activities:get', local('2026-11-17', '12:00'))).map(a => a.id)).toContain(saved.id);
  });

  test("today's total near midnight is filed on the local day", async () => {
    jest.useFakeTimers({ now: new Date('2026-11-20T00:30:00'), doNotFake: ['setTimeout', 'setInterval', 'setImmediate', 'nextTick'] });
    const { storage, invoke } = setup();
    storage.store.set('activities', [
      { id: 'today', date: '2026-11-20', startTime: local('2026-11-20', '00:05'), duration: 600 },
      { id: 'yesterday', date: '2026-11-19', startTime: local('2026-11-19', '23:00'), duration: 1800 }
    ]);
    storage.activityCache = null;
    expect(await invoke('get-today-total')).toBe(600);
    expect(await storage.getTodayTotal()).toBe(600);
  });
});
