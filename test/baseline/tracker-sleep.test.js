/**
 * A-7: time while the computer sleeps or the screen is locked is not counted (AS-2).
 * Drives the real tracker with a fake clock and fake power events.
 */
jest.mock('electron', () => ({ app: {}, dialog: {}, ipcMain: {}, powerMonitor: { on() {}, getSystemIdleTime: () => 0 }, Notification: function () {} }));
jest.mock('../../src/main/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const logger = require('../../src/main/logger');
const ActivityTracker = require('../../src/main/core/activity-tracker');
const { TRACKING_INTERVAL_MS } = require('../../src/shared/constants');

const T0 = new Date(2026, 10, 20, 11, 0, 0).getTime();
const INTERVAL_S = TRACKING_INTERVAL_MS / 1000;

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
  const clock = {
    advance(ms) { now += ms; jest.setSystemTime(now); }
  };
  jest.setSystemTime(now);
  return { tracker, saved, clock };
}

describe('tracker sleep and lock (A-7)', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['setTimeout', 'setInterval', 'setImmediate', 'nextTick'] }));
  afterEach(() => { jest.useRealTimers(); logger.warn.mockClear(); });

  // Two samples, then a first long gap: the baseline the defect is measured against.
  async function trackFor(tracker, clock, samples) {
    for (let i = 0; i < samples; i++) {
      clock.advance(TRACKING_INTERVAL_MS);
      await tracker.track();
    }
  }

  test('sleep: a 60-minute gap with no power event credits one interval and is logged', async () => {
    const { tracker, clock } = setup();
    await trackFor(tracker, clock, 2);
    const before = tracker.currentActivity.duration;

    clock.advance(60 * 60 * 1000);
    await tracker.track();

    expect(tracker.currentActivity.duration - before).toBeLessThanOrEqual(INTERVAL_S);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('gap'), expect.anything());
  });

  test('sleep: suspend for 60 minutes and resume adds at most one interval', async () => {
    const { tracker, saved, clock } = setup();
    await trackFor(tracker, clock, 2);
    const before = tracker.currentActivity.duration;

    await tracker.pauseForSystem('suspend');
    expect(saved.get(tracker.currentActivity?.id ?? [...saved.keys()][0])).toBeDefined();
    clock.advance(60 * 60 * 1000);
    tracker.resumeFromSystem('resume');
    await trackFor(tracker, clock, 1);

    expect(tracker.currentActivity.duration - before).toBeLessThanOrEqual(2 * INTERVAL_S);
  });

  test('sleep: overnight, with or without a power event, the morning starts a new activity', async () => {
    for (const withEvent of [false, true]) {
      const { tracker, saved, clock } = setup();
      await trackFor(tracker, clock, 2);
      const evening = tracker.currentActivity;
      const eveningDuration = evening.duration;

      if (withEvent) await tracker.pauseForSystem('suspend');
      clock.advance(14 * 60 * 60 * 1000); // 11:00 to 01:00 the next day
      if (withEvent) tracker.resumeFromSystem('resume');
      await trackFor(tracker, clock, 1);

      expect(tracker.currentActivity.id).not.toBe(evening.id);
      expect(tracker.currentActivity.date).toBe('2026-11-21');
      expect(tracker.currentActivity.duration).toBeLessThanOrEqual(2 * INTERVAL_S);
      expect(saved.get(evening.id).duration).toBe(eveningDuration);
    }
  });

  test('sleep: a screen locked for 20 minutes adds nothing while locked', async () => {
    const { tracker, clock } = setup();
    await trackFor(tracker, clock, 2);
    const before = tracker.currentActivity.duration;

    await tracker.pauseForSystem('lock-screen');
    for (let i = 0; i < 240; i++) { // timers keep firing while the screen is locked
      clock.advance(TRACKING_INTERVAL_MS);
      await tracker.track();
    }
    expect(tracker.currentActivity.duration).toBe(before);

    tracker.resumeFromSystem('unlock-screen');
    await trackFor(tracker, clock, 1);
    expect(tracker.currentActivity.duration - before).toBeLessThanOrEqual(INTERVAL_S);
  });
});
