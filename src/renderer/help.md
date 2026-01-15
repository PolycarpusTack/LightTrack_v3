# LightTrack User Manual

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

- **Today**: Total time tracked today
- **Billable**: Percentage of billable time
- **Context Switches**: Number of app changes (fewer = better focus)
- **Projects**: Number of different projects worked on today

### Activity Feed

Shows a chronological list of today's activities with:
- Project name and app
- Duration
- Billable status
- Tags (meeting, dev, jira, etc.)

Click any activity to edit its details.

### Insights Panel

- **Upcoming Meetings**: Shows synced calendar meetings
- **Top Projects**: Time distribution across projects
- **Weekly Focus Score**: Your 7-day focus average

---

## Timeline View

The Timeline view provides a detailed look at any day's activities.

### Date Navigation

- Use **<** and **>** arrows to navigate days
- Click **Today** to return to current date

### Day Statistics

- **Tracked**: Total time recorded
- **Gaps**: Untracked time during work hours
- **Billable**: Percentage of billable work
- **Projects**: Number of projects for the day

### Visual Timeline Bar

A horizontal bar showing your day with:
- Colored segments for different projects
- Gaps shown in gray
- Time markers for work hours

### Activity List

Detailed list of all activities for the selected day. Each entry shows:
- Time range (start - end)
- Project and app name
- Duration
- Tags and billable status

Click **+ Add entry** to add manual entries for the selected date.

### Editing Activities

Click any activity to open the edit modal:
- Change project assignment
- Adjust start/end times
- Toggle billable status
- Delete the entry

---

## Analytics View

The Analytics view provides insights into your work patterns.

### Date Range Selector

Choose from:
- **This Week**: Current week's data
- **This Month**: Current month's data
- **This Year**: Year-to-date data
- **All Time**: Complete history

### Filter Pills

Filter analytics by:
- **All**: All activities
- **Billable**: Only billable time
- **Non-billable**: Only non-billable time
- **Meetings**: Only meeting time

### Key Metrics

- **Total Time**: Sum of tracked hours
- **Avg per Day**: Average daily tracking
- **Top Project**: Most time-consuming project
- **Focus Time**: Deep work sessions (25+ minutes uninterrupted)

### Daily Activity Chart

Bar chart showing hours tracked per day.

### Project Breakdown

Pie chart and bars showing time distribution across projects.

### Insights

AI-generated insights about your work patterns:
- Peak productivity times
- Most frequent apps
- Focus session analysis

---

## Projects View

The Projects view is where you configure automatic project detection rules.

### App Rules

Auto-assign activities based on app name or window title.

**Example**: Assign "VS Code" to project "Development"

| Field | Description |
|-------|-------------|
| Pattern | Text to match in app/title (e.g., "VS Code") |
| Project | Target project name |
| Activity | Activity type (optional, e.g., "Coding") |
| SAP Code | SAP time type code |
| Cost Center | SAP cost center |
| WBS Element | SAP WBS element |

### URL Rules

Auto-assign based on browser URL patterns.

**Example**: Assign "github.com/myorg" to project "Open Source"

| Field | Description |
|-------|-------------|
| URL Pattern | URL substring to match |
| Project | Target project name |
| Activity | Activity type (optional) |
| SAP Code | SAP time type code |

### JIRA Rules

Auto-assign based on JIRA project keys detected in window titles.

**Example**: Assign tickets like "PROJ-123" to project "Project Alpha"

| Field | Description |
|-------|-------------|
| Project Key | JIRA prefix (e.g., "PROJ") |
| Project | Target LightTrack project |
| Activity | Activity type (optional) |
| SAP Code | SAP time type code |

LightTrack automatically detects JIRA ticket patterns like:
- `PROJ-123` in browser titles
- `[PROJ-456]` in IDE window titles
- `proj-789` (case-insensitive)

### Meeting Rules

Auto-assign based on Outlook/Teams meeting subjects.

**Example**: Assign "Sprint Planning" meetings to project "Agile"

| Field | Description |
|-------|-------------|
| Subject Pattern | Text in meeting subject |
| Project | Target project name |
| Activity | Activity type (defaults to "Meeting") |
| SAP Code | SAP time type code |

### All Projects

View total time tracked per project across all time.

Click **+ New Project** to create a project with SAP fields pre-configured.

---

## SAP Export

Export your time data for SAP ByDesign timesheet submission.

### Employee Settings

Enter your SAP Employee ID. This is included in the export file header.

### Select Period

Choose a date range:
- **This Week**: Monday to Sunday of current week
- **Last Week**: Previous week
- **This Month**: Current calendar month
- **Last Month**: Previous calendar month

### Preview

Review the aggregated data before export:

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

### Export to CSV

Click **Export to CSV** to download the file. The format is compatible with SAP ByDesign timesheet import.

---

## Settings

### Startup

- **Launch at system startup**: Start LightTrack when Windows starts
- **Start tracking automatically**: Begin tracking when app launches

### Window Behavior

