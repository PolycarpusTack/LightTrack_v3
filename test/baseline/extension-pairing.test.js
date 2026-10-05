/**
 * LT3-004: browser-extension pairing, payload validation and the HTTP endpoint.
 */
const http = require('http');
const { ExtensionPairing, PairingError, CODE_TTL_MS, MAX_ATTEMPTS, STORE_KEY } =
  require('../../src/main/integrations/browser/extension-pairing');
const { validateBrowserActivity, validatePageContext } =
  require('../../src/main/integrations/browser/extension-payloads');
const BrowserExtensionServer = require('../../src/main/core/browser-extension-server');

const ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
const OTHER_ORIGIN = 'chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba';

function memoryStore() {
  const data = {};
  return { data, get: (k, d) => (k in data ? data[k] : d), set: (k, v) => { data[k] = v; } };
}

function setup(now = () => Date.now()) {
  const store = memoryStore();
  const shown = [];
  const pairing = new ExtensionPairing({ store, now, showCode: (code, id) => shown.push({ code, id }) });
  return { store, shown, pairing };
}

describe('pairing', () => {
  test('issues a token only for the code shown on the desktop', () => {
    const { pairing, shown, store } = setup();
    const { pairingId } = pairing.start(ORIGIN);
    expect(shown).toHaveLength(1);
    expect(shown[0].code).toMatch(/^\d{6}$/);

    const token = pairing.complete(pairingId, shown[0].code, ORIGIN);
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(pairing.verify(token, ORIGIN)).toBe(true);
    // Only a hash is stored.
    expect(JSON.stringify(store.data[STORE_KEY])).not.toContain(token);
  });

  test('a code works once (no replay)', () => {
    const { pairing, shown } = setup();
    const { pairingId } = pairing.start(ORIGIN);
    pairing.complete(pairingId, shown[0].code, ORIGIN);
    expect(() => pairing.complete(pairingId, shown[0].code, ORIGIN)).toThrow(PairingError);
  });

  test(`a pairing is dropped after ${MAX_ATTEMPTS} wrong codes`, () => {
    const { pairing, shown } = setup();
    const { pairingId } = pairing.start(ORIGIN);
    const wrong = shown[0].code === '000000' ? '000001' : '000000';
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      expect(() => pairing.complete(pairingId, wrong, ORIGIN)).toThrow('Incorrect code');
    }
    expect(() => pairing.complete(pairingId, shown[0].code, ORIGIN)).toThrow('not found or expired');
  });

  test('codes expire', () => {
    let t = 1_000_000;
    const { pairing, shown } = setup(() => t);
    const { pairingId } = pairing.start(ORIGIN);
    t += CODE_TTL_MS + 1;
    expect(() => pairing.complete(pairingId, shown[0].code, ORIGIN)).toThrow('not found or expired');
  });

  test('tokens are bound to the extension origin and can be revoked', () => {
    const { pairing, shown } = setup();
    const { pairingId } = pairing.start(ORIGIN);
    expect(() => pairing.complete(pairingId, shown[0].code, OTHER_ORIGIN)).toThrow(PairingError);

    const second = pairing.start(ORIGIN);
    const token = pairing.complete(second.pairingId, shown[1].code, ORIGIN);
    expect(pairing.verify(token, OTHER_ORIGIN)).toBe(false);
    expect(pairing.verify('not-a-token', ORIGIN)).toBe(false);

    pairing.revokeAll();
    expect(pairing.verify(token, ORIGIN)).toBe(false);
    expect(pairing.pairedCount()).toBe(0);
  });

  test('cancel (Deny) removes the pending pairing', () => {
    const { pairing, shown } = setup();
    const { pairingId } = pairing.start(ORIGIN);
    pairing.cancel(pairingId);
    expect(() => pairing.complete(pairingId, shown[0].code, ORIGIN)).toThrow('not found or expired');
  });
});

describe('payload validation', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');

  test('browser activity: http(s) URL and string title required', () => {
    expect(validateBrowserActivity({ url: 'javascript:alert(1)', title: 'x' }, now).error).toMatch(/url/);
    expect(validateBrowserActivity({ url: 'https://example.com', title: 42 }, now).error).toMatch(/title/);
    expect(validateBrowserActivity([], now).error).toBeTruthy();
  });

  test('browser activity: timestamps outside a day of now use server time', () => {
    const ok = validateBrowserActivity({ url: 'https://example.com/a', title: 't', timestamp: '2026-10-05T11:59:00Z' }, now);
    expect(ok.value.timestamp).toBe('2026-10-05T11:59:00.000Z');
    const far = validateBrowserActivity({ url: 'https://example.com/a', title: 't', timestamp: '1999-01-01T00:00:00Z' }, now);
    expect(far.value.timestamp).toBe(new Date(now).toISOString());
    const junk = validateBrowserActivity({ url: 'https://example.com/a', title: 't', timestamp: { evil: true } }, now);
    expect(junk.value.timestamp).toBe(new Date(now).toISOString());
  });

  test('page context: Jira keys must look like Jira keys; unknown types rejected', () => {
    expect(validatePageContext({ url: 'https://x.atlassian.net/browse/ABC-1', type: 'jira', data: { issueKey: 'ABC-1' } }).value.data.projectKey).toBe('ABC');
    expect(validatePageContext({ url: 'https://x', type: 'jira', data: { issueKey: '<script>' } }).error).toBeTruthy();
    expect(validatePageContext({ url: 'https://x', type: 'other', data: {} }).error).toBeTruthy();
  });
});

