/**
 * B-4: returning from idle asks what to do with the time, and the answer is applied
 * to the activity that was paused, also when tracking has resumed on that activity.
 * Drives the real tracker and idle detector with a fake clock and a fake idle time.
 */
let mockIdleSeconds = 0;
jest.mock('electron', () => ({
  app: {}, dialog: {}, ipcMain: {}, Notification: function () {},
  powerMonitor: { on() {}, getSystemIdleTime: () => mockIdleSeconds }
}));
jest.mock('../../src/main/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const ActivityTracker = require('../../src/main/core/activity-tracker');
const { TRACKING_INTERVAL_MS } = require('../../src/shared/constants');

const T0 = new Date(2026, 10, 20, 11, 0, 0).getTime();
const MIN = 60 * 1000;

function setup(settings = {}) {
  const saved = new Map();
  const storage = {
    getSettings: () => ({ smartSamplingEnabled: true, minActivityDuration: 1, ...settings }),
    // Consolidation resumes the stored record for the same app and project.
    findActivityByAppAndProject: (app, project) =>
      [...saved.values()].find(a => a.app === app && a.project === project) || null,
    findActivityById: id => saved.get(id) || null,
    getActivities: async () => [...saved.values()],
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
  const send = jest.fn();
  tracker.mainWindow = { isDestroyed: () => false, webContents: { send } };
  let now = T0;
  const clock = { advance(ms) { now += ms; jest.setSystemTime(now); } };
  jest.setSystemTime(now);
  return { tracker, saved, clock, send };
}

const flush = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve)); };

async function trackFor(tracker, clock, samples) {
  for (let i = 0; i < samples; i++) {
    clock.advance(TRACKING_INTERVAL_MS);
    await tracker.track();
  }
}

/** Idle for `idleSeconds` past the last input, then active again `awayMs` after that input. */
async function goIdleAndReturn(tracker, clock, idleSeconds, awayMs) {
  mockIdleSeconds = idleSeconds;
  tracker.idleDetector.checkIdle(true);
  await flush();
  clock.advance(awayMs - idleSeconds * 1000);
  mockIdleSeconds = 0;
  tracker.idleDetector.checkIdle(true);
  await flush();
}

const sent = (send, channel) => send.mock.calls.filter(([c]) => c === channel).map(([, payload]) => payload);

describe('idle decision (B-4)', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['setTimeout', 'setInterval', 'setImmediate', 'nextTick'] }));
  afterEach(() => { jest.useRealTimers(); mockIdleSeconds = 0; });

  test('idle decision: count as work adds the idle period to the paused activity after it resumed', async () => {
    const { tracker, saved, clock, send } = setup();
    await trackFor(tracker, clock, 2);
    await tracker.saveActivity(); // stored once already, so the idle save updates that record
    await trackFor(tracker, clock, 1);
    const id = tracker.currentActivity.id;

    await goIdleAndReturn(tracker, clock, 200, 12 * MIN);
    expect(sent(send, 'tracking-paused')).toHaveLength(1);
    const [period] = sent(send, 'idle-return');
    expect(period).toMatchObject({ duration: 12 * 60 });
    const before = saved.get(id).duration;

    await trackFor(tracker, clock, 1); // tracking resumes on the same record
    expect(tracker.currentActivity.id).toBe(id);
    await tracker.handleIdleTimeDecision(true);

    expect(saved.get(id).duration).toBe(before + 12 * 60);
    // The resumed activity carries the added time, so its next save keeps it.
    await tracker.saveActivity();
    expect(saved.get(id).duration).toBeGreaterThanOrEqual(before + 12 * 60);
  });

  test('idle decision: leave out adds nothing and records the period on the paused activity', async () => {
    const { tracker, saved, clock } = setup();
    await trackFor(tracker, clock, 3);
    const id = tracker.currentActivity.id;

    await goIdleAndReturn(tracker, clock, 200, 12 * MIN);
    const before = saved.get(id).duration;
    await tracker.handleIdleTimeDecision(false);

    expect(saved.get(id).duration).toBe(before);
    expect(saved.get(id).idlePeriods).toEqual([expect.objectContaining({ duration: 12 * 60, excluded: true })]);
  });

  test('idle decision: a 2-minute absence shows no prompt, 12 minutes does', async () => {
    const short = setup({ idleThreshold: 60 });
    await trackFor(short.tracker, short.clock, 3);
    await goIdleAndReturn(short.tracker, short.clock, 60, 2 * MIN);
    expect(sent(short.send, 'tracking-paused')).toHaveLength(1);
    expect(sent(short.send, 'idle-return')).toHaveLength(0);

    const long = setup({ idleThreshold: 60 });
    await trackFor(long.tracker, long.clock, 3);
    await goIdleAndReturn(long.tracker, long.clock, 60, 12 * MIN);
    expect(sent(long.send, 'idle-return')).toHaveLength(1);
  });
});
