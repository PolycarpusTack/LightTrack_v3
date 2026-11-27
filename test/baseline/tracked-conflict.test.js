/**
 * C-1: editing or deleting the activity being tracked says why it is refused, a deleted
 * tracked activity is not brought back, and tracking never resumes a manual entry.
 */
const exposed = {};
const mockInvoke = jest.fn();
jest.mock('electron', () => ({
  app: { getPath: () => '' }, dialog: {}, ipcMain: {}, safeStorage: {},
  contextBridge: { exposeInMainWorld: (key, api) => { exposed[key] = api; } },
  ipcRenderer: { invoke: (...args) => mockInvoke(...args), on() {}, removeListener() {} }
}));
jest.mock('../../src/main/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../src/main/core/storage-key', () => ({ resolveStorageKey: () => undefined }));
jest.mock('electron-store', () => class MemoryStore {
  constructor(options = {}) { this.data = JSON.parse(JSON.stringify(options.defaults || {})); }
  get(key, fallback) {
    const value = key.split('.').reduce((node, part) => (node && part in node ? node[part] : undefined), this.data);
    return value === undefined ? fallback : JSON.parse(JSON.stringify(value));
  }
  set(key, value) { this.data[key] = JSON.parse(JSON.stringify(value)); }
});

const ActivitiesHandlerMain = require('../../src/main/ipc/handlers/activitiesHandlerMain');
const StorageManager = require('../../src/main/core/storage-manager');
const { IpcRegistry } = require('../../src/main/ipc/registry');
const { IpcError, encodeIpcError } = require('../../src/shared/ipc/errors');
const { validateAndSanitizeActivity } = require('../../src/shared/sanitize');
const { localDay } = require('../../src/main/core/local-day');
require('../../src/preload/index');

const REASON = 'Stop tracking before editing this activity';

function handlersWith(activities, currentActivity) {
  const handlers = new Map();
  const registry = new IpcRegistry({ handle: (channel, fn) => handlers.set(channel, fn) }, { warn() {}, error() {} });
  const storage = {
    activities,
    async getActivities() { return this.activities; },
    async deleteActivity(id) {
      const before = this.activities.length;
      this.activities = this.activities.filter(a => String(a.id) !== String(id));
      return this.activities.length < before;
    }
  };
  new ActivitiesHandlerMain(storage, {}, { windows: { main: null } }, validateAndSanitizeActivity, () => ({ currentActivity }))
    .registerHandlers(registry);
  return { storage, invoke: (channel, ...args) => handlers.get(channel)({}, ...args) };
}

// Electron wraps an error thrown in main like this before the renderer sees it.
const fromMain = (channel, code, message) =>
  new Error(`Error invoking remote method '${channel}': Error: ${encodeIpcError(new IpcError(code, message, channel))}`);

describe('tracked activity conflict (C-1)', () => {
  beforeEach(() => mockInvoke.mockReset());

  test('tracked activity conflict: deleting the activity being tracked is refused and it stays', async () => {
    const { storage, invoke } = handlersWith([{ id: 'live', app: 'Code', project: 'P' }], { id: 'live' });
    await expect(invoke('activities:delete', 'live')).rejects.toThrow(`[CONFLICT] ${REASON.replace('editing', 'deleting')}`);
    expect(storage.activities.map(a => a.id)).toEqual(['live']);
  });

  test('tracked activity conflict: another activity can still be deleted', async () => {
    const { storage, invoke } = handlersWith([{ id: 'old' }, { id: 'live' }], { id: 'live' });
    await expect(invoke('activities:delete', 'old')).resolves.toMatchObject({ deleted: true });
    expect(storage.activities.map(a => a.id)).toEqual(['live']);
  });

  test("tracked activity conflict: the window gets main's reason for a refused edit or delete", async () => {
    mockInvoke.mockRejectedValueOnce(fromMain('activities:update', 'CONFLICT', REASON));
    await expect(exposed.lightTrackAPI.updateActivity('live', { project: 'X' })).rejects.toThrow(REASON);

    mockInvoke.mockRejectedValueOnce(fromMain('activities:delete', 'CONFLICT', 'Stop tracking before deleting this activity'));
    await expect(exposed.lightTrackAPI.deleteActivity('live')).rejects.toThrow('Stop tracking before deleting this activity');
  });

  test('tracked activity conflict: other failures keep the plain message', async () => {
    mockInvoke.mockRejectedValueOnce(fromMain('activities:delete', 'INVALID_REQUEST', '0: expected string'));
    await expect(exposed.lightTrackAPI.deleteActivity({})).rejects.toThrow(/^Failed to delete activity\. Please try again\.$/);
  });

  test('tracked activity conflict: tracking does not resume a manual entry', () => {
    const today = localDay();
    const storage = new StorageManager();
    storage.store.set('activities', [
      { id: 'manual', app: 'Chrome', project: 'General', date: today, isManual: true, duration: 3600 }
    ]);
    expect(storage.findActivityByAppAndProject('Chrome', 'General', today)).toBeNull();

    storage.store.set('activities', [
      { id: 'manual', app: 'Chrome', project: 'General', date: today, isManual: true, duration: 3600 },
      { id: 'tracked', app: 'Chrome', project: 'General', date: today, duration: 600 }
    ]);
    expect(storage.findActivityByAppAndProject('Chrome', 'General', today)?.id).toBe('tracked');
  });
});
