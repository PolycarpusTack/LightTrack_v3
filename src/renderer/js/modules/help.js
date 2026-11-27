/**
 * LightTrack Help Module
 * Displays application help and documentation
 */

(function() {
  'use strict';

  // Help content in markdown format. Describes an installed build only (B-11).
  const HELP_CONTENT = `# LightTrack User Manual

**Version 3.0.0** | Time tracking for Windows with automatic project detection

---

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Timer View](#timer-view)
4. [Timeline View](#timeline-view)
5. [Analytics View](#analytics-view)
6. [Projects View](#projects-view)
7. [SAP Export](#sap-export)
8. [Settings](#settings)
9. [Taking Breaks](#taking-breaks)
10. [Browser Extension](#browser-extension)
11. [Keyboard Shortcuts](#keyboard-shortcuts)
12. [Troubleshooting](#troubleshooting)

---

## Introduction

LightTrack records which window you are working in and books the time to a project. Your rules decide the project; it detects JIRA tickets, Salesforce cases and Outlook or Teams meetings, and exports timesheets for SAP ByDesign.

### Key Features

- **Automatic tracking**: records the active window and puts it on a project
- **Rules**: app, URL, JIRA and meeting rules set the project and booking fields
- **Calendar sync**: shows meetings from an Outlook or Exchange ICS subscription
- **SAP export**: a CSV timesheet for SAP ByDesign
- **Focus**: focus score and deep work sessions
- **Browser extension**: adds the page you are on, in Chrome and Edge

---

## Getting Started

### Starting Tracking

1. Click **Start** in the Timer view
2. LightTrack records the active window and puts each activity on a project
3. Click **Stop** to stop tracking

When you are away from the keyboard, tracking pauses. After a longer absence LightTrack asks whether the time was work: **Count as work** or **Leave out**.

### System Tray

Right-click the tray icon to show LightTrack, start or stop tracking, see today's total, open Settings, or quit. Left-click the icon to show or hide the window.

### Auto-Start Options

In Settings > Tracking > Startup and window behavior:
- **Launch at system startup**: start LightTrack when you sign in
- **Start tracking automatically**: begin tracking as soon as it starts

---

## Timer View

### Hero Section

- **Timer**: time on the current activity; "Paused" while you are away
- **Current project and app**
- **Sampling**: how often the active window is checked (5 to 60 seconds)
- **Focus score, goals and a mini timeline** of today

### Actions

- **Start** / **Stop**: tracking on or off
- **Add manual**: add a time entry by hand
- **Mark break**: record a break (not billable)
- **Floating timer**: the timer icon in the top bar shows a small timer you can drag over the window

### KPI Cards

| Card | Description |
|------|-------------|
| Today | Time tracked today |
| Billable | Share of billable time |
| Context switches | Number of app changes (fewer means more focus) |
| Projects | Projects worked on today |

### Activity Feed

Today's activities with project, app, duration, billable status and tags. Click a row, or its **Edit** button, to edit it. Each row also has **Tags** and **Delete**.

---

## Timeline View

### Date Navigation

- The arrow buttons go to the previous or next day
- **Today** returns to today

### Day Statistics

| Stat | Description |
|------|-------------|
| Tracked | Time recorded |
| Gaps | Untracked time during work hours |
| Billable | Share of billable time |
| Projects | Projects worked on that day |

### Day Overview

A bar across the work day. Segments show billable, non-billable and break time; empty parts are untracked. Hour markers and, for today, a line at the current time are shown. Click a segment to edit that activity.

### Working with the List

- **Edit**, **Tags** and **Delete** on each row
- **Select** several rows and **Merge** them
- Show billable only, or group by project
- **+ Add entry** for a manual entry

### Editing Activities

The edit dialog changes the project, description, date, start and end time, and billable status. It shows which rule matched. To delete an activity, use **Delete** on its row.

---

## Analytics View

### Date Range Selector

**This week**, **This month**, **This year**, **All time**, or **Custom** with a from and to date.

### Filter Options

**All**, **Billable**, **Non-billable**, **Meetings**.

### Key Metrics

| Metric | Description |
|--------|-------------|
| Total time | Hours tracked in the range |
| Avg per Day | Average per tracked day |
| Top project | The project with the most time |
| Focus time | Sessions of 25 minutes or more |

Also shown: billable hours, daily goals, daily activity, project breakdown, productivity by hour and insights. **Compare** shows the previous period; **Export CSV** saves the range.

---

## Projects View

Rules put activities on a project. Your rules always come before LightTrack's own guesses (the IDE folder name, or "Meetings" for meeting-like titles). They are applied in this order: Salesforce case, meeting, JIRA, URL, app.

### Patterns

- Plain text matches anywhere, ignoring case: \`Visual Studio\`
- \`*\` stands for any characters: \`*Outlook*\`
- \`/.../i\` is a regular expression: \`/JIRA-\\d+/i\`. One that could be very slow is not used.

**Test** checks a pattern against sample text and matches the way tracking does.

### Rule Types

| Rule | First field |
|------|-------------|
| App rules | Pattern, matched against the app and window title |
| URL Rules | URL pattern (needs the browser extension) |
| JIRA Rules | Project key, for example PROJ for PROJ-123 |
| Meeting rules | Subject pattern of an Outlook or Teams meeting |

Each rule sets the project and, optionally, the activity, SAP code, cost center and WBS element.

### Salesforce Cases

Assign a Salesforce case to a client once; later activities for that case go to the same project.

### All Projects

Lists every project with its time. **+ New project** adds one.

---

## SAP Export

### Steps

1. Enter your **Employee ID** under Employee settings in this view (**Save** keeps it for next time)
2. Choose **This week**, **Last week**, **This month** or **Last month**
3. Check the preview and adjust descriptions
4. Click **Export to CSV**

The export history below lists the last 20 exports with date, period and number of rows.

### Export Columns

Employee ID, Date, Project, Activity Type, Hours (decimal), SAP Code, Cost Center, WBS Element, Work Description, Billable (Yes or No). Rows are one per day and project. Window titles are never exported.

---

## Settings

### Tracking
- Startup and window behavior: launch at startup, start tracking automatically, what happens when you close the window, minimize to tray
- **Consolidate similar activities**, with mode Smart, Strict or Relaxed
- **Idle and short activities**: when you count as away, and the shortest activity that is saved
- Default project

### Schedule
- Work day start and end time, and the first day of the week
- Daily goals: deep work target (hours) and breaks target (count)

### Notifications
- **Break reminder**: remind every so many minutes

### Calendar
1. Get your ICS URL from Outlook (**How to get your calendar URL**)
2. Paste it in **Calendar ICS URL**
3. Click **Sync now**; it then syncs every 30 minutes
4. **Remove** clears the URL and its meetings

### Data
- **Export CSV**: all activities
- **Clear old data (30+ days)**
- **Create backup**: all data as a JSON file (restoring is not available yet)
- Browser extension: paired extensions, and **Disconnect all extensions**

### Customization
Appearance (light or dark), tags, projects and activity types.

---

## Taking Breaks

Click **Mark break** in the Timer view, or press \`Ctrl+Shift+B\`, to record a break. Turn on the break reminder in Settings > Notifications.

---

## Browser Extension

The extension for Chrome and Edge adds the page you are on to the activity, so URL rules and JIRA keys in pages work.

### Pairing
1. Load the extension (it is not in a web store)
2. Open its popup and choose **Pair**
3. Type the 6-digit code LightTrack shows

The popup shows the connection: "Connected to LightTrack", "LightTrack found - not paired" or "Not connected". It connects to 127.0.0.1 on port 41417.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| \`Ctrl+Shift+T\` | Start or stop tracking |
| \`Ctrl+Shift+F\` | Show or hide the floating timer |
| \`Ctrl+Shift+B\` | Mark a break (Timer view) |
| \`Ctrl+Shift+N\` | Add a manual entry (Timer view) |
| \`←\` / \`→\`, \`Home\` | Previous day, next day, today (Timeline view) |
| \`←\` / \`→\` | Previous or next date range (Analytics view) |
| \`Enter\` / \`Escape\` | Add or cancel in a rule form (Projects view) |
| \`Escape\` | Close a dialog |

---

## Troubleshooting

### Tracking Not Starting
1. Restart the application
2. Check that security software is not blocking it

### Wrong Project
1. Add a rule for the app, URL, JIRA key or meeting
2. Use **Test** to check the pattern against the window title

### Calendar Not Syncing
1. Check that the ICS URL is correct and uses HTTPS
2. Click **Sync now**

### Browser Extension Not Connecting
1. Make sure LightTrack is running
2. Pair again from the popup
3. Check that port 41417 is not blocked

---

## Data Storage

Data is stored on this computer in \`%APPDATA%\\LightTrack\\\`, encrypted.

---

## Privacy & Security

- All data stays on this computer
- Nothing is sent anywhere except the calendar ICS URL you set up
- No telemetry

---

**LightTrack** - time tracking that stays on your computer
`;

  /**
   * Generate a slug from text for anchor IDs
   */
  function slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  /**
   * Simple markdown to HTML converter
   * Handles basic markdown syntax
   */
  function markdownToHtml(markdown) {
    let html = markdown;

    // Escape HTML
    html = html.replace(/&/g, '&amp;');

    // Headers with IDs for anchor links
    html = html.replace(/^### (.+)$/gm, (match, title) => {
      const id = slugify(title);
      return `<h3 id="${id}">${title}</h3>`;
    });
    html = html.replace(/^## (.+)$/gm, (match, title) => {
      const id = slugify(title);
      return `<h2 id="${id}">${title}</h2>`;
    });
    html = html.replace(/^# (.+)$/gm, (match, title) => {
      const id = slugify(title);
      return `<h1 id="${id}">${title}</h1>`;
    });

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Code (inline)
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr>');

    // Tables
    html = html.replace(/\|(.+)\|/g, function(match, content) {
      const cells = content.split('|').map(c => c.trim());
      const isHeader = cells.every(c => /^-+$/.test(c));
      if (isHeader) return '';

      const tag = content.includes('---') ? 'th' : 'td';
      const row = cells.map(c => `<${tag}>${c}</${tag}>`).join('');
      return `<tr>${row}</tr>`;
    });

    // Wrap table rows in table
    html = html.replace(/(<tr>.*?<\/tr>\s*)+/gs, function(match) {
      const firstRow = match.match(/<tr>.*?<\/tr>/);
      if (firstRow && firstRow[0].includes('<th>')) {
        const header = firstRow[0];
        const body = match.replace(header, '').trim();
        return `<table><thead>${header}</thead><tbody>${body}</tbody></table>`;
      }
      return `<table><tbody>${match}</tbody></table>`;
    });

    // Lists (unordered)
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\s*)+/gs, '<ul>$&</ul>');

    // Lists (ordered)
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    // Paragraphs
    html = html.replace(/^(?!<[hulo]|<t[rdh]|<li|<hr|<table|<thead|<tbody)(.+)$/gm, '<p>$1</p>');

    // Clean up empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '');

    // Fix nested ul/li issues
    html = html.replace(/<\/ul>\s*<ul>/g, '');

    return html;
  }

  /**
   * Show the help modal
   */
  function showHelp() {
    const overlay = document.getElementById('help-modal-overlay');
    const content = document.getElementById('help-content');

    if (!overlay || !content) {
      console.error('Help modal elements not found');
      return;
    }

    // Convert markdown to HTML and set content
    content.innerHTML = markdownToHtml(HELP_CONTENT);

    // Handle anchor link clicks - scroll within modal instead of navigating
    content.querySelectorAll('a[href^="#"]').forEach(link => {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        const targetId = this.getAttribute('href').substring(1);
        const targetElement = content.querySelector('#' + targetId);
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });

    // Handle external links - open in system browser
    content.querySelectorAll('a[href^="http"]').forEach(link => {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        // Use preload bridge to open external links safely
        window.lightTrackAPI.openExternal(this.href)
          .catch(error => window.LightTrack.UI.showNotification(error.message, 'error'));
      });
    });

    // Show modal
    overlay.classList.add('active');
  }

  /**
   * Hide the help modal
   */
  function hideHelp() {
    const overlay = document.getElementById('help-modal-overlay');
    if (overlay) {
      overlay.classList.remove('active');
    }
  }

  /**
   * Initialize help functionality
   */
  function init() {
    // Help button click
    const helpBtn = document.getElementById('btn-help');
    if (helpBtn) {
      helpBtn.addEventListener('click', showHelp);
    }

    // Close button clicks
    const closeBtn = document.getElementById('help-modal-close');
    const closeBtnFooter = document.getElementById('help-modal-close-btn');

    if (closeBtn) {
      closeBtn.addEventListener('click', hideHelp);
    }
    if (closeBtnFooter) {
      closeBtnFooter.addEventListener('click', hideHelp);
    }

    // Click outside to close
    const overlay = document.getElementById('help-modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
          hideHelp();
        }
      });
    }

    // Escape key to close
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && overlay && overlay.classList.contains('active')) {
        hideHelp();
      }
    });

    console.log('Help module initialized');
  }

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export for module system
  window.LightTrack = window.LightTrack || {};
  window.LightTrack.Help = {
    show: showHelp,
    hide: hideHelp,
    init: init
  };

})();
