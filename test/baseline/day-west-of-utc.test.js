/**
 * @jest-environment ./test/baseline/tz-new-york-environment.js
 */
/**
 * C-5: a day asked for is that day in every timezone. `new Date('2026-11-27')` is UTC
 * midnight, which is still the 26th in New York, so activities:get read the wrong day.
 * The environment above runs this file in America/New_York.
 */

jest.mock('electron', () => ({ app: {}, dialog: {}, ipcMain: {} }));
jest.mock('../../src/main/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const ActivitiesHandlerMain = require('../../src/main/ipc/handlers/activitiesHandlerMain');
const { IpcRegistry } = require('../../src/main/ipc/registry');
const { CHANNELS } = require('../../src/main/ipc/contract');

function setup() {
  const handlers = new Map();
  const registry = new IpcRegistry({ handle: (channel, fn) => handlers.set(channel, fn) }, { warn() {}, error() {} });
  const asked = [];
  const storage = { async getActivities(filter) { asked.push(filter); return []; } };
  new ActivitiesHandlerMain(storage, { get: () => [] }, { windows: { main: null } }, () => ({ valid: true }), () => null)
    .registerHandlers(registry);
  return { asked, handlers, invoke: (channel, ...args) => handlers.get(channel)({}, ...args) };
}

describe('day west of UTC (C-5)', () => {
  test('west of UTC: the timezone is pinned for this file', () => {
    expect(new Date(2026, 10, 27).getTimezoneOffset()).toBe(300);
  });

  test('west of UTC: activities:get asks storage for the day it was given', async () => {
    const { asked, invoke } = setup();
    await invoke('activities:get', '2026-11-27');
    expect(asked).toEqual([{ startDate: '2026-11-27', endDate: '2026-11-27' }]);
  });

  test('west of UTC: a full timestamp still means its local day', async () => {
    const { asked, invoke } = setup();
    await invoke('activities:get', new Date(2026, 10, 27, 23, 30).toISOString()); // 04:30 UTC on the 28th
    expect(asked).toEqual([{ startDate: '2026-11-27', endDate: '2026-11-27' }]);
  });

  test('west of UTC: the unused stats channels are gone', () => {
    const { handlers } = setup();
    for (const channel of ['activities:get-stats', 'get-focus-stats']) {
      expect(handlers.has(channel)).toBe(false);
      expect(CHANNELS).not.toContain(channel);
    }
  });
});
