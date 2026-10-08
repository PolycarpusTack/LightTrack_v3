/**
 * Packaged-application harness (LT3-005).
 *
 * Launches the packaged LightTrack.exe in harness mode with an isolated profile,
 * drives the real UI and IPC: stores a manual activity, previews and writes a SAP
 * export, then restarts to check the data persisted (encrypted, as installed
 * builds are). Capture is not started; the manual entry is the stored raw event.
 *
 * LIGHTTRACK_EXE overrides the executable (default: dist/win-unpacked/LightTrack.exe).
 */
const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EXE = process.env.LIGHTTRACK_EXE || path.join(__dirname, '..', '..', 'dist', 'win-unpacked', 'LightTrack.exe');
const PROJECT = 'Harness Project';

function localDateISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function launch(userData) {
  const app = await electron.launch({
    executablePath: EXE,
    env: { ...process.env, LIGHTTRACK_HARNESS: '1', LIGHTTRACK_USER_DATA: userData }
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.locator('.nav-btn[data-view="timer"]').waitFor({ state: 'visible' });
  return { app, page, errors };
}

test.describe('packaged application', () => {
  let userData;

  test.beforeAll(() => {
    expect(fs.existsSync(EXE), `packaged app not found at ${EXE}`).toBe(true);
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'lighttrack-harness-'));
  });

  test.afterAll(() => {
    if (userData) fs.rmSync(userData, { recursive: true, force: true });
  });

  test('stores a manual entry, exports it to SAP CSV and keeps it after restart', async () => {
    const { app, page, errors } = await launch(userData);

    // The renderer TypeScript bundle (LT3-006) loaded and published its module.
    const bundle = await page.evaluate(() => ({
      icon: typeof window.LightTrack?.Utils?.icon,
      svg: window.LightTrack.Utils.icon('inbox').startsWith('<svg')
    }));
    expect(bundle).toEqual({ icon: 'function', svg: true });

    // Harness mode uses the isolated profile, not the user's real one.
    const appUserData = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'));
    expect(path.resolve(appUserData)).toBe(path.resolve(userData));

    // 1. Store a manual activity through the real form and IPC.
    await page.locator('#add-manual-entry').click();
    await page.locator('#entry-project').fill(PROJECT);
    await page.locator('#entry-app').fill('Harness work');
    await page.locator('#entry-date').fill(localDateISO());
    await page.locator('#entry-start').fill('09:00');
    await page.locator('#entry-end').fill('10:30');
    await page.locator('#modal-save').click();

    const stored = await page.evaluate(async project => {
      const all = await window.lightTrackAPI.getActivities();
      return all.filter(a => a.project === project);
    }, PROJECT);
    expect(stored).toHaveLength(1);
    expect(stored[0].duration).toBe(5400);

    // 2. SAP export: preview is built in main, then written to a file.
    await page.locator('.nav-btn[data-view="sap-export"]').click();
    await page.locator('#sap-employee-id').fill('E-HARNESS');
    await page.locator('#sap-save-employee-id').click();
    await page.locator('#sap-this-week').click();
    const row = page.locator('#sap-preview-body tr', { hasText: PROJECT });
    await expect(row).toHaveCount(1);
    await expect(row.locator('td.num')).toHaveText('1.50');
    await expect(row.locator('.sap-description-input')).toHaveValue(`${PROJECT} - Development`);

    const csvPath = path.join(userData, 'harness-export.csv');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, csvPath);
    await page.locator('#sap-export-btn').click();
    await expect.poll(() => fs.existsSync(csvPath)).toBe(true);

    const lines = fs.readFileSync(csvPath, 'utf8').split('\n');
    expect(lines[0]).toBe('Employee ID,Date,Project,Activity Type,Hours,SAP Code,Cost Center,WBS Element,Work Description,Billable');
    const dataLine = lines.find(l => l.includes(PROJECT));
    expect(dataLine).toBe(`"E-HARNESS",${localDateISO()},"${PROJECT}","Development",1.50,"","","","${PROJECT} - Development",Yes`);
    expect(fs.readFileSync(csvPath, 'utf8')).not.toContain('Harness work'); // raw title never exported

    expect(errors).toEqual([]);
    await app.close();

    // 3. Installed builds encrypt the data file with a protected key.
    expect(fs.existsSync(path.join(userData, '.keyref'))).toBe(true);
    expect(fs.readFileSync(path.join(userData, 'config.json')).toString('utf8')).not.toContain(PROJECT);

    // 4. Data survives a restart.
    const second = await launch(userData);
    const afterRestart = await second.page.evaluate(async project => {
      const all = await window.lightTrackAPI.getActivities();
      return all.filter(a => a.project === project).length;
    }, PROJECT);
    expect(afterRestart).toBe(1);
    expect(second.errors).toEqual([]);
    await second.app.close();
  });

  // LT3-101: the packaged app creates, migrates and encrypts the database (sql.js loads from app.asar).
  test('packaged app creates an encrypted, migrated database', async () => {
    const { app } = await launch(userData);
    const dbFile = path.join(userData, 'harness.db');

    const result = await app.evaluate(async (_electron, file) => {
      // eslint-disable-next-line no-undef
      const { openDatabase, schemaVersion } = process.mainModule.require('./persistence/database');
      const key = 'harness-key';
      const first = await openDatabase(file, { key });
      first.db.run("INSERT INTO project VALUES ('p1', 'Harness', 'active', 0, '2026-10-06', '2026-10-06')");
      first.db.save();
      first.db.close();
      const second = await openDatabase(file, { key });
      const out = {
        applied: first.migration.applied.length,
        reapplied: second.migration.applied.length,
        version: schemaVersion(second.db),
        projects: second.db.all('SELECT name FROM project')
      };
      second.db.close();
      return out;
    }, dbFile);

    expect(result.applied).toBeGreaterThan(0);
    expect(result.reapplied).toBe(0);
    expect(result.version).toBe(result.applied);
    expect(result.projects).toEqual([{ name: 'Harness' }]);
    const bytes = fs.readFileSync(dbFile);
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('LTDB');
    expect(bytes.includes(Buffer.from('Harness'))).toBe(false);
    await app.close();
  });

  // Window detection loads its native module (koffi) from the packaged app.
  test('packaged app can read process and window details', async () => {
    const { app } = await launch(userData);
    const result = await app.evaluate(() => {
      // eslint-disable-next-line no-undef
      const { activeWindow, processInfo } = process.mainModule.require('./core/active-window');
      const window = activeWindow(); // may be undefined on a runner without a foreground window
      return { self: processInfo(process.pid), window: window === undefined ? 'none' : typeof window.owner.name };
    });
    expect(result.self.path).toMatch(/LightTrack\.exe$/i);
    expect(result.self.name).toBe('LightTrack');
    expect(['none', 'string']).toContain(result.window);
    await app.close();
  });

  // #48: a Salesforce case remembered through the preload shows up under Projects.
  test('remembers the client for a Salesforce case', async () => {
    const { app, page, errors } = await launch(userData);

    const result = await page.evaluate(() => window.lightTrackAPI.salesforce.assignCase('00012345', 'Harness client'));
    expect(result).toEqual({ mappings: { '00012345': 'Harness client' }, updated: 0 });

    await page.locator('.nav-btn[data-view="projects"]').click();
    const item = page.locator('#salesforce-cases-list .mapping-item');
    await expect(item).toContainText('Case 00012345');
    await expect(item).toContainText('Harness client');

    expect(errors).toEqual([]);
    await app.close();
  });

  // #45: a failed request shows an error toast instead of an empty view.
  test('shows a failed request to the user', async () => {
    const { app, page } = await launch(userData);

    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('activities:get');
      ipcMain.handle('activities:get', () => { throw new Error('[INTERNAL] forced failure'); });
    });
    await page.locator('.nav-btn[data-view="timeline"]').click();

    const toast = page.locator('.notification-toast.notification-error');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Failed to load activities.');
    await app.close();
  });

  // LT3-003: main validates every request against the IPC contract.
  test('main refuses a request outside the IPC contract', async () => {
    const { app, page, errors } = await launch(userData);

    const outcome = await page.evaluate(async () => {
      try {
        await window.lightTrackAPI.deleteActivity({ id: 'not-an-id' });
        return 'resolved';
      } catch (error) {
        return error.message;
      }
    });

    expect(outcome).toBe('Failed to delete activity. Please try again.');
    expect(errors.some(e => e.includes('[INVALID_REQUEST]'))).toBe(true);
    await app.close();
  });
});
