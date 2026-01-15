# LightTrack Complete Reference Manual

**Version 3.0.0** | Lightweight Time Tracking with Automatic Project Detection

---

## Document Information

| Field | Value |
|-------|-------|
| Generation Date | January 2025 |
| Codebase Version | 3.0.0 |
| Platform | Windows 10/11 (Electron-based) |
| License | MIT |

### Known Limitations of This Documentation
- Browser extension documentation is minimal (extension is in early development)
- Some edge cases in activity merging may not be fully documented
- Auto-updater behavior may vary by platform

---

## How to Use This Manual

### Reading Paths by Audience

| Audience | Recommended Sections |
|----------|---------------------|
| **Non-Technical Users** | Parts I, II (Chapters 1-2), Part VI Quick Reference |
| **New Developers** | Parts I through IV |
| **Experienced Developers** | Parts III, IV, V |
| **System Administrators** | Parts I, II, Appendices A-E |
| **Everyone** | Part VI (Complete Reference) |

### Document Conventions

- `Code blocks` indicate commands, file paths, or code
- **Bold text** indicates important terms or UI elements
- *Italic text* indicates emphasis or variable values
- > Blockquotes contain tips or important notes

---

## Table of Contents

### Part I: Introduction & Quick Start
- [Chapter 1: Project Overview](#chapter-1-project-overview)
- [Chapter 2: Installation Guide for Everyone](#chapter-2-installation-guide-for-everyone)
- [Chapter 3: Installation for Developers](#chapter-3-installation-for-developers)

### Part II: Understanding the Codebase
- [Chapter 4: Architecture Overview](#chapter-4-architecture-overview)
- [Chapter 5: Core Concepts](#chapter-5-core-concepts)

### Part III: Feature Documentation
- [Chapter 6: Activity Tracking](#chapter-6-activity-tracking)
- [Chapter 7: Project Detection & Mapping](#chapter-7-project-detection--mapping)
- [Chapter 8: Calendar Integration](#chapter-8-calendar-integration)
- [Chapter 9: Analytics & Reporting](#chapter-9-analytics--reporting)
- [Chapter 10: SAP Export](#chapter-10-sap-export)
- [Chapter 11: Settings & Configuration](#chapter-11-settings--configuration)
- [Chapter 12: System Tray & Window Management](#chapter-12-system-tray--window-management)

### Part IV: API Reference
- [Chapter 13: IPC API Reference](#chapter-13-ipc-api-reference)
- [Chapter 14: Preload API Reference](#chapter-14-preload-api-reference)

### Part V: Development Guide
- [Chapter 15: Contributing and Extending](#chapter-15-contributing-and-extending)
- [Chapter 16: Testing](#chapter-16-testing)
- [Chapter 17: Security](#chapter-17-security)

### Part VI: Complete Reference
- [Chapter 18: File-by-File Documentation](#chapter-18-file-by-file-documentation)
- [Chapter 19: Glossary](#chapter-19-glossary)
- [Chapter 20: Index by Task](#chapter-20-index-by-task)

### Appendices
- [Appendix A: Environment Variables](#appendix-a-environment-variables)
- [Appendix B: CLI Commands Reference](#appendix-b-cli-commands-reference)
- [Appendix C: Error Messages Reference](#appendix-c-error-messages-reference)
- [Appendix D: Dependencies](#appendix-d-dependencies)
- [Appendix E: Scripts Reference](#appendix-e-scripts-reference)
- [Appendix F: Keyboard Shortcuts](#appendix-f-keyboard-shortcuts)

---

# Part I: Introduction & Quick Start

---

## Chapter 1: Project Overview

### 1.1 What This Project Does

LightTrack is a desktop application that automatically tracks how you spend your time on your computer. It monitors which application window is active, records the time spent, and intelligently categorizes your work into projects. The application runs quietly in the background, detects JIRA tickets and meetings, syncs with your calendar, and can export timesheets for SAP ByDesign.

### 1.2 Key Capabilities

| Capability | Description |
|------------|-------------|
| **Automatic Tracking** | Monitors active window and records time automatically |
| **Project Detection** | Auto-assigns activities to projects based on patterns |
| **JIRA Integration** | Extracts ticket numbers (e.g., PROJ-123) from window titles |
| **Meeting Detection** | Recognizes Outlook appointments and Teams meetings |
| **Calendar Sync** | Imports meetings from Outlook/Exchange via ICS subscription |
| **SAP Export** | Exports timesheets in CSV format for SAP ByDesign |
| **Focus Metrics** | Measures productivity with focus scoring |
| **System Tray** | Runs minimized with quick access controls |
| **Break Reminders** | Configurable notifications for taking breaks |
| **Snake Game** | Built-in break activity for short mental breaks |

### 1.3 Technology Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Electron 39.2.7 |
| **Runtime** | Node.js |
| **Frontend** | Vanilla JavaScript, HTML5, CSS3 |
| **Data Storage** | electron-store (JSON-based local storage) |
| **Window Detection** | active-win library |
| **Calendar Parsing** | node-ical library |
| **Auto-Updates** | electron-updater |
| **Logging** | electron-log |
| **Testing** | Jest with jsdom |
| **Build System** | electron-builder |

### 1.4 Project Structure Overview

```
LightTrack/
├── src/                      # Source code
│   ├── main/                 # Electron main process
│   │   ├── index.js         # Application entry point
│   │   ├── core/            # Core business logic
│   │   ├── ipc/             # IPC handlers
│   │   └── services/        # High-level services
│   ├── renderer/            # UI (HTML, CSS, JS)
│   │   ├── index.html       # Main window template
│   │   ├── js/              # Frontend JavaScript
│   │   └── styles/          # CSS stylesheets
│   ├── preload.js           # Security bridge
│   ├── security/            # Security modules
│   └── shared/              # Shared utilities
├── config/                   # Configuration files
├── test/                     # Test files
├── assets/                   # Icons and images
├── browser-extension/        # Browser integration
├── docs/                     # Documentation
└── scripts/                  # Build and utility scripts
```

### 1.5 Quick Start

**For Users (Pre-built Application):**
1. Download the latest release from the releases page
2. Run the installer (`LightTrack-Setup-3.0.0.exe`)
3. Launch LightTrack from Start Menu
4. Click **Start** to begin tracking

**For Developers:**
```bash
git clone https://github.com/user/LightTrack.git
cd LightTrack
npm install
npm start
```

---

## Chapter 2: Installation Guide for Everyone

*This chapter is written for people who have never used a terminal before.*

### 2.1 What You'll Need Before Starting

**Hardware Requirements:**
- Computer running Windows 10 or Windows 11
- At least 4 GB of RAM (8 GB recommended)
- 200 MB of free disk space
- Internet connection (for calendar sync feature)

**Software Prerequisites:**
- None for pre-built installer

**Account Requirements (Optional):**
- Outlook/Exchange account (for calendar sync)
- JIRA account (for automatic ticket detection)

### 2.2 Step-by-Step Installation

#### Step 1: Download LightTrack

1. Open your web browser (Chrome, Edge, Firefox)
2. Navigate to the LightTrack releases page
3. Click on the latest version (e.g., `v3.0.0`)
4. Click `LightTrack-Setup-3.0.0.exe` to download

> **What to do if the download is blocked:**
> - Click "Keep" or "Keep anyway" if prompted
> - The file is safe but Windows may not recognize it

#### Step 2: Run the Installer

1. Find the downloaded file (usually in your Downloads folder)
2. Double-click `LightTrack-Setup-3.0.0.exe`
3. If Windows asks "Do you want to allow this app to make changes?", click **Yes**
4. Follow the installation wizard:
   - Click **Next** on the welcome screen
   - Accept the license agreement
   - Choose installation location (default is fine)
   - Click **Install**
   - Wait for installation to complete
   - Click **Finish**

> **What to do if you see "Windows protected your PC":**
> - Click "More info"
> - Click "Run anyway"
> - This appears because the app isn't from the Microsoft Store

#### Step 3: Launch LightTrack

1. Find LightTrack in your Start Menu
2. Click to launch
3. A splash screen will appear briefly
4. The main window will open

### 2.3 Verifying Installation

After launching, you should see:
- A window with "Timer" selected in the left sidebar
- A large timer display showing "00:00:00"
- A green "Start" button
- KPI cards showing "Today", "Billable", "Context Switches", "Projects"

**First Run Checklist:**
- [ ] Application window opens
- [ ] Timer view is displayed
- [ ] Start button is clickable
- [ ] System tray icon appears (small clock icon near the clock)

### 2.4 Common Installation Problems

| Problem | Solution |
|---------|----------|
| "Windows protected your PC" message | Click "More info" then "Run anyway" |
| Installer won't run | Right-click > "Run as administrator" |
| Application won't start | Check if antivirus is blocking it |
| Missing tray icon | Click the ^ arrow in system tray to find hidden icons |
| Black screen on launch | Wait 5-10 seconds; if persistent, restart the app |

---

## Chapter 3: Installation for Developers

### 3.1 Prerequisites

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Node.js | 18.x or later | `node --version` |
| npm | 9.x or later | `npm --version` |
| Git | Any recent | `git --version` |
| Windows Build Tools | Latest | (for native modules) |

**Installing Prerequisites on Windows:**
```powershell
# Install Node.js from https://nodejs.org/
# Or use Chocolatey:
choco install nodejs

# Install Windows Build Tools (run as Administrator)
npm install --global windows-build-tools
```

### 3.2 Clone and Setup Commands

```bash
# Clone the repository
git clone https://github.com/user/LightTrack.git

# Navigate to project directory
cd LightTrack

# Install dependencies
npm install

# If native module build fails, try:
npm rebuild
```

**Expected Output:**
```
added 1247 packages in 45s
```

### 3.3 Environment Configuration

Create a `.env` file in the project root (optional):

```bash
# Copy the example file
cp .env.example .env
```

**Environment Variables:**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `production` | Environment mode |
| `DEBUG` | No | `false` | Enable debug logging |
| `API_KEY` | No | - | External API key (future use) |
| `ENCRYPTION_KEY` | No | - | Data encryption key (future use) |

### 3.4 Running in Development Mode

```bash
# Start with development settings
npm run dev

# Or with explicit environment
NODE_ENV=development npm start
```

**Development Mode Features:**
- DevTools automatically open (Ctrl+Shift+I to toggle)
- Extended logging to console
- Hot-reload for renderer process changes
- Debug menu in application

### 3.5 Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- --testPathPattern=activity

# Run tests in watch mode
npm test -- --watch
```

**Expected Test Output:**
```
PASS  test/unit/activity-list.test.js
PASS  test/unit/feature-manager.test.js
...
Test Suites: 12 passed, 12 total
Tests:       87 passed, 87 total
```

### 3.6 Building for Production

```bash
# Build the application
npm run build

# Build for specific platform
npm run electron:build:win    # Windows
npm run electron:build:mac    # macOS
npm run electron:build:linux  # Linux

# Build all platforms
npm run electron:build:all
```

**Build Output:**
```
dist/
├── LightTrack-Setup-3.0.0.exe      # Windows installer
├── LightTrack-3.0.0.dmg            # macOS installer
├── LightTrack-3.0.0.AppImage       # Linux AppImage
└── win-unpacked/                    # Unpacked Windows build
```

---

# Part II: Understanding the Codebase

---

## Chapter 4: Architecture Overview

### 4.1 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        LIGHTTRACK APPLICATION                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────┐      ┌──────────────────────────────┐ │
│  │    MAIN PROCESS      │      │     RENDERER PROCESS         │ │
│  │    (Node.js)         │      │     (Chromium)               │ │
│  │                      │      │                              │ │
│  │  ┌────────────────┐  │      │  ┌────────────────────────┐  │ │
│  │  │ ActivityTracker│  │      │  │      UI (HTML/CSS)     │  │ │
│  │  │ WindowManager  │  │      │  │  ┌──────────────────┐  │  │ │
│  │  │ StorageManager │  │ IPC  │  │  │   Timer View     │  │  │ │
│  │  │ TrayManager    │◄─┼──────┼──┤  │   Timeline View  │  │  │ │
│  │  │ CalendarSync   │  │      │  │  │   Analytics View │  │  │ │
│  │  │ IdleDetector   │  │      │  │  │   Projects View  │  │  │ │
│  │  └────────────────┘  │      │  │  │   SAP Export     │  │  │ │
│  │                      │      │  │  │   Settings View  │  │  │ │
│  │  ┌────────────────┐  │      │  │  └──────────────────┘  │  │ │
│  │  │  IPC Handlers  │  │      │  │                        │  │ │
│  │  │  - Activities  │  │      │  │  ┌──────────────────┐  │  │ │
│  │  │  - Settings    │  │      │  │  │   app.js         │  │  │ │
│  │  │  - Tracking    │  │      │  │  │   modules/*.js   │  │  │ │
│  │  │  - Calendar    │  │      │  │  └──────────────────┘  │  │ │
│  │  │  - Projects    │  │      │  └────────────────────────┘  │ │
│  │  │  - Tags        │  │      │                              │ │
│  │  └────────────────┘  │      │                              │ │
│  └──────────────────────┘      └──────────────────────────────┘ │
│             │                              ▲                     │
│             │         ┌────────────────────┘                     │
│             ▼         │                                          │
│  ┌──────────────────────┐                                        │
│  │    PRELOAD SCRIPT    │                                        │
│  │    (Security Bridge) │                                        │
│  │                      │                                        │
│  │  window.lightTrackAPI│                                        │
│  │  - startTracking()   │                                        │
│  │  - stopTracking()    │                                        │
│  │  - getActivities()   │                                        │
│  │  - saveActivity()    │                                        │
│  │  - ...               │                                        │
│  └──────────────────────┘                                        │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                        EXTERNAL SYSTEMS                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │  OS API  │  │ Calendar │  │  Browser │  │  electron-store  │ │
│  │(active-  │  │   (ICS)  │  │Extension │  │   (JSON files)   │ │
│  │  win)    │  │          │  │          │  │                  │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Directory Structure Explained

#### `/src/main/` - Main Process
The Electron main process runs in Node.js with full system access.

| Directory/File | Purpose | Key Exports |
|----------------|---------|-------------|
| `index.js` | Application entry point, initializes all modules | `LightTrackApp` class |
| `logger.js` | Centralized logging service | `logger` object |
| `auto-updater.js` | Manages application updates | `setupAutoUpdater()` |
| `core/` | Core business logic modules | - |
| `ipc/` | IPC handler modules | - |
| `services/` | High-level service wrappers | - |

#### `/src/main/core/` - Core Modules

| File | Purpose | Key Functions |
|------|---------|---------------|
| `activity-tracker.js` | Main tracking engine | `start()`, `stop()`, `detectActivity()` |
| `storage-manager.js` | Storage abstraction | `getActivities()`, `saveActivity()` |
| `lightweight-storage.js` | Low-level storage | `lightweightCleanup()`, `mergeConsecutiveActivities()` |
| `window-manager.js` | Main window lifecycle | `createMainWindow()`, `show()`, `hide()` |
| `tray-manager.js` | System tray integration | `createTray()`, `updateTray()` |
| `title-parser.js` | Window title parsing | `parse()`, `detectProject()` |
| `idle-detector.js` | Idle state detection | `isIdle()`, `getIdleTime()` |
| `focus-session-tracker.js` | Focus metrics | `startSession()`, `endSession()` |
| `browser-extension-server.js` | Browser extension API | `startServer()` |

#### `/src/main/ipc/handlers/` - IPC Handlers

| File | Handles | Channels |
|------|---------|----------|
| `activitiesHandlerMain.js` | Activity CRUD | `activities:*` |
| `settingsHandlerMain.js` | Settings and mappings | `settings:*`, `*-mapping*` |
| `trackingHandlerMain.js` | Tracking control | `tracking:*` |
| `tagsHandlerMain.js` | Tag management | `tags:*` |
| `projectsHandlerMain.js` | Project management | `projects:*` |
| `activityTypesHandlerMain.js` | Activity types | `activityTypes:*` |
| `calendarHandlerMain.js` | Calendar operations | `calendar:*` |
| `updaterHandlerMain.js` | Auto-updates | `updater-*` |

#### `/src/renderer/` - Renderer Process
The UI runs in a Chromium-based browser environment.

| File/Directory | Purpose |
|----------------|---------|
| `index.html` | Main HTML template with all views |
| `js/app.js` | Main renderer application (~8000 lines) |
| `js/modules/` | Feature modules (charts, help, sap-export, etc.) |
| `styles/` | CSS stylesheets |
| `help.md` | Built-in help documentation |

#### `/src/security/` - Security Modules

| File | Purpose |
|------|---------|
| `security-config.js` | Security defaults and CSP configuration |
| `input-validator.js` | Input validation rules |
| `csp-generator.js` | Content Security Policy generator |

#### `/src/shared/` - Shared Code

| File | Purpose |
|------|---------|
| `constants.js` | Global constants (timing, IPC channels) |
| `sanitize.js` | Input sanitization utilities |

### 4.3 Data Flow

#### Tracking Flow
```
1. User clicks "Start"
   │
   ▼
2. Renderer: app.js startTracking()
   │
   ▼
3. IPC: window.lightTrackAPI.startTracking()
   │
   ▼
4. Preload: ipcRenderer.invoke('tracking:start')
   │
   ▼
5. Main: TrackingHandlerMain handles 'tracking:start'
   │
   ▼
6. Main: ActivityTracker.start()
   │
   ▼
7. Main: Polling loop begins (5-60 second intervals)
   │
   ├──► active-win gets active window info
   │
   ├──► title-parser detects project
   │
   ├──► Activity saved to storage
   │
   └──► IPC broadcast 'tracking-update' to renderer
```

#### Settings Flow
```
1. User changes setting in UI
   │
   ▼
2. Renderer: Settings input handler fires
   │
   ▼
3. Renderer: Calls saveSettings()
   │
   ▼
4. IPC: window.lightTrackAPI.updateSettings(data)
   │
   ▼
5. Main: SettingsHandlerMain validates and saves
   │
   ▼
6. Main: electron-store persists to JSON file
   │
   ▼
7. Main: Relevant modules notified of change
```

### 4.4 Key Design Patterns

| Pattern | Usage | Example |
|---------|-------|---------|
| **Module Pattern** | Feature encapsulation | `LightTrack.SAPExport = (function() {...})()` |
| **Singleton** | Core services | `StorageManager`, `TrayManager` |
| **Observer** | Event handling | IPC event broadcasts |
| **Repository** | Data access | `ActivitiesHandlerMain` |
| **Factory** | Object creation | `createSafeHandler()` |
| **Strategy** | Configurable behavior | Project detection rules |

### 4.5 External Dependencies and Purpose

| Package | Version | Purpose |
|---------|---------|---------|
| `electron` | 39.2.7 | Desktop application framework |
| `electron-store` | 8.2.0 | Persistent JSON storage |
| `electron-updater` | 6.6.2 | Auto-update functionality |
| `electron-log` | 5.4.3 | Cross-platform logging |
| `active-win` | 8.2.1 | Get active window information |
| `node-ical` | 0.22.1 | Parse ICS calendar files |

---

## Chapter 5: Core Concepts

### 5.1 Domain Terminology

| Term | Definition | Used In |
|------|------------|---------|
| **Activity** | A time entry with app, title, project, duration | Throughout |
| **Project** | A category for grouping activities | Mappings, Analytics |
| **Mapping** | A rule that assigns activities to projects | Settings, Title Parser |
| **Focus Session** | An uninterrupted work period (25+ minutes) | Analytics |
| **Billable** | Flag indicating if time is chargeable | Activities, Export |
| **Tag** | A label for categorizing activities | Activity management |
| **Sampling Rate** | How often the tracker checks the active window | Tracking |
| **Idle** | When no user input is detected for threshold time | Idle detection |
| **Consolidation** | Merging similar consecutive activities | Storage |

### 5.2 Key Abstractions

#### Activity Object
```javascript
{
  id: "1705123456789abc123",      // Unique identifier
  app: "Visual Studio Code",      // Application name
  title: "index.js - LightTrack", // Window title
  project: "LightTrack",          // Assigned project
  startTime: "2025-01-13T09:00:00.000Z",
  endTime: "2025-01-13T09:30:00.000Z",
  duration: 1800,                 // Seconds
  billable: true,
  tags: ["dev", "coding"],
  tickets: ["PROJ-123"],          // Detected JIRA tickets
  activityType: "Development",
  sapCode: "DEV001",
  costCenter: "IT-001",
  wbsElement: "WBS.001"
}
```

#### Project Mapping Object
```javascript
{
  id: "map_123",
  pattern: "LightTrack",          // Text to match
  project: "LightTrack Dev",      // Target project
  activity: "Development",        // Activity type
  sapCode: "DEV001",
  costCenter: "IT-001",
  wbsElement: "WBS.001",
  isRegex: false,
  caseSensitive: false
}
```

#### Settings Object
```javascript
{
  deepWorkTarget: 4,              // Hours per day
  breaksTarget: 4,                // Breaks per day
  workDayStart: "09:00",
  workDayEnd: "17:00",
  defaultProject: "General",
  launchAtStartup: false,
  autoStartTracking: false,
  closeBehavior: "minimize",      // "minimize" | "close"
  minimizeToTray: true,
  breakReminderEnabled: false,
  breakReminderInterval: 60       // Minutes
}
```

### 5.3 Configuration System

LightTrack uses a layered configuration system:

```
Priority (highest to lowest):
1. User settings (electron-store)
2. Environment variables (.env)
3. Environment-specific config (config/*.development.json)
4. Base config (config/*.json)
5. Hardcoded defaults
```

**Configuration Files:**

| File | Purpose |
|------|---------|
| `config/app-config.json` | Application metadata, feature flags |
| `config/tracking-config.json` | Tracking intervals, thresholds |
| `config/performance-config.json` | Sampling rates, limits |
| `config/ui-config.json` | Window dimensions, animations |
| `config/business-config.json` | Business rules |
| `config/network-config.json` | Network settings |

### 5.4 Error Handling Approach

LightTrack uses a consistent error handling pattern:

```javascript
// In IPC handlers - createSafeHandler wrapper
ipcMain.handle('channel', createSafeHandler('channel', async (event, data) => {
  // Handler code - errors are caught and logged
}));

// In renderer - try/catch with user notification
try {
  await window.lightTrackAPI.someOperation();
  showNotification('Success', 'success');
} catch (error) {
  console.error('Operation failed:', error);
  showNotification('Operation failed', 'error');
}
```

**Error Types:**
- **Validation Errors**: Invalid input data (shown to user)
- **Storage Errors**: Failed to read/write data (logged + notification)
- **Network Errors**: Calendar sync failures (silent retry)
- **System Errors**: OS-level failures (logged, graceful degradation)

### 5.5 Logging and Debugging

**Log Levels:**
```javascript
logger.error('Critical error');    // Always logged
logger.warn('Warning');            // Important issues
logger.info('Informational');      // General operations
logger.debug('Debug info');        // Development only
```

**Log Locations:**
- **Windows**: `%APPDATA%/LightTrack/logs/`
- **macOS**: `~/Library/Logs/LightTrack/`
- **Linux**: `~/.config/LightTrack/logs/`

**Debug Mode:**
```bash
# Enable debug logging
DEBUG=true npm start

# Or set in .env
DEBUG=true
```

**DevTools:**
- Press `Ctrl+Shift+I` to toggle DevTools
- Or `Ctrl+Y` when the app has focus

---

# Part III: Feature Documentation

---

## Chapter 6: Activity Tracking

### 6.1 Feature Overview

**What it does:** Automatically monitors your active window and records time entries.

**Where it lives:**
- Main logic: `/src/main/core/activity-tracker.js`
- IPC handlers: `/src/main/ipc/handlers/trackingHandlerMain.js`
- UI: `/src/renderer/js/app.js` (Timer view)

**Entry points:**
- `startTracking()` - Begin tracking
- `stopTracking()` - End tracking
- `toggleTracking()` - Toggle state

### 6.2 How It Works

#### Tracking Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                    TRACKING LIFECYCLE                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [STOPPED] ──── startTracking() ────► [TRACKING]            │
│      ▲                                     │                 │
│      │                                     │                 │
│      └─────── stopTracking() ◄────────────┘                 │
│                                                              │
│  While TRACKING:                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Every 5-60 seconds:                                   │ │
│  │  1. Get active window (active-win)                     │ │
│  │  2. Parse title for project/tickets                    │ │
│  │  3. Check if same as current activity                  │ │
│  │  4. If different: save current, start new              │ │
│  │  5. If same: update duration                           │ │
│  │  6. Broadcast update to renderer                       │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  IDLE DETECTION:                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  If no input for 180 seconds (configurable):           │ │
│  │  1. Pause tracking                                     │ │
│  │  2. Prompt user: "Were you working?"                   │ │
│  │  3. User decides: keep idle time or discard            │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

#### Activity Detection Flow

```javascript
// Simplified detection flow
async function detectActivity() {
  // 1. Get active window
  const window = await activeWin();
  // Returns: { owner: { name: "Code" }, title: "index.js - LightTrack" }

  // 2. Parse for project and tickets
  const parsed = titleParser.parse(window);
  // Returns: { project: "LightTrack", tickets: ["PROJ-123"] }

  // 3. Check if activity changed
  if (isDifferentActivity(parsed, currentActivity)) {
    // Save current activity
    await saveCurrentActivity();
    // Start new activity
    startNewActivity(parsed);
  } else {
    // Update duration
    currentActivity.duration += samplingInterval;
  }

  // 4. Broadcast update
  mainWindow.webContents.send('tracking-update', currentActivity);
}
```

### 6.3 Configuration Options

| Option | Location | Default | Description |
|--------|----------|---------|-------------|
| Sampling interval | `config/tracking-config.json` | 5-60s | Adaptive polling rate |
| Idle threshold | `config/tracking-config.json` | 180s | Seconds before idle detection |
| Min activity duration | `config/tracking-config.json` | 60s | Minimum recorded duration |
| Auto-start tracking | Settings | false | Start on app launch |

### 6.4 Usage Examples

**Starting Tracking:**
```javascript
// From renderer
await window.lightTrackAPI.startTracking();

// Response
{
  isActive: true,
  currentActivity: {
    app: "Visual Studio Code",
    title: "app.js - LightTrack",
    project: "LightTrack",
    startTime: "2025-01-13T09:00:00.000Z"
  }
}
```

**Getting Current Status:**
```javascript
const status = await window.lightTrackAPI.getTrackingStatus();
// Response
{
  isActive: true,
  isTracking: true,
  currentProject: "LightTrack",
  currentApp: "Visual Studio Code",
  currentActivity: { ... },
  sessionDuration: 1800,
  samplingRate: 15
}
```

### 6.5 Limitations and Constraints

- **Minimum sampling interval**: 5 seconds (to reduce CPU usage)
- **Maximum sampling interval**: 60 seconds (for accuracy)
- **Window detection**: Requires active-win library (OS-dependent)
- **Admin applications**: Some elevated windows may not be detected
- **Virtual desktops**: Only detects active desktop
- **Full-screen games**: May report incorrect window info

---

## Chapter 7: Project Detection & Mapping

### 7.1 Feature Overview

**What it does:** Automatically assigns activities to projects based on configurable rules.

**Where it lives:**
- Parser: `/src/main/core/title-parser.js`
- IPC handlers: `/src/main/ipc/handlers/settingsHandlerMain.js`
- UI: `/src/renderer/js/app.js` (Projects view)

### 7.2 How It Works

#### Rule Priority (Highest to Lowest)

```
1. JIRA Ticket Match    → If title contains "PROJ-123", use JIRA mapping
2. URL Pattern Match    → If browser URL matches pattern
3. Meeting Match        → If Outlook/Teams meeting subject matches
4. App Pattern Match    → If app name or title matches pattern
5. Default Project      → Fallback to "General" or configured default
```

#### Detection Examples

| Window Title | Detected Project | Rule Used |
|--------------|------------------|-----------|
| `PROJ-123: Fix login bug - Jira` | Project Alpha | JIRA mapping for "PROJ" |
| `github.com/myorg/repo` | Open Source | URL mapping for "github.com/myorg" |
| `Sprint Planning - Microsoft Teams` | Agile Ceremonies | Meeting mapping for "Sprint" |
| `index.js - Visual Studio Code` | Development | App mapping for "Visual Studio Code" |
| `Untitled - Notepad` | General | Default fallback |

### 7.3 Configuration Options

#### App Mappings
```javascript
{
  pattern: "Visual Studio Code",  // Match in app name or title
  project: "Development",
  activity: "Coding",
  sapCode: "DEV001",
  costCenter: "IT-001",
  wbsElement: "WBS.001",
  isRegex: false,                 // Support regex patterns
  caseSensitive: false
}
```

#### URL Mappings
```javascript
{
  urlPattern: "github.com/myorg", // Match in browser URL
  project: "Open Source",
  activity: "Code Review",
  sapCode: "OSS001"
}
```

#### JIRA Mappings
```javascript
{
  projectKey: "PROJ",             // JIRA project prefix
  project: "Project Alpha",
  activity: "Development",
  sapCode: "PROJ001"
}
```

#### Meeting Mappings
```javascript
{
  subjectPattern: "Sprint",       // Match in meeting subject
  project: "Agile Ceremonies",
  activity: "Meeting",
  sapCode: "MTG001"
}
```

### 7.4 Usage Examples

**Adding a Mapping:**
```javascript
await window.lightTrackAPI.addProjectMapping({
  pattern: "LightTrack",
  project: "LightTrack Development",
  activity: "Development",
  sapCode: "LT001"
});
```

**Testing a Pattern:**
```javascript
// In Projects view, enter a sample window title
// The UI shows which project would be detected
```

### 7.5 Limitations

- **Regex performance**: Complex regex patterns may slow detection
- **Case sensitivity**: By default, matching is case-insensitive
- **Pattern conflicts**: First matching rule wins; order matters
- **JIRA format**: Only detects standard "PROJECT-123" format
- **Meeting detection**: Requires Outlook/Teams window to be active

---

## Chapter 8: Calendar Integration

### 8.1 Feature Overview

**What it does:** Syncs meetings from Outlook/Exchange calendars via ICS subscription.

**Where it lives:**
- Service: `/src/main/services/calendarSyncService.js`
- IPC handlers: `/src/main/ipc/handlers/calendarHandlerMain.js`
- UI: `/src/renderer/js/app.js` (Settings view)

### 8.2 How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    CALENDAR SYNC FLOW                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. User provides ICS URL from Outlook                       │
│     └─► Settings > Calendar > Paste URL                      │
│                                                              │
│  2. Service fetches ICS file every 30 minutes                │
│     └─► node-ical parses the .ics format                     │
│                                                              │
│  3. Meetings extracted and stored locally                    │
│     └─► Upcoming meetings shown in Timer view                │
│                                                              │
│  4. Meeting detection during tracking                        │
│     └─► If Teams/Outlook is active, match meeting subject    │
│     └─► Apply meeting mapping rules for project assignment   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 8.3 Configuration Options

| Setting | Location | Description |
|---------|----------|-------------|
| Calendar URL | Settings | ICS subscription URL |
| Sync interval | Hardcoded | 30 minutes |
| Meeting mappings | Projects view | Subject-to-project rules |

### 8.4 Usage Examples

**Getting Calendar URL (Outlook):**
1. Open Outlook on the web (outlook.office.com)
2. Go to Settings (gear icon)
3. View all Outlook settings
4. Calendar > Shared calendars
5. Publish a calendar
6. Select "Can view all details"
7. Copy the ICS link

**Setting Calendar URL:**
```javascript
await window.lightTrackAPI.setCalendarUrl(
  "https://outlook.office365.com/owa/calendar/.../calendar.ics"
);
```

**Getting Today's Meetings:**
```javascript
const meetings = await window.lightTrackAPI.getTodayMeetings();
// Returns array of meeting objects
[
  {
    summary: "Sprint Planning",
    start: "2025-01-13T10:00:00.000Z",
    end: "2025-01-13T11:00:00.000Z",
    location: "Teams Meeting"
  }
]
```

### 8.5 Limitations

- **ICS only**: No native Outlook API integration
- **Read-only**: Cannot modify calendar from LightTrack
- **Public URL**: ICS URLs are typically public; keep them private
- **Sync delay**: Up to 30 minutes to reflect calendar changes
- **HTTPS required**: HTTP URLs are not supported

---

## Chapter 9: Analytics & Reporting

### 9.1 Feature Overview

**What it does:** Visualizes time tracking data with charts and metrics.

**Where it lives:**
- Charts: `/src/renderer/js/modules/charts.js`
- UI: `/src/renderer/js/app.js` (Analytics view)

### 9.2 Available Metrics

| Metric | Description | Calculation |
|--------|-------------|-------------|
| Total Time | Sum of all tracked time | Sum of activity durations |
| Average per Day | Daily average | Total time / days with data |
| Top Project | Most time spent | Max duration by project |
| Focus Time | Deep work sessions | Sessions 25+ minutes uninterrupted |
| Billable % | Billable vs total | Billable duration / total duration |
| Context Switches | App changes | Count of different apps per day |

### 9.3 Date Range Options

| Range | Description |
|-------|-------------|
| This Week | Monday through Sunday of current week |
| This Month | First through last day of current month |
| This Year | January 1st through today |
| All Time | All recorded activities |
| Custom | User-specified date range |

### 9.4 Filter Options

| Filter | Shows |
|--------|-------|
| All | All activities |
| Billable | Only activities marked as billable |
| Non-billable | Only activities not billable |
| Meetings | Only meeting-tagged activities |

### 9.5 Export Options

**CSV Export:**
```javascript
await window.lightTrackAPI.exportActivities('csv');
// Downloads: lighttrack-export-2025-01-13.csv
```

**JSON Export:**
```javascript
await window.lightTrackAPI.exportActivities('json');
// Downloads: lighttrack-export-2025-01-13.json
```

---

## Chapter 10: SAP Export

### 10.1 Feature Overview

**What it does:** Exports time data in CSV format compatible with SAP ByDesign timesheet import.

**Where it lives:**
- Module: `/src/renderer/js/modules/sap-export.js`
- UI: `/src/renderer/js/app.js` (SAP Export view)

### 10.2 Export Format

| Column | Description | Example |
|--------|-------------|---------|
| Date | Activity date | 2025-01-13 |
| Project | Project name | LightTrack |
| Activity Type | Work category | Development |
| Hours | Decimal hours | 2.50 |
| SAP Code | Time type code | DEV001 |
| Cost Center | Billing center | IT-001 |
| WBS | Work breakdown element | WBS.001 |
| Description | Activity details | Fixed login bug |

### 10.3 Usage Steps

1. Enter your Employee ID in SAP Export view
2. Select a date range (This Week, Last Week, etc.)
3. Review the preview table
4. Click "Export to CSV"
5. Save the file
6. Import into SAP ByDesign

### 10.4 Data Aggregation

Activities are aggregated by:
- Date
- Project

Multiple activities on the same day for the same project are combined, with:
- Durations summed
- Descriptions concatenated
- SAP codes taken from latest activity

---

## Chapter 11: Settings & Configuration

### 11.1 Feature Overview

**What it does:** Allows users to customize application behavior.

**Where it lives:**
- IPC handlers: `/src/main/ipc/handlers/settingsHandlerMain.js`
- UI: `/src/renderer/js/app.js` (Settings view)
- Storage: electron-store (`settings` key)

### 11.2 Available Settings

#### Startup Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Launch at startup | boolean | false | Start when Windows starts |
| Auto-start tracking | boolean | false | Begin tracking on launch |

#### Window Behavior

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Close behavior | enum | "minimize" | What X button does: minimize or close |
| Minimize to tray | boolean | true | Send to tray when minimized |

#### Daily Goals

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Deep work target | number | 4 | Hours of focused work goal |
| Breaks target | number | 4 | Number of breaks goal |

#### Work Day

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Start time | string | "09:00" | When workday begins |
| End time | string | "17:00" | When workday ends |

#### Tracking

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Default project | string | "General" | Fallback project |
| Break reminder | boolean | false | Enable break notifications |
| Reminder interval | number | 60 | Minutes between reminders |

### 11.3 Data Management

| Action | Description |
|--------|-------------|
| Export CSV | Download all activities as CSV |
| Backup | Create JSON backup of all data |
| Restore | Restore from backup file |
| Clear old data | Remove activities older than 30 days |

---

## Chapter 12: System Tray & Window Management

### 12.1 Feature Overview

**What it does:** Provides system tray integration and window behavior control.

**Where it lives:**
- Tray: `/src/main/core/tray-manager.js`
- Window: `/src/main/core/window-manager.js`

### 12.2 Tray Menu

| Menu Item | Action |
|-----------|--------|
| Show/Hide | Toggle main window visibility |
| Start/Stop Tracking | Toggle tracking state |
| Settings | Open settings view |
| Quit | Exit application completely |

### 12.3 Tray Tooltip

Displays current status:
- Current project (if tracking)
- Today's total time
- Tracking status (Active/Stopped)

### 12.4 Window Behavior

| Setting | X Button | Minimize |
|---------|----------|----------|
| Close = minimize, Minimize to tray = true | Hides to tray | Hides to tray |
| Close = minimize, Minimize to tray = false | Hides to taskbar | Hides to taskbar |
| Close = close, Minimize to tray = true | Exits app | Hides to tray |
| Close = close, Minimize to tray = false | Exits app | Hides to taskbar |

---

# Part IV: API Reference

---

## Chapter 13: IPC API Reference

### 13.1 Activities API

#### `activities:get`

Get activities, optionally filtered by date.

**Request:**
```javascript
ipcRenderer.invoke('activities:get', '2025-01-13')  // or null for all
```

**Response:**
```javascript
[
  {
    id: "1705123456789abc",
    app: "Visual Studio Code",
    title: "app.js - LightTrack",
    project: "LightTrack",
    startTime: "2025-01-13T09:00:00.000Z",
    endTime: "2025-01-13T09:30:00.000Z",
    duration: 1800,
    billable: true,
    tags: ["dev"],
    tickets: []
  }
]
```

#### `activities:save-manual`

Create a manual time entry.

**Request:**
```javascript
ipcRenderer.invoke('activities:save-manual', {
  app: "Meeting",
  title: "Sprint Planning",
  project: "Agile",
  startTime: "2025-01-13T10:00:00.000Z",
  endTime: "2025-01-13T11:00:00.000Z",
  billable: true,
  tags: ["meeting"]
})
```

**Response:**
```javascript
{
  id: "1705123456789def",
  // ... saved activity with generated fields
}
```

#### `activities:update`

Update an existing activity.

**Request:**
```javascript
ipcRenderer.invoke('activities:update', {
  id: "1705123456789abc",
  project: "New Project",
  billable: false
})
```

#### `activities:delete`

Delete an activity by ID.

**Request:**
```javascript
ipcRenderer.invoke('activities:delete', "1705123456789abc")
```

### 13.2 Tracking API

#### `tracking:start`

Start activity tracking.

**Request:**
```javascript
ipcRenderer.invoke('tracking:start')
```

**Response:**
```javascript
{
  isActive: true,
  currentActivity: { ... }
}
```

#### `tracking:stop`

Stop activity tracking.

**Request:**
```javascript
ipcRenderer.invoke('tracking:stop')
```

#### `tracking:get-current`

Get current tracking status and activity.

**Request:**
```javascript
ipcRenderer.invoke('tracking:get-current')
```

**Response:**
```javascript
{
  isActive: true,
  isTracking: true,
  currentProject: "LightTrack",
  currentApp: "Visual Studio Code",
  sessionDuration: 1800,
  samplingRate: 15
}
```

### 13.3 Settings API

#### `settings:get-all`

Get all settings and mappings.

**Request:**
```javascript
ipcRenderer.invoke('settings:get-all')
```

**Response:**
```javascript
{
  deepWorkTarget: 4,
  breaksTarget: 4,
  workDayStart: "09:00",
  workDayEnd: "17:00",
  defaultProject: "General",
  launchAtStartup: false,
  autoStartTracking: false,
  projectMappings: [...],
  urlMappings: [...],
  jiraMappings: [...],
  meetingMappings: [...]
}
```

#### `settings:save`

Save settings (partial update).

**Request:**
```javascript
ipcRenderer.invoke('settings:save', {
  deepWorkTarget: 6,
  autoStartTracking: true
})
```

### 13.4 Projects API

#### `projects:getAll`

Get all projects.

**Request:**
```javascript
ipcRenderer.invoke('projects:getAll')
```

#### `projects:add`

Add a new project.

**Request:**
```javascript
ipcRenderer.invoke('projects:add', {
  name: "New Project",
  sapCode: "NP001",
  costCenter: "IT-001",
  wbsElement: "WBS.001"
})
```

### 13.5 Tags API

#### `tags:getAll`

Get all tags (system + custom).

**Request:**
```javascript
ipcRenderer.invoke('tags:getAll')
```

**Response:**
```javascript
{
  systemTags: ["dev", "meeting", "admin", "communication"],
  customTags: ["important", "client-facing"]
}
```

#### `tags:updateActivity`

Update tags on an activity.

**Request:**
```javascript
ipcRenderer.invoke('tags:updateActivity', {
  activityId: "1705123456789abc",
  tags: ["dev", "important"]
})
```

### 13.6 Calendar API

#### `calendar:set-url`

Set the ICS calendar subscription URL.

**Request:**
```javascript
ipcRenderer.invoke('calendar:set-url', "https://outlook.../calendar.ics")
```

#### `calendar:sync`

Manually trigger calendar sync.

**Request:**
```javascript
ipcRenderer.invoke('calendar:sync')
```

#### `calendar:get-upcoming`

Get upcoming meetings (next 24 hours).

**Request:**
```javascript
ipcRenderer.invoke('calendar:get-upcoming')
```

---

## Chapter 14: Preload API Reference

The preload script exposes `window.lightTrackAPI` to the renderer process.

### 14.1 Tracking Methods

```javascript
// Start tracking
await window.lightTrackAPI.startTracking()

// Stop tracking
await window.lightTrackAPI.stopTracking()

// Toggle tracking
await window.lightTrackAPI.toggleTracking()

// Get current status
const status = await window.lightTrackAPI.getTrackingStatus()
```

### 14.2 Activity Methods

```javascript
// Get activities (optional date filter)
const activities = await window.lightTrackAPI.getActivities('2025-01-13')

// Save manual activity
const saved = await window.lightTrackAPI.saveManualActivity({...})

// Update activity
await window.lightTrackAPI.updateActivity({id: '...', ...updates})

// Delete activity
await window.lightTrackAPI.deleteActivity('activity-id')

// Export activities
await window.lightTrackAPI.exportActivities('csv') // or 'json'
```

### 14.3 Settings Methods

```javascript
// Get all settings
const settings = await window.lightTrackAPI.getSettings()

// Update settings
await window.lightTrackAPI.updateSettings({...changes})

// Get/set startup preference
const launchAtStartup = await window.lightTrackAPI.getLaunchAtStartup()
await window.lightTrackAPI.setLaunchAtStartup(true)
```

### 14.4 Mapping Methods

```javascript
// Project mappings
const mappings = await window.lightTrackAPI.getProjectMappings()
await window.lightTrackAPI.addProjectMapping({...})
await window.lightTrackAPI.removeProjectMapping('mapping-id')

// URL mappings
const urlMappings = await window.lightTrackAPI.getUrlMappings()
await window.lightTrackAPI.addUrlMapping({...})
await window.lightTrackAPI.removeUrlMapping('mapping-id')

// JIRA mappings
const jiraMappings = await window.lightTrackAPI.getJiraMappings()
await window.lightTrackAPI.addJiraMapping({...})
await window.lightTrackAPI.removeJiraMapping('mapping-id')

// Meeting mappings
const meetingMappings = await window.lightTrackAPI.getMeetingMappings()
await window.lightTrackAPI.addMeetingMapping({...})
await window.lightTrackAPI.removeMeetingMapping('mapping-id')
```

### 14.5 Calendar Methods

```javascript
// Set calendar URL
await window.lightTrackAPI.setCalendarUrl('https://...')

// Get calendar URL
const url = await window.lightTrackAPI.getCalendarUrl()

// Sync calendar
await window.lightTrackAPI.syncCalendar()

// Get meetings
const todayMeetings = await window.lightTrackAPI.getTodayMeetings()
const upcomingMeetings = await window.lightTrackAPI.getUpcomingMeetings()
```

### 14.6 Event Listeners

```javascript
// Listen for tracking updates
window.lightTrackAPI.onTrackingUpdate((activity) => {
  console.log('Activity update:', activity)
})

// Listen for status changes
window.lightTrackAPI.onStatusChange((status) => {
  console.log('Tracking status:', status)
})

// Listen for settings open request
window.lightTrackAPI.onOpenSettings(() => {
  // Switch to settings view
})
```

---

# Part V: Development Guide

---

## Chapter 15: Contributing and Extending

### 15.1 Development Workflow

**Branch Strategy:**
```
main          ─── production releases
  └── develop ─── integration branch
        └── feature/* ─── new features
        └── fix/* ─── bug fixes
        └── refactor/* ─── code improvements
```

**Commit Conventions:**
```
feat: add new feature
fix: resolve bug
refactor: code improvement
docs: documentation
test: add tests
chore: maintenance
```

**Example Commits:**
```
feat: add break reminder notification system
fix: resolve calendar sync timeout issue
refactor: extract title parser into separate module
docs: update API documentation
test: add unit tests for focus tracker
```

### 15.2 Code Style and Standards

**Linting:**
```bash
npm run lint
```

**ESLint Configuration:**
- ES6+ syntax
- Single quotes for strings
- 2-space indentation
- Semicolons required
- Max line length: 100 characters

**Naming Conventions:**

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `activity-tracker.js` |
| Classes | PascalCase | `ActivityTracker` |
| Functions | camelCase | `detectActivity()` |
| Constants | UPPER_SNAKE | `MAX_SAMPLING_RATE` |
| Variables | camelCase | `currentActivity` |
| IPC Channels | colon-separated | `activities:get` |

### 15.3 Adding New Features

#### Adding a New IPC Handler

1. **Create handler file:**
```javascript
// src/main/ipc/handlers/newFeatureHandlerMain.js
const { ipcMain } = require('electron');
const logger = require('../../logger');

class NewFeatureHandlerMain {
  constructor(storage, appState, createSafeHandler) {
    this.storage = storage;
    this.appState = appState;
    this.createSafeHandler = createSafeHandler;
  }

  registerHandlers() {
    logger.debug('Registering NewFeature IPC handlers...');

    ipcMain.handle('newFeature:action',
      this.createSafeHandler('newFeature:action', async (event, data) => {
        // Implementation
        return result;
      })
    );
  }
}

module.exports = NewFeatureHandlerMain;
```

2. **Register in main/index.js:**
```javascript
const NewFeatureHandlerMain = require('./ipc/handlers/newFeatureHandlerMain');

// In setupIPCHandlers():
this.newFeatureHandler = new NewFeatureHandlerMain(
  this.storage,
  this.appState,
  createSafeHandler
);
this.newFeatureHandler.registerHandlers();
```

3. **Expose in preload.js:**
```javascript
newFeatureAction: (data) => ipcRenderer.invoke('newFeature:action', data),
```

4. **Use in renderer:**
```javascript
const result = await window.lightTrackAPI.newFeatureAction(data);
```

#### Adding a New View

1. **Add HTML in index.html:**
```html
<div class="view" data-view="new-view">
  <h1>New View</h1>
  <!-- View content -->
</div>
```

2. **Add navigation button:**
```html
<button class="nav-btn" data-view="new-view" title="New View">
  <!-- Icon -->
</button>
```

3. **Add view loader in app.js:**
```javascript
async function loadNewView() {
  // Load and render view content
}

// In navigation handler:
case 'new-view':
  loadNewView();
  break;
```

### 15.4 Debugging

**Enable Debug Mode:**
```bash
DEBUG=true npm start
```

**Debug Logging:**
```javascript
const logger = require('./logger');

logger.debug('Detailed debug info', { data: value });
logger.info('General information');
logger.warn('Warning message');
logger.error('Error occurred', error);
```

**DevTools Shortcuts:**
- `Ctrl+Shift+I` - Toggle DevTools
- `Ctrl+Y` - Alternative toggle
- `Ctrl+R` - Reload renderer

**Common Debug Scenarios:**

| Issue | Debug Approach |
|-------|----------------|
| IPC not working | Check console for handler registration |
| Activity not saving | Log in storage manager |
| Window detection failing | Check active-win output |
| Calendar not syncing | Log calendar service response |

---

## Chapter 16: Testing

### 16.1 Test Structure

```
test/
├── unit/                    # Unit tests
│   ├── activity-list.test.js
│   ├── feature-manager.test.js
│   └── components/
├── integration/             # Integration tests
│   ├── app.test.js
│   ├── end-to-end.test.js
│   └── performance.test.js
├── e2e/                     # End-to-end tests
│   └── tracking-workflow.test.js
├── security/                # Security tests
│   ├── csrf.test.js
│   └── input-validation.test.js
└── fixtures/                # Test data
```

### 16.2 Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific file
npm test -- activity-list.test.js

# Run in watch mode
npm test -- --watch

# Run only unit tests
npm test -- --testPathPattern=unit

# Run security tests
npm test -- --testPathPattern=security
```

### 16.3 Writing Tests

**Unit Test Example:**
```javascript
// test/unit/title-parser.test.js
const { parse } = require('../../src/main/core/title-parser');

describe('TitleParser', () => {
  describe('JIRA ticket detection', () => {
    test('detects standard JIRA format', () => {
      const result = parse({
        owner: { name: 'Chrome' },
        title: 'PROJ-123: Fix bug - Jira'
      });
      expect(result.tickets).toContain('PROJ-123');
    });

    test('detects multiple tickets', () => {
      const result = parse({
        owner: { name: 'Code' },
        title: 'PROJ-123 and PROJ-456 comparison'
      });
      expect(result.tickets).toHaveLength(2);
    });
  });
});
```

**Integration Test Example:**
```javascript
// test/integration/tracking.test.js
describe('Tracking Integration', () => {
  test('start tracking creates activity', async () => {
    const tracker = new ActivityTracker(mockStorage, mockStore);

    await tracker.start();
    expect(tracker.isTracking).toBe(true);

    // Wait for first detection
    await new Promise(r => setTimeout(r, 100));

    expect(mockStorage.saveActivity).toHaveBeenCalled();
  });
});
```

### 16.4 Test Coverage Requirements

| Area | Minimum Coverage |
|------|-----------------|
| Core modules | 80% |
| IPC handlers | 70% |
| Utilities | 90% |
| Security | 100% |

---

## Chapter 17: Security

### 17.1 Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SECURITY BOUNDARIES                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  MAIN PROCESS (Trusted)                                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ • Full Node.js access                                  │ │
│  │ • File system operations                               │ │
│  │ • Native module access                                 │ │
│  │ • IPC handler validation                               │ │
│  └────────────────────────────────────────────────────────┘ │
│                          ▲                                   │
│                          │ IPC (validated)                   │
│                          │                                   │
│  PRELOAD (Bridge)        │                                   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ • Whitelist of exposed APIs                            │ │
│  │ • contextBridge isolation                              │ │
│  │ • No direct Node access                                │ │
│  └────────────────────────────────────────────────────────┘ │
│                          │                                   │
│                          ▼                                   │
│  RENDERER (Untrusted)                                        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ • Web content only                                     │ │
│  │ • No Node integration                                  │ │
│  │ • CSP enforced                                         │ │
│  │ • Sandboxed execution                                  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 17.2 Security Features

| Feature | Implementation |
|---------|----------------|
| Context Isolation | Main/renderer fully separated |
| Node Integration | Disabled in renderer |
| Sandbox Mode | Enabled for main window |
| CSP | Strict Content Security Policy |
| Input Validation | All IPC inputs validated |
| Sanitization | HTML/script stripping |
| Rate Limiting | IPC request throttling |

### 17.3 Input Validation

**Validation in IPC Handlers:**
```javascript
// src/shared/sanitize.js
function sanitizeString(str, maxLength = 1000) {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .substring(0, maxLength)
    .replace(/<[^>]*>/g, ''); // Strip HTML
}

function sanitizeProjectName(name) {
  return sanitizeString(name, 100)
    .replace(/[<>:"/\\|?*]/g, ''); // Remove invalid chars
}
```

### 17.4 Security Best Practices for Contributors

1. **Never trust renderer input** - Always validate in main process
2. **Use createSafeHandler** - Wraps handlers with error handling
3. **Sanitize before display** - Use `escapeHtml()` for user content
4. **No eval or innerHTML** - Use DOM methods or text content
5. **Log security events** - But never log sensitive data

---

# Part VI: Complete Reference

---

## Chapter 18: File-by-File Documentation

### Main Process Files

#### `/src/main/index.js`

| Property | Value |
|----------|-------|
| **Path** | `/src/main/index.js` |
| **Type** | Source |
| **Language** | JavaScript |
| **Lines** | ~600 |
| **Purpose** | Application entry point and initialization |

**Contains:**
- `LightTrackApp` class - Main application controller
- `setupIPCHandlers()` - Register all IPC handlers
- `initializeModules()` - Create core modules
- App lifecycle event handlers

**Key Functions:**

| Function | Purpose |
|----------|---------|
| `constructor()` | Initialize app state and modules |
| `setupIPCHandlers()` | Register all IPC channel handlers |
| `initializeModules()` | Create storage, tracker, window, tray |
| `run()` | Start the application |

---

#### `/src/main/core/activity-tracker.js`

| Property | Value |
|----------|-------|
| **Path** | `/src/main/core/activity-tracker.js` |
| **Type** | Source |
| **Language** | JavaScript |
| **Lines** | ~450 |
| **Purpose** | Core activity tracking engine |

**Contains:**
- `ActivityTracker` class
- Polling loop management
- Activity detection logic
- Idle handling

**Key Functions:**

| Function | Purpose | Parameters |
|----------|---------|------------|
| `start()` | Begin tracking | - |
| `stop()` | End tracking | - |
| `detectActivity()` | Get current window info | - |
| `saveCurrentActivity()` | Persist current activity | - |
| `handleIdleReturn()` | Process idle time decision | keepIdleTime: boolean |

---

#### `/src/main/core/storage-manager.js`

| Property | Value |
|----------|-------|
| **Path** | `/src/main/core/storage-manager.js` |
| **Type** | Source |
| **Language** | JavaScript |
| **Lines** | ~200 |
| **Purpose** | Data persistence abstraction layer |

**Key Functions:**

| Function | Purpose | Parameters |
|----------|---------|------------|
| `getActivities(options)` | Retrieve activities | `{ startDate, endDate }` |
| `saveActivity(activity)` | Save new activity | Activity object |
| `updateActivity(id, updates)` | Modify activity | ID, partial updates |
| `deleteActivity(id)` | Remove activity | Activity ID |

---

#### `/src/main/core/title-parser.js`

| Property | Value |
|----------|-------|
| **Path** | `/src/main/core/title-parser.js` |
| **Type** | Source |
| **Language** | JavaScript |
| **Lines** | ~300 |
| **Purpose** | Window title parsing and project detection |

**Key Functions:**

| Function | Purpose | Returns |
|----------|---------|---------|
| `parse(windowInfo)` | Parse window for project/tickets | `{ project, tickets, tags }` |
| `detectJiraTickets(title)` | Find JIRA ticket numbers | Array of ticket strings |
| `matchProject(app, title)` | Match against project rules | Project name or null |

---

### Renderer Files

#### `/src/renderer/js/app.js`

| Property | Value |
|----------|-------|
| **Path** | `/src/renderer/js/app.js` |
| **Type** | Source |
| **Language** | JavaScript |
| **Lines** | ~7500 |
| **Purpose** | Main renderer application logic |

**Contains:**
- View management (Timer, Timeline, Analytics, Projects, SAP, Settings)
- Activity list rendering
- Real-time UI updates
- Event handlers
- Utility functions

**Key Functions:**

| Function | Purpose |
|----------|---------|
| `initApp()` | Initialize renderer application |
| `loadActivities()` | Fetch and display activities |
| `loadTimelineView()` | Render timeline view |
| `loadAnalyticsView()` | Render analytics view |
| `loadProjectsView()` | Render projects view |
| `loadSettingsView()` | Render settings view |
| `startTracking()` | Begin tracking from UI |
| `stopTracking()` | Stop tracking from UI |
| `showNotification()` | Display toast notification |

---

#### `/src/renderer/js/modules/sap-export.js`

| Property | Value |
|----------|-------|
| **Path** | `/src/renderer/js/modules/sap-export.js` |
| **Type** | Source |
| **Language** | JavaScript |
| **Lines** | ~330 |
| **Purpose** | SAP ByDesign export functionality |

**Exports:**
```javascript
window.LightTrack.SAPExport = {
  init,
  updatePreview,
  getState,
  getThisWeekRange,
  getLastWeekRange,
  getThisMonthRange,
  getLastMonthRange
}
```

---

### Configuration Files

#### `/config/tracking-config.json`

| Property | Value |
|----------|-------|
| **Path** | `/config/tracking-config.json` |
| **Type** | Config |
| **Format** | JSON |

**Contents:**
```json
{
  "detection": {
    "baseInterval": 60000,
    "minInterval": 5000,
    "maxInterval": 60000
  },
  "idle": {
    "threshold": 180,
    "checkInterval": 10000
  },
  "breakReminder": {
    "defaultInterval": 3600000
  }
}
```

---

## Chapter 19: Glossary

| Term | Definition |
|------|------------|
| **Activity** | A recorded time entry with app, title, project, and duration |
| **Active Window** | The currently focused application window |
| **Billable** | Time that can be charged to a client |
| **Context Switch** | Changing from one application to another |
| **CSP** | Content Security Policy - browser security mechanism |
| **Deep Work** | Focused, uninterrupted work sessions |
| **Electron** | Framework for building desktop apps with web technologies |
| **electron-store** | Library for persistent JSON storage |
| **Focus Session** | A work period of 25+ minutes without switching apps |
| **ICS** | iCalendar format for calendar data |
| **Idle** | State when no user input detected |
| **IPC** | Inter-Process Communication between main and renderer |
| **JIRA Ticket** | Issue identifier in format PROJECT-123 |
| **Main Process** | Electron process with Node.js and system access |
| **Mapping** | Rule that assigns activities to projects |
| **Preload Script** | Bridge between main and renderer processes |
| **Renderer Process** | Electron process running the UI (Chromium) |
| **Sampling Rate** | How often tracking checks the active window |
| **SAP ByDesign** | SAP's cloud ERP system for timesheets |
| **System Tray** | Notification area near the system clock |
| **WBS Element** | Work Breakdown Structure code for SAP |

---

## Chapter 20: Index by Task

### "I want to..."

#### Track my time
- **Start tracking**: Click Start button or use `Ctrl+Shift+T`
- **Stop tracking**: Click Stop button or use `Ctrl+Shift+T`
- **Add manual entry**: Click "Add Manual" in Timer view
- **View today's activities**: Timer view > Activity Feed

#### Set up project detection
- **Add app mapping**: Projects view > App Rules > Add
- **Add URL mapping**: Projects view > URL Rules > Add
- **Add JIRA mapping**: Projects view > JIRA Rules > Add
- **Add meeting mapping**: Projects view > Meeting Rules > Add

#### Export my time
- **Export to CSV**: Settings > Export CSV
- **Export for SAP**: SAP Export view > Select period > Export
- **Backup all data**: Settings > Backup

#### Configure the app
- **Change startup behavior**: Settings > Startup
- **Set work hours**: Settings > Work Day
- **Enable break reminders**: Settings > Break Reminder
- **Change tray behavior**: Settings > Window Behavior

#### Sync my calendar
- **Set calendar URL**: Settings > Calendar > ICS URL
- **Manual sync**: Settings > Calendar > Sync Now
- **View meetings**: Timer view > Upcoming Meetings

#### Understand my time
- **View analytics**: Analytics view
- **See daily breakdown**: Timeline view
- **Check focus score**: Timer view > KPI Cards

#### Debug issues
- **View logs**: `%APPDATA%/LightTrack/logs/`
- **Open DevTools**: `Ctrl+Shift+I`
- **Enable debug mode**: Set `DEBUG=true` in environment

#### Develop/contribute
- **Run in dev mode**: `npm run dev`
- **Run tests**: `npm test`
- **Build for production**: `npm run build`
- **Lint code**: `npm run lint`

---

# Appendices

---

## Appendix A: Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `production` | Environment: `development` or `production` |
| `DEBUG` | No | `false` | Enable debug logging |
| `API_KEY` | No | - | External API key (future use) |
| `ENCRYPTION_KEY` | No | - | Data encryption key (future use) |

**Usage:**
```bash
# Windows PowerShell
$env:DEBUG="true"; npm start

# Windows CMD
set DEBUG=true && npm start

# Linux/macOS
DEBUG=true npm start
```

---

## Appendix B: CLI Commands Reference

| Command | Description | Example |
|---------|-------------|---------|
| `npm start` | Launch application | `npm start` |
| `npm run dev` | Launch in development mode | `npm run dev` |
| `npm test` | Run test suite | `npm test` |
| `npm run lint` | Run ESLint | `npm run lint` |
| `npm run build` | Build distributable | `npm run build` |
| `npm run electron:build:win` | Build Windows installer | - |
| `npm run electron:build:mac` | Build macOS installer | - |
| `npm run electron:build:linux` | Build Linux AppImage | - |
| `npm run electron:build:all` | Build all platforms | - |
| `npm run docs:api` | Generate API documentation | - |

---

## Appendix C: Error Messages Reference

| Error | Cause | Solution |
|-------|-------|----------|
| "LightTrack API not available" | Preload script failed | Restart application |
| "Failed to start tracking" | Tracker initialization error | Check logs, restart |
| "Failed to load activities" | Storage read error | Check disk space, restart |
| "Calendar sync failed" | Invalid ICS URL or network error | Verify URL, check connection |
| "Failed to save settings" | Storage write error | Check disk space, permissions |
| "Invalid activity data" | Malformed activity object | Check input fields |
| "Project name is required" | Empty project name | Enter a project name |
| "SAP Export module failed to load" | Module initialization error | Restart application |

---

## Appendix D: Dependencies

### Production Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `electron` | 39.2.7 | Desktop application framework |
| `electron-store` | 8.2.0 | Persistent local storage |
| `electron-updater` | 6.6.2 | Auto-update functionality |
| `electron-log` | 5.4.3 | Cross-platform logging |
| `active-win` | 8.2.1 | Active window detection |
| `node-ical` | 0.22.1 | ICS calendar parsing |

### Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `electron-builder` | 26.0.12 | Application packaging |
| `jest` | 29.7.0 | Testing framework |
| `eslint` | - | Code linting |
| `@babel/core` | 7.x | JavaScript transpilation |
| `jsdoc` | - | API documentation generation |

---

## Appendix E: Scripts Reference

| Script | Purpose | Usage |
|--------|---------|-------|
| `start` | Launch Electron app | `npm start` |
| `dev` | Launch in development mode | `npm run dev` |
| `build` | Build production bundle | `npm run build` |
| `test` | Run Jest tests | `npm test` |
| `test:coverage` | Run tests with coverage | `npm run test:coverage` |
| `lint` | Run ESLint | `npm run lint` |
| `lint:fix` | Auto-fix lint issues | `npm run lint:fix` |
| `electron:build:win` | Build Windows installer | - |
| `electron:build:mac` | Build macOS DMG | - |
| `electron:build:linux` | Build Linux AppImage | - |
| `electron:build:all` | Build all platforms | - |
| `docs:api` | Generate JSDoc API docs | - |
| `release` | Full production build | - |

---

## Appendix F: Keyboard Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| `Ctrl+Shift+T` | Toggle tracking | Global |
| `Ctrl+Shift+F` | Toggle floating timer | Global |
| `Ctrl+Y` | Toggle DevTools | Window focused |
| `Escape` | Close modal | Modal open |
| `Space` | Toggle tracking | Timer view focused |
| `M` | Mark break | Timer view focused |
| `A` | Add manual entry | Timer view focused |
| `Arrow Keys` / `WASD` | Move snake | Snake game |
| `P` | Pause/resume | Snake game |
| `Enter` | Restart | Snake game (game over) |

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | January 2025 | Initial comprehensive manual |

---

**LightTrack** - Smart time tracking for productive professionals

*This manual was generated from the codebase and represents the actual implementation as of version 3.0.0.*
