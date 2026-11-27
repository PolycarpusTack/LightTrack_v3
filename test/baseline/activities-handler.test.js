/**
 * Activities IPC handlers, driven through the IPC registry as the renderer would.
 */
jest.mock('electron', () => ({ app: {}, dialog: {}, ipcMain: {} }), { virtual: false });
jest.mock('../../src/main/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const ActivitiesHandlerMain = require('../../src/main/ipc/handlers/activitiesHandlerMain');
const { IpcRegistry } = require('../../src/main/ipc/registry');
const { validateAndSanitizeActivity } = require('../../src/shared/sanitize');

function setup(activities, currentActivity = null) {
  const handlers = new Map();
  const registry = new IpcRegistry({ handle: (channel, fn) => handlers.set(channel, fn) }, { warn() {}, error() {} });
  const storage = {
    activities,
    async getActivities() {
      return this.activities;
    },
    async updateActivity(id, updates) {
      const index = this.activities.findIndex(a => String(a.id) === String(id));
      this.activities[index] = { ...this.activities[index], ...updates };
      return this.activities[index];
    }
  };
  const appState = { windows: { main: null } };
  const tracker = { currentActivity };
  new ActivitiesHandlerMain(storage, {}, appState, validateAndSanitizeActivity, () => tracker).registerHandlers(registry);
  const invoke = (channel, ...args) => handlers.get(channel)({}, ...args);
  return { storage, invoke };
}

describe('activities:update', () => {
  const stored = () => ({
    id: 'a1', title: 'Code review', app: 'Code', project: 'LightTrack', tags: ['development', 'jira'],
    startTime: '2026-10-06T09:00:00.000Z', endTime: '2026-10-06T10:00:00.000Z', duration: 3600, billable: true
  });

  test('keeps fields the edit did not send (#38)', async () => {
    const { invoke } = setup([stored()]);
    const updated = await invoke('activities:update', 'a1', { project: 'Internal', billable: false });
    expect(updated).toMatchObject({ project: 'Internal', billable: false, title: 'Code review', app: 'Code', tags: ['development', 'jira'] });
  });

  test('the edit dialog payload keeps tags and recalculates duration', async () => {
    const { invoke } = setup([stored()]);
    const updated = await invoke('activities:update', 'a1', {
      project: 'LightTrack', app: 'Code', title: 'Code', startTime: '2026-10-06T09:00:00.000Z',
      endTime: '2026-10-06T09:30:00.000Z', duration: 1800, billable: true
    });
    expect(updated.tags).toEqual(['development', 'jira']);
    expect(updated.duration).toBe(1800);
    expect(updated.actualDuration).toBe(1800);
  });

  test('still sanitises the fields that are sent', async () => {
    const { invoke } = setup([stored()]);
    const updated = await invoke('activities:update', 'a1', { title: '<b>Review</b>', tags: ['Bug Fix'] });
    expect(updated.title).toBe('Review');
    expect(updated.tags).toEqual(['bug-fix']);
  });
});

describe('activities:update edit keeps duration (A-4)', () => {
  // A tracked activity: 3h counted over a span of 09:00 to 17:00, times stored as numbers.
  const tracked = () => ({
    id: 't1', title: 'Design review', app: 'Figma', project: 'LightTrack',
    startTime: Date.parse('2026-11-20T09:00:00.000Z'), endTime: Date.parse('2026-11-20T17:00:00.000Z'),
    duration: 10800, actualDuration: 10800
  });
  const manual = () => ({
    id: 'm1', title: 'Workshop', app: 'Manual', project: 'LightTrack', isManual: true,
    startTime: '2026-11-20T09:00:00.000Z', endTime: '2026-11-20T10:00:00.000Z', duration: 3600, actualDuration: 3600
  });

  test('edit keeps the duration when the update has no times', async () => {
    const { invoke } = setup([tracked()]);
    const updated = await invoke('activities:update', 't1', { project: 'Internal' });
    expect(updated).toMatchObject({ project: 'Internal', duration: 10800, title: 'Design review' });
  });

  test('edit keeps the duration when the times sent are unchanged', async () => {
    const { invoke } = setup([tracked()]);
    const updated = await invoke('activities:update', 't1', {
      project: 'Internal', startTime: '2026-11-20T09:00:00.000Z', endTime: '2026-11-20T17:00:00.000Z'
    });
    expect(updated.duration).toBe(10800);
    expect(updated.actualDuration).toBe(10800);
  });

  test('edit keeps start and recomputes duration when only the end changes', async () => {
    const { invoke } = setup([manual()]);
    const updated = await invoke('activities:update', 'm1', { endTime: '2026-11-20T11:00:00.000Z' });
    expect(updated.duration).toBe(7200);
    expect(updated.actualDuration).toBe(7200);
  });

  test('edit keeps the stored activity when it is being tracked', async () => {
    const { invoke, storage } = setup([tracked()], { id: 't1' });
    await expect(invoke('activities:update', 't1', { project: 'Internal' }))
      .rejects.toThrow('[CONFLICT] Stop tracking before editing this activity');
    expect(storage.activities[0].project).toBe('LightTrack');
  });

  test('edit keeps the same result when applied twice', async () => {
    const { invoke } = setup([manual()]);
    const edit = { endTime: '2026-11-20T11:00:00.000Z' };
    const first = await invoke('activities:update', 'm1', edit);
    const second = await invoke('activities:update', 'm1', edit);
    expect(second).toEqual(first);
  });
});
