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

  test('settings round trip: an unknown consolidation mode or week day is refused by the contract', async () => {
    const { invoke } = setup();
    await expect(invoke('settings:save', { consolidationMode: 'loose' })).rejects.toThrow('INVALID_REQUEST');
    await expect(invoke('settings:save', { weekStartDay: 7 })).rejects.toThrow('INVALID_REQUEST');
  });
});
