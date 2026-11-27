const { detectSalesforceCase } = require('./salesforce-case');
const { compileRulePattern, bookingOf, isSafeRegex } = require('../../shared/rule-pattern');

/**
 * TitleParser - Extracts activity information from window titles
 * Extracted from ActivityTracker to improve maintainability and testability
 */
class TitleParser {
  constructor(storage) {
    this.storage = storage;

    // Regex patterns for detection
    // Note: jira/github use /g for extracting multiple matches
    // meeting/feature/bugfix use /i only (no /g) to avoid lastIndex issues with .test()
    // JIRA pattern: 2-10 letters followed by dash and numbers (e.g., ABC-123, proj-4567)
    // Case-insensitive to catch lowercase in URLs or user input
    this.patterns = {
      jira: /\b([A-Za-z]{2,10}-\d+)\b/gi,
      github: /#(\d+)/g,
      meeting: /meeting|standup|sync|review|retrospective|call|huddle|1:1|one.on.one/i,
      feature: /feat|feature|implement|add/i,
      bugfix: /fix|bug|issue|resolve/i,

      // Outlook Desktop patterns
      outlookMeeting: /^(.+?)\s*-\s*(?:Meeting|Appointment|Event)\s*-\s*(?:Microsoft\s*)?Outlook/i,
      outlookCalendar: /^Calendar\s*-\s*(.+?)\s*-\s*(?:Microsoft\s*)?Outlook/i,
      outlookEmail: /^(.+?)\s*-\s*Message\s*(?:\(HTML\))?\s*-?\s*(?:Microsoft\s*)?Outlook/i,
      outlookReading: /^(?:RE:|FW:|FWD:)?\s*(.+?)\s*-\s*(?:Microsoft\s*)?Outlook$/i,
      outlookInbox: /^(?:Inbox|Sent Items|Drafts|Deleted Items)\s*-\s*(.+?)\s*-\s*(?:Microsoft\s*)?Outlook/i,
      // Composing: "Untitled - Message" (new) or "RE:/FW: Subject - Message" (reply/forward compose window)
      outlookComposing: /^(?:Untitled|(?:RE:|FW:|FWD:)\s*.+?)\s*-\s*Message\s*(?:\(HTML\))?/i,

      // New Outlook for Windows patterns (uses bullet point separator)
      newOutlookMeeting: /^(.+?)\s*[•·]\s*(?:Calendar|Event)\s*[-•·]?\s*(?:Microsoft\s*)?Outlook/i,
      newOutlookMail: /^(?:Mail|Inbox)\s*[•·]\s*(?:Microsoft\s*)?Outlook/i,
      newOutlookReading: /^(.+?)\s*[•·]\s*(?:Microsoft\s*)?Outlook(?:\s*\(PWA\))?$/i,

      // Outlook Web (browser) patterns - matches browser window titles
      outlookWebMail: /^(?:Mail|Inbox)\s*-\s*.*?(?:@|Outlook)/i,
      outlookWebCalendar: /^(?:Calendar)\s*-\s*.*?(?:@|Outlook)/i,
      outlookWebMeeting: /^(.+?)\s*-\s*(?:Calendar|Event)\s*-\s*.*?(?:@|Outlook)/i,
      outlookWebReading: /^(?:RE:|FW:|FWD:)?\s*(.+?)\s*-\s*.*?(?:@|Outlook)/i,

      // Teams patterns
      teamsMeeting: /^(.+?)\s*\|\s*Microsoft Teams$/i,
      teamsCall: /^(?:Call with|Meeting with|Calling)\s+(.+?)\s*(?:\||$)/i,
      teamsChat: /^(?:Chat|(.+?))\s*\|\s*Microsoft Teams$/i
    };

    // App categories for detection (use word-boundary patterns)
    // Note: These are matched with word boundaries via matchesAppPattern()
    this.meetingApps = ['zoom', 'teams', 'google meet', 'skype', 'webex', 'slack huddle', 'discord'];
    this.devApps = ['visual studio code', 'vscode', 'vs code', 'visual studio', 'intellij', 'webstorm', 'pycharm', 'sublime', 'atom', 'neovim', 'nvim'];
    // 'vim' needs special handling - only match if it's the whole app name or preceded by word boundary
    this.devAppsExact = ['vim'];
    this.nonBillablePatterns = ['break', 'lunch', 'personal', 'youtube', 'netflix', 'spotify'];

    // Each rule pattern is compiled once (C-4); an unusable pattern is reported once
    this.matchers = new Map();
  }

