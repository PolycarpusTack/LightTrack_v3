/**
 * #48: Salesforce cases are detected in window titles and book to the client
 * remembered for the case.
 */
jest.mock('electron', () => ({ app: {}, ipcMain: {}, powerMonitor: { on() {} }, Notification: function () {} }), { virtual: false });
jest.mock('../../src/main/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const { detectSalesforceCase } = require('../../src/main/core/salesforce-case');
const TitleParser = require('../../src/main/core/title-parser');
const { SalesforceHandler } = require('../../src/main/ipc/handlers/salesforceHandler');
const { IpcRegistry } = require('../../src/main/ipc/registry');

function memoryStore(data = {}) {
  return { data, get: (k, d) => (k in data ? data[k] : d), set: (k, v) => { data[k] = v; } };
}

describe('detecting the case number', () => {
  test.each([
    ['00012345 | Case | Salesforce - Google Chrome', '00012345'],
    ['00012345 | Case | Salesforce and 3 more pages - Work - Microsoft​ Edge', '00012345'],
    ['Printer offline | 00012345 | Case | Salesforce - Google Chrome', '00012345'],
    ['CS-0012345 | Case | Salesforce - Google Chrome', 'CS-0012345'],
    ['Case: 00012345 | Service Console | Salesforce - Google Chrome', '00012345'],
    ['00012345 | Service Console | Salesforce - Google Chrome', '00012345']
  ])('%s', (title, expected) => {
    expect(detectSalesforceCase(title)).toBe(expected);
  });

  test.each([
    'Cases | Salesforce - Google Chrome',                 // list view, no case open
    'Acme Corp | Account | Salesforce - Google Chrome',   // other record type
    'Case 00012345 discussion - Outlook',                 // not Salesforce
    'Home | Salesforce - Google Chrome'
  ])('nothing in "%s"', title => {
    expect(detectSalesforceCase(title)).toBeNull();
  });

  test('a Salesforce URL is enough to recognise the site', () => {
    expect(detectSalesforceCase('Case: 00012345', 'https://acme.lightning.force.com/lightning/r/Case/500XX/view')).toBe('00012345');
  });
});

describe('title parser', () => {
  const window = title => ({ title, owner: { name: 'Google Chrome' } });

  test('tags the case and leaves the project open when the case is unknown', () => {
    const parser = new TitleParser({ store: memoryStore() });
    const parsed = parser.parse(window('00012345 | Case | Salesforce - Google Chrome'));
    expect(parsed.salesforceCase).toBe('00012345');
    expect(parsed.tags).toContain('salesforce');
    expect(parsed.salesforceCaseAssigned).toBeUndefined();
  });

  test('books a remembered case to its client, before other rules', () => {
    const store = memoryStore({
      salesforceCaseMappings: { '00012345': { project: 'Acme', sapCode: 'PRD-1' } },
      projectMappings: { Salesforce: 'Internal' }
    });
    const parsed = new TitleParser({ store }).parse(window('00012345 | Case | Salesforce - Google Chrome'));
    expect(parsed.project).toBe('Acme');
    expect(parsed.sapCode).toBe('PRD-1');
    expect(parsed.salesforceCaseAssigned).toBe(true);
  });
});

describe('remembering a case', () => {
  function setup(activities, currentActivity = null) {
    const store = memoryStore({ activities });
    const storage = { store, activityCache: ['stale'] };
    const tracker = { currentActivity };
    const handlers = new Map();
    const registry = new IpcRegistry({ handle: (c, fn) => handlers.set(c, fn) }, { warn() {}, error() {} });
    new SalesforceHandler(storage, () => tracker).registerHandlers(registry);
    const invoke = (channel, ...args) => handlers.get(channel)({}, ...args);
    return { store, storage, tracker, invoke };
  }

  test('stores the client and moves every entry of the case, including the one being tracked', async () => {
    const { store, storage, tracker, invoke } = setup([
      { id: 'a', salesforceCase: '00012345', project: 'General' },
      { id: 'b', salesforceCase: '00099999', project: 'General' },
      { id: 'c', salesforceCase: '00012345', project: 'General' },
      { id: 'd', project: 'General' }
    ], { id: 'now', salesforceCase: '00012345', project: 'General' });

    const result = await invoke('salesforce:assign-case', '00012345', 'Acme');

    expect(result).toEqual({ mappings: { '00012345': 'Acme' }, updated: 2 });
    expect(store.data.activities.map(a => a.project)).toEqual(['Acme', 'General', 'Acme', 'General']);
    expect(store.data.activities.map(a => Boolean(a.salesforceCaseAssigned))).toEqual([true, false, true, false]);
    expect(storage.activityCache).toBeNull();
    expect(tracker.currentActivity.project).toBe('Acme');
  });

  test('keeps booking details and normalises the case number', async () => {
    const { store, invoke } = setup([{ id: 'a', salesforceCase: 'CS-0012345', project: 'General' }]);
    await invoke('salesforce:assign-case', 'cs-0012345', { project: 'Acme', sapCode: 'PRD-1', wbsElement: 'W-1' });
    expect(store.data.salesforceCaseMappings).toEqual({ 'CS-0012345': { project: 'Acme', sapCode: 'PRD-1', wbsElement: 'W-1' } });
    expect(store.data.activities[0]).toMatchObject({ project: 'Acme', sapCode: 'PRD-1', wbsElement: 'W-1' });
  });

  test('refuses something that is not a case number', async () => {
    const { invoke } = setup([]);
    await expect(invoke('salesforce:assign-case', 'DROP TABLE', 'Acme')).rejects.toThrow(/INVALID_REQUEST/);
  });

  test('forgetting a case keeps entries already booked', async () => {
    const { store, invoke } = setup([{ id: 'a', salesforceCase: '00012345', project: 'General' }]);
    await invoke('salesforce:assign-case', '00012345', 'Acme');
    await expect(invoke('salesforce:remove-case-mapping', '00012345')).resolves.toEqual({});
    expect(store.data.activities[0].project).toBe('Acme');
  });
});

describe('tracking', () => {
  const ActivityTracker = require('../../src/main/core/activity-tracker');
  const canContinue = (current, next) =>
    ActivityTracker.prototype.canContinueActivity.call({ storage: { getSettings: () => ({}) } }, current, next);

  test('a different case starts a new activity', () => {
    const base = { app: 'Google Chrome', project: 'General', title: 'x', startTime: Date.now() };
    expect(canContinue({ ...base, salesforceCase: '00012345' }, { ...base, salesforceCase: '00099999' })).toBe(false);
    expect(canContinue({ ...base, salesforceCase: '00012345' }, { ...base })).toBe(false);
    expect(canContinue({ ...base, salesforceCase: '00012345' }, { ...base, salesforceCase: '00012345' })).toBe(true);
  });
});
