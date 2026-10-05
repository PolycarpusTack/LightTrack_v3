// browser-extension-server.js - HTTP API for the LightTrack browser extension
//
// Loopback only (127.0.0.1). Requests are authenticated with a token obtained by
// pairing (see integrations/browser/extension-pairing.js, LT3-004):
//   GET  /status          - liveness; reports whether the caller's token is paired
//   POST /pair/start      - begin pairing; LightTrack shows a code to the user
//   POST /pair/complete   - exchange pairing ID + code for a token
//   POST /browser-activity, POST /page-context - require "Authorization: Bearer <token>"
// POST bodies must be application/json and pass schema validation. Titles, URLs and
// tokens are never logged.

const http = require('http');
const { BROWSER_EXTENSION_PORT } = require('../../shared/constants');
const { PairingError } = require('../integrations/browser/extension-pairing');
const { validateBrowserActivity, validatePageContext } = require('../integrations/browser/extension-payloads');

const RATE_LIMIT = 60;            // requests per minute per endpoint
const PAIR_RATE_LIMIT = 10;       // pairing requests per minute
const RATE_WINDOW_MS = 60000;
const MAX_BODY = { '/browser-activity': 10000, '/page-context': 50000, '/pair/start': 1000, '/pair/complete': 1000 };

const EXTENSION_ORIGIN = /^(chrome-extension|moz-extension):\/\/[a-z0-9-]+\/?$/i;

class BrowserExtensionServer {
  /**
   * @param {object} activityTracker
   * @param {object} storage
   * @param {object} options
   * @param {import('../integrations/browser/extension-pairing').ExtensionPairing} options.pairing
   * @param {number} [options.port]
   * @param {object} [options.log] - logger with info/warn/error
   */
  constructor(activityTracker, storage, { pairing, port = BROWSER_EXTENSION_PORT, log = console } = {}) {
    this.activityTracker = activityTracker;
    this.storage = storage;
    this.pairing = pairing;
    this.port = port;
    this.log = log;
    this.server = null;
    this.isRunning = false;
    this.requestCounts = new Map();
  }

  /** Extension origins only; web pages and origin-less callers are not extensions. */
  static isExtensionOrigin(origin) {
    return typeof origin === 'string' && EXTENSION_ORIGIN.test(origin);
  }

  bearerToken(req) {
    const header = req.headers.authorization;
    if (typeof header !== 'string') return null;
    const match = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(header);
    return match ? match[1] : null;
  }

  isAuthorized(req) {
    return this.pairing.verify(this.bearerToken(req), req.headers.origin);
  }

