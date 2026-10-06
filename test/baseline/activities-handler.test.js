/**
 * Activities IPC handlers, driven through the IPC registry as the renderer would.
 */
jest.mock('electron', () => ({ app: {}, dialog: {}, ipcMain: {} }), { virtual: false });
jest.mock('../../src/main/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const ActivitiesHandlerMain = require('../../src/main/ipc/handlers/activitiesHandlerMain');
const { IpcRegistry } = require('../../src/main/ipc/registry');
const { validateAndSanitizeActivity } = require('../../src/shared/sanitize');

function setup(activities) {
  const handlers = new Map();
  const registry = new IpcRegistry({ handle: (channel, fn) => handlers.set(channel, fn) }, { warn() {}, error() {} });
  const storage = {
    activities,
    async updateActivity(id, updates) {
      const index = this.activities.findIndex(a => String(a.id) === String(id));
      this.activities[index] = { ...this.activities[index], ...updates };
      return this.activities[index];
    }
  };
  const appState = { windows: { main: null } };
  new ActivitiesHandlerMain(storage, {}, appState, validateAndSanitizeActivity).registerHandlers(registry);
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