  /**
   * The matcher for a rule pattern, compiled on first use. Same rules as the rule tester.
   * @param {string} pattern
   * @param {string} kind - for the warning: 'app', 'URL' or 'meeting'
   * @returns {((text: string) => boolean) | null}
   */
  matcherFor(pattern, kind) {
    if (!this.matchers.has(pattern)) {
      const matcher = compileRulePattern(pattern);
      if (!matcher) console.warn(`Skipping ${kind} rule with an unusable pattern`);
      this.matchers.set(pattern, matcher);
    }
    return this.matchers.get(pattern);
  }

  /**
   * Set the project and all booking fields a rule carries (C-4).
   * @returns {boolean} true when the rule set a project
   */
  applyRuleBooking(extracted, mapping) {
    const booking = bookingOf(mapping);
    if (!booking.project) return false;
    extracted.project = booking.project;
    for (const field of ['activity', 'sapCode', 'costCenter', 'wbsElement']) {
      if (booking[field]) extracted[field] = booking[field];
    }
    return true;
  }

  /**
   * Remember a guessed project. Guesses (meeting, IDE folder) apply only when no rule
   * set the project (C-4); the first guess wins, as before.
   */
  guessProject(extracted, project) {
    if (!extracted.guessedProject) extracted.guessedProject = project;
  }

  /**
   * Check if app name matches a pattern with word boundaries
   * Prevents false positives like 'code' matching 'Decode'
   * @param {string} appName - Lowercase app name
   * @param {string} pattern - Pattern to match
   * @returns {boolean} True if matched
   */
  matchesAppPattern(appName, pattern) {
    // Create word boundary regex for the pattern
    const regex = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return regex.test(appName);
  }

  /**
   * Helper to add tag without duplicates
   * @param {Array} tags - Tags array to modify
   * @param {string|string[]} newTags - Tag(s) to add
   */
  addTag(tags, newTags) {
    const toAdd = Array.isArray(newTags) ? newTags : [newTags];
    for (const tag of toAdd) {
      if (!tags.includes(tag)) {
        tags.push(tag);
      }
    }
  }

  /**
   * Safely get a value from storage store with fallback
   * @param {string} key - Storage key
   * @param {*} defaultValue - Default value if key not found or store unavailable
   * @returns {*} The stored value or default
   */
  getStoreValue(key, defaultValue = {}) {
    try {
      return this.storage?.store?.get(key) ?? defaultValue;
    } catch (e) {
      console.warn(`Failed to get store value for key "${key}":`, e);
      return defaultValue;
    }
  }

  /**
   * Check if a regex pattern is safe from ReDoS attacks
   * @param {string} pattern - Regex pattern to check
   * @returns {boolean} True if pattern appears safe
   */
  isSafeRegex(pattern) {
    return isSafeRegex(pattern);
  }

