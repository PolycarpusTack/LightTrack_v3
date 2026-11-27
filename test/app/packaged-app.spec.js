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

// Settings remembers which groups are open, so open one only when it is closed.
async function openSettingsGroup(page, group) {
  const details = page.locator(`details[data-group="${group}"]`);
  if (!(await details.evaluate(d => d.open))) await details.locator('> summary').click();
  await expect(details).toHaveAttribute('open', '');
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

  // #44: row actions are always visible, and a bare key press does not toggle tracking.
  test('keeps row actions visible and ignores a bare Space', async () => {
    const { app, page, errors } = await launch(userData);

    const actions = page.locator('#activity-list .activity-actions').first();
    await expect(actions).toBeVisible();
    expect(await actions.evaluate(el => getComputedStyle(el).opacity)).toBe('1');

    await page.locator('body').press('Space');
    await page.waitForTimeout(500);
    await expect(page.locator('#toggle-tracking-text')).toHaveText('Start');

    expect(errors).toEqual([]);
    await app.close();
  });

  // #40: restore is not offered until backup and restore are rebuilt (#16).
  test('offers backup but not restore', async () => {
    const { app, page, errors } = await launch(userData);
    await page.locator('.nav-btn[data-view="settings"]').click();
    await expect(page.locator('#backup-data-btn')).toHaveCount(1);
    await expect(page.locator('#restore-data-btn')).toHaveCount(0);
    expect(await page.evaluate(() => typeof window.restoreFromBackup)).toBe('undefined');
    expect(errors).toEqual([]);
    await app.close();
  });

  // B-1: a save says "Settings saved", and a refused save gives main's reason.
  test('settings saved, or the reason they were not', async () => {
    const { app, page, errors } = await launch(userData);
    try {
      const toast = page.locator('.notification-toast').last();
      const stored = () => page.evaluate(async () => (await window.lightTrackAPI.getSettings()).workDayEnd);
      await page.locator('.nav-btn[data-view="settings"]').click();
      await openSettingsGroup(page, 'schedule');
      await expect(page.locator('#settings-day-start')).toHaveValue('09:00');

      await page.locator('#settings-day-end').fill('17:30');
      await expect(toast).toHaveText(/Settings saved/);
      await expect(toast).toHaveClass(/notification-success/);
      expect(await stored()).toBe('17:30');

      await page.locator('#settings-day-end').fill('08:00');
      await expect(toast).toHaveText(/Work day end time must be after start time/);
      await expect(toast).toHaveClass(/notification-error/);
      expect(await stored()).toBe('17:30');

      expect(errors).toEqual([]);
    } finally {
      await app.close();
    }
  });

  // B-2: every setting on the screen is stored and shown again after a restart.
  test('setting survives restart', async () => {
    const first = await launch(userData);
    try {
      const { page } = first;
      const toast = page.locator('.notification-toast').last();
      await page.locator('.nav-btn[data-view="settings"]').click();
      await openSettingsGroup(page, 'schedule');
      await expect(page.locator('#settings-consolidate-activities')).toBeChecked();

      await page.locator('#settings-consolidation-mode').selectOption('strict');
      await page.locator('#settings-consolidate-activities').uncheck();
      await page.locator('#settings-week-start').selectOption('0');
      await page.locator('#settings-idle-threshold').fill('600');
      await page.locator('#settings-min-duration').fill('30');
      await page.locator('#settings-min-duration').blur();
      await expect(toast).toHaveText(/Settings saved/);

      // Out of range: main refuses with the allowed range, and the screen shows what is stored.
      await page.locator('#settings-idle-threshold').fill('10');
      await page.locator('#settings-idle-threshold').blur();
      await expect(toast).toHaveText(/Idle threshold must be between 30 and 1800 seconds/);
      await expect(page.locator('#settings-idle-threshold')).toHaveValue('600');
      expect(first.errors).toEqual([]);
    } finally {
      await first.app.close();
    }

    const second = await launch(userData);
    try {
      const { page } = second;
      await page.locator('.nav-btn[data-view="settings"]').click();
      await expect(page.locator('#settings-consolidate-activities')).not.toBeChecked();
      await expect(page.locator('#settings-consolidation-mode')).toHaveValue('strict');
      await expect(page.locator('#settings-week-start')).toHaveValue('0');
      await expect(page.locator('#settings-idle-threshold')).toHaveValue('600');
      await expect(page.locator('#settings-min-duration')).toHaveValue('30');
      expect(second.errors).toEqual([]);
    } finally {
      await second.app.close();
    }
  });

  // #39: merging on the timeline keeps one activity with the summed time.
  test('merges two activities on the timeline', async () => {
    const { app, page, errors } = await launch(userData);
    const date = localDateISO();
    await page.evaluate(async d => {
      for (const [start, end, title] of [['13:00', '13:30', 'Merge work A'], ['14:00', '14:45', 'Merge work B']]) {
        await window.lightTrackAPI.addManualEntry({
          project: 'Merge Project', app: title, title,
          startTime: new Date(d + 'T' + start + ':00').toISOString(),
          endTime: new Date(d + 'T' + end + ':00').toISOString()
        });
      }
    }, date);

    await page.locator('.nav-btn[data-view="timeline"]').click();
    const rows = page.locator('#timeline-list .activity', { hasText: 'Merge Project' });
    await expect(rows).toHaveCount(2);
    for (const box of await rows.locator('.activity-checkbox').all()) await box.click();
    await page.locator('#timeline-merge-selected').click();
    await expect(page.locator('.notification-toast')).toContainText('Merged 2 activities');

    const merged = await page.evaluate(async () => (await window.lightTrackAPI.getActivities()).filter(a => a.project === 'Merge Project'));
    expect(merged).toHaveLength(1);
    expect(merged[0].duration).toBe(4500);
    await expect(rows).toHaveCount(1);
    expect(errors).toEqual([]);
    await app.close();
  });

  // A-9: catches a repeat of A-2, where a tracked activity's numeric times failed the IPC
  // contract and the Timer stayed empty.
  test('tracked activity is listed with its duration', async () => {
    // Tracked activities store numeric times. Seed one into a fresh profile as a plain
    // data file, which the app adopts and encrypts on first start.
    const seeded = fs.mkdtempSync(path.join(os.tmpdir(), 'lighttrack-harness-tracked-'));
    const date = localDateISO();
    const at = time => new Date(`${date}T${time}:00`).getTime();
    fs.writeFileSync(path.join(seeded, 'config.json'), JSON.stringify({
      activities: [
        { id: 'tracked-smoke', app: 'Excel', title: 'Budget review', project: 'Seeded', date,
          startTime: at('10:00'), endTime: at('12:30'), duration: 8100, actualDuration: 8100 }
      ]
    }));
    try {
      const { app, page, errors } = await launch(seeded);
      try {
        const row = page.locator('#activity-list .activity[data-id="tracked-smoke"]');
        await expect(row).toBeVisible();
        const expected = await page.evaluate(() => window.formatDuration(8100));
        await expect(row.locator('.duration')).toHaveText(expected);
        expect(errors).toEqual([]);
      } finally {
        await app.close();
      }
      // A reply that fails the contract is logged by main, not shown in the window.
      const log = path.join(seeded, 'logs', 'main.log');
      expect(fs.existsSync(log), `no log at ${log}`).toBe(true);
      expect(fs.readFileSync(log, 'utf8')).not.toContain('invalid response');
    } finally {
      fs.rmSync(seeded, { recursive: true, force: true });
    }
  });

  // A-4: an edit sends only what changed, so a tracked activity keeps its duration and title.
  test('edit keeps duration and title of a tracked activity', async () => {
    // A tracked activity cannot be made through IPC; seed it into a fresh profile as a
    // plain data file, which the app adopts and encrypts on first start.
    const seeded = fs.mkdtempSync(path.join(os.tmpdir(), 'lighttrack-harness-edit-'));
    const date = localDateISO();
    const at = time => new Date(`${date}T${time}:00`).getTime();
    fs.writeFileSync(path.join(seeded, 'config.json'), JSON.stringify({
      activities: [
        { id: 'tracked-day', app: 'Figma', title: 'Design review', project: 'Seeded', date,
          startTime: at('09:00'), endTime: at('17:00'), duration: 10800, actualDuration: 10800 },
        { id: 'tracked-night', app: 'Terminal', title: 'Night build', project: 'Seeded', date,
          startTime: at('00:10'), endTime: at('00:40'), duration: 1200, actualDuration: 1200 }
      ]
    }));
    const { app, page, errors } = await launch(seeded);
    try {
      const stored = async id => page.evaluate(
        async key => (await window.lightTrackAPI.getActivities()).find(a => a.id === key), id);
      const row = name => page.locator('#activity-list .activity', { hasText: name }).first();

      // An activity started just after midnight opens on its local day.
      await row('Terminal').click();
      await expect(page.locator('#entry-date')).toHaveValue(date);
      await page.locator('#modal-cancel').click();

      // Changing only the project keeps the counted 3h and the window title.
      await row('Figma').click();
      await page.locator('#entry-project').fill('Edited Project');
      await page.locator('#modal-save').click();
      await expect(page.locator('.notification-toast').last()).toContainText('Entry updated');
      expect(await stored('tracked-day')).toMatchObject({ project: 'Edited Project', duration: 10800, title: 'Design review' });

      // Changing a time warns that the span replaces the tracked duration; declining saves nothing.
      let warning = '';
      page.once('dialog', dialog => { warning = dialog.message(); dialog.dismiss(); });
      await row('Figma').click();
      await page.locator('#entry-end').fill('17:30');
      await page.locator('#modal-save').click();
      await expect.poll(() => warning).toContain('duration will become');
      expect((await stored('tracked-day')).duration).toBe(10800);

      // Confirming applies the new span.
      page.once('dialog', dialog => dialog.accept());
      await page.locator('#modal-save').click();
      await expect.poll(async () => (await stored('tracked-day')).duration).toBe(30600);

      expect(errors).toEqual([]);
    } finally {
      await app.close();
      fs.rmSync(seeded, { recursive: true, force: true });
    }
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

  // A-3: a load failure is shown where the list would be, never as an empty day.
  test('load failure shows an error state with Retry, and Settings still loads', async () => {
    const { app, page } = await launch(userData);
    const failActivities = () => app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('activities:get');
      ipcMain.handle('activities:get', () => { throw new Error('[INTERNAL] forced failure'); });
    });

    await failActivities();
    await page.reload();
    await page.locator('.nav-btn[data-view="timer"]').waitFor({ state: 'visible' });

    // Timer
    const timerList = page.locator('#activity-list');
    await expect(timerList.locator('.load-error')).toContainText('Could not load activities');
    await expect(timerList).not.toContainText('No activities yet today');

    // Timeline
    await page.locator('.nav-btn[data-view="timeline"]').click();
    await expect(page.locator('#timeline-list .load-error')).toContainText('Could not load activities');
    await expect(page.locator('#timeline-summary')).toHaveText('Could not load activities');

    // Analytics
    await page.locator('.nav-btn[data-view="analytics"]').click();
    await expect(page.locator('.view[data-view="analytics"] .load-error')).toContainText('Could not load activities');

    // Settings: only the statistics fail; the other sections are filled.
    await page.locator('.nav-btn[data-view="settings"]').click();
    await expect(page.locator('#settings-stats')).toHaveText('Could not load statistics');
    await expect(page.locator('#browser-extension-status')).not.toHaveText('Loading...');

    // Retry works once the request succeeds again.
    await page.locator('.nav-btn[data-view="timeline"]').click();
    await expect(page.locator('#timeline-list .load-error')).toBeVisible();
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('activities:get');
      ipcMain.handle('activities:get', () => []);
    });
    await page.locator('#timeline-list .load-error-retry').click();
    await expect(page.locator('#timeline-list .load-error')).toHaveCount(0);
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
