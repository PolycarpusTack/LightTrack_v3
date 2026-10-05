/**
 * LT3-008: storage key without a guessable fallback, protected calendar URL,
 * and in-app updates switched off.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

// electron is not available under plain Node; the modules below only need these names.
jest.mock('electron', () => ({ safeStorage: undefined, app: {}, ipcMain: {} }), { virtual: false });

const Conf = require('conf');
const { resolveStorageKey, legacyDerivedKeys, StorageKeyError, KEY_FILE, STORE_FILE, LEGACY_BACKUP_FILE } =
  require('../../src/main/core/storage-key');
const { protect, unprotect, maskUrl, ProtectedValueError } = require('../../src/main/core/protected-value');

/** Stand-in for Electron safeStorage (Windows DPAPI). */
function fakeSafeStorage({ available = true, failDecrypt = false } = {}) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: text => Buffer.from(`enc:${text}`, 'utf8'),
    decryptString: buf => {
      if (failDecrypt) throw new Error('DPAPI failure');
      const text = Buffer.from(buf).toString('utf8');
      if (!text.startsWith('enc:')) throw new Error('not ours');
      return text.slice(4);
    }
  };
}

// conf needs a projectName when used outside Electron.
class TestStore extends Conf {
  constructor(options) {
    super({ projectName: 'lighttrack-test', configName: 'config', ...options });
  }
}

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lt3-008-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const resolve = (opts = {}) => resolveStorageKey({
  safeStorage: fakeSafeStorage(opts.safe),
  userDataPath: dir,
  StoreClass: TestStore,
  production: opts.production ?? true,
  log: { info: () => {} }
});

describe('storage key', () => {
  test('outside production the store stays unencrypted (unchanged behaviour)', () => {
    expect(resolve({ production: false })).toBeUndefined();
    expect(fs.existsSync(path.join(dir, KEY_FILE))).toBe(false);
  });

  test('fresh install: random key stored protected, reused on next start', () => {
    const key = resolve();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.readFileSync(path.join(dir, KEY_FILE), 'utf8')).toBe(`enc:${key}`);
    expect(resolve()).toBe(key);
  });

  test('fails closed when data protection is unavailable, and writes nothing', () => {
    expect(() => resolve({ safe: { available: false } })).toThrow(StorageKeyError);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  test('fails closed when the key file cannot be unlocked; no derived-key fallback', () => {
    resolve();
    const before = fs.readFileSync(path.join(dir, KEY_FILE));
    expect(() => resolve({ safe: { failDecrypt: true } })).toThrow(/could not unlock/);
    expect(fs.readFileSync(path.join(dir, KEY_FILE))).toEqual(before);
  });

  test.each([
    ['primary derived key', 0],
    ['secondary derived key', 1],
    ['unencrypted store', null]
  ])('migrates a store written with the %s, keeping a backup', (_name, index) => {
    const legacyKey = index === null ? undefined : legacyDerivedKeys(dir)[index];
    new TestStore({ cwd: dir, encryptionKey: legacyKey }).set('activities', [{ id: 'a1', duration: 60 }]);

    const key = resolve();

    expect(fs.existsSync(path.join(dir, LEGACY_BACKUP_FILE))).toBe(true);
    const migrated = new TestStore({ cwd: dir, encryptionKey: key, clearInvalidConfig: false });
    expect(migrated.get('activities')).toEqual([{ id: 'a1', duration: 60 }]);
    // The old key no longer opens it.
    if (legacyKey) {
      expect(() => new TestStore({ cwd: dir, encryptionKey: legacyKey, clearInvalidConfig: false }).store).toThrow();
    }
  });

  test('refuses to touch a store it cannot read with any known key', () => {
    new TestStore({ cwd: dir, encryptionKey: 'some-other-key' }).set('x', 1);
    const before = fs.readFileSync(path.join(dir, STORE_FILE));
    expect(() => resolve()).toThrow(StorageKeyError);
    expect(fs.readFileSync(path.join(dir, STORE_FILE))).toEqual(before);
    expect(fs.existsSync(path.join(dir, KEY_FILE))).toBe(false);
  });
});

describe('protected values', () => {
  const safe = fakeSafeStorage();

  test('round-trips and never stores plain text', () => {
    const url = 'https://outlook.office365.com/owa/calendar/abc/SECRETTOKEN/calendar.ics';
    const stored = protect(safe, url);
    expect(stored.startsWith('dpapi:')).toBe(true);
    expect(stored).not.toContain('SECRETTOKEN');
    expect(unprotect(safe, stored)).toBe(url);
  });

  test('refuses to save without data protection', () => {
    expect(() => protect(fakeSafeStorage({ available: false }), 'x')).toThrow(ProtectedValueError);
  });

  test('masks everything after the host', () => {
    expect(maskUrl('https://outlook.office365.com/owa/calendar/abc/SECRET/calendar.ics')).toBe('https://outlook.office365.com/…');
    expect(maskUrl('')).toBe('');
  });
});

describe('calendar URL storage', () => {
  const CalendarSyncService = require('../../src/main/integrations/calendar/calendar-sync-service');
  const secret = 'https://outlook.office365.com/owa/calendar/abc/SECRETTOKEN/calendar.ics';

  function memoryStore(initial = {}) {
    const data = { ...initial };
    return {
      data,
      get: (key, fallback) => (key in data ? data[key] : fallback),
      set: (key, value) => { data[key] = value; },
      delete: key => { delete data[key]; }
    };
  }

  test('migrates a plain-text URL from older versions', () => {
    const store = memoryStore({ 'settings.calendarIcsUrl': secret });
    const service = new CalendarSyncService(store, fakeSafeStorage());
    expect(store.data['settings.calendarIcsUrl']).toBeUndefined();
    expect(JSON.stringify(store.data)).not.toContain('SECRETTOKEN');
    expect(service.readUrl()).toBe(secret);
  });

  test('only a masked URL is returned to the renderer', () => {
    const store = memoryStore({ 'settings.calendarIcsUrl': secret });
    const service = new CalendarSyncService(store, fakeSafeStorage());
    expect(service.getCalendarUrl()).toBe('https://outlook.office365.com/…');
  });

  test('keeps the plain value (and still works) when data protection is unavailable', () => {
    const store = memoryStore({ 'settings.calendarIcsUrl': secret });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const service = new CalendarSyncService(store, fakeSafeStorage({ available: false }));
    expect(service.readUrl()).toBe(secret);
  });

  test('clearing the URL removes both stored forms', async () => {
    const store = memoryStore({ 'settings.calendarIcsUrl': secret });
    const service = new CalendarSyncService(store, fakeSafeStorage());
    await service.setCalendarUrl('');
    expect(service.readUrl()).toBe('');
  });
});

describe('update policy', () => {
  test('in-app updates are disabled until releases are signed', () => {
    const { UPDATES_ENABLED } = require('../../src/main/update-policy');
    expect(UPDATES_ENABLED).toBe(false);
  });
});