  /**
   * Extract comprehensive activity information from a window
   * @param {Object} window - Active window (see active-window.ts)
   * @returns {Object} Extracted activity information
   */
  parse(window) {
    // Defensive null checks
    const appName = window?.owner?.name || 'Unknown';
    const title = window?.title || '';
    const url = window?.url || null;

    const extracted = {
      app: appName,
      title: title,
      url: url,
      project: null,
      salesforceCase: null,
      activity: null,
      sapCode: null,
      tickets: [],
      tags: [],
      billable: true,
      metadata: {},
      // Fields for Outlook/Teams integration
      meetingSubject: null,
      meetingApp: null,
      emailSubject: null,
      emailActivity: null  // 'reading', 'composing', 'inbox', 'calendar'
    };

    const searchText = `${title} ${appName}`.toLowerCase();

    // Extract tickets and tags
    this.extractTickets(extracted, title);
    this.extractSalesforceCase(extracted);

    // Detect Outlook/Teams activity first (more specific)
    this.detectOutlookActivity(extracted);
    this.detectTeamsActivity(extracted);

    // Then general activity type detection (tags, and a guessed project)
    this.detectActivityType(extracted, searchText);

    // The user's rules, in priority order; the first that matches sets the project (C-4)
    this.applySalesforceCaseMappings(extracted); // a remembered case wins (#48)
    this.applyMeetingMappings(extracted);
    this.applyJiraMappings(extracted, searchText);
    this.applyUrlMappings(extracted);
    this.applyProjectMappings(extracted, searchText);

    // Only without a rule: the guess (meeting, IDE folder), then the default project
    if (!extracted.project && extracted.guessedProject) extracted.project = extracted.guessedProject;
    delete extracted.guessedProject;
    this.applyDefaultProject(extracted);

    // Determine billability
    this.checkBillability(extracted, searchText);

    return extracted;
  }

  /**
   * Extract JIRA and GitHub tickets from title
   * Note: Only extracts tickets, does NOT set project - let mapping functions handle that
   */
  extractTickets(extracted, title) {
    // Reset pattern indices for global regexes
    this.patterns.jira.lastIndex = 0;
    this.patterns.github.lastIndex = 0;

    // Extract JIRA tickets (normalize to uppercase for consistency)
    let match;
    const jiraTickets = [];
    while ((match = this.patterns.jira.exec(title)) !== null) {
      const normalizedTicket = match[1].toUpperCase();
      if (!jiraTickets.includes(normalizedTicket)) {
        jiraTickets.push(normalizedTicket);
        extracted.tickets.push(normalizedTicket);
      }
    }
    if (jiraTickets.length > 0) {
      this.addTag(extracted.tags, 'jira');
    }

    // Extract GitHub issues
    const githubIssues = [];
    while ((match = this.patterns.github.exec(title)) !== null) {
      if (!githubIssues.includes(match[0])) {
        githubIssues.push(match[0]);
        extracted.tickets.push(match[0]);
      }
    }
    if (githubIssues.length > 0) {
      this.addTag(extracted.tags, 'github');
    }
  }

  /**
   * Salesforce case number from the title (#48); the client is remembered per case.
   */
  extractSalesforceCase(extracted) {
    extracted.salesforceCase = detectSalesforceCase(extracted.title, extracted.url);
    if (extracted.salesforceCase) {
      this.addTag(extracted.tags, 'salesforce');
    }
  }

  /**
   * Apply the project remembered for this Salesforce case. Runs first and replaces
   * any guess made by activity-type detection, since the user chose it.
   */
  applySalesforceCaseMappings(extracted) {
    if (!extracted.salesforceCase) return;
    const mapping = this.getStoreValue('salesforceCaseMappings', {})[extracted.salesforceCase];
    if (!mapping) return;
    if (this.applyRuleBooking(extracted, mapping)) extracted.salesforceCaseAssigned = true;
  }

  /**
   * Detect activity type (meeting, development, feature, bugfix)
   */
  detectActivityType(extracted, searchText) {
    const appName = extracted.app.toLowerCase();

    // Detect meeting activities (use word boundaries to prevent false positives)
    if (this.patterns.meeting.test(searchText) ||
        this.meetingApps.some(app => this.matchesAppPattern(appName, app))) {
      this.addTag(extracted.tags, 'meeting');
      this.guessProject(extracted, 'Meetings');
    }

    // Detect development activities (use word boundaries)
    const isDevApp = this.devApps.some(app => this.matchesAppPattern(appName, app)) ||
                     this.devAppsExact.some(app => appName === app || this.matchesAppPattern(appName, app));
    if (isDevApp) {
      this.addTag(extracted.tags, 'development');
      this.extractProjectFromDevTitle(extracted);
    }

    // Check for feature/bugfix tags
    if (this.patterns.feature.test(searchText)) {
      this.addTag(extracted.tags, 'feature');
    }
    if (this.patterns.bugfix.test(searchText)) {
      this.addTag(extracted.tags, 'bugfix');
    }
  }

