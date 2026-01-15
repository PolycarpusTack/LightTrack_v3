/**
 * LightTrack Help Module
 * Displays application help and documentation
 */

(function() {
  'use strict';

  // Help content in markdown format
  const HELP_CONTENT = `# LightTrack User Manual

**Version 3.0.0** | Lightweight Time Tracking with Automatic Project Detection

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

LightTrack is a lightweight personal time tracking application that automatically detects what you're working on by monitoring your active window. It intelligently categorizes your work, detects JIRA tickets, recognizes meetings from Outlook and Teams, and exports timesheets for SAP ByDesign.

### Key Features

- **Automatic Tracking**: Detects active window and categorizes work automatically
- **JIRA Integration**: Extracts ticket numbers (e.g., PROJ-123) from window titles
- **Meeting Detection**: Recognizes Outlook appointments and Teams meetings
- **Project Mapping**: Create rules to auto-assign activities to projects
- **Calendar Sync**: Import meetings from Outlook/Exchange via ICS subscription
- **SAP Export**: Export timesheets in CSV format for SAP ByDesign
- **Focus Scoring**: Measure your productivity with focus metrics
- **Browser Extension**: Track web browsing activity in Chrome/Edge/Firefox

---

## Getting Started

### Starting Tracking

1. Click the **Start** button in the Timer view
2. LightTrack will begin monitoring your active window
3. Activities are automatically categorized based on the app and window title
4. Click **Stop** to pause tracking

### System Tray

LightTrack runs in the system tray when minimized. Right-click the tray icon to:
- Show/hide the main window
- Start/stop tracking
- Open settings
- Quit the application

### Auto-Start Options

In Settings, you can enable:
- **Launch at system startup**: Start LightTrack when you log in
- **Start tracking automatically**: Begin tracking immediately when launched

---

## Timer View

The Timer view is your main dashboard showing:

### Hero Section

- **Timer Display**: Shows elapsed time for current session
- **Current Project**: The detected or assigned project name
- **Current App**: The active application being tracked
- **Sampling Rate**: How often the tracker checks your activity (5s-60s adaptive)

### Actions

- **Start/Stop**: Toggle time tracking
- **Add Manual**: Add a manual time entry
- **Mark Break**: Record a break (non-billable time)
- **Floating Timer**: Open a small always-on-top timer window

### KPI Cards

| Card | Description |
|------|-------------|
| Today | Total time tracked today |
| Billable | Percentage of billable time |
| Context Switches | Number of app changes (fewer = better focus) |
| Projects | Number of different projects worked on today |

### Activity Feed

Shows a chronological list of today's activities with:
- Project name and app
- Duration
- Billable status
- Tags (meeting, dev, jira, etc.)

Click any activity to edit its details.

---

## Timeline View

The Timeline view provides a detailed look at any day's activities.

### Date Navigation

- Use **<** and **>** arrows to navigate days
- Click **Today** to return to current date

### Day Statistics

| Stat | Description |
|------|-------------|
| Tracked | Total time recorded |
| Gaps | Untracked time during work hours |
| Billable | Percentage of billable work |
| Projects | Number of projects for the day |

### Visual Timeline Bar

A horizontal bar showing your day with:
- Colored segments for different projects
- Gaps shown in gray
- Time markers for work hours

### Editing Activities

Click any activity to open the edit modal where you can:
- Change project assignment
- Adjust start/end times
- Toggle billable status
- Delete the entry

---

## Analytics View

The Analytics view provides insights into your work patterns.

### Date Range Selector

- **This Week**: Current week's data
- **This Month**: Current month's data
- **This Year**: Year-to-date data
- **All Time**: Complete history

### Filter Options

- **All**: All activities
- **Billable**: Only billable time
- **Non-billable**: Only non-billable time
- **Meetings**: Only meeting time

### Key Metrics

| Metric | Description |
|--------|-------------|
| Total Time | Sum of tracked hours |
| Avg per Day | Average daily tracking |
| Top Project | Most time-consuming project |
| Focus Time | Deep work sessions (25+ minutes) |

---

## Projects View

Configure automatic project detection rules.

### App Rules

Auto-assign activities based on app name or window title.

| Field | Description |
|-------|-------------|
| Pattern | Text to match in app/title |
| Project | Target project name |
| Activity | Activity type (optional) |
| SAP Code | SAP time type code |
| Cost Center | SAP cost center |
| WBS Element | SAP WBS element |

### URL Rules

Auto-assign based on browser URL patterns.

### JIRA Rules

Auto-assign based on JIRA project keys (e.g., PROJ-123).

LightTrack automatically detects JIRA ticket patterns:
- \`PROJ-123\` in browser titles
- \`[PROJ-456]\` in IDE window titles
- \`proj-789\` (case-insensitive)

### Meeting Rules

Auto-assign based on Outlook/Teams meeting subjects.

---

## SAP Export

Export time data for SAP ByDesign timesheet submission.

### Steps

1. Enter your **Employee ID** in settings
2. Select a **date range** (This Week, Last Week, etc.)
3. Review the **preview table**
4. Click **Export to CSV**

### Export Columns

| Column | Description |
|--------|-------------|
| Date | Activity date |
| Project | Project name |
| Activity Type | Work category |
| Hours | Total hours (decimal) |
| SAP Code | Time type code |
| Cost Center | Cost center for billing |
| WBS | Work breakdown structure element |
| Description | Activity details/JIRA tickets |

---

## Settings

### Startup
- Launch at system startup
- Start tracking automatically

### Window Behavior
- **Close button behavior**: Minimize to tray or close app
- **Minimize to tray**: Send to system tray when minimized

### Daily Goals
- Deep work target (hours)
- Breaks target (count)

### Work Day
- Start time (for timeline display)
- End time

### Activity Consolidation
- **Smart**: Merge by JIRA ticket or similar titles
- **Strict**: Exact title match only
- **Relaxed**: Same project only

### Calendar Sync

Sync meetings from Outlook/Exchange via ICS subscription:
1. Get your ICS URL from Outlook settings
2. Paste in the Calendar ICS URL field
3. Click **Sync Now**

### Data Management
- Export all data to CSV
- Clear activities older than 30 days

---

## Taking Breaks

Regular breaks help maintain focus and productivity.

### Break Button
Click **Mark Break** in the Timer view to record a break.

### Snake Game 🐍
Click the snake button in the toolbar to play during breaks.

**Controls:**
- Arrow keys or WASD to move
- P to pause/resume
- Enter to restart

### Break Reminders
Enable in Settings to get notified when it's time for a break.

---

## Browser Extension

The browser extension tracks web browsing activity.

### Features
- Tracks visited URLs and page titles
- Detects JIRA tickets in web pages
- Detects GitHub issues
- Sends activity to LightTrack desktop

### Connection
- Connects via localhost port 41417
- Green = Connected, Red = Disconnected

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| \`Ctrl+Shift+T\` | Toggle tracking |
| \`Ctrl+Shift+F\` | Toggle floating timer |
| \`Ctrl+Y\` | Toggle developer tools |

---

## Troubleshooting

### Tracking Not Starting
1. Check permissions for window detection
2. Verify no antivirus is blocking
3. Restart the application

### Wrong Project Detection
1. Create a more specific mapping rule
2. Check pattern matches window title exactly

### Calendar Not Syncing
1. Verify ICS URL is correct (HTTPS only)
2. Check URL is accessible
3. Try manual sync

### Browser Extension Not Connecting
1. Ensure desktop app is running
2. Check port 41417 is not blocked
3. Reload the extension

---

## Data Storage

Data is stored locally:
- **Windows**: \`%APPDATA%/LightTrack/\`
- **macOS**: \`~/Library/Application Support/LightTrack/\`
- **Linux**: \`~/.config/LightTrack/\`

---

## Privacy & Security

- All data stored locally
- No external server communication
- Calendar sync uses HTTPS only
- No telemetry collection

---

**LightTrack** - Smart time tracking for productive professionals
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
        // Use Electron shell to open external links
        if (window.require) {
          const { shell } = window.require('electron');
          shell.openExternal(this.href);
        } else {
          window.open(this.href, '_blank');
        }
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