  isRateLimited(key, limit) {
    const now = Date.now();
    if (this.requestCounts.size > 100) {
      for (const [k, v] of this.requestCounts) {
        if (now - v.windowStart > RATE_WINDOW_MS) this.requestCounts.delete(k);
      }
    }
    const entry = this.requestCounts.get(key);
    if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
      this.requestCounts.set(key, { count: 1, windowStart: now });
      return false;
    }
    entry.count += 1;
    return entry.count > limit;
  }

  send(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  }

  /** Read and parse a JSON body with a size limit. Resolves to the parsed value. */
  readJson(req, limit) {
    return new Promise((resolve, reject) => {
      const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (type !== 'application/json') {
        reject(Object.assign(new Error('Content-Type must be application/json'), { status: 415 }));
        return;
      }
      let size = 0;
      const chunks = [];
      req.on('data', chunk => {
        size += chunk.length;
        if (size > limit) {
          // Stop reading; the 413 is sent with Connection: close and the socket closed after it.
          req.pause();
          reject(Object.assign(new Error('Request too large'), { status: 413 }));
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
        }
      });
      req.on('error', reject);
    });
  }

  async handle(req, res) {
    const origin = req.headers.origin;
    const path = (req.url || '').split('?')[0];
    const isExtension = BrowserExtensionServer.isExtensionOrigin(origin);

    // CORS only for extension origins
    if (isExtension) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(isExtension ? 204 : 403);
      res.end();
      return;
    }

    const isPairing = path.startsWith('/pair/');
    if (this.isRateLimited(isPairing ? 'pair' : path, isPairing ? PAIR_RATE_LIMIT : RATE_LIMIT)) {
      this.send(res, 429, { error: 'Too many requests' });
      return;
    }

    if (req.method === 'GET' && path === '/status') {
      this.send(res, 200, {
        status: 'ok',
        tracking: Boolean(this.activityTracker?.isTracking),
        paired: this.isAuthorized(req)
      });
      return;
    }

    if (req.method !== 'POST' || !(path in MAX_BODY)) {
      this.send(res, 404, { error: 'Not found' });
      return;
    }

    if (!isExtension) {
      this.send(res, 403, { error: 'Forbidden: extension origin required' });
      return;
    }

    let body;
    try {
      body = await this.readJson(req, MAX_BODY[path]);
    } catch (error) {
      if (error.status === 413) {
        res.writeHead(413, { 'Content-Type': 'application/json', 'Connection': 'close' });
        res.end(JSON.stringify({ error: error.message }), () => req.destroy());
        return;
      }
      this.send(res, error.status || 400, { error: error.message });
      return;
    }

    try {
      if (path === '/pair/start') {
        const { pairingId, expiresAt } = this.pairing.start(origin);
        this.log.info('Browser extension pairing started');
        this.send(res, 200, { pairingId, expiresAt });
        return;
      }

      if (path === '/pair/complete') {
        const pairingId = typeof body?.pairingId === 'string' ? body.pairingId : '';
        const code = typeof body?.code === 'string' ? body.code.replace(/\s/g, '') : '';
        const token = this.pairing.complete(pairingId, code, origin);
        this.log.info('Browser extension paired');
        this.send(res, 200, { token });
        return;
      }

      if (!this.isAuthorized(req)) {
        this.send(res, 401, { error: 'Unauthorized: pair the extension with LightTrack' });
        return;
      }

      if (path === '/browser-activity') {
        const { value, error } = validateBrowserActivity(body);
        if (error) {
          this.send(res, 400, { error });
          return;
        }
        this.activityTracker?.processBrowserActivity?.(value);
        this.send(res, 200, { success: true });
        return;
      }

      if (path === '/page-context') {
        const { value, error } = validatePageContext(body);
        if (error) {
          this.send(res, 400, { error });
          return;
        }
        this.activityTracker?.processPageContext?.(value);
        this.send(res, 200, { success: true });
      }
    } catch (error) {
      if (error instanceof PairingError) {
        this.send(res, error.status, { error: error.message });
        return;
      }
      this.log.error('Browser extension request failed:', error.name);
      this.send(res, 500, { error: 'Internal error' });
    }
  }

  start() {
    if (this.isRunning) return Promise.resolve();
    this.server = http.createServer((req, res) => {
      this.handle(req, res).catch(() => this.send(res, 500, { error: 'Internal error' }));
    });
    return new Promise(resolve => {
      this.server.on('error', err => {
        if (err.code === 'EADDRINUSE') {
          this.log.error(`Port ${this.port} is already in use. Browser extension server not started.`);
        } else {
          this.log.error('Browser extension server error:', err.code || err.name);
        }
        resolve();
      });
      this.server.listen(this.port, '127.0.0.1', () => {
        this.isRunning = true;
        this.log.info(`Browser extension server listening on http://127.0.0.1:${this.server.address().port}`);
        resolve();
      });
    });
  }

  /** Port actually bound (useful when started on port 0 in tests). */
  boundPort() {
    return this.server?.address()?.port;
  }

  stop() {
    if (!this.server) return Promise.resolve();
    return new Promise(resolve => {
      this.server.close(() => {
        this.isRunning = false;
        resolve();
      });
    });
  }
}

module.exports = BrowserExtensionServer;