  /**
   * Extract project name from IDE window titles
   */
  extractProjectFromDevTitle(extracted) {
    if (extracted.guessedProject) return;

    const title = extracted.title;

    // VS Code pattern: "file.js - ProjectName - Visual Studio Code"
    const vsCodeMatch = title.match(/\s-\s([^-]+)\s-\s(?:Visual Studio Code|VSCode)/);
    if (vsCodeMatch) {
      this.guessProject(extracted, vsCodeMatch[1].trim());
      return;
    }

    // Generic pattern: "file.js - ProjectName"
    const genericMatch = title.match(/\s-\s([^-]+)(?:\s-\s|$)/);
    if (genericMatch) {
      this.guessProject(extracted, genericMatch[1].trim());
    }
  }

  /**
   * Apply JIRA project key mappings
   */
  applyJiraMappings(extracted, searchText) {
    if (extracted.project) return;

    const jiraMappings = this.getStoreValue('jiraProjectMappings', {});
    if (Object.keys(jiraMappings).length === 0) return;

    // Reuse the same JIRA pattern for consistency (now case-insensitive)
    this.patterns.jira.lastIndex = 0;
    const matches = searchText.match(this.patterns.jira);

    if (matches) {
      for (const match of matches) {
        // Normalize to uppercase for consistent mapping lookup
        const normalizedMatch = match.toUpperCase();
        const projectKey = normalizedMatch.split('-')[0];

        // Try uppercase key first, then original case for backwards compatibility
        const mapping = jiraMappings[projectKey] || jiraMappings[projectKey.toLowerCase()];
        if (mapping && this.applyRuleBooking(extracted, mapping)) {
          // Only add if not already in tickets array (use normalized version)
          if (!extracted.tickets.includes(normalizedMatch)) {
            extracted.tickets.push(normalizedMatch);
          }
          break;
        }
      }
    }
  }

  /**
   * Apply URL-based project mappings
   */
  applyUrlMappings(extracted) {
    if (extracted.project || !extracted.url) return;

    const urlMappings = this.getStoreValue('urlProjectMappings', {});

    for (const [pattern, mapping] of Object.entries(urlMappings)) {
      const matches = this.matcherFor(pattern, 'URL');
      if (matches && matches(extracted.url) && this.applyRuleBooking(extracted, mapping)) break;
    }
  }

  /**
   * Apply custom project mappings
   */
  applyProjectMappings(extracted, searchText) {
    if (extracted.project) return;

    let mappings;
    try {
      mappings = this.storage?.getProjectMappings?.() || {};
    } catch (e) {
      console.warn('Failed to get project mappings:', e);
      return;
    }
    if (Object.keys(mappings).length === 0) return;

    for (const [pattern, mapping] of Object.entries(mappings)) {
      const matches = this.matcherFor(pattern, 'app');
      if (matches && matches(searchText) && this.applyRuleBooking(extracted, mapping)) break;
    }
  }

