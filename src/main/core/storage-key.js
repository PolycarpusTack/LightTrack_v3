// storage-key.js - Encryption key for the electron-store data file (LT3-008)
//
// The key is random and protected by Windows data protection (Electron safeStorage),
// stored encrypted in <userData>/.keyref. There is no guessable fallback: if the key
// cannot be created or unlocked, startup fails closed instead of silently opening a
// different (empty or unreadable) store.
//
// Earlier versions fell back to a key derived from the platform and userData path.
// Data written with that key is migrated once to a protected key, after a backup.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEY_FILE = '.keyref';
const STORE_FILE = 'config.json';
const LEGACY_BACKUP_FILE = 'config.pre-keyref-backup.json';

class StorageKeyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StorageKeyError';
  }
}

/** Keys the pre-LT3-008 code derived when safeStorage was unavailable or failed. */
function legacyDerivedKeys(userDataPath, platform = process.platform, arch = process.arch) {
  const hash = text => crypto.createHash('sha256').update(text).digest('hex').substring(0, 32);
  return [
    hash(`${platform}-${arch}-${userDataPath}`),
    hash(`lighttrack-${platform}-${userDataPath}`)
  ];
}

/**
 * Try to read the store file with each candidate key. electron-store (conf) throws
 * on a wrong key because the decrypted bytes are not valid JSON.
 * @returns {{ data: object } | null}
 */
function readWithCandidates(StoreClass, userDataPath, candidates) {
  for (const encryptionKey of candidates) {
    try {
      const store = new StoreClass({ cwd: userDataPath, encryptionKey, clearInvalidConfig: false });
      return { data: store.store };
    } catch {
      // Wrong key; try the next one.
    }
  }
  return null;
}

/**
 * Resolve the store encryption key, creating or migrating it when needed.
 *
 * @param {object} deps
 * @param {object} deps.safeStorage - Electron safeStorage (or a test double)
 * @param {string} deps.userDataPath - directory that holds config.json and .keyref
 * @param {Function} deps.StoreClass - electron-store (or conf in tests)
 * @param {boolean} [deps.production] - encryption is only applied in production
 * @param {object} [deps.log] - logger with info/warn
 * @returns {string|undefined} the key, or undefined outside production
 */
function resolveStorageKey({ safeStorage, userDataPath, StoreClass, production, log = console }) {
  // Development and test runs keep an unencrypted store for easier debugging.
  if (!production) return undefined;

  if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
    throw new StorageKeyError(
      'Windows data protection is not available, so LightTrack cannot protect its data file. ' +
      'Your data has not been changed.'
    );
  }

  const keyFile = path.join(userDataPath, KEY_FILE);
  if (fs.existsSync(keyFile)) {
    try {
      return safeStorage.decryptString(fs.readFileSync(keyFile));
    } catch (error) {
      throw new StorageKeyError(
        `LightTrack could not unlock its data key (${KEY_FILE}). This can happen after a Windows ` +
        'profile change. Your data has not been changed. Details: ' + error.message
      );
    }
  }

  const newKey = crypto.randomBytes(32).toString('hex');
  const storeFile = path.join(userDataPath, STORE_FILE);

  if (fs.existsSync(storeFile)) {
    // A store without a key file was written with a derived key (or unencrypted). Migrate it.
    const legacy = readWithCandidates(StoreClass, userDataPath, [...legacyDerivedKeys(userDataPath), undefined]);
    if (!legacy) {
      throw new StorageKeyError(
        'LightTrack found a data file it cannot read with any known key. It has not been changed.'
      );
    }
    fs.copyFileSync(storeFile, path.join(userDataPath, LEGACY_BACKUP_FILE));
    fs.writeFileSync(keyFile, safeStorage.encryptString(newKey));
    fs.unlinkSync(storeFile);
    const migrated = new StoreClass({ cwd: userDataPath, encryptionKey: newKey, clearInvalidConfig: false });
    migrated.store = legacy.data;
    log.info?.(`Storage key migrated to Windows data protection; backup kept as ${LEGACY_BACKUP_FILE}`);
    return newKey;
  }

  fs.writeFileSync(keyFile, safeStorage.encryptString(newKey));
  return newKey;
}

module.exports = { resolveStorageKey, legacyDerivedKeys, StorageKeyError, KEY_FILE, STORE_FILE, LEGACY_BACKUP_FILE };
