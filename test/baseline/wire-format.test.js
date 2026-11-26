/**
 * A-2: activities leave main in the wire format (times as ISO text), whatever the
 * store holds. The tracker stores numbers, manual entries store text.
 */
jest.mock('electron', () => ({ app: {}, dialog: {}, ipcMain: {}, powerMonitor: { on() {} }, Notification: function () {} }), { virtual: false });
jest.mock('../../src/main/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const logger = require('../../src/main/logger');
const { toWireActivity, toWireActivities } = require('../../src/main/ipc/wire-activity');
const ActivitiesHandlerMain = require('../../src/main/ipc/handlers/activitiesHandlerMain');
const TagsHandlerMain = require('../../src/main/ipc/handlers/tagsHandlerMain');
const ActivityTracker = require('../../src/main/core/activity-tracker');
const { IpcRegistry } = require('../../src/main/ipc/registry');
const { validateAndSanitizeActivity } = require('../../src/shared/sanitize');
const { mergeActivities } = require('../../src/main/core/merge-activities');

const START = new Date(2026, 10, 26, 9, 0, 0).getTime();
const END = START + 3600 * 1000;

/** An activity exactly as the tracker builds and stores it: times are numbers. */
function tracked(overrides = {}) {
  const holder = {};
  ActivityTracker.prototype.startNewActivity.call(holder, {
    app: 'Code', title: 'wire-format.test.js', project: 'LightTrack', tags: ['development'], tickets: []
  }, START);
  return { ...holder.currentActivity, endTime: END, duration: 3600, actualDuration: 3600, ...overrides };
}

const manual = () => ({
  id: 'm1', app: 'Manual Entry', title: 'Call', project: 'LightTrack', tags: [],
  startTime: '2026-11-26T10:00:00.000Z', endTime: '2026-11-26T10:30:00.000Z', duration: 1800, isManual: true
});

function setup(activities) {
  const handlers = new Map();
  const registry = new IpcRegistry({ handle: (channel, fn) => handlers.set(channel, fn) }, { warn() {}, error() {} });
  const storage = {
    activities,
    async getActivities() { return this.activities; },
    async saveActivity(activity) { this.activities.unshift(activity); return activity; },
    async updateActivity(id, updates) {
      const index = this.activities.findIndex(a => String(a.id) === String(id));
      this.activities[index] = { ...this.activities[index], ...updates };
      return this.activities[index];
    },
    mergeActivities(ids) {
      const { merged, activities: next } = mergeActivities(this.activities, ids);
      this.activities = next;
      return merged;
    },
    updateActivityTags(id, tags) {
      const found = this.activities.find(a => String(a.id) === String(id));
      if (!found) return null;
      found.tags = tags;
      return found;
    },
    getActivitiesByTags() { return this.activities; }
  };
  const appState = { windows: { main: null } };
  new ActivitiesHandlerMain(storage, {}, appState, validateAndSanitizeActivity).registerHandlers(registry);
  new TagsHandlerMain(storage).registerHandlers(registry);
  const invoke = (channel, ...args) => handlers.get(channel)({}, ...args);
  return { storage, invoke };
}

describe('wire format', () => {
  test('the tracker stores times as numbers', () => {
    const activity = tracked();
    expect(typeof activity.startTime).toBe('number');
    expect(typeof activity.endTime).toBe('number');
  });

  test('number times become ISO text for the same instants', () => {
    const wire = toWireActivity(tracked());
    expect(wire.startTime).toBe(new Date(START).toISOString());
    expect(wire.endTime).toBe(new Date(END).toISOString());
    expect(wire).toMatchObject({ app: 'Code', project: 'LightTrack', duration: 3600 });
  });

  test('text times are returned as stored', () => {
    expect(toWireActivity(manual())).toEqual(manual());
  });

  test('does not change the stored activity', () => {
    const stored = tracked();
    toWireActivity(stored);
    expect(stored.startTime).toBe(START);
  });

  test('a time that is not a date becomes null, with a warning that leaves out the title', () => {
    const wire = toWireActivity(tracked({ id: 'bad', startTime: NaN, title: 'Secret customer call' }));
    expect(wire.startTime).toBeNull();
    expect(wire.endTime).toBe(new Date(END).toISOString());
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.warn.mock.calls[0])).not.toContain('Secret customer call');
  });

  test('null and missing values pass through', () => {
    expect(toWireActivity(null)).toBeNull();
    expect(toWireActivity({ id: 'x' })).toEqual({ id: 'x' });
    expect(toWireActivities([tracked(), manual()])).toHaveLength(2);
  });

  test('activities:get accepts a tracked activity (wire format)', async () => {
    const { invoke } = setup([tracked(), manual()]);
    const result = await invoke('activities:get', null);
    expect(result).toHaveLength(2);
    expect(result[0].startTime).toBe(new Date(START).toISOString());
    expect(result[1].startTime).toBe(manual().startTime);
  });

  test('activities:get still returns the day when one time is unreadable (wire format)', async () => {
    const { invoke } = setup([tracked({ id: 'bad', startTime: 'not a date' }), manual()]);
    const result = await invoke('activities:get', null);
    expect(result).toHaveLength(2);
    expect(result[0].startTime).toBeNull();
  });

  test('activities:update returns a tracked activity in the wire format', async () => {
    const stored = tracked();
    const { invoke } = setup([stored]);
    const updated = await invoke('activities:update', stored.id, { project: 'Internal' });
    expect(updated.project).toBe('Internal');
    expect(updated.startTime).toBe(new Date(START).toISOString());
  });

  test('activities:merge returns the wire format', async () => {
    const first = tracked({ id: 't1' });
    const second = tracked({ id: 't2', startTime: END, endTime: END + 1800 * 1000, duration: 1800 });
    const { invoke } = setup([first, second]);
    const merged = await invoke('activities:merge', ['t1', 't2']);
    expect(merged.startTime).toBe(new Date(START).toISOString());
    expect(merged.endTime).toBe(new Date(END + 1800 * 1000).toISOString());
  });

  test('tag channels return the wire format', async () => {
    const stored = tracked();
    const { invoke } = setup([stored]);
    const updated = await invoke('tags:updateActivity', stored.id, ['review']);
    expect(updated.startTime).toBe(new Date(START).toISOString());
    const filtered = await invoke('tags:filterActivities', ['review']);
    expect(filtered[0].startTime).toBe(new Date(START).toISOString());
    await expect(invoke('tags:updateActivity', 'missing', ['x'])).resolves.toBeNull();
  });

  test('activities:save-manual returns the wire format', async () => {
    const { invoke } = setup([]);
    const saved = await invoke('activities:save-manual', {
      title: 'Call', project: 'LightTrack', startTime: '2026-11-26T10:00:00.000Z', endTime: '2026-11-26T10:30:00.000Z'
    });
    expect(saved.startTime).toBe('2026-11-26T10:00:00.000Z');
    expect(saved.duration).toBe(1800);
  });
});
