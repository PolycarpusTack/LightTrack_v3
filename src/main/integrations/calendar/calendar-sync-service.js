/**
 * CalendarSyncService - ICS Calendar Subscription for Outlook/Exchange
 * Fetches and parses ICS calendar feeds to sync meetings into LightTrack
 */

const ical = require('node-ical');
const { protect, unprotect, maskUrl } = require('../../core/protected-value');
const {
  CALENDAR_SYNC_INTERVAL_MS,
  FETCH_TIMEOUT_MS
} = require('../../../shared/constants');

// Private IPv4 ranges to block for SSRF protection
const PRIVATE_IPV4_PATTERNS = [
  /^127\./,                      // Loopback
  /^10\./,                       // Class A private
  /^172\.(1[6-9]|2\d|3[01])\./,  // Class B private
  /^192\.168\./,                 // Class C private
  /^169\.254\./,                 // Link-local
  /^0\./                         // Current network
];

const isPrivateIPv4 = address => PRIVATE_IPV4_PATTERNS.some(pattern => pattern.test(address));

/**
 * Loopback, unspecified, link-local (fe80::/10), unique-local (fc00::/7), and IPv4-mapped
 * private addresses. The URL parser writes a mapped address in hex (::ffff:7f00:1) (C-7).
 */
function isPrivateIPv6(address) {
  const a = address.toLowerCase();
  if (a === '::' || a === '::1') return true;
  const dotted = a.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) return isPrivateIPv4(dotted[1]);
  const hex = a.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return isPrivateIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return /^fe[89ab][0-9a-f]:/.test(a) || /^f[cd][0-9a-f]{2}:/.test(a);
}

/** An error message with the feed URL replaced by its masked form, for logs (C-7). */
function withoutUrl(message, ...urls) {
  let text = String(message || '');
  for (const url of urls) if (url) text = text.split(url).join(maskUrl(url));
  return text;
}

// A rule such as FREQ=MINUTELY would otherwise list thousands of meetings (C-8)
const MAX_OCCURRENCES_PER_EVENT = 500;
const DAY_MS = 86400000;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f]/g;
// eslint-disable-next-line no-control-regex
const LINE_BREAKS = /[\t\n\r]+/g;

/** Offset of a timezone from UTC at an instant, in milliseconds. */
function zoneOffsetMs(instantMs, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(instantMs));
  const get = type => Number(parts.find(p => p.type === type).value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - instantMs;
}

/**
 * A wall-clock time labelled as UTC (09:00 Paris as 09:00Z) to the real instant in that
 * zone (C-8).
 */
function wallClockToInstant(wallClock, timeZone) {
  const target = wallClock.getTime();
  let instant = target;
  for (let i = 0; i < 2; i++) instant = target - zoneOffsetMs(instant, timeZone);
  return new Date(instant);
}

// The ICS URL usually embeds a private feed token, so it is stored protected (LT3-008).
const URL_KEY = 'settings.calendarIcsUrlProtected';
const LEGACY_URL_KEY = 'settings.calendarIcsUrl';

class CalendarSyncService {
  constructor(store, safeStorage = require('electron').safeStorage) {
    this.store = store;
    this.safeStorage = safeStorage;
    this.migrateLegacyUrl();
    this.syncInterval = null;
    this.syncIntervalMs = CALENDAR_SYNC_INTERVAL_MS;

    // Regex cache for meeting mappings
    this.regexCache = new Map();
  }

  /**
   * Validate URL for security (SSRF protection)
   * @param {string} url - URL to validate
   * @returns {{valid: boolean, error?: string, sanitizedUrl?: string}}
   */
  validateUrl(url) {
    try {
      const parsed = new URL(url);

      // Only allow https:// and webcal:// schemes
      const allowedSchemes = ['https:', 'webcal:'];
      if (!allowedSchemes.includes(parsed.protocol)) {
        return { valid: false, error: 'Invalid URL scheme. Only HTTPS and webcal:// are allowed.' };
      }

      // Block private/internal hostnames
      const hostname = parsed.hostname.toLowerCase();
      if (hostname === 'localhost' || hostname === 'local' || hostname.endsWith('.local')) {
        return { valid: false, error: 'Cannot use localhost or local network addresses.' };
      }

      // An IP address: IPv4 as is, IPv6 without its brackets (C-7)
      const isIPv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
      const ipv6 = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : null;
      if ((isIPv4 && isPrivateIPv4(hostname)) || (ipv6 && isPrivateIPv6(ipv6))) {
        return { valid: false, error: 'Cannot use private or internal IP addresses.' };
      }

      // Convert webcal to https
      const sanitizedUrl = url.replace('webcal://', 'https://');

      return { valid: true, sanitizedUrl };
    } catch (e) {
      return { valid: false, error: 'Invalid URL format.' };
    }
  }

