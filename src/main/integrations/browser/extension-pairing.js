// extension-pairing.js - Pairing and authentication for the browser extension (LT3-004)
//
// The extension never receives a token just for asking. Pairing works like this:
// 1. The extension calls POST /pair/start. LightTrack shows a 6-digit code in a desktop
//    dialog that only the person at the computer can see.
// 2. The person types the code into the extension popup; the extension calls
//    POST /pair/complete with the pairing ID and the code.
// 3. LightTrack returns a random long-lived token and stores only its SHA-256 hash.
//    Tokens survive restarts and can be revoked from Settings.
// Codes expire after two minutes, allow five attempts and can be used once.

const crypto = require('crypto');

const STORE_KEY = 'browserExtension.pairedTokens';
const CODE_TTL_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_PAIRED = 10;

const sha256 = value => crypto.createHash('sha256').update(String(value)).digest();

/** Constant-time comparison of two strings via their hashes (equal length). */
function safeEqual(a, b) {
  return crypto.timingSafeEqual(sha256(a), sha256(b));
}

class PairingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'PairingError';
    this.status = status;
  }
}

class ExtensionPairing {
  /**
   * @param {object} opts
   * @param {object} opts.store - get/set store (electron-store in the app)
   * @param {Function} opts.showCode - (code, pairingId) => void; shows the code to the user
   * @param {Function} [opts.now] - clock, for tests
   */
  constructor({ store, showCode, now = () => Date.now() }) {
    this.store = store;
    this.showCode = showCode;
    this.now = now;
    this.pending = new Map(); // pairingId -> { code, origin, expiresAt, attempts }
  }

  pruneExpired() {
    const now = this.now();
    for (const [id, p] of this.pending) {
      if (p.expiresAt <= now) this.pending.delete(id);
    }
  }

  /** Start pairing for an extension origin. Replaces any pending pairing for that origin. */
  start(origin) {
    if (!origin) throw new PairingError('Pairing requires an extension origin', 403);
    this.pruneExpired();
    for (const [id, p] of this.pending) {
      if (p.origin === origin) this.pending.delete(id);
    }
    const pairingId = crypto.randomUUID();
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const expiresAt = this.now() + CODE_TTL_MS;
    this.pending.set(pairingId, { code, origin, expiresAt, attempts: 0 });
    this.showCode(code, pairingId);
    return { pairingId, expiresAt };
  }

  /** Cancel a pending pairing (the user chose Deny). */
  cancel(pairingId) {
    this.pending.delete(pairingId);
  }

  /** Complete pairing with the code the user typed. Returns the new token. */
  complete(pairingId, code, origin) {
    this.pruneExpired();
    const p = this.pending.get(pairingId);
    if (!p || p.origin !== origin) throw new PairingError('Pairing request not found or expired', 404);

    p.attempts += 1;
    if (!safeEqual(String(code), p.code)) {
      if (p.attempts >= MAX_ATTEMPTS) this.pending.delete(pairingId);
      throw new PairingError('Incorrect code', 401);
    }

    this.pending.delete(pairingId); // one use only
    const token = crypto.randomBytes(32).toString('base64url');
    const paired = this.list()
      .filter(t => t.origin !== origin) // one token per extension
      .concat({ hash: sha256(token).toString('hex'), origin, createdAt: new Date(this.now()).toISOString() })
      .slice(-MAX_PAIRED);
    this.store.set(STORE_KEY, paired);
    return token;
  }

  list() {
    const value = this.store.get(STORE_KEY, []);
    return Array.isArray(value) ? value : [];
  }

  /** True when the bearer token belongs to a paired extension with this origin. */
  verify(token, origin) {
    if (!token || !origin) return false;
    const hash = sha256(token).toString('hex');
    let ok = false;
    for (const entry of this.list()) {
      // Compare every entry so timing does not reveal which one matched.
      if (safeEqual(entry.hash, hash) && entry.origin === origin) ok = true;
    }
    return ok;
  }

  /** Remove all paired extensions. */
  revokeAll() {
    this.store.set(STORE_KEY, []);
    this.pending.clear();
  }

  pairedCount() {
    return this.list().length;
  }
}

module.exports = { ExtensionPairing, PairingError, CODE_TTL_MS, MAX_ATTEMPTS, STORE_KEY };
