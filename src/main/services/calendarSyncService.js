/**
 * CalendarSyncService - ICS Calendar Subscription for Outlook/Exchange
 * Fetches and parses ICS calendar feeds to sync meetings into LightTrack
 */

const ical = require('node-ical');
const {
  CALENDAR_SYNC_INTERVAL_MS,
  FETCH_TIMEOUT_MS
} = require('../../shared/constants');

// Private IP ranges to block for SSRF protection
const PRIVATE_IP_PATTERNS = [
  /^127\./,                      // Loopback
  /^10\./,                       // Class A private
  /^172\.(1[6-9]|2\d|3[01])\./,  // Class B private
  /^192\.168\./,                 // Class C private
  /^169\.254\./,                 // Link-local
  /^0\./,                        // Current network
  /^::1$/,                       // IPv6 loopback
  /^fe80:/i,                     // IPv6 link-local
  /^fc00:/i,                     // IPv6 unique local
  /^fd00:/i,                     // IPv6 unique local
];

class CalendarSyncService {
  constructor(store) {
    this.store = store;
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
        return { valid: false, error: `Invalid URL scheme. Only HTTPS and webcal:// are allowed.` };
      }

      // Block private/internal hostnames
      const hostname = parsed.hostname.toLowerCase();
      if (hostname === 'localhost' || hostname === 'local' || hostname.endsWith('.local')) {
        return { valid: false, error: 'Cannot use localhost or local network addresses.' };
      }

      // Check for IP addresses in hostname
      const ipv4Match = hostname.match(/^(\d{1,3}\.){3}\d{1,3}$/);
      if (ipv4Match) {
        // Check against private IP patterns
        for (const pattern of PRIVATE_IP_PATTERNS) {
          if (pattern.test(hostname)) {
            return { valid: false, error: 'Cannot use private or internal IP addresses.' };
          }
        }
      }

      // Convert webcal to https
      const sanitizedUrl = url.replace('webcal://', 'https://');

      return { valid: true, sanitizedUrl };
    } catch (e) {
      return { valid: false, error: 'Invalid URL format.' };
    }
  }

  /**
   * Sanitize string to prevent XSS
   * @param {string} str - String to sanitize
   * @param {number} maxLength - Maximum length
   * @returns {string} Sanitized string
   */
  sanitizeString(str, maxLength = 500) {
    if (typeof str !== 'string') return '';
    return str
      .slice(0, maxLength)
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
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
   * Initialize the service and start auto-sync if URL is configured
   */
  initialize() {
    const calendarUrl = this.store.get('settings.calendarIcsUrl');
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
      this.store.set('settings.calendarIcsUrl', '');
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
      console.warn('URL may not be a valid ICS feed:', url);
    }

    // Store the validated URL
    this.store.set('settings.calendarIcsUrl', validation.sanitizedUrl);

    // Try to sync
    const result = await this.syncCalendar();

    if (result.success) {
      this.startAutoSync();
    }

    return result;
  }

  /**
   * Get the current calendar URL
   * @returns {string|null}
   */
  getCalendarUrl() {
    return this.store.get('settings.calendarIcsUrl', '');
  }

  /**
   * Sync calendar from configured ICS URL
   * @returns {Promise<Object>} Sync result with meeting count
   */
  async syncCalendar() {
    const url = this.store.get('settings.calendarIcsUrl');

    if (!url) {
      return { success: false, error: 'No calendar URL configured' };
    }

    // Re-validate URL before fetching (in case stored URL is compromised)
    const validation = this.validateUrl(url);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      console.log('Syncing calendar from:', validation.sanitizedUrl);

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
      console.error('Calendar sync error:', error);
      return {
        success: false,
        error: error.message || 'Failed to sync calendar'
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
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Calendar fetch timed out after ${FETCH_TIMEOUT_MS / 1000} seconds`));
      }, FETCH_TIMEOUT_MS);
    });

    // Race between fetch and timeout
    return Promise.race([fetchPromise, timeoutPromise]);
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

    for (const [uid, event] of Object.entries(events)) {
      // Skip non-event items (like VTIMEZONE)
      if (event.type !== 'VEVENT') continue;

      // Get start and end times (handle timezone)
      const startTime = this.normalizeToUtc(event.start);
      const endTime = this.normalizeToUtc(event.end);

      // Skip if outside date range
      if (!startTime || startTime > endRange || endTime < startRange) continue;

      // Skip all-day events that span multiple days (likely holidays/OOO)
      const isAllDay = event.start && event.start.dateOnly === true;

      // Sanitize all string fields from ICS to prevent XSS
      const sanitizedSubject = this.sanitizeString(event.summary, 200) || 'No Subject';
      const sanitizedDescription = this.sanitizeString(event.description, 2000) || '';
      const sanitizedLocation = this.sanitizeString(event.location, 200) || '';

      // Validate duration calculation
      const durationMs = endTime - startTime;
      const duration = (isNaN(durationMs) || durationMs < 0) ? 0 : Math.round(durationMs / (1000 * 60));

      const meeting = {
        id: this.sanitizeString(uid, 200),
        subject: sanitizedSubject,
        description: sanitizedDescription,
        location: sanitizedLocation,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        startTimeLocal: this.formatLocalTime(startTime),
        endTimeLocal: this.formatLocalTime(endTime),
        duration: duration, // minutes
        isAllDay: isAllDay,
        organizer: this.parseOrganizer(event.organizer),
        attendees: this.parseAttendees(event.attendee),
        status: this.sanitizeString(event.status, 50) || 'CONFIRMED',
        categories: Array.isArray(event.categories) ? event.categories.slice(0, 10).map(c => this.sanitizeString(c, 50)) : [],
        // For matching with project mappings (use original unsanitized for matching)
        searchText: `${event.summary || ''} ${event.description || ''} ${event.location || ''}`.toLowerCase()
      };

      meetings.push(meeting);
    }

    // Sort by start time
    meetings.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    return meetings;
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
