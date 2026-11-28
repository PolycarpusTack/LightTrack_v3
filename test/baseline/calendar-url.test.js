/**
 * C-7: the calendar feed URL carries a private token, so nothing logged may contain its
 * path; and an IPv6 loopback, link-local, unique-local or mapped private address is
 * refused like its IPv4 form.
 */
jest.mock('node-ical', () => ({ async: { fromURL: (url, options, done) => done(null, {}) } }));

const CalendarSyncService = require('../../src/main/integrations/calendar/calendar-sync-service');

const FEED_URL = 'https://outlook.office365.com/owa/calendar/abc/feed-id-4711/calendar.ics';

// setCalendarUrl starts the 30-minute auto-sync; each test stops it again
const services = [];

function service() {
  const data = {};
  const store = {
    get: (key, fallback) => (key in data ? data[key] : fallback),
    set: (key, value) => { data[key] = value; },
    delete: key => { delete data[key]; }
  };
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: text => Buffer.from(`enc:${text}`, 'utf8'),
    decryptString: buf => Buffer.from(buf).toString('utf8').slice(4)
  };
  const created = new CalendarSyncService(store, safeStorage);
  services.push(created);
  return created;
}

describe('calendar url (C-7)', () => {
  let logged;
  beforeEach(() => {
    logged = [];
    for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
      jest.spyOn(console, level).mockImplementation((...args) => logged.push(args.map(String).join(' ')));
    }
  });
  afterEach(() => {
    jest.restoreAllMocks();
    services.splice(0).forEach(s => s.stopAutoSync());
  });

  test('calendar url: a sync logs the host, never the path or token', async () => {
    const calendar = service();
    const result = await calendar.setCalendarUrl(FEED_URL);
    expect(result.success).toBe(true);
    expect(logged.join('\n')).not.toContain('feed-id-4711');
    expect(logged.join('\n')).not.toContain('/owa/calendar');
  });

  test('calendar url: a failed sync logs no token either', async () => {
    const ical = require('node-ical');
    jest.spyOn(ical.async, 'fromURL').mockImplementation((url, options, done) => done(new Error(`getaddrinfo ENOTFOUND for ${url}`)));
    const calendar = service();
    const result = await calendar.setCalendarUrl(FEED_URL);
    expect(result.success).toBe(false);
    expect(logged.join('\n')).not.toContain('feed-id-4711');
  });

  test.each([
    'https://[::1]/cal.ics',
    'https://[fe80::1]/cal.ics',
    'https://[fc00::5]/cal.ics',
    'https://[fd12:3456::1]/cal.ics',
    'https://[::ffff:127.0.0.1]/cal.ics',
    'https://[::ffff:192.168.1.10]/cal.ics',
    'https://[::]/cal.ics'
  ])('calendar url: %s is refused', url => {
    expect(service().validateUrl(url).valid).toBe(false);
  });

  test('calendar url: a public IPv6 or IPv4 address and a host name are allowed', () => {
    const calendar = service();
    expect(calendar.validateUrl('https://[2001:db8::1]/cal.ics').valid).toBe(true);
    expect(calendar.validateUrl('https://93.184.216.34/cal.ics').valid).toBe(true);
    expect(calendar.validateUrl(FEED_URL).valid).toBe(true);
    expect(calendar.validateUrl('https://10.0.0.1/cal.ics').valid).toBe(false);
  });
});
