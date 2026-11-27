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

  // B-9: the export uses the employee ID as typed, and the export history lists each export.
  test('SAP export uses the typed employee ID and fills the export history', async () => {
    // Its own profile: no saved employee ID and no earlier export
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lighttrack-b9-'));
    const { app, page, errors } = await launch(profile);
    try {
      await page.locator('#add-manual-entry').click();
      await page.locator('#entry-project').fill(PROJECT);
      await page.locator('#entry-app').fill('Harness work');
      await page.locator('#entry-date').fill(localDateISO());
      await page.locator('#entry-start').fill('09:00');
      await page.locator('#entry-end').fill('10:30');
      await page.locator('#modal-save').click();
      await expect.poll(() => page.evaluate(async () => (await window.lightTrackAPI.getActivities()).length)).toBe(1);

      await page.locator('.nav-btn[data-view="sap-export"]').click();
      await expect(page.locator('#export-history-list')).toContainText('No exports yet');
      await page.locator('#sap-employee-id').fill('E-TYPED'); // typed, Save not pressed
      await page.locator('#sap-this-week').click();
      await expect(page.locator('#sap-preview-body tr', { hasText: PROJECT })).toHaveCount(1);

      const csvPath = path.join(profile, 'b9-export.csv');
      await app.evaluate(({ dialog }, filePath) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      }, csvPath);
      await page.locator('#sap-export-btn').click();
      await expect.poll(() => fs.existsSync(csvPath)).toBe(true);
      const dataLine = fs.readFileSync(csvPath, 'utf8').split('\n').find(l => l.includes(PROJECT));
      expect(dataLine.startsWith('"E-TYPED",')).toBe(true);

      // The export history lists it with date, period and row count, and only that
      const item = page.locator('#export-history-list .export-history-item');
      await expect(item).toHaveCount(1);
      await expect(item.locator('.export-period')).toHaveText(/\S/);
      await expect(item.locator('.export-records')).toHaveText('1 row');
      const stored = await page.evaluate(() => localStorage.getItem('lighttrack-export-history'));
      expect(stored).not.toContain(PROJECT);

      // And again after the view is opened anew
      await page.locator('.nav-btn[data-view="timer"]').click();
      await page.locator('.nav-btn[data-view="sap-export"]').click();
      await expect(item).toHaveCount(1);
      expect(errors).toEqual([]);
    } finally {
      try {
        await app.close();
      } finally {
        fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      }
    }
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

  // B-10: the backup summary counts projects and tags, the file holds Salesforce cases,
  // and the calendar URL can be removed.
  test('backup summary counts projects and tags; calendar URL can be removed', async () => {
    const { app, page, errors } = await launch(userData);
    try {
      page.on('dialog', dialog => dialog.accept());
      await page.evaluate(() => window.lightTrackAPI.salesforce.assignCase('00012345', 'B10 Client'));
      // Keep the backup in the page instead of downloading it
      await page.evaluate(() => {
        window.__backup = null;
        const create = URL.createObjectURL.bind(URL);
        URL.createObjectURL = blob => { window.__backup = blob; return create(blob); };
        HTMLAnchorElement.prototype.click = function () {};
      });
      const expected = await page.evaluate(async () => ({
        projects: (await window.lightTrackAPI.getProjects()).all.length,
        tags: (await window.lightTrackAPI.getTags()).all.length
      }));

      await page.locator('.nav-btn[data-view="settings"]').click();
      await openSettingsGroup(page, 'data');
      await page.locator('#backup-data-btn').click();
      await expect(page.locator('#backup-status')).toContainText(`${expected.projects} projects`);
      await expect(page.locator('#backup-status')).toContainText(`${expected.tags} tags`);
      const backup = JSON.parse(await page.evaluate(() => window.__backup.text()));
      expect(backup.data.mappings.salesforceCase).toMatchObject({ '00012345': expect.anything() });
      expect(backup.stats).toMatchObject({ projectsCount: expected.projects, tagsCount: expected.tags });

      // A saved calendar URL (it never syncs here) can be removed
      await page.evaluate(() => window.lightTrackAPI.calendar.setUrl('https://calendar.invalid/b10.ics'));
      await page.locator('.nav-btn[data-view="timer"]').click();
      await page.locator('.nav-btn[data-view="settings"]').click();
      await openSettingsGroup(page, 'calendar');
      const remove = page.locator('#calendar-remove-btn');
      await expect(remove).toBeVisible();
      await remove.click();
      await expect(page.locator('#calendar-sync-status')).toContainText('Calendar removed');
      await expect(remove).toBeHidden();
      expect(await page.evaluate(() => window.lightTrackAPI.calendar.getUrl())).toBeFalsy();
      expect(await page.evaluate(() => window.lightTrackAPI.calendar.getMeetings())).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      await app.close();
    }
  });

  // B-11: the tray's Settings item opens the Settings view.
  test('tray settings opens the Settings view', async () => {
    const { app, page, errors } = await launch(userData);
    try {
      await expect(page.locator('.view[data-view="timer"]')).toHaveClass(/active/);
      // Sent as the tray does; resent until the window listens
      await expect(async () => {
        await app.evaluate(({ BrowserWindow }) => {
          BrowserWindow.getAllWindows().forEach(w => w.webContents.send('open-settings'));
        });
        await expect(page.locator('.view[data-view="settings"]')).toHaveClass(/active/, { timeout: 1000 });
      }).toPass({ timeout: 15000 });
      expect(errors).toEqual([]);
    } finally {
      await app.close();
    }
  });

  // B-11: two messages at once are both shown, and a toast stays for its duration.
  test('two errors at once are both shown', async () => {
    const { app, page, errors } = await launch(userData);
    try {
      // Two requests that fail together, as the window reports them
      await page.evaluate(async () => {
        const fails = ['First request failed', 'Second request failed'].map(message =>
          Promise.reject(new Error(message)).catch(error => window.LightTrack.UI.showNotification(error.message, 'error')));
        await Promise.all(fails);
      });
      await expect(page.locator('.notification-toast', { hasText: 'First request failed' })).toBeVisible();
      await expect(page.locator('.notification-toast', { hasText: 'Second request failed' })).toBeVisible();

      // A longer duration is honoured; the default (3 s) is not cut short
      await page.evaluate(() => window.LightTrack.UI.showNotification('Stays a while', 'warning', 6000));
      await page.waitForTimeout(4000);
      await expect(page.locator('.notification-toast', { hasText: 'Stays a while' })).toBeVisible();
      await expect(page.locator('.notification-toast', { hasText: 'First request failed' })).toHaveCount(0);
      expect(errors).toEqual([]);
    } finally {
      await app.close();
    }
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

  // B-3: the Timeline keeps its own list, so an edit or delete for another day shows at once.
  test('timeline refreshes after an edit, a delete and a change made by main', async () => {
    const seeded = fs.mkdtempSync(path.join(os.tmpdir(), 'lighttrack-harness-timeline-'));
    const past = new Date();
    past.setDate(past.getDate() - 3);
    const day = localDateISO(past);
    const today = localDateISO();
    const at = (date, time) => new Date(`${date}T${time}:00`).getTime();
    fs.writeFileSync(path.join(seeded, 'config.json'), JSON.stringify({
      activities: [
        { id: 'past-a', app: 'Word', title: 'Report', project: 'Past', date: day,
          startTime: at(day, '09:00'), endTime: at(day, '10:00'), duration: 3600 },
        { id: 'past-b', app: 'Excel', title: 'Sheet', project: 'Past', date: day,
          startTime: at(day, '11:00'), endTime: at(day, '12:00'), duration: 3600 },
        { id: 'today-a', app: 'Outlook', title: 'Mail', project: 'Today', date: today,
          startTime: at(today, '08:00'), endTime: at(today, '08:30'), duration: 1800 }
      ]
    }));
    try {
      const { app, page, errors } = await launch(seeded);
      try {
        const row = id => page.locator(`#timeline-list .activity[data-id="${id}"]`);
        await page.locator('.nav-btn[data-view="timeline"]').click();
        for (let i = 0; i < 3; i++) await page.locator('#timeline-prev').click();
        await expect(row('past-a')).toBeVisible();

        // Edit: the row shows the change.
        await row('past-a').locator('.btn-edit').click();
        await page.locator('#entry-project').fill('Edited Past');
        await page.locator('#modal-save').click();
        await expect(page.locator('.notification-toast').last()).toContainText('Entry updated');
        await expect(row('past-a')).toContainText('Edited Past');

        // A second edit on the same day still finds its activity.
        await row('past-b').locator('.btn-edit').click();
        await expect(page.locator('#entry-project')).toHaveValue('Past');
        await page.locator('#modal-cancel').click();

        // Delete: the row disappears.
        await row('past-b').locator('.btn-delete').click();
        await page.locator('#delete-confirm').click();
        await expect(row('past-b')).toHaveCount(0);

        // A change main reports (here a manual entry saved without the dialog) reloads the view.
        await page.evaluate(async date => {
          await window.lightTrackAPI.addManualEntry({
            project: 'From Main', app: 'Manual', title: 'From Main',
            startTime: new Date(`${date}T14:00:00`).toISOString(), endTime: new Date(`${date}T15:00:00`).toISOString(),
            duration: 3600, billable: true, isManual: true
          });
        }, day);
        await expect(page.locator('#timeline-list .activity', { hasText: 'From Main' })).toBeVisible();

        // The Timer still lists today.
        await page.locator('.nav-btn[data-view="timer"]').click();
        await expect(page.locator('#activity-list .activity[data-id="today-a"]')).toBeVisible();
        expect(errors).toEqual([]);
      } finally {
        await app.close();
      }
    } finally {
      fs.rmSync(seeded, { recursive: true, force: true });
    }
  });

  // B-4: returning from a long absence asks what to do with the time. The harness keeps
  // tracking off, so main's idle-return event is sent by hand; main is covered by unit tests.
  test('idle prompt offers count as work and leave out', async () => {
    const { app, page, errors } = await launch(userData);
    try {
      const returnFromIdle = () => app.evaluate(({ BrowserWindow }) => {
        const end = Date.now();
        BrowserWindow.getAllWindows()[0].webContents.send('idle-return', {
          start: new Date(end - 12 * 60 * 1000).toISOString(), end: new Date(end).toISOString(), duration: 720, minutes: 12
        });
      });
      const dialog = page.locator('#idle-modal-overlay');
      const toast = page.locator('.notification-toast').last();

      // The window subscribes once it has started; resend until it listens.
      await expect(async () => {
        await returnFromIdle();
        await expect(dialog).toHaveClass(/active/, { timeout: 1000 });
      }).toPass({ timeout: 15000 });
      await expect(page.locator('#idle-modal-text')).toContainText('No input for 12 min');
      await expect(page.locator('#idle-count')).toHaveText('Count as work');
      await expect(page.locator('#idle-leave-out')).toHaveText('Leave out');
      await page.locator('#idle-count').click();
      await expect(dialog).not.toHaveClass(/active/);
      await expect(toast).toHaveText(/Idle time counted as work/);

      // Escape leaves the time out.
      await returnFromIdle();
      await expect(dialog).toHaveClass(/active/);
      await page.keyboard.press('Escape');
      await expect(dialog).not.toHaveClass(/active/);
      await expect(toast).toHaveText(/Idle time left out/);
      expect(errors).toEqual([]);
    } finally {
      await app.close();
    }
  });

  // B-6: prompt() throws in Electron, so these controls did nothing. Each opens a dialog now.
  test('no prompt: break, project edit and rule test open a dialog', async () => {
    const { app, page, errors } = await launch(userData);
    try {
      await page.evaluate(() => {
        window.__prompts = [];
        window.prompt = message => { window.__prompts.push(message); return null; };
      });
      const dialog = page.locator('#form-modal-overlay');
      const field = name => page.locator(`#form-modal-fields [name="${name}"]`);
      const toast = page.locator('.notification-toast').last();
      const expectDialog = async labels => {
        await expect(dialog).toHaveClass(/active/);
        for (const label of labels) await expect(page.locator('#form-modal-fields label', { hasText: label })).toBeVisible();
        await expect(page.locator('#form-modal-cancel')).toBeVisible();
        await expect(page.locator('#form-modal-save')).toBeVisible();
      };
      const breaks = () => page.evaluate(async () =>
        (await window.lightTrackAPI.getActivities()).filter(a => a.project === 'Break').length);

      // Mark break: Cancel saves nothing, Save logs the break.
      const before = await breaks();
      await page.locator('#mark-break').click();
      await expectDialog(['Break length (minutes)']);
      await page.locator('#form-modal-cancel').click();
      await expect(dialog).not.toHaveClass(/active/);
      expect(await breaks()).toBe(before);
      await page.locator('#mark-break').click();
      await field('minutes').fill('10');
      await page.locator('#form-modal-save').click();
      await expect(toast).toContainText('Break logged: 10 min');
      expect(await breaks()).toBe(before + 1);

      // Ctrl+Shift+B acts only while tracking, which the harness keeps off; set the flag.
      await page.evaluate(() => { AppState.isTracking = true; });
      await page.keyboard.press('Control+Shift+B');
      await expectDialog(['Break length (minutes)']);
      await page.keyboard.press('Escape');
      await expect(dialog).not.toHaveClass(/active/);
      await page.evaluate(() => { AppState.isTracking = false; });
      expect(await breaks()).toBe(before + 1);

      // Settings > Project Edit (custom projects only): Cancel keeps the project, Save stores the fields.
      const project = name => page.evaluate(async key =>
        ((await window.lightTrackAPI.getProjects()).custom || []).find(p => p.name === key) || null, name);
      await page.locator('.nav-btn[data-view="settings"]').click();
      await openSettingsGroup(page, 'customization');
      await page.locator('#project-manager #pm-project-name').fill('B6 Project');
      await page.locator('#project-manager [data-action="add-project"]').click();
      const edit = name => page.locator('#project-manager .project-list-item', { hasText: name })
        .locator('[data-action="edit-project"]');
      await edit('B6 Project').click();
      await expectDialog(['Project name', 'SAP code', 'Cost center', 'WBS element']);
      await expect(field('name')).toHaveValue('B6 Project');
      await field('sapCode').fill('SAP-CANCEL');
      await page.locator('#form-modal-cancel').click();
      expect((await project('B6 Project')).sapCode || '').toBe('');
      await edit('B6 Project').click();
      await field('name').fill('B6 Renamed');
      await field('sapCode').fill('SAP-B6');
      await page.locator('#form-modal-save').click();
      await expect(toast).toContainText('Project updated');
      expect(await project('B6 Renamed')).toMatchObject({ sapCode: 'SAP-B6' });

      // Rule Test: the sample text is asked in a dialog.
      await page.locator('.nav-btn[data-view="projects"]').click();
      // The view wires its buttons once its rules have loaded.
      await expect(page.locator('#projects-list')).not.toHaveClass(/view-loading/);
      await page.locator('#mapping-pattern').fill('Code');
      await page.locator('.btn-test-pattern[data-pattern-input="mapping-pattern"]').click();
      await expectDialog(['Sample text']);
      await field('sample').fill('Visual Studio Code');
      await page.locator('#form-modal-save').click();
      await expect(toast).toContainText('Pattern matches');

      expect(await page.evaluate(() => window.__prompts)).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      await app.close();
    }
  });

  // B-8: Settings and the New project dialog had the same field ids, and the tag and
  // activity-type managers added a click handler each time they loaded.
  test('project, tag and activity-type controls: each acts once', async () => {
    const { app, page, errors } = await launch(userData);
    try {
      const confirms = [];
      page.on('dialog', dialog => { confirms.push(dialog.message()); dialog.accept(); });
      const toasts = text => page.locator('.notification-toast', { hasText: text });
      const projectNames = () => page.evaluate(async () => (await window.lightTrackAPI.getProjects()).all.map(p => p.name));

      // Open Settings three times
      for (let i = 0; i < 3; i++) {
        await page.locator('.nav-btn[data-view="settings"]').click();
        await openSettingsGroup(page, 'customization');
        await expect(page.locator('#tag-manager [data-action="add-tag"]')).toBeVisible();
        await page.locator('.nav-btn[data-view="timer"]').click();
      }

      // "+ New project" in Projects, after Settings was opened
      await page.locator('.nav-btn[data-view="projects"]').click();
      await page.locator('#create-project-btn').click();
      await page.locator('#new-project-modal-overlay #new-project-name').fill('B8 Project');
      await page.locator('#new-project-save').click();
      await expect.poll(projectNames).toContain('B8 Project');

      await page.locator('.nav-btn[data-view="settings"]').click();
      await openSettingsGroup(page, 'customization');

      // One tag added, one confirmation on removal
      await page.locator('#tag-manager #new-custom-tag').fill('b8tag');
      await page.locator('#tag-manager [data-action="add-tag"]').click();
      await expect(toasts('b8tag')).toHaveCount(1);
      await page.locator('#tag-manager [data-action="remove-tag"][data-tag="b8tag"]').click();
      await expect.poll(() => confirms.length).toBe(1);

      // One activity type added, one confirmation on removal
      await page.locator('#activity-type-manager #new-activity-type').fill('B8 Type');
      await page.locator('#activity-type-manager [data-action="add-activity-type"]').click();
      await expect(toasts('"B8 Type" added')).toHaveCount(1);
      await page.locator('#activity-type-manager .tag-manager-item', { hasText: 'B8 Type' })
        .locator('[data-action="remove-activity-type"]').click();
      await expect.poll(() => confirms.length).toBe(2);
      await page.waitForTimeout(500);
      expect(confirms).toHaveLength(2);
      expect(errors).toEqual([]);
    } finally {
      await app.close();
    }
  });

  // C-4: the rule tester uses the matcher tracking uses, from the renderer bundle.
  test('rule tester matches the way tracking does', async () => {
    const { app, page, errors } = await launch(userData);
    try {
      const toast = page.locator('.notification-toast').last();
      const tryRule = async (pattern, sample) => {
        await page.locator('#mapping-pattern').fill(pattern);
        await page.locator('.btn-test-pattern[data-pattern-input="mapping-pattern"]').click();
        await page.locator('#form-modal-fields [name="sample"]').fill(sample);
        await page.locator('#form-modal-save').click();
      };
      await page.locator('.nav-btn[data-view="projects"]').click();
      await expect(page.locator('#projects-list')).not.toHaveClass(/view-loading/);

      await tryRule('*Outlook*', 'Inbox - Microsoft Outlook');
      await expect(toast).toContainText('Pattern matches');
      await tryRule('C++ Builder', 'main.cpp - C++ Builder');
      await expect(toast).toContainText('Pattern matches');
      await tryRule('/(a+)+$/', 'aaaa');
      await expect(toast).toContainText('Pattern not used');
      expect(errors).toEqual([]);
    } finally {
      await app.close();
    }
  });

  // B-7: the tag editor opens under the row that was clicked, and ticking a tag edits nothing else.
  test('tag editor opens on the clicked row', async () => {
    const seeded = fs.mkdtempSync(path.join(os.tmpdir(), 'lighttrack-harness-tags-'));
    const today = localDateISO();
    const past = new Date();
    past.setDate(past.getDate() - 2);
    const day = localDateISO(past);
    const at = (date, time) => new Date(`${date}T${time}:00`).getTime();
    fs.writeFileSync(path.join(seeded, 'config.json'), JSON.stringify({
      activities: [
        { id: 'tags-today', app: 'Word', title: 'Notes', project: 'Tags', date: today,
          startTime: at(today, '09:00'), endTime: at(today, '10:00'), duration: 3600 },
        { id: 'tags-past', app: 'Excel', title: 'Sheet', project: 'Tags', date: day,
          startTime: at(day, '09:00'), endTime: at(day, '10:00'), duration: 3600 }
      ]
    }));
    try {
      const { app, page, errors } = await launch(seeded);
      try {
        const editor = page.locator('#tag-editor');
        const timelineRow = id => page.locator(`#timeline-list .activity[data-id="${id}"]`);

        // Timeline, today: the editor opens under the Timeline row, not the hidden Timer row.
        await page.locator('.nav-btn[data-view="timeline"]').click();
        await timelineRow('tags-today').locator('.btn-tags').click();
        await expect(timelineRow('tags-today').locator('#tag-editor')).toBeVisible();
        await editor.locator('.tag-editor-close').click();

        // Timeline, another day: the activity is found.
        for (let i = 0; i < 2; i++) await page.locator('#timeline-prev').click();
        await timelineRow('tags-past').locator('.btn-tags').click();
        await expect(timelineRow('tags-past').locator('#tag-editor')).toBeVisible();
        const firstTag = editor.locator('.tag-editor-item input').first();
        const tag = await firstTag.getAttribute('value');
        await firstTag.check();
        await editor.locator('.tag-editor-save').click();
        await expect(page.locator('.notification-toast').last()).toContainText('Tags updated');
        const tagsOf = id => page.evaluate(async ({ key, date }) =>
          (await window.lightTrackAPI.getActivities(date)).find(a => a.id === key)?.tags || [], { key: id, date: day });
        expect(await tagsOf('tags-past')).toEqual([tag]);

        // Timer: ticking a tag does not open the Edit dialog.
        await page.locator('.nav-btn[data-view="timer"]').click();
        const timerRow = page.locator('#activity-list .activity[data-id="tags-today"]');
        await timerRow.locator('.btn-tags').click();
        await expect(timerRow.locator('#tag-editor')).toBeVisible();
        await editor.locator('.tag-editor-item input').first().check();
        await expect(page.locator('#modal-overlay')).not.toHaveClass(/active/);
        await expect(editor).toBeVisible();
        expect(errors).toEqual([]);
      } finally {
        await app.close();
      }
    } finally {
      fs.rmSync(seeded, { recursive: true, force: true });
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
    await expect(page.locator('.notification-toast', { hasText: 'Merged 2 activities' })).toBeVisible();

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

  // B-12: the main flows end to end: change a setting, change a tracked activity's project,
  // and add a manual entry for yesterday.
  test('main flows: setting, project change and manual entry for yesterday', async () => {
    const seeded = fs.mkdtempSync(path.join(os.tmpdir(), 'lighttrack-harness-flows-'));
    const today = localDateISO();
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = localDateISO(yesterdayDate);
    const at = time => new Date(`${today}T${time}:00`).getTime();
    fs.writeFileSync(path.join(seeded, 'config.json'), JSON.stringify({
      activities: [
        { id: 'tracked-flow', app: 'Word', title: 'Quarterly report', project: 'Seeded', date: today,
          startTime: at('08:00'), endTime: at('11:00'), duration: 9000, actualDuration: 9000 }
      ]
    }));
    const { app, page, errors } = await launch(seeded);
    try {
      const stored = () => page.evaluate(async () => window.lightTrackAPI.getActivities());

      // 1. A setting is saved, and says so
      await page.locator('.nav-btn[data-view="settings"]').click();
      await openSettingsGroup(page, 'schedule');
      await page.locator('#settings-day-end').fill('17:45');
      await page.locator('#settings-day-end').blur();
      await expect(page.locator('.notification-toast', { hasText: 'Settings saved' })).toBeVisible();
      expect((await page.evaluate(() => window.lightTrackAPI.getSettings())).workDayEnd).toBe('17:45');

      // 2. The tracked activity moves to another project and keeps its duration
      await page.locator('.nav-btn[data-view="timer"]').click();
      await page.locator('#activity-list .activity[data-id="tracked-flow"]').click();
      await page.locator('#entry-project').fill('Flow Project');
      await page.locator('#modal-save').click();
      await expect(page.locator('.notification-toast', { hasText: 'Entry updated' })).toBeVisible();
      expect((await stored()).find(a => a.id === 'tracked-flow')).toMatchObject({ project: 'Flow Project', duration: 9000 });

      // 3. A manual entry for yesterday is listed under yesterday, not today
      await page.locator('#add-manual-entry').click();
      await page.locator('#entry-project').fill('Yesterday Project');
      await page.locator('#entry-app').fill('Phone call');
      await page.locator('#entry-date').fill(yesterday);
      await page.locator('#entry-start').fill('14:00');
      await page.locator('#entry-end').fill('15:00');
      await page.locator('#modal-save').click();
      await expect.poll(async () => (await stored()).filter(a => a.project === 'Yesterday Project').length).toBe(1);
      await expect(page.locator('#activity-list .activity', { hasText: 'Yesterday Project' })).toHaveCount(0);

      await page.locator('.nav-btn[data-view="timeline"]').click();
      await expect(page.locator('#timeline-list .activity', { hasText: 'Yesterday Project' })).toHaveCount(0);
      await page.locator('#timeline-prev').click();
      await expect(page.locator('#timeline-list .activity', { hasText: 'Yesterday Project' })).toHaveCount(1);
      await expect(page.locator('#timeline-list .activity', { hasText: 'Flow Project' })).toHaveCount(0);
      expect(errors).toEqual([]);
    } finally {
      try {
        await app.close();
      } finally {
        fs.rmSync(seeded, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      }
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

    // One toast for the failure, though the Timer and Timeline both asked (B-11)
    const toast = page.locator('.notification-toast.notification-error');
    await expect(toast).toHaveCount(1);
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
