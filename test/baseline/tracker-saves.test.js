/**
 * C-2: every tracked second is stored. The duplicate-save check skipped a save whose
 * app, project, day and 10-second duration bucket had been saved before, by any
 * activity; and each tick dropped its fraction of a second.
 */
jest.mock('electron', () => ({ app: {}, dialog: {}, ipcMain: {}, powerMonitor: { on() {}, getSystemIdleTime: () => 0 }, Notification: function () {} }));
jest.mock('../../src/main/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const ActivityTracker = require('../../src/main/core/activity-tracker');

const T0 = new Date(2026, 10, 20, 11, 0, 0).getTime();
const DAY = '2026-11-20';

function setup() {
  const saved = new Map();
  const storage = {
    getSettings: () => ({ smartSamplingEnabled: true, minActivityDuration: 1 }),
    findActivityByAppAndProject: () => null,
    findActivityById: id => saved.get(id) || null,
    addActivity: async activity => { saved.set(activity.id, { ...activity }); return activity; },
    updateActivity: async (id, updates) => { saved.set(id, { ...saved.get(id), ...updates }); return saved.get(id); }
  };
  const tracker = new ActivityTracker(storage, null);
  tracker.getActiveWindowWithRetry = async () => ({ owner: { name: 'Code' }, title: 'notes.md' });
  tracker.extractActivityInfo = () => ({ app: 'Code', title: 'notes.md', project: 'P', tags: [], tickets: [] });
  tracker.focusSessionTracker.update = () => {};
  tracker.adjustSamplingRate = () => {};
  tracker.isTracking = true;
  tracker.lastActiveTime = T0;
  let now = T0;
  const clock = { advance(ms) { now += ms; jest.setSystemTime(now); } };
  jest.setSystemTime(now);
  return { tracker, saved, clock };
}

const activity = (id, duration, extra = {}) =>
  ({ id, app: 'Chrome', project: 'Support', title: 'Case', date: DAY, startTime: T0, duration, ...extra });

describe('tracker saves (C-2)', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['setTimeout', 'setInterval', 'setImmediate', 'nextTick'] }));
  afterEach(() => jest.useRealTimers());

  test('save is not skipped: a short return to a saved activity is stored', async () => {
    const { tracker, saved } = setup();
    tracker.currentActivity = activity('a', 62);
    await tracker.saveActivity();
    expect(saved.get('a').duration).toBe(62);

    tracker.currentActivity = activity('a', 67);
    await tracker.saveActivity();
    expect(saved.get('a').duration).toBe(67);
  });

  test('save is not skipped: an activity for another Salesforce case is stored', async () => {
    const { tracker, saved } = setup();
    tracker.currentActivity = activity('case-a', 62, { salesforceCase: '00012345' });
    await tracker.saveActivity();
    tracker.currentActivity = activity('case-b', 65, { salesforceCase: '00067890' });
    await tracker.saveActivity();
    expect([...saved.keys()].sort()).toEqual(['case-a', 'case-b']);
  });

  test('save is not skipped: the same state saved twice is written once', async () => {
    const { tracker, saved } = setup();
    const writes = jest.spyOn(tracker.storage, 'updateActivity');
    tracker.currentActivity = activity('a', 62);
    await tracker.saveActivity();
    await tracker.saveActivity();
    expect(writes).not.toHaveBeenCalled();
    expect(saved.get('a').duration).toBe(62);
  });

  test('fractional seconds carry over between ticks', async () => {
    const { tracker, clock } = setup();
    clock.advance(5000);
    await tracker.track(); // opens the activity
    const start = tracker.currentActivity.duration;
    for (let i = 0; i < 10; i++) {
      clock.advance(5500);
      await tracker.track();
    }
    expect(tracker.currentActivity.duration - start).toBe(55);
  });
});

// B-11-T0: the tray's today total adds only the time not yet stored.
describe('today total (B-11-T0)', () => {
  const tracker = (stored, current) => {
    const t = new ActivityTracker({
      getSettings: () => ({}),
      getTodayTotal: async () => stored.reduce((sum, a) => sum + a.duration, 0),
      findActivityById: id => stored.find(a => a.id === id) || null
    }, null);
    t.currentActivity = current;
    t.idleDetector.isPaused = () => false;
    return t;
  };

  test('today total: a resumed activity adds only its unsaved seconds', async () => {
    jest.useFakeTimers({ doNotFake: ['setTimeout', 'setInterval', 'setImmediate', 'nextTick'] });
    jest.setSystemTime(new Date(2026, 10, 20, 12, 1, 0));
    const chrome = { id: 'chrome', duration: 600 };
    const code = { id: 'code', duration: 10200 };
    // Chrome resumed at 12:00 and tracked 60 s; its start is still 09:00
    const current = { ...chrome, duration: 660, startTime: new Date(2026, 10, 20, 9, 0, 0).getTime() };
    expect(await tracker([chrome, code], current).getTodayTotal()).toBe(10860); // 3 h 1 min
    jest.useRealTimers();
  });

  test('today total: an activity not stored yet counts in full', async () => {
    const current = { id: 'new', duration: 45, startTime: Date.now() - 45000 };
    expect(await tracker([{ id: 'code', duration: 100 }], current).getTodayTotal()).toBe(145);
  });
});