  /**
   * Plain text from an ICS field, with control characters removed (C-8). The window
   * escapes it when it shows it; storing HTML entities made "O'Brien" show as
   * "O&#x27;Brien" and kept meeting rules from matching.
   * @param {string} str - Text from the feed
   * @param {number} maxLength - Maximum length
   * @param {{multiline?: boolean}} [options] - Keep line breaks (descriptions)
   * @returns {string} Plain text
   */
  sanitizeString(str, maxLength = 500, { multiline = false } = {}) {
    if (typeof str !== 'string') return '';
    let text = str.replace(CONTROL_CHARS, '');
    text = multiline ? text.replace(/\r\n?/g, '\n') : text.replace(LINE_BREAKS, ' ');
    return text.trim().slice(0, maxLength);
  }

  /**
   * Check if a regex pattern is safe from ReDoS
   * @param {string} pattern - Regex pattern
   * @returns {boolean}
   */
  isSafeRegex(pattern) {
    if (pattern.length > 200) return false;
    // Detect nested quantifiers
    if (/\([^)]*[+*][^)]*\)[+*?]|\([^)]*[+*?][^)]*\)\{/.test(pattern)) return false;
    // Detect excessive quantifier nesting
    if (/(\+|\*|\?|\{[^}]+\}){2,}/.test(pattern)) return false;
    return true;
  }

  /**
   * Get cached regex or compile and cache it
   * @param {string} pattern - Regex pattern
   * @returns {RegExp|null}
   */
  getCachedRegex(pattern) {
    if (this.regexCache.has(pattern)) {
      return this.regexCache.get(pattern);
    }

    if (!this.isSafeRegex(pattern)) {
      console.warn(`Skipping unsafe regex pattern: ${pattern}`);
      return null;
    }

    try {
      const regex = new RegExp(pattern, 'i');
      this.regexCache.set(pattern, regex);
      return regex;
    } catch (e) {
      console.warn(`Invalid regex pattern: ${pattern}`);
      return null;
    }
  }

  /**
   * Move a plain-text URL from older versions into protected storage.
   * If data protection is unavailable the plain value is left in place.
   */
  migrateLegacyUrl() {
    const legacy = this.store.get(LEGACY_URL_KEY);
    if (!legacy) return;
    try {
      this.store.set(URL_KEY, protect(this.safeStorage, legacy));
      this.store.delete(LEGACY_URL_KEY);
    } catch (error) {
      console.warn('Calendar URL left unmigrated:', error.message);
    }
  }

  /** The stored URL in clear text, for use inside the main process only. */
  readUrl() {
    return unprotect(this.safeStorage, this.store.get(URL_KEY)) || this.store.get(LEGACY_URL_KEY, '');
  }

  /**
   * Initialize the service and start auto-sync if URL is configured
   */
  initialize() {
    const calendarUrl = this.readUrl();
    if (calendarUrl) {
      // Initial sync on startup
      this.syncCalendar().catch(err => {
        console.error('Initial calendar sync failed:', err.message);
      });
      // Start periodic sync
      this.startAutoSync();
    }
    console.log('CalendarSyncService initialized');
  }

  /**
   * Start automatic sync every 30 minutes
   */
  startAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    this.syncInterval = setInterval(() => {
      this.syncCalendar().catch(err => {
        console.error('Auto calendar sync failed:', err.message);
      });
    }, this.syncIntervalMs);
    console.log('Calendar auto-sync started (every 30 minutes)');
  }

  /**
   * Stop automatic sync
   */
  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('Calendar auto-sync stopped');
    }
  }

  /**
   * Set calendar ICS URL and trigger sync
   * @param {string} url - The ICS calendar URL
   * @returns {Promise<Object>} Sync result
   */
  async setCalendarUrl(url) {
    if (!url) {
      this.store.delete(URL_KEY);
      this.store.delete(LEGACY_URL_KEY);
      this.stopAutoSync();
      this.store.set('calendarMeetings', []);
      return { success: true, message: 'Calendar URL cleared' };
    }

    // Validate URL for security (SSRF protection)
    const validation = this.validateUrl(url);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Validate it's an ICS URL (basic check)
    if (!url.includes('.ics') && !url.includes('calendar') && !url.includes('webcal')) {
      console.warn('URL may not be a valid ICS feed:', maskUrl(url));
    }

    // Store the validated URL, protected
    try {
      this.store.set(URL_KEY, protect(this.safeStorage, validation.sanitizedUrl));
      this.store.delete(LEGACY_URL_KEY);
    } catch (error) {
      return { success: false, error: error.message };
    }

    // Try to sync
    const result = await this.syncCalendar();

    if (result.success) {
      this.startAutoSync();
    }

    return result;
  }

  /**
   * Get a masked form of the configured URL for display (never the full URL).
   * @returns {string} e.g. "https://outlook.office365.com/…", or '' when not configured
   */
  getCalendarUrl() {
    return maskUrl(this.readUrl());
  }

  /**
   * Sync calendar from configured ICS URL
   * @returns {Promise<Object>} Sync result with meeting count
   */
  async syncCalendar() {
    const url = this.readUrl();

    if (!url) {
      return { success: false, error: 'No calendar URL configured' };
    }

    // Re-validate URL before fetching (in case stored URL is compromised)
    const validation = this.validateUrl(url);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      // The path carries the feed token: log the host only (C-7)
      console.log('Syncing calendar from:', maskUrl(validation.sanitizedUrl));

      // Fetch and parse ICS with timeout
      const events = await this.fetchIcsEvents(validation.sanitizedUrl);

      // Filter to relevant time range (past week to 2 weeks ahead)
      const now = new Date();
      const startRange = new Date(now);
      startRange.setDate(startRange.getDate() - 7); // 1 week ago
      const endRange = new Date(now);
      endRange.setDate(endRange.getDate() + 14); // 2 weeks ahead

      const meetings = this.parseEventsToMeetings(events, startRange, endRange);

      // Store meetings
      this.store.set('calendarMeetings', meetings);
      this.store.set('calendarLastSync', now.toISOString());

      console.log(`Calendar sync complete: ${meetings.length} meetings`);

      return {
        success: true,
        meetingCount: meetings.length,
        lastSync: now.toISOString()
      };
    } catch (error) {
      const message = withoutUrl(error?.message, url, validation.sanitizedUrl);
      console.error('Calendar sync error:', message);
      return {
        success: false,
        error: message || 'Failed to sync calendar'
      };
    }
  }

  /**
   * Fetch and parse ICS from URL with timeout
   * @param {string} url - ICS URL (already validated and sanitized)
   * @returns {Promise<Object>} Parsed events
   */
  async fetchIcsEvents(url) {
    // Create fetch promise
    const fetchPromise = new Promise((resolve, reject) => {
      ical.async.fromURL(url, {}, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });

    // Create timeout promise
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Calendar fetch timed out after ${FETCH_TIMEOUT_MS / 1000} seconds`));
      }, FETCH_TIMEOUT_MS);
    });

    // Race between fetch and timeout; the timer is cleared either way
    try {
      return await Promise.race([fetchPromise, timeoutPromise]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Parse ICS events to meeting objects
   * @param {Object} events - Parsed ICS events
   * @param {Date} startRange - Start of date range
   * @param {Date} endRange - End of date range
   * @returns {Array} Meeting objects
   */
  parseEventsToMeetings(events, startRange, endRange) {
    const meetings = [];

    for (const [uid, event] of Object.entries(events || {})) {
      // Skip non-event items (like VTIMEZONE)
      if (!event || event.type !== 'VEVENT') continue;
      // A moved occurrence is listed through its series (event.recurrences)
      if (event.recurrenceid && events[event.uid] && events[event.uid] !== event) continue;

      for (const occurrence of this.occurrencesOf(uid, event, startRange, endRange)) {
        meetings.push(this.toMeeting(occurrence));
      }
    }

    // Sort by start time
    meetings.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    return meetings;
  }

  /**
   * The occurrences of an event that overlap the range. A recurring event is expanded
   * with its RRULE, skipping EXDATEs and using moved occurrences (RECURRENCE-ID) (C-8).
   * @returns {Array<{id: string, event: Object, startTime: Date, endTime: Date}>}
   */
  occurrencesOf(uid, event, startRange, endRange) {
    const startTime = this.normalizeToUtc(event.start);
    const endTime = this.normalizeToUtc(event.end) || startTime;
    if (!startTime) return [];
    const inRange = (start, end) => start <= endRange && end >= startRange;

    if (!event.rrule || typeof event.rrule.between !== 'function') {
      return inRange(startTime, endTime) ? [{ id: uid, event, startTime, endTime }] : [];
    }

    const lengthMs = Math.max(0, endTime - startTime);
    const timeZone = event.rrule.options?.tzid || null;
    // For a zoned series, rrule's own output shifts with the machine's timezone. A copy
    // without the zone gives plain wall-clock times, which toInstant converts.
    const rule = timeZone ? new event.rrule.constructor({ ...event.rrule.origOptions, tzid: null }) : event.rrule;
    const toInstant = date => {
      if (!timeZone) return date;
      try {
        return wallClockToInstant(date, timeZone);
      } catch {
        return date; // unknown zone: keep the time as given
      }
    };
    const baseId = this.sanitizeString(String(uid), 170);

    // Widen by a day and the event's length: the wall-clock dates rrule works with can be
    // up to a day away from the real instants
    const found = [];
    rule.between(
      new Date(startRange.getTime() - lengthMs - DAY_MS), new Date(endRange.getTime() + DAY_MS), true,
      (date, i) => i < MAX_OCCURRENCES_PER_EVENT && Boolean(found.push(date))
    );

    const occurrences = [];
    for (const date of found) {
      const start = toInstant(date);
      const key = start.toISOString().slice(0, 10);
      if (event.exdate && event.exdate[key]) continue;

      const moved = event.recurrences && event.recurrences[key];
      if (moved) {
        if (String(moved.status || '').toUpperCase() === 'CANCELLED') continue;
        const movedStart = this.normalizeToUtc(moved.start) || start;
        const movedEnd = this.normalizeToUtc(moved.end) || new Date(movedStart.getTime() + lengthMs);
        if (inRange(movedStart, movedEnd)) {
          occurrences.push({ id: `${baseId}|${movedStart.toISOString()}`, event: { ...event, ...moved }, startTime: movedStart, endTime: movedEnd });
        }
        continue;
      }

      const end = new Date(start.getTime() + lengthMs);
      if (inRange(start, end)) occurrences.push({ id: `${baseId}|${start.toISOString()}`, event, startTime: start, endTime: end });
    }
    return occurrences;
  }

  /** One stored meeting. Text fields are plain text; the window escapes them. */
  toMeeting({ id, event, startTime, endTime }) {
    const isAllDay = event.start && event.start.dateOnly === true;
    const subject = this.sanitizeString(event.summary, 200) || 'No Subject';
    const description = this.sanitizeString(event.description, 2000, { multiline: true });
    const location = this.sanitizeString(event.location, 200);

    const durationMs = endTime - startTime;
    const duration = (isNaN(durationMs) || durationMs < 0) ? 0 : Math.round(durationMs / (1000 * 60));

    return {
      id: this.sanitizeString(String(id), 200),
      subject,
      description,
      location,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      startTimeLocal: this.formatLocalTime(startTime),
      endTimeLocal: this.formatLocalTime(endTime),
      duration, // minutes
      isAllDay,
      organizer: this.parseOrganizer(event.organizer),
      attendees: this.parseAttendees(event.attendee),
      status: this.sanitizeString(event.status, 50) || 'CONFIRMED',
      categories: Array.isArray(event.categories) ? event.categories.slice(0, 10).map(c => this.sanitizeString(c, 50)) : [],
      // For matching with project mappings
      searchText: `${subject} ${description} ${location}`.toLowerCase()
    };
  }

  /**
   * Normalize date to UTC, handling timezone info
   * @param {Date|Object} dateValue - Date from ICS
   * @returns {Date} UTC Date
   */
  normalizeToUtc(dateValue) {
    if (!dateValue) return null;

    // node-ical returns JavaScript Date objects already converted
    if (dateValue instanceof Date) {
      return dateValue;
    }

    // Handle string dates
    if (typeof dateValue === 'string') {
      return new Date(dateValue);
    }

    return null;
  }

  /**
   * Format date to local time string
   * @param {Date} date
   * @returns {string}
   */
  formatLocalTime(date) {
    if (!date) return '';
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  /**
   * Parse organizer from ICS format
   * @param {Object|string} organizer
   * @returns {Object|null}
   */
  parseOrganizer(organizer) {
    if (!organizer) return null;

    if (typeof organizer === 'string') {
      return { email: organizer.replace('mailto:', '') };
    }

    if (organizer.val) {
      return {
        email: organizer.val.replace('mailto:', ''),
        name: organizer.params?.CN || ''
      };
    }

    return null;
  }

  /**
   * Parse attendees from ICS format
   * @param {Array|Object} attendees
   * @returns {Array}
   */
  parseAttendees(attendees) {
    if (!attendees) return [];

    const attendeeList = Array.isArray(attendees) ? attendees : [attendees];

    return attendeeList.map(att => {
      if (typeof att === 'string') {
        return { email: att.replace('mailto:', '') };
      }
      if (att.val) {
        return {
          email: att.val.replace('mailto:', ''),
          name: att.params?.CN || '',
          status: att.params?.PARTSTAT || ''
        };
      }
      return null;
    }).filter(Boolean);
  }

  /**
   * Get synced meetings
   * @param {Object} options - Filter options
   * @returns {Array} Meetings
   */
  getMeetings(options = {}) {
    const meetings = this.store.get('calendarMeetings', []);

    if (!options.includeAllDay) {
      return meetings.filter(m => !m.isAllDay);
    }

    return meetings;
  }

  /**
   * Get today's meetings
   * @returns {Array}
   */
  getTodaysMeetings() {
    const meetings = this.getMeetings();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return meetings.filter(m => {
      const start = new Date(m.startTime);
      return start >= today && start < tomorrow;
    });
  }

  /**
   * Get this week's meetings
   * @returns {Array}
   */
  getThisWeeksMeetings() {
    const meetings = this.getMeetings();
    const now = new Date();

    // Get Monday of current week
    const monday = new Date(now);
    const day = monday.getDay();
    const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
    monday.setDate(diff);
    monday.setHours(0, 0, 0, 0);

    // Get Sunday of current week
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return meetings.filter(m => {
      const start = new Date(m.startTime);
      return start >= monday && start <= sunday;
    });
  }

  /**
   * Get upcoming meetings (next 24 hours)
   * @returns {Array}
   */
  getUpcomingMeetings() {
    const meetings = this.getMeetings();
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return meetings.filter(m => {
      const start = new Date(m.startTime);
      return start >= now && start < tomorrow;
    });
  }

  /**
   * Get last sync time
   * @returns {string|null}
   */
  getLastSyncTime() {
    return this.store.get('calendarLastSync', null);
  }

  /**
   * Match meeting to project using meeting mappings
   * @param {Object} meeting - Meeting object
   * @returns {Object|null} Matched project mapping
   */
  matchMeetingToProject(meeting) {
    const meetingMappings = this.store.get('meetingMappings', {});

    for (const [pattern, mapping] of Object.entries(meetingMappings)) {
      // Use cached regex with safety checks
      const regex = this.getCachedRegex(pattern);
      if (!regex) continue;

      if (regex.test(meeting.subject) || regex.test(meeting.searchText)) {
        return {
          project: typeof mapping === 'string' ? mapping : mapping.project,
          activity: typeof mapping === 'object' ? mapping.activity : null,
          sapCode: typeof mapping === 'object' ? mapping.sapCode : null
        };
      }
    }

    return null;
  }

  /**
   * Create time entry from meeting
   * @param {Object} meeting - Meeting object
   * @returns {Object} Activity-compatible object
   */
  meetingToActivity(meeting) {
    const projectMatch = this.matchMeetingToProject(meeting);

    return {
      title: meeting.subject,
      app: meeting.location ? `Meeting (${meeting.location})` : 'Meeting',
      project: projectMatch?.project || 'Meetings',
      activity: projectMatch?.activity || 'meeting',
      sapCode: projectMatch?.sapCode || null,
      startTime: meeting.startTime,
      endTime: meeting.endTime,
      duration: meeting.duration * 60, // Convert to seconds
      tags: ['meeting', 'calendar-sync'],
      billable: true,
      source: 'calendar',
      calendarEventId: meeting.id,
      metadata: {
        organizer: meeting.organizer,
        attendeeCount: meeting.attendees?.length || 0,
        location: meeting.location
      }
    };
  }

  /**
   * Cleanup on shutdown
   */
  cleanup() {
    this.stopAutoSync();
    this.regexCache.clear();
  }
}

module.exports = CalendarSyncService;