  /**
   * Detect Outlook-specific activity from window title
   * Supports: Classic Outlook, New Outlook for Windows, Outlook Web (browser)
   */
  detectOutlookActivity(extracted) {
    const appName = extracted.app.toLowerCase();
    const title = extracted.title;
    const url = (extracted.url || '').toLowerCase();

    // Check for Outlook Web via URL (in browser)
    const isOutlookWeb = url.includes('outlook.office') ||
                         url.includes('outlook.live') ||
                         url.includes('outlook.com');

    // Check for Outlook desktop app (classic or new)
    const isOutlookDesktop = appName.includes('outlook');

    // Check for New Outlook (PWA or new version)
    const isNewOutlook = title.includes('•') || title.includes('·') || title.includes('(PWA)');

    // Only process if it's Outlook in some form
    if (!isOutlookDesktop && !isOutlookWeb) return;

    this.addTag(extracted.tags, 'outlook');
    if (isOutlookWeb) {
      this.addTag(extracted.tags, 'outlook-web');
    }
    if (isNewOutlook) {
      this.addTag(extracted.tags, 'new-outlook');
    }

    let match;

    // === New Outlook for Windows detection (uses bullet separator) ===
    if (isNewOutlook) {
      // New Outlook meeting/calendar
      match = title.match(this.patterns.newOutlookMeeting);
      if (match) {
        extracted.meetingSubject = match[1].trim();
        extracted.meetingApp = 'Outlook (New)';
        extracted.activity = 'meeting';
        this.addTag(extracted.tags, 'meeting');
        this.guessProject(extracted, 'Meetings');
        return;
      }

      // New Outlook mail inbox
      if (this.patterns.newOutlookMail.test(title)) {
        extracted.emailActivity = 'inbox';
        extracted.activity = 'email';
        this.addTag(extracted.tags, 'email');
        return;
      }

      // New Outlook reading email
      match = title.match(this.patterns.newOutlookReading);
      if (match) {
        extracted.emailSubject = match[1].trim();
        extracted.emailActivity = 'reading';
        extracted.activity = 'email-reading';
        this.addTag(extracted.tags, ['email', 'reading']);
        return;
      }
    }

    // === Outlook Web detection (browser) ===
    if (isOutlookWeb) {
      // Outlook Web calendar
      if (this.patterns.outlookWebCalendar.test(title)) {
        extracted.emailActivity = 'calendar';
        extracted.activity = 'calendar';
        this.addTag(extracted.tags, 'calendar');
        return;
      }

      // Outlook Web meeting
      match = title.match(this.patterns.outlookWebMeeting);
      if (match) {
        extracted.meetingSubject = match[1].trim();
        extracted.meetingApp = 'Outlook Web';
        extracted.activity = 'meeting';
        this.addTag(extracted.tags, 'meeting');
        this.guessProject(extracted, 'Meetings');
        return;
      }

      // Outlook Web mail inbox
      if (this.patterns.outlookWebMail.test(title)) {
        extracted.emailActivity = 'inbox';
        extracted.activity = 'email';
        this.addTag(extracted.tags, 'email');
        return;
      }

      // Outlook Web reading email
      match = title.match(this.patterns.outlookWebReading);
      if (match) {
        extracted.emailSubject = match[1].trim();
        extracted.emailActivity = 'reading';
        extracted.activity = 'email-reading';
        this.addTag(extracted.tags, ['email', 'reading']);
        return;
      }
    }

    // === Classic Outlook Desktop detection ===
    // Check for Outlook meeting window
    match = title.match(this.patterns.outlookMeeting);
    if (match) {
      extracted.meetingSubject = match[1].trim();
      extracted.meetingApp = 'Outlook';
      extracted.activity = 'meeting';
      this.addTag(extracted.tags, 'meeting');
      this.guessProject(extracted, 'Meetings');
      return;
    }

    // Check for calendar view
    match = title.match(this.patterns.outlookCalendar);
    if (match) {
      extracted.emailActivity = 'calendar';
      extracted.activity = 'calendar';
      this.addTag(extracted.tags, 'calendar');
      return;
    }

    // Check for inbox/folder view
    match = title.match(this.patterns.outlookInbox);
    if (match) {
      extracted.emailActivity = 'inbox';
      extracted.activity = 'email';
      this.addTag(extracted.tags, 'email');
      return;
    }

    // Check for composing email (Untitled - Message or RE:/FW: - Message)
    if (this.patterns.outlookComposing.test(title)) {
      extracted.emailActivity = 'composing';
      extracted.activity = 'email-composing';
      this.addTag(extracted.tags, ['email', 'composing']);
      return;
    }

    // Check for reading/viewing email message
    match = title.match(this.patterns.outlookEmail);
    if (match) {
      extracted.emailSubject = match[1].trim();
      extracted.emailActivity = 'reading';
      extracted.activity = 'email-reading';
      this.addTag(extracted.tags, ['email', 'reading']);
      return;
    }

    // Generic Outlook reading (RE: FW: subjects)
    match = title.match(this.patterns.outlookReading);
    const titleLower = title.toLowerCase();
    if (match && !titleLower.includes('inbox') && !titleLower.includes('calendar')) {
      extracted.emailSubject = match[1].trim();
      extracted.emailActivity = 'reading';
      extracted.activity = 'email-reading';
      this.addTag(extracted.tags, ['email', 'reading']);
    }
  }

