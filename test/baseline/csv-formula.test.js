/**
 * C-6: no export writes a cell a spreadsheet would run as a formula, and every text
 * field is quoted. Dates are YYYY-MM-DD.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

const mockSavePath = path.join(os.tmpdir(), `lighttrack-c6-${process.pid}.csv`);
jest.mock('electron', () => ({
  app: { getPath: () => require('os').tmpdir() },
  dialog: { showSaveDialog: async () => ({ canceled: false, filePath: mockSavePath }) },
  ipcMain: {}
}));
jest.mock('../../src/main/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const { textCell } = require('../../src/shared/csv');
const { toActivitiesCsv } = require('../../src/main/exports/activities-csv');
const sap = require('../../src/main/exports/sap-csv');
const ActivitiesHandlerMain = require('../../src/main/ipc/handlers/activitiesHandlerMain');
const { IpcRegistry } = require('../../src/main/ipc/registry');

const FORMULA = '=HYPERLINK("https://example.test","x")';

describe('csv formula (C-6)', () => {
  afterAll(() => fs.rmSync(mockSavePath, { force: true }));

  test('csv formula: Settings > Export CSV writes a title as text, and the day as YYYY-MM-DD', async () => {
    const handlers = new Map();
    const registry = new IpcRegistry({ handle: (channel, fn) => handlers.set(channel, fn) }, { warn() {}, error() {} });
    const start = new Date(2026, 10, 27, 9, 5).getTime();
    const storage = { async getActivities() {
      return [{ startTime: start, endTime: start + 3600000, duration: 3600, app: 'Chrome', title: FORMULA, project: 'P' }];
    } };
    new ActivitiesHandlerMain(storage, {}, { windows: { main: null } }, () => ({ valid: true }), () => null).registerHandlers(registry);

    expect(await handlers.get('activities:export')({})).toBe(mockSavePath);
    const row = fs.readFileSync(mockSavePath, 'utf8').split('\n')[1];
    expect(row.startsWith('2026-11-27,09:05,10:05,60,')).toBe(true);
    expect(row).toContain(textCell(FORMULA));
  });

  test('csv formula: a formula-like text cell starts with a quote and is quoted', () => {
    expect(textCell(FORMULA)).toBe('"\'=HYPERLINK(""https://example.test"",""x"")"');
    for (const lead of ['=', '+', '-', '@', '\t', '\r']) expect(textCell(`${lead}1`)).toBe(`"'${lead}1"`);
    expect(textCell('plain')).toBe('"plain"');
    expect(textCell(undefined)).toBe('""');
  });

  test('csv formula: Settings export neutralises app, title and project', () => {
    const start = new Date(2026, 10, 27, 9, 5).getTime();
    const csv = toActivitiesCsv([
      { startTime: start, endTime: start + 3600000, duration: 3600, app: '+cmd', title: FORMULA, project: '@Client', billable: true }
    ]);
    const [header, row] = csv.split('\n');
    expect(header).toBe('Date,Start Time,End Time,Duration (min),App,Title,Project,Billable');
    expect(row).toBe(`2026-11-27,09:05,10:05,60,"'+cmd",${textCell(FORMULA)},"'@Client",Yes`);
  });

  test('csv formula: the SAP export uses the same cell', () => {
    expect(sap.textCell).toBe(textCell);
  });
});
