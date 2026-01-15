# LightTrack

LightTrack is a desktop time tracking application for Windows that automatically monitors your active applications and categorizes your work time by project. It runs locally with no internet connection required, keeping all your data private on your computer.

**Version:** 3.0.0
**Platform:** Windows 10/11
**License:** MIT

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Features](#features)
- [User Interface](#user-interface)
- [Configuration](#configuration)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Data Export](#data-export)
- [Browser Extension](#browser-extension)
- [Troubleshooting](#troubleshooting)
- [Privacy and Security](#privacy-and-security)
- [Uninstalling](#uninstalling)

---

## Installation

### System Requirements

| Requirement | Minimum |
|-------------|---------|
| Operating System | Windows 10 (64-bit) |
| RAM | 4 GB |
| Disk Space | 200 MB |
| Display | 1280 x 720 |

### Install Steps

1. Download `LightTrack-Setup-3.0.0.exe` from the releases page.
2. Run the installer and follow the on-screen prompts.
3. Launch LightTrack from your desktop shortcut or Start Menu.
4. The application starts minimized to the system tray.

---

## Quick Start

### Start Tracking Your Time

1. Click the LightTrack icon in the system tray to open the main window.
2. Click **Start Tracking** in the header bar.
3. Work normally. LightTrack monitors your active window and records time automatically.
4. Click **Stop Tracking** when finished.

### Add a Manual Time Entry

1. Click **Add Time** in the header bar.
2. Enter the duration or specify start and end times.
3. Select a project from the dropdown.
4. Add an optional description.
5. Click **Save**.

### View Your Activities

1. Open the **Timeline** view to see activities on a 24-hour timeline.
2. Use the date picker to view different days.
3. Click any activity to edit its details.

---

## Features

### Automatic Time Tracking

LightTrack monitors your active window and records:

- Application name
- Window title
- Time spent
- Start and end times

The tracker pauses automatically when you are idle (default: 5 minutes) and resumes when you return.

### Project Assignment

Assign time to projects using these methods:

- **Automatic mapping:** Create rules that match window titles to projects
- **Manual selection:** Choose a project when adding or editing activities
- **Default project:** Set a fallback project in settings

### Activity Management

- **Edit activities:** Change project, description, tags, or billable status
- **Merge activities:** Combine multiple activities into one
- **Delete activities:** Remove unwanted entries
- **Bulk operations:** Select multiple activities for batch editing

### Daily Summary

The Timer view displays a collapsible summary card showing:

- Total tracked time
- Billable time and percentage
- Progress toward daily goal
- Top projects by time
- Active time range

### Analytics Dashboard

The Analytics view provides:

- Time distribution by project (pie chart)
- Daily trends over time (bar chart)
- Productivity metrics
- Billable vs non-billable breakdown
- Custom date range filtering

### SAP Export

Export time entries in SAP-compatible format:

- Select a date range
- Preview entries before export
- Download as formatted text
- View export history

### Backup and Restore

Protect your data with full backup capabilities:

- Create JSON backup of all activities, settings, and mappings
- Restore from backup file
- Backup includes version information for compatibility

---

## User Interface

### Views

| View | Purpose |
|------|---------|
| Timer | Start/stop tracking, view daily summary, see current activity |
| Activities | Browse and filter all recorded activities |
| Timeline | Visual 24-hour timeline of daily activities |
| Analytics | Charts and statistics for productivity analysis |
| SAP Export | Export time data in SAP format |
| Settings | Configure application behavior and mappings |

### Navigation

- Click view names in the sidebar to switch views.
- Use keyboard shortcuts for quick navigation (see below).
- The current view is highlighted in the sidebar.

### System Tray

LightTrack runs in the system tray when minimized:

- **Double-click:** Open main window
- **Right-click:** Access context menu
- **Scroll wheel:** Pause or resume tracking

---

## Configuration

### Settings Overview

Access settings by clicking **Settings** in the sidebar.

#### Tracking Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Idle Threshold | Minutes of inactivity before pausing | 5 |
| Auto-start Tracking | Begin tracking when app launches | Off |
| Minimum Activity Duration | Ignore activities shorter than this | 60 seconds |
| Consolidate Activities | Merge similar consecutive activities | On |
| Merge Gap Threshold | Maximum gap between mergeable activities | 5 minutes |

#### Project Mappings

Create rules to automatically assign projects based on window patterns:

1. Go to **Settings > Project Mappings**.
2. Click **Add Rule**.
3. Enter a pattern (supports wildcards and regex).
4. Select the target project.
5. Click **Save**.

**Pattern Examples:**

| Pattern | Matches | Project |
|---------|---------|---------|
| `Visual Studio` | Any window containing "Visual Studio" | Development |
| `*Outlook*` | Windows with "Outlook" anywhere in title | Communication |
| `/JIRA-\d+/i` | JIRA ticket references (regex) | Project Management |
| `Microsoft Teams` | Teams application | Meetings |

#### URL Mappings

Map web URLs to projects (requires browser extension):

- Match by domain: `github.com` → Development
- Match by path: `*/pull/*` → Code Review
- Use regex for complex patterns

#### JIRA Mappings

Automatically detect JIRA ticket references in window titles:

- Map JIRA project keys to LightTrack projects
- Example: `PROJ` → Project Alpha (matches PROJ-123, PROJ-456)

#### Meeting Mappings

Identify meetings by title patterns:

- `*Stand-up*` → Daily Standup
- `*Review*` → Code Review
- `*Planning*` → Sprint Planning

### Projects

Manage your project list:

1. Go to **Settings > Projects**.
2. Add custom projects with optional SAP codes.
3. Edit or delete existing projects.
4. System projects (General, Internal IT) cannot be deleted.

### Tags

Organize activities with tags:

- System tags: development, meeting, review, planning, research
- Create custom tags in Settings
- Apply multiple tags per activity

---

## Keyboard Shortcuts

### Global Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+L` | Show or hide main window |

### Application Shortcuts

| Shortcut | Action |
|----------|--------|
| `Space` | Toggle tracking (Timer view) |
| `Ctrl+N` | Add manual time entry |
| `Ctrl+S` | Open settings |
| `Ctrl+E` | Export activities |
| `Ctrl+F` | Focus search field |
| `F1` | Open help |
| `Escape` | Close modal or dialog |

### Timeline Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+A` | Select all activities |
| `Delete` | Delete selected activities |
| `M` | Merge selected activities |

---

## Data Export

### CSV Export

Export activities to CSV for use in spreadsheets:

1. Go to **Activities** view.
2. Apply filters (date range, project, tags).
3. Click **Export CSV**.
4. Choose a save location.

The export includes:

- Date and time
- Duration
- Project name
- Description
- Tags
- Billable status
- SAP codes (if configured)

### SAP Export

Export time entries for SAP timesheet entry:

1. Go to **SAP Export** view.
2. Select the date range.
3. Review the preview.
4. Click **Export**.

---

## Browser Extension

Track time spent in web browsers with the optional browser extension.

### Installation

1. Open Chrome or Edge.
2. Navigate to `chrome://extensions` or `edge://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `browser-extension` folder from your LightTrack installation.

### Usage

- The extension communicates with LightTrack on port 41417.
- LightTrack must be running for the extension to work.
- Tracked URLs appear as activities with the browser name.

### Supported Browsers

- Google Chrome
- Microsoft Edge
- Other Chromium-based browsers

---

## Troubleshooting

### Application Does Not Start

1. Check if LightTrack is already running in the system tray.
2. End any existing `LightTrack.exe` processes in Task Manager.
3. Run the application as Administrator.
4. Check Windows Defender or antivirus exclusions.

### Tracking Does Not Work

1. Verify tracking is active (header shows "Stop Tracking" button).
2. Check the idle threshold setting.
3. Ensure the application has necessary permissions.
4. Review the activity log in the console (Ctrl+Shift+I).

### Activities Are Missing

1. Check the date filter (default shows today only).
2. Clear any active search filters.
3. Look for merged activities that may contain the missing time.
4. Verify the minimum activity duration setting.

### Browser Extension Not Connecting

1. Confirm LightTrack desktop application is running.
2. Check that port 41417 is not blocked by firewall.
3. Reload the browser extension.
4. Verify the extension has permission to access localhost.

### Data Recovery

If you need to recover data:

1. Check for automatic backups in `%APPDATA%/lighttrack`.
2. Use the **Restore from Backup** feature in Settings.
3. Contact support with your backup file if needed.

---

## Privacy and Security

### Data Storage

- All data is stored locally in `%APPDATA%/lighttrack`.
- Data is encrypted using the operating system keychain.
- No data is transmitted over the internet.

### Network Usage

- LightTrack operates completely offline by default.
- The browser extension uses localhost (127.0.0.1) only.
- No telemetry or analytics are collected.

### Permissions

LightTrack requires:

- Window title access for activity tracking
- File system access for data storage
- Network access for browser extension (localhost only)

---

## Uninstalling

### Standard Uninstall

1. Open **Windows Settings > Apps**.
2. Search for "LightTrack".
3. Click **Uninstall**.
4. Follow the prompts.

### Complete Removal

To remove all data after uninstalling:

1. Delete `%APPDATA%/lighttrack` folder.
2. Delete `%LOCALAPPDATA%/lighttrack` folder (if present).

### Keep Your Data

During uninstall, choose to keep your data if you plan to reinstall later. Your activities and settings remain in the AppData folder.

---

## Support

- **Issues:** Report bugs on the project repository
- **Questions:** Check the troubleshooting section above
- **Feature Requests:** Submit via the project repository

---

## Credits

**LightTrack** is developed by 2LS - Yannick Verrydt.

Built with:

- Electron
- Chart.js
- electron-store

---

*Last updated: January 2026 | Version 3.0.0*
# LightTrack_v3
