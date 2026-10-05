// protected-value.js - Store small secrets (e.g. the calendar ICS URL) encrypted with
// Windows data protection via Electron safeStorage (LT3-008).
//
// Values are stored as "dpapi:<base64>". There is no plain-text fallback: if data
// protection is unavailable, saving fails and the caller reports it.

const PREFIX = 'dpapi:';

class ProtectedValueError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProtectedValueError';
  }
}

function protect(safeStorage, value) {
  if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
    throw new ProtectedValueError('Windows data protection is not available; the value was not saved.');
  }
  return PREFIX + safeStorage.encryptString(String(value)).toString('base64');
}

function unprotect(safeStorage, stored) {
  if (typeof stored !== 'string' || !stored.startsWith(PREFIX)) return '';
  try {
    return safeStorage.decryptString(Buffer.from(stored.slice(PREFIX.length), 'base64'));
  } catch {
    return '';
  }
}

/** Display form that does not reveal a URL's path or query (where feed tokens live). */
function maskUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}/…`;
  } catch {
    return url ? '…' : '';
  }
}

module.exports = { protect, unprotect, maskUrl, ProtectedValueError, PREFIX };
