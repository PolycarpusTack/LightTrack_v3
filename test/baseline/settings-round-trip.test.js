/**
 * B-2: every setting the Settings screen shows survives a save through the IPC contract.
 * The contract parses the request and passes only known keys, so a key missing from the
 * Settings schema was dropped without an error.
 */
jest.mock('electron', () => ({ app: { setLoginItemSettings() {}, getLoginItemSettings: () => ({}) }, dialog: {}, ipcMain: {} }));
jest.mock('../../src/main/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const SettingsHandlerMain = require('../../src/main/ipc/handlers/settingsHandlerMain');
const { IpcRegistry } = require('../../src/main/ipc/registry');

function memoryStore(initial = {}) {
  const data = { ...initial };
  return { get: (key, fallback) => (key in data ? data[key] : fallback), set: (key, value) => { data[key] = value; } };
}

function setup() {
  const store = memoryStore({ settings: { workDayStart: '09:00', workDayEnd: '18:00' } });
  const handlers = new Map();
  const registry = new IpcRegistry({ handle: (channel, fn) => handlers.set(channel, fn) }, { warn() {}, error() {} });
  new SettingsHandlerMain(store, {}, () => {}).registerHandlers(registry);
  const invoke = (channel, ...args) => handlers.get(channel)({}, ...args);
  return { store, invoke };
}

describe('settings round trip (B-2)', () => {
  test('settings round trip: consolidation, week start, idle threshold and minimum duration are kept', async () => {
    const { invoke } = setup();
    const saved = {
      consolidateActivities: false,
      consolidationMode: 'strict',
      weekStartDay: 0,
      idleThreshold: 600,
      minActivityDuration: 30
    };
    expect(await invoke('settings:save', saved)).toEqual({ success: true });
    expect(await invoke('settings:get-all')).toMatchObject(saved);
  });

  test('settings round trip: an idle threshold out of range is refused with the allowed range', async () => {
    const { invoke } = setup();
    const result = await invoke('settings:save', { idleThreshold: 10 });
    expect(result).toEqual({ success: false, errors: ['Idle threshold must be between 30 and 1800 seconds'] });
    expect((await invoke('settings:get-all')).idleThreshold).toBeUndefined();
  });

  // C-9: checked against what is stored, not only against what was sent
  test('settings round trip: a start time after the stored end time is refused', async () => {
    const { invoke } = setup();
    expect(await invoke('settings:save', { workDayStart: '20:00' }))
      .toEqual({ success: false, errors: ['Work day end time must be after start time'] });
    expect(await invoke('settings:save', { workDayEnd: '08:00' }))
      .toEqual({ success: false, errors: ['Work day end time must be after start time'] });
    expect(await invoke('settings:save', { workDayStart: '08:30' })).toEqual({ success: true });
    expect((await invoke('settings:get-all')).workDayStart).toBe('08:30');
  });

  test('settings round trip: times must be HH:MM', async () => {
    const { invoke } = setup();
    for (const bad of ['9:00', '25:00', '09:60', 'noon', '']) {
      expect(await invoke('settings:save', { workDayStart: bad }))
        .toEqual({ success: false, errors: ['Work day start must be a time as HH:MM'] });
    }
    expect(await invoke('settings:save', { workDayEnd: '7pm' }))
      .toEqual({ success: false, errors: ['Work day end must be a time as HH:MM'] });
  });

  test('settings round trip: a break reminder interval out of range is refused with the allowed range', async () => {
    const { invoke } = setup();
    for (const bad of [0, 4, 481]) {
      expect(await invoke('settings:save', { breakReminderInterval: bad }))
        .toEqual({ success: false, errors: ['Break reminder interval must be between 5 and 480 minutes'] });
    }
    expect(await invoke('settings:save', { breakReminderInterval: 45 })).toEqual({ success: true });
  });

  test('settings round trip: a null value does not erase or bypass the stored setting', async () => {
    const { invoke } = setup();
    expect(await invoke('settings:save', { workDayEnd: null, idleThreshold: null })).toEqual({ success: true });
    const stored = await invoke('settings:get-all');
    expect(stored.workDayEnd).toBe('18:00');
    expect('idleThreshold' in stored).toBe(false);
    expect(await invoke('settings:save', { workDayStart: '19:00', workDayEnd: null }))
      .toEqual({ success: false, errors: ['Work day end time must be after start time'] });
  });

  test('settings round trip: an unknown consolidation mode or week day is refused by the contract', async () => {
    const { invoke } = setup();
    await expect(invoke('settings:save', { consolidationMode: 'loose' })).rejects.toThrow('INVALID_REQUEST');
    await expect(invoke('settings:save', { weekStartDay: 7 })).rejects.toThrow('INVALID_REQUEST');
  });
});