describe('HTTP endpoint', () => {
  let server;
  let port;
  let tracker;
  let ctx;

  beforeEach(async () => {
    ctx = setup();
    tracker = { isTracking: true, processBrowserActivity: jest.fn(), processPageContext: jest.fn() };
    const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    server = new BrowserExtensionServer(tracker, null, { pairing: ctx.pairing, port: 0, log });
    await server.start();
    port = server.boundPort();
  });

  afterEach(async () => { await server.stop(); });

  function request(method, path, { headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, method, path, headers }, res => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, json: data ? JSON.parse(data) : null }));
      });
      req.on('error', reject);
      if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
      req.end();
    });
  }

  const json = (extra = {}) => ({ 'Content-Type': 'application/json', Origin: ORIGIN, ...extra });

  async function pair() {
    const start = await request('POST', '/pair/start', { headers: json(), body: {} });
    const code = ctx.shown[ctx.shown.length - 1].code;
    const done = await request('POST', '/pair/complete', { headers: json(), body: { pairingId: start.json.pairingId, code } });
    return done.json.token;
  }

  test('/status never hands out a token', async () => {
    const res = await request('GET', '/status', { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ status: 'ok', tracking: true, paired: false });
  });

  test('pairing over HTTP, then authenticated activity is accepted', async () => {
    const token = await pair();
    const status = await request('GET', '/status', { headers: { Origin: ORIGIN, Authorization: `Bearer ${token}` } });
    expect(status.json.paired).toBe(true);

    const res = await request('POST', '/browser-activity', {
      headers: json({ Authorization: `Bearer ${token}` }),
      body: { url: 'https://example.com/page', title: 'Example' }
    });
    expect(res.status).toBe(200);
    expect(tracker.processBrowserActivity).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://example.com/page' }));
  });

  test('rejects unpaired, wrong-origin and web-page callers', async () => {
    const body = { url: 'https://example.com', title: 'x' };
    expect((await request('POST', '/browser-activity', { headers: json(), body })).status).toBe(401);

    const token = await pair();
    const otherOrigin = await request('POST', '/browser-activity', {
      headers: json({ Origin: OTHER_ORIGIN, Authorization: `Bearer ${token}` }), body
    });
    expect(otherOrigin.status).toBe(401);

    const web = await request('POST', '/pair/start', { headers: json({ Origin: 'https://evil.example' }), body: {} });
    expect(web.status).toBe(403);
    expect(web.headers['access-control-allow-origin']).toBeUndefined();

    const noOrigin = await request('POST', '/pair/start', { headers: { 'Content-Type': 'application/json' }, body: {} });
    expect(noOrigin.status).toBe(403);

    const preflight = await request('OPTIONS', '/browser-activity', { headers: { Origin: 'https://evil.example' } });
    expect(preflight.status).toBe(403);
    expect(tracker.processBrowserActivity).not.toHaveBeenCalled();
  });

  test('requires JSON, validates the schema and limits size', async () => {
    const token = await pair();
    const auth = { Authorization: `Bearer ${token}` };

    const text = await request('POST', '/browser-activity', {
      headers: { 'Content-Type': 'text/plain', Origin: ORIGIN, ...auth }, body: '{"url":"https://x","title":"t"}'
    });
    expect(text.status).toBe(415);

    const bad = await request('POST', '/browser-activity', { headers: json(auth), body: { url: 'file:///c:/secret', title: 't' } });
    expect(bad.status).toBe(400);

    const big = await request('POST', '/browser-activity', { headers: json(auth), body: { url: 'https://x', title: 'a'.repeat(20000) } });
    expect(big.status).toBe(413);
    expect(tracker.processBrowserActivity).not.toHaveBeenCalled();
  });

  test('does not log titles, URLs or tokens', async () => {
    const token = await pair();
    await request('POST', '/browser-activity', {
      headers: json({ Authorization: `Bearer ${token}` }),
      body: { url: 'https://secret.example/path', title: 'Secret Title' }
    });
    const logged = JSON.stringify([server.log.info.mock.calls, server.log.warn.mock.calls, server.log.error.mock.calls]);
    expect(logged).not.toMatch(/secret\.example|Secret Title/);
    expect(logged).not.toContain(token);
  });
});