- **Close button behavior**: Choose what happens when you click the X button
  - **Minimize to tray**: Window closes but app continues in system tray
  - **Close app**: Completely exit the application
- **Minimize to tray**: When checked, minimizing sends the app to system tray

### Daily Goals

- **Deep work target**: Hours of focused work per day (default: 4)
- **Breaks target**: Number of breaks per day (default: 4)

### Work Day

- **Start time**: When your workday begins (for timeline display)
- **End time**: When your workday ends

### Defaults

- **Default project**: Fallback project when no rule matches (default: "General")

### Activity Consolidation

Control how similar activities are merged:

- **Enable consolidation**: Toggle merging of similar activities
- **Consolidation mode**:
  - **Smart**: Merge activities with same JIRA ticket or similar titles
  - **Strict**: Only merge if titles match exactly
  - **Relaxed**: Merge all activities in the same project

### Calendar Sync

Sync meetings from Outlook/Exchange via ICS subscription.

1. Get your calendar ICS URL from Outlook (Settings > Calendar > Shared calendars > Publish calendar)
2. Paste the URL in the Calendar ICS URL field
3. Click **Sync Now**

Meetings sync automatically every 30 minutes.

**Privacy Note**: The ICS URL is typically public. Do not share it with others.

### Data Management

- **Export CSV**: Export all activities to CSV file
- **Clear old data**: Remove activities older than 30 days

### Tag Management

Manage tags for activity categorization:
- **System tags**: Auto-generated (meeting, dev, jira, etc.)
- **Custom tags**: User-defined tags

### Project Management

Configure projects with SAP fields:
- Project name
- SAP Code
- Cost Center
- WBS Element

### Activity Types

Define work categories:
- Development
- Meeting
- Communication
- Research
- Documentation
- Admin

---

## Taking Breaks

Regular breaks help maintain focus and productivity. LightTrack includes features to help you take effective breaks.

### Break Button

Click **Mark Break** in the Timer view to record a break. This creates a non-billable entry and resets your focus timer.

### Snake Game

Click the **Snake button (🐍)** in the toolbar to play a quick game of Snake during your break.

**Controls:**
- Arrow keys or WASD to move
- P to pause/resume
- Enter to restart after game over

Your high score is saved locally. The game is designed for short 5-minute breaks.

### Break Reminders

Enable break reminders in Settings to get notified when it's time for a break. You can configure the reminder interval (default: 60 minutes).

---

## Browser Extension

The LightTrack browser extension tracks your web browsing activity.

### Installation

1. Open Chrome/Edge/Firefox
2. Navigate to Extensions
3. Load the extension from `browser-extension` folder

### Features

- Tracks visited URLs and page titles
- Detects JIRA tickets in web pages
- Detects GitHub issues
- Sends activity to LightTrack desktop app

### Connection

The extension connects to LightTrack via localhost port 41417.

Green indicator = Connected
Red indicator = Disconnected

### Privacy

- Only URL and title are sent to local LightTrack app
- No data is sent to external servers
- Extension only activates when LightTrack desktop is running

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+T` | Toggle tracking |
| `Ctrl+Shift+F` | Toggle floating timer |
| `Ctrl+Y` | Toggle developer tools |

---

## Troubleshooting

### Tracking Not Starting

1. Ensure LightTrack has necessary permissions
2. Check that no antivirus is blocking window detection
3. Restart the application

### Wrong Project Detection

1. Create a more specific mapping rule in Projects view
2. Order matters: more specific rules should be listed first
3. Check pattern matches using exact text from window title

### Calendar Not Syncing

1. Verify ICS URL is correct (must be HTTPS or webcal://)
2. Check URL is accessible in browser
3. Ensure URL is for published calendar (not private)
4. Try clicking "Sync Now" manually

### Browser Extension Not Connecting

1. Ensure LightTrack desktop app is running
2. Check that port 41417 is not blocked by firewall
3. Reload the extension
4. Restart LightTrack

### SAP Export Issues

1. Ensure Employee ID is set
2. Verify projects have SAP Code configured
3. Check that activities have valid dates

### Data Not Saving

1. Check disk space availability
2. Ensure user data folder is writable
3. Check logs in `%APPDATA%/LightTrack/logs`

### High CPU Usage

1. Increase sampling interval in settings
2. Reduce number of mapping rules
3. Close unnecessary browser tabs

---

## Data Storage

LightTrack stores data locally in:
- **Windows**: `%APPDATA%/LightTrack/`
- **macOS**: `~/Library/Application Support/LightTrack/`
- **Linux**: `~/.config/LightTrack/`

Files include:
- `config.json` - Settings and mappings
- `activities.json` - Time entries
- `lighttrack.json` - Electron store data

---

## Privacy & Security

- All data is stored locally on your computer
- No data is sent to external servers
- Calendar sync uses HTTPS only
- Browser extension only communicates with localhost
- No telemetry or analytics collection

---

## Support

For issues and feature requests, visit:
- GitHub: https://github.com/lightsuite/lighttrack

---

**LightTrack** - Smart time tracking for productive professionals
