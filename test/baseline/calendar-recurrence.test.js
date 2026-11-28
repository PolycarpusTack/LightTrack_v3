/**
 * C-8: a recurring meeting appears on every day it recurs (EXDATE and moved occurrences
 * honoured, in the event's own timezone), and subjects are stored as plain text.
 */
const ical = require('node-ical');
const CalendarSyncService = require('../../src/main/integrations/calendar/calendar-sync-service');

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
  return new CalendarSyncService(store, safeStorage);
}

const calendar = (...lines) => ical.sync.parseICS(['BEGIN:VCALENDAR', 'VERSION:2.0', ...lines, 'END:VCALENDAR'].join('\r\n'));

const icsTime = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

describe('calendar recurrence (C-8)', () => {
  afterEach(() => jest.restoreAllMocks());

  test('calendar recurrence: a weekly Brussels meeting, with one day cancelled and one moved', () => {
    const events = calendar(
      'BEGIN:VEVENT', 'UID:weekly-1', "SUMMARY:O'Brien / Q4 sync",
      'DTSTART;TZID=Romance Standard Time:20260929T090000', 'DTEND;TZID=Romance Standard Time:20260929T093000',
      'RRULE:FREQ=WEEKLY', 'EXDATE;TZID=Romance Standard Time:20261117T090000',
      'END:VEVENT',
      'BEGIN:VEVENT', 'UID:weekly-1', 'RECURRENCE-ID;TZID=Romance Standard Time:20261124T090000', 'SUMMARY:Moved sync',
      'DTSTART;TZID=Romance Standard Time:20261124T140000', 'DTEND;TZID=Romance Standard Time:20261124T150000',
      'END:VEVENT'
    );
    const meetings = service().parseEventsToMeetings(events, new Date('2026-11-01T00:00:00Z'), new Date('2026-12-10T00:00:00Z'));

    // 09:00 Paris time is 08:00 UTC in winter (the series started in summer time, at 07:00 UTC)
    expect(meetings.map(m => [m.startTime, m.duration, m.subject])).toEqual([
      ['2026-11-03T08:00:00.000Z', 30, "O'Brien / Q4 sync"],
      ['2026-11-10T08:00:00.000Z', 30, "O'Brien / Q4 sync"],
      ['2026-11-24T13:00:00.000Z', 60, 'Moved sync'],
      ['2026-12-01T08:00:00.000Z', 30, "O'Brien / Q4 sync"],
      ['2026-12-08T08:00:00.000Z', 30, "O'Brien / Q4 sync"]
    ]);
    expect(new Set(meetings.map(m => m.id)).size).toBe(meetings.length);
    for (const m of meetings) expect(m.id.length).toBeLessThanOrEqual(200);
  });

  test('calendar recurrence: a weekly meeting created 60 days ago is listed this week after a sync', async () => {
    const first = new Date(Date.now() - 60 * 86400000);
    first.setUTCSeconds(0, 0);
    const events = calendar(
      'BEGIN:VEVENT', 'UID:weekly-utc', 'SUMMARY:Standup',
      `DTSTART:${icsTime(first)}`, `DTEND:${icsTime(new Date(first.getTime() + 45 * 60000))}`, 'RRULE:FREQ=WEEKLY',
      'END:VEVENT'
    );
    jest.spyOn(ical.async, 'fromURL').mockImplementation((url, options, done) => done(null, events));
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const calendarService = service();
    calendarService.readUrl = () => 'https://calendar.example.test/feed.ics';

    const result = await calendarService.syncCalendar();
    expect(result.success).toBe(true);
    const week = calendarService.getMeetings().filter(m => {
      const start = Date.parse(m.startTime);
      return start > Date.now() - 7 * 86400000 && start <= Date.now();
    });
    expect(week).toHaveLength(1);
    expect(week[0]).toMatchObject({ subject: 'Standup', duration: 45 });
  });

  test('calendar recurrence: subjects are plain text without control characters', () => {
    const start = new Date('2026-11-27T10:00:00Z');
    const meetings = service().parseEventsToMeetings({
      a: { type: 'VEVENT', summary: "O'Brien\u0007 / <Q4> \"sync\"", location: 'Room 1/2', description: 'Line one\nLine two\u0000', start, end: new Date(start.getTime() + 3600000) }
    }, new Date('2026-11-27T00:00:00Z'), new Date('2026-11-28T00:00:00Z'));
    expect(meetings[0]).toMatchObject({ subject: "O'Brien / <Q4> \"sync\"", location: 'Room 1/2', description: 'Line one\nLine two' });
  });

  test('calendar recurrence: a meeting rule matches the subject as shown', () => {
    const calendarService = service();
    calendarService.store.set('meetingMappings', { "O'Brien / Q4": 'Client Q4' });
    const start = new Date('2026-11-27T10:00:00Z');
    const [meeting] = calendarService.parseEventsToMeetings({
      a: { type: 'VEVENT', summary: "O'Brien / Q4 sync", start, end: new Date(start.getTime() + 3600000) }
    }, new Date('2026-11-27T00:00:00Z'), new Date('2026-11-28T00:00:00Z'));
    expect(calendarService.matchMeetingToProject(meeting)?.project).toBe('Client Q4');
    expect(calendarService.meetingToActivity(meeting).title).toBe("O'Brien / Q4 sync");
  });

  test('calendar recurrence: a rule that repeats every minute is capped', () => {
    const events = calendar(
      'BEGIN:VEVENT', 'UID:noisy', 'SUMMARY:Noisy',
      'DTSTART:20261101T000000Z', 'DTEND:20261101T000100Z', 'RRULE:FREQ=MINUTELY',
      'END:VEVENT'
    );
    const meetings = service().parseEventsToMeetings(events, new Date('2026-11-01T00:00:00Z'), new Date('2026-11-20T00:00:00Z'));
    expect(meetings.length).toBeGreaterThan(0);
    expect(meetings.length).toBeLessThanOrEqual(500);
  });
});