  /**
   * Detect Microsoft Teams activity from window title
   */
  detectTeamsActivity(extracted) {
    const appName = extracted.app.toLowerCase();
    const title = extracted.title;

    // Only process Teams windows
    if (!appName.includes('teams')) return;

    this.addTag(extracted.tags, 'teams');

    // Check for active call/meeting
    let match = title.match(this.patterns.teamsCall);
    if (match) {
      extracted.meetingSubject = match[1].trim();
      extracted.meetingApp = 'Teams';
      extracted.activity = 'meeting';
      this.addTag(extracted.tags, ['meeting', 'call']);
      this.guessProject(extracted, 'Meetings');
      return;
    }

    // Check for Teams meeting window
    match = title.match(this.patterns.teamsMeeting);
    if (match) {
      const subject = match[1].trim();
      // Filter out non-meeting titles like "Chat" or "Activity"
      if (!['chat', 'activity', 'calendar', 'teams', 'files', 'apps'].includes(subject.toLowerCase())) {
        extracted.meetingSubject = subject;
        extracted.meetingApp = 'Teams';
        extracted.activity = 'meeting';
        this.addTag(extracted.tags, 'meeting');
        this.guessProject(extracted, 'Meetings');
        return;
      }
    }

    // Check for chat window
    match = title.match(this.patterns.teamsChat);
    if (match) {
      extracted.activity = 'chat';
      this.addTag(extracted.tags, 'chat');
      // match[1] is the person's name if not the generic "Chat" window
      if (match[1]) {
        extracted.metadata.chatWith = match[1].trim();
      }
    }
  }

  /**
   * Apply meeting-specific project mappings
   * Maps meeting subjects to projects/SAP codes
   */
  applyMeetingMappings(extracted) {
    // Only for a meeting subject, and only when no earlier rule set the project
    if (!extracted.meetingSubject || extracted.project) return;

    const meetingMappings = this.getStoreValue('meetingMappings', {});
    if (Object.keys(meetingMappings).length === 0) return;

    const searchText = extracted.meetingSubject.toLowerCase();

    for (const [pattern, mapping] of Object.entries(meetingMappings)) {
      const matches = this.matcherFor(pattern, 'meeting');
      if (matches && matches(searchText) && this.applyRuleBooking(extracted, mapping)) break;
    }
  }

  /**
   * Apply default project from settings
   */
  applyDefaultProject(extracted) {
    if (extracted.project) return;

    try {
      const settings = this.storage?.getSettings?.() || {};
      extracted.project = settings.defaultProject || 'General';
    } catch (e) {
      console.warn('Failed to get settings for default project:', e);
      extracted.project = 'General';
    }
  }

  /**
   * Check if activity should be marked as non-billable
   */
  checkBillability(extracted, searchText) {
    if (this.nonBillablePatterns.some(pattern => searchText.includes(pattern))) {
      extracted.billable = false;
      this.addTag(extracted.tags, 'break');
    }
  }
}

module.exports = TitleParser;
