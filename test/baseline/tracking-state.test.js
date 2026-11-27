/**
 * A-6: the tracker is the only source of tracking state. The tray toggles the
 * tracker directly, so the IPC handlers must read it rather than keep a copy.
 */
jest.mock('electron', () => ({ app: { setLoginItemSettings() {}, getLoginItemSettings: () => ({}) }, dialog: {}, ipcMain: {} }));
jest.mock('../../src/main/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const TrackingHandlerMain = require('../../src/main/ipc/handlers/trackingHandlerMain');
const SettingsHandlerMain = require('../../src/main/ipc/handlers/settingsHandlerMain');
const { IpcRegistry } = require('../../src/main/ipc/registry');

function fakeTracker() {
  return {
    isTracking: false,
    currentActivity: null,
    sessionStartTime: null,
    lastActiveTime: null,
    currentCheckInterval: 5000,
    start: jest.fn(async function () {
      this.isTracking = true;
      this.sessionStartTime = 1_700_000_000_000;
      this.currentActivity = { id: 'c1', app: 'Code', project: 'P', startTime: 1_700_000_000_000 };
    }),
    stop: jest.fn(async function () {
      this.isTracking = false;
      this.sessionStartTime = null;
      this.currentActivity = null;
    })
  };
}

function registryFor(register) {
  const handlers = new Map();
  register(new IpcRegistry({ handle: (channel, fn) => handlers.set(channel, fn) }, { warn() {}, error() {} }));
  return (channel, ...args) => handlers.get(channel)({}, ...args);
}

function setupTracking() {
  const tracker = fakeTracker();
  const onChanged = jest.fn();
  const invoke = registryFor(registry =>
    new TrackingHandlerMain(() => tracker, onChanged, async () => {}).registerHandlers(registry));
  return { tracker, onChanged, invoke };
}

describe('tracking state comes from the tracker (A-6)', () => {
  test('tracking state: stop from the tray, then Stop in the window stays stopped', async () => {
    const { tracker, invoke } = setupTracking();
    await invoke('tracking:start');
    await tracker.stop(); // the tray stops the tracker directly
    const result = await invoke('tracking:stop');
    expect(result).toMatchObject({ isActive: false, wasAlreadyStopped: true });
    expect(tracker.isTracking).toBe(false);
    expect(tracker.start).toHaveBeenCalledTimes(1);
  });

  test('tracking state: status after auto-start reports the activity the tracker holds', async () => {
    const { tracker, invoke } = setupTracking();
    await tracker.start(); // started at launch, not through IPC
    const status = await invoke('tracking:get-current');
    expect(status).toMatchObject({ isActive: true, sessionStartTime: 1_700_000_000_000, samplingRate: 5 });
    expect(status.currentActivity).toMatchObject({ id: 'c1', app: 'Code' });
  });

  test('tracking state: start when the tray already started is a no-op', async () => {
    const { tracker, invoke } = setupTracking();
    await tracker.start();
    const result = await invoke('tracking:start');
    expect(result).toMatchObject({ isActive: true, wasAlreadyActive: true });
    expect(tracker.start).toHaveBeenCalledTimes(1);
  });

  test('tracking state: toggle follows the tracker and reports the change', async () => {
    const { tracker, onChanged, invoke } = setupTracking();
    await tracker.start();
    const result = await invoke('tracking:toggle');
    expect(result).toMatchObject({ isActive: false });
    expect(tracker.stop).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalled();
  });
});

describe('settings save does not restart the tracker (A-6)', () => {
  test('settings save does not restart tracking when the employee ID changes', async () => {
    const tracker = fakeTracker();
    await tracker.start();
    tracker.start.mockClear();
    const data = { settings: { employeeId: '' } };
    const store = { get: (key, fallback) => (key in data ? data[key] : fallback), set: (key, value) => { data[key] = value; } };
    const invoke = registryFor(registry =>
      new SettingsHandlerMain(store, { tracking: { isActive: true } }, () => {}, () => tracker.stop(), () => tracker.start())
        .registerHandlers(registry));
    const result = await invoke('settings:save', { employeeId: 'E123' });
    expect(result).toMatchObject({ success: true });
    expect(data.settings.employeeId).toBe('E123');
    expect(tracker.stop).not.toHaveBeenCalled();
    expect(tracker.start).not.toHaveBeenCalled();
  });
});
