/**
 * LT3-003: the IPC contract, the registry that enforces it, and the error codes.
 */
const fs = require('fs');
const path = require('path');
const { CONTRACT, CHANNELS } = require('../../src/main/ipc/contract');
const { IpcRegistry } = require('../../src/main/ipc/registry');
const { IpcError, decodeIpcError } = require('../../src/shared/ipc/errors');

const root = path.join(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const matches = (text, regex) => [...text.matchAll(regex)].map(m => m[1]);

function preloadChannels() {
  return new Set(matches(read('src/preload/index.ts'), /call\('([^']+)'/g));
}

function mainChannels() {
  const files = ['src/main/index.js', ...fs.readdirSync(path.join(root, 'src/main/ipc/handlers'))
    .map(f => `src/main/ipc/handlers/${f}`)];
  const channels = files.flatMap(f => matches(read(f), /registry\.handle\('([^']+)'/g));
  return { channels: new Set(channels), count: channels.length };
}

function fakeIpcMain() {
  const handlers = new Map();
  return { handlers, handle: (channel, fn) => handlers.set(channel, fn) };
}

function setup() {
  const ipcMain = fakeIpcMain();
  const log = { warn: jest.fn(), error: jest.fn() };
  const registry = new IpcRegistry(ipcMain, log);
  const invoke = (channel, ...args) => ipcMain.handlers.get(channel)({}, ...args);
  return { registry, invoke, log };
}

/** What the renderer sees after Electron wraps a rejected invoke. */
async function rendererError(promise, channel) {
  try {
    await promise;
  } catch (error) {
    return decodeIpcError(new Error(`Error invoking remote method '${channel}': Error: ${error.message}`), channel);
  }
  throw new Error('expected a rejection');
}

describe('contract coverage', () => {
  test('preload, contract and main use the same channels', () => {
    const contract = new Set(CHANNELS);
    expect([...preloadChannels()].sort()).toEqual([...contract].sort());
    expect([...mainChannels().channels].sort()).toEqual([...contract].sort());
  });

  test('main registers each channel once', () => {
    const { channels, count } = mainChannels();
    expect(count).toBe(channels.size);
  });

  test('no handler is registered on ipcMain directly', () => {
    for (const file of ['src/main/index.js', ...fs.readdirSync(path.join(root, 'src/main/ipc/handlers'))
      .map(f => `src/main/ipc/handlers/${f}`)]) {
      expect(read(file)).not.toMatch(/ipcMain\.handle\(/);
    }
  });

  test('every channel is documented', () => {
    for (const channel of CHANNELS) {
      expect(CONTRACT[channel].doc).toEqual(expect.any(String));
    }
  });
});

describe('registry', () => {
  test('refuses a channel outside the contract', () => {
    const { registry } = setup();
    let thrown;
    try {
      registry.handle('activities:get-paginated', () => []);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(IpcError);
    expect(thrown.code).toBe('UNKNOWN_CHANNEL');
  });

  test('refuses a second handler for the same channel', () => {
    const { registry } = setup();
    registry.handle('get-today-total', () => 0);
    expect(() => registry.handle('get-today-total', () => 0)).toThrow(/twice/);
  });

  test('lists channels that have no handler', () => {
    const { registry } = setup();
    expect(registry.missing()).toHaveLength(CHANNELS.length);
    registry.handle('get-today-total', () => 0);
    expect(registry.missing()).not.toContain('get-today-total');
  });

  test('passes valid arguments and returns a valid result', async () => {
    const { registry, invoke } = setup();
    const handler = jest.fn((event, id) => ({ deleted: true, id }));
    registry.handle('activities:delete', handler);
    await expect(invoke('activities:delete', 'a1')).resolves.toEqual({ deleted: true, id: 'a1' });
    expect(handler).toHaveBeenCalledWith({}, 'a1');
  });

  test('rejects invalid arguments with INVALID_REQUEST before the handler runs', async () => {
    const { registry, invoke, log } = setup();
    const handler = jest.fn();
    registry.handle('activities:delete', handler);
    const error = await rendererError(invoke('activities:delete', { id: 1 }), 'activities:delete');
    expect(error.code).toBe('INVALID_REQUEST');
    expect(handler).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalled();
  });

  test('rejects extra arguments', async () => {
    const { registry, invoke } = setup();
    const handler = jest.fn(() => 0);
    registry.handle('get-today-total', handler);
    const error = await rendererError(invoke('get-today-total', 'extra'), 'get-today-total');
    expect(error.code).toBe('INVALID_REQUEST');
    expect(handler).not.toHaveBeenCalled();
  });

  test('reports a result outside the contract as INVALID_RESPONSE', async () => {
    const { registry, invoke, log } = setup();
    registry.handle('get-today-total', () => 'not a number');
    const error = await rendererError(invoke('get-today-total'), 'get-today-total');
    expect(error.code).toBe('INVALID_RESPONSE');
    expect(log.error).toHaveBeenCalled();
  });

  test('keeps the code of an IpcError thrown by a handler', async () => {
    const { registry, invoke } = setup();
    registry.handle('projects:getById', () => { throw new IpcError('NOT_FOUND', 'Project not found'); });
    const error = await rendererError(invoke('projects:getById', 'p1'), 'projects:getById');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('Project not found');
  });

  test('reports other handler errors as INTERNAL with their message', async () => {
    const { registry, invoke } = setup();
    registry.handle('activities:export', () => { throw new Error('No activities to export'); });
    const error = await rendererError(invoke('activities:export'), 'activities:export');
    expect(error.code).toBe('INTERNAL');
    expect(error.message).toBe('No activities to export');
  });

  test('drops request fields the contract does not know', async () => {
    const { registry, invoke } = setup();
    const handler = jest.fn((event, activity) => ({ id: 'a1', ...activity }));
    registry.handle('activities:save-manual', handler);
    await invoke('activities:save-manual', { title: 'Work', duration: 60, __proto__hack: true, isAdmin: true });
    expect(handler.mock.calls[0][1]).toEqual({ title: 'Work', duration: 60 });
  });
});

describe('renderer payloads', () => {
  // Shapes taken from the renderer's call sites; they must keep passing.
  const accepts = (channel, ...args) => expect(CONTRACT[channel].args.safeParse(args).success).toBe(true);
  const refuses = (channel, ...args) => expect(CONTRACT[channel].args.safeParse(args).success).toBe(false);

  test('activities', () => {
    accepts('activities:get');
    accepts('activities:get', undefined);
    accepts('activities:get', '2026-10-06');
    accepts('activities:save-manual', {
      project: 'Break', app: 'Break', title: 'Break', startTime: '2026-10-06T09:00:00.000Z',
      endTime: '2026-10-06T09:15:00.000Z', duration: 900, billable: false, isManual: true
    });
    accepts('activities:update', '17283', { project: 'X', app: 'Code', title: 'Code', duration: 60, billable: true });
    accepts('activities:delete', 1728300000000);
    accepts('clear-old-activities', 30);
    refuses('activities:save-manual', { duration: -5 });
    refuses('activities:delete');
  });

  test('settings and window behaviour', () => {
    accepts('settings:save', {
      deepWorkTarget: 4, breaksTarget: 4, workDayStart: '09:00', workDayEnd: '18:00', defaultProject: 'General',
      launchAtStartup: false, autoStartTracking: undefined, closeBehavior: 'minimize', minimizeToTray: true,
      breakReminderEnabled: false, breakReminderInterval: 60
    });
    accepts('settings:save', { employeeId: 'E123' });
    accepts('window:update-behavior', { closeBehavior: 'close', minimizeToTray: false });
    refuses('window:update-behavior', { closeBehavior: 'explode' });
    accepts('settings:set-launch-at-startup', true);
  });

  test('mappings accept a project name or a project with booking details', () => {
    accepts('add-project-mapping', 'Visual Studio', 'LightTrack');
    accepts('add-project-mapping', 'Visual Studio', { project: 'LightTrack', sapCode: 'P-1', activity: 'Dev' });
    accepts('add-jira-mapping', 'LT', { project: 'LightTrack', wbsElement: 'W-1' });
    accepts('add-meeting-mapping', 'stand-up', 'Internal');
    accepts('add-url-mapping', 'github.com', 'Dev');
    refuses('add-url-mapping', '', 'Dev');
  });

  test('projects, tags, types, SAP export and calendar', () => {
    accepts('projects:add', { name: 'New', sapCode: '', costCenter: '', wbsElement: '' });
    accepts('projects:update', '123abc', { name: 'Renamed', sapCode: 'S', costCenter: 'C', wbsElement: 'W' });
    accepts('tags:updateActivity', 'a1', ['meeting', 'bugfix']);
    accepts('tags:filterActivities', ['meeting'], false);
    accepts('activityTypes:add', 'Review');
    accepts('activities:preview-sap', {
      startDate: '2026-10-01T00:00:00.000Z', endDate: '2026-10-07T00:00:00.000Z', descriptions: { 'row-1': 'Work' }
    });
    accepts('activities:export-sap', {
      startDate: '2026-10-01T00:00:00.000Z', endDate: '2026-10-07T00:00:00.000Z', employeeId: 'E1', descriptions: {}
    });
    accepts('calendar:set-url', '');
    accepts('calendar:get-meetings', {});
    accepts('shell:open-external', 'https://example.com');
  });
});

describe('error encoding', () => {
  test('decodes the code from an Electron invoke error', () => {
    const error = decodeIpcError(new Error("Error invoking remote method 'x': Error: [NOT_FOUND] Gone"), 'x');
    expect(error).toMatchObject({ code: 'NOT_FOUND', message: 'Gone', channel: 'x' });
  });

  test('treats an uncoded error as INTERNAL', () => {
    expect(decodeIpcError(new Error('boom')).code).toBe('INTERNAL');
  });
});
