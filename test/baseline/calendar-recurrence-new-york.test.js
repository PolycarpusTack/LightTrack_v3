/**
 * @jest-environment ./test/baseline/tz-new-york-environment.js
 *
 * C-8: a zoned series gives the same instants whatever the machine's own timezone.
 * rrule's zoned output shifts with it; CI runs in UTC and the owner in Brussels.
 */
const ical = require('node-ical');
const CalendarSyncService = require('../../src/main/integrations/calendar/calendar-sync-service');

describe('calendar recurrence west of UTC (C-8)', () => {
  test('calendar recurrence: a Paris series on a New York machine', () => {
    expect(new Date(2026, 10, 27).getTimezoneOffset()).toBe(300);
    const events = ical.sync.parseICS([
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:weekly-1', 'SUMMARY:Sync',
      'DTSTART;TZID=Romance Standard Time:20260929T090000', 'DTEND;TZID=Romance Standard Time:20260929T093000',
      'RRULE:FREQ=WEEKLY', 'EXDATE;TZID=Romance Standard Time:20261110T090000',
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n'));
    const store = { get: (key, fallback) => fallback, set() {}, delete() {} };
    const safeStorage = { isEncryptionAvailable: () => false };
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const meetings = new CalendarSyncService(store, safeStorage)
      .parseEventsToMeetings(events, new Date('2026-11-01T00:00:00Z'), new Date('2026-11-20T00:00:00Z'));
    expect(meetings.map(m => m.startTime)).toEqual(['2026-11-03T08:00:00.000Z', '2026-11-17T08:00:00.000Z']);
  });
});
