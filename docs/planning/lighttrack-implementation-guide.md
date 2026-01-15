# LightTrack Complete Implementation Guide
## From Chaos to Clean - A Systematic Transformation

> **IMPORTANT**: Follow these instructions EXACTLY as written. Do not deviate or add extra features unless explicitly instructed. Each phase builds on the previous one.

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Feature Architecture](#feature-architecture)
3. [Phase 0: Project Cleanup](#phase-0-project-cleanup)
4. [Phase 1: Core Foundation](#phase-1-core-foundation)
5. [Phase 2: Essential Features](#phase-2-essential-features)
6. [Phase 3: UI/UX Implementation](#phase-3-uiux-implementation)
7. [Phase 4: Feature Modules](#phase-4-feature-modules)
8. [Phase 5: Polish & Distribution](#phase-5-polish--distribution)
9. [UI/UX Design Specifications](#uiux-design-specifications)
10. [Validation Checklist](#validation-checklist)

---

## 🎯 Project Overview

### Goal
Transform LightTrack from a cluttered codebase into a clean, lightweight time-tracking application with a modern VSCode/Notion-inspired UI.

### Core Principles
- **Lightweight**: < 50MB installer, < 100MB RAM usage
- **Fast**: < 2 second startup time
- **Clean**: No unnecessary dependencies or features
- **Modular**: Features can be enabled/disabled
- **Professional**: VSCode/Notion aesthetic

### Target Structure
```
LightTrack/
├── src/
│   ├── main/           # Electron main process
│   ├── renderer/       # Frontend code
│   └── shared/         # Shared utilities
├── build/              # Build configurations
├── dist/               # Build output
├── docs/               # Documentation
└── tests/              # Test files
```

---

## 🏗️ Feature Architecture

### Core Features (Always Enabled)
```
📍 Time Tracking Engine
  ├── 🔄 Automatic Window Tracking
  ├── ⏸️ Idle Detection (3 min default)
  ├── 🎯 Project Auto-detection (JIRA, Git)
  └── 💾 Local Data Storage (electron-store)

📊 Basic UI & Interaction
  ├── 📱 System Tray Integration
  ├── ⌨️ Keyboard Shortcuts (Ctrl+Shift+T)
  ├── 📋 Activity List View
  └── ⏱️ Current Activity Display

✏️ Manual Entry
  ├── ⏰ Quick Time Entry
  ├── 🗣️ Natural Language Input
  └── 📝 Edit/Delete Activities
```

### Optional Features (Modules)
```
🎯 Productivity Suite
  ├── 🍅 Pomodoro Timer
  ├── 📈 Goals & Targets
  ├── 🔔 Smart Notifications
  └── 🎪 Focus Mode

📊 Analytics & Reporting
  ├── 📈 Timeline Visualization
  ├── 📊 Project Distribution
  ├── 📑 Custom Reports
  └── 📤 Export (CSV, JSON)

🌐 Integrations
  ├── 📧 Outlook Integration
  ├── 🌏 Browser Extension
  ├── 🔌 Web API (port 41417)
  └── 🎮 RPG Gamification
```

---

## 🧹 Phase 0: Project Cleanup

### Objective
Clean up the existing chaos and create a foundation for the new structure.

### Step 1: Create Cleanup Script
Create file: `cleanup-project.js`

```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Files to preserve and relocate
const PRESERVE_FILES = {
  'main.js': 'archive/original/main.js',
  'preload.js': 'archive/original/preload.js',
  'lightweight-storage.js': 'archive/original/lightweight-storage.js',
  'package.json': 'archive/original/package.json',
  // Feature files to preserve
  'rpg-character-system.js': 'archive/features/rpg-character-system.js',
  'goals-system.js': 'archive/features/goals-system.js',
  'pomodoro-visual-feedback.js': 'archive/features/pomodoro-visual-feedback.js',
  'natural-language-parser.js': 'archive/features/natural-language-parser.js',
  'outlook-integration.js': 'archive/features/outlook-integration.js',
  'do-not-track.js': 'archive/features/do-not-track.js',
  'notification-system.js': 'archive/features/notification-system.js',
  'ultra-lightweight-features.js': 'archive/features/ultra-lightweight-features.js'
};

// Create archive structure
const ARCHIVE_DIRS = [
  'archive/original',
  'archive/features',
  'archive/fixes',
  'archive/html-files',
  'archive/styles',
  'archive/scripts',
  'archive/docs',
  'archive/screenshots'
];

console.log('🧹 Starting LightTrack cleanup...\n');

// Create archive directories
ARCHIVE_DIRS.forEach(dir => {
  fs.mkdirSync(dir, { recursive: true });
  console.log(`✓ Created ${dir}`);
});

// Archive important files
Object.entries(PRESERVE_FILES).forEach(([src, dest]) => {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`✓ Archived ${src} → ${dest}`);
  }
});

// Move all fix-*.js files
const files = fs.readdirSync('.');
files.forEach(file => {
  if (file.startsWith('fix-') && file.endsWith('.js')) {
    fs.renameSync(file, `archive/fixes/${file}`);
  }
  if (file.endsWith('.html') && file !== 'index.html') {
    fs.renameSync(file, `archive/html-files/${file}`);
  }
  if (file.endsWith('.md') && !['README.md', 'LICENSE'].includes(file)) {
    fs.renameSync(file, `archive/docs/${file}`);
  }
  if (file.endsWith('.png') || file.endsWith('.jpg')) {
    fs.renameSync(file, `archive/screenshots/${file}`);
  }
  if (file.endsWith('.bat') || file.endsWith('.sh') || file.endsWith('.ps1')) {
    fs.renameSync(file, `archive/scripts/${file}`);
  }
});

// Archive styles directory
if (fs.existsSync('styles')) {
  fs.renameSync('styles', 'archive/styles/original');
}

console.log('\n✅ Cleanup complete! Check archive/ directory for preserved files.');
```

### Step 2: Run Cleanup
```bash
# Execute cleanup
node cleanup-project.js

# Remove node_modules and reinstall
rm -rf node_modules package-lock.json
```

### Step 3: Create New Project Structure
```bash
# Create directory structure
mkdir -p src/main/core
mkdir -p src/main/services  
mkdir -p src/main/integrations
mkdir -p src/renderer/js
mkdir -p src/renderer/styles
mkdir -p src/renderer/components
mkdir -p src/renderer/features
mkdir -p src/shared
mkdir -p build
mkdir -p docs
mkdir -p tests
```

### Step 4: Create New package.json
Create file: `package.json`

```json
{
  "name": "lighttrack",
  "version": "3.0.0",
  "description": "Lightweight time tracking with automatic project detection",
  "main": "src/main/index.js",
  "scripts": {
    "start": "electron .",
    "dev": "electron . --dev",
    "build": "electron-builder",
    "test": "jest",
    "lint": "eslint src"
  },
  "keywords": ["time-tracking", "productivity", "electron"],
  "author": "LightSuite Team",
  "license": "MIT",
  "devDependencies": {
    "electron": "^28.3.3",
    "electron-builder": "^24.13.3",
    "eslint": "^8.57.0",
    "jest": "^29.7.0"
  },
  "dependencies": {
    "active-win": "^8.2.1",
    "electron-store": "^8.2.0"
  },
  "build": {
    "appId": "com.lightsuite.lighttrack",
    "productName": "LightTrack",
    "directories": {
      "output": "dist"
    },
    "files": [
      "src/**/*",
      "!src/**/*.test.js",
      "!src/**/*.map"
    ],
    "win": {
      "target": "nsis",
      "icon": "build/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true
    }
  }
}
```

### Step 5: Install Dependencies
```bash
npm install
```

### Expected Result
- Clean directory with only essential files
- All old files archived in `archive/` directory
- New project structure created
- Dependencies installed

---

## 🏗️ Phase 1: Core Foundation

### Objective
Create the minimal working Electron application with basic time tracking.

### Step 1: Create Main Process Entry
Create file: `src/main/index.js`

```javascript
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

class LightTrackApp {
  constructor() {
    this.mainWindow = null;
    this.isTracking = false;
    
    // Bind methods
    this.createWindow = this.createWindow.bind(this);
    this.setupIPC = this.setupIPC.bind(this);
  }

  async init() {
    // Disable GPU acceleration for better performance
    app.disableHardwareAcceleration();
    
    await app.whenReady();
    this.createWindow();
    this.setupIPC();
  }

  createWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      },
      backgroundColor: '#0f172a',
      titleBarStyle: 'hiddenInset',
      frame: process.platform === 'darwin',
      show: false
    });

    this.mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();
    });

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  setupIPC() {
    ipcMain.handle('get-tracking-status', () => this.isTracking);
    
    ipcMain.handle('toggle-tracking', () => {
      this.isTracking = !this.isTracking;
      return this.isTracking;
    });
  }
}

// Initialize app
const app = new LightTrackApp();
app.init();

// Handle app lifecycle
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

### Step 2: Create Preload Script
Create file: `src/preload.js`

```javascript
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('lightTrackAPI', {
  getTrackingStatus: () => ipcRenderer.invoke('get-tracking-status'),
  toggleTracking: () => ipcRenderer.invoke('toggle-tracking'),
  
  // We'll add more methods as we build features
  onTrackingUpdate: (callback) => {
    ipcRenderer.on('tracking-update', callback);
  }
});
```

### Step 3: Create Basic HTML
Create file: `src/renderer/index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LightTrack</title>
    <link rel="stylesheet" href="styles/app.css">
</head>
<body>
    <div class="app-container">
        <!-- Activity Bar -->
        <div class="activity-bar">
            <div class="activity-icon active" data-view="timer">
                <span class="icon">⏱️</span>
            </div>
        </div>

        <!-- Main Content -->
        <div class="main-content">
            <div class="current-activity">
                <h2>Time Tracking</h2>
                <div class="timer" id="timer">00:00:00</div>
                <button class="btn btn-primary" id="toggle-tracking">
                    Start Tracking
                </button>
            </div>
        </div>
    </div>
    
    <script src="js/app.js"></script>
</body>
</html>
```

### Step 4: Create Basic Styles
Create file: `src/renderer/styles/app.css`

```css
:root {
    --bg-primary: #0f172a;
    --bg-secondary: #1e293b;
    --text-primary: #f1f5f9;
    --text-secondary: #e2e8f0;
    --accent-primary: #00bcd4;
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    height: 100vh;
    overflow: hidden;
}

.app-container {
    display: flex;
    height: 100vh;
}

.activity-bar {
    width: 48px;
    background: var(--bg-primary);
    border-right: 1px solid rgba(255, 255, 255, 0.1);
    padding: 12px 0;
}

.activity-icon {
    width: 32px;
    height: 32px;
    margin: 0 auto 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 6px;
}

.activity-icon.active {
    color: var(--accent-primary);
}

.main-content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
}

.current-activity {
    text-align: center;
}

.timer {
    font-size: 48px;
    font-weight: 700;
    color: var(--accent-primary);
    margin: 24px 0;
    font-variant-numeric: tabular-nums;
}

.btn {
    padding: 12px 24px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
}

.btn-primary {
    background: var(--accent-primary);
    color: white;
}

.btn-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 188, 212, 0.3);
}
```

### Step 5: Create Basic JavaScript
Create file: `src/renderer/js/app.js`

```javascript
// Timer functionality
let timerInterval = null;
let startTime = null;

async function init() {
  const toggleBtn = document.getElementById('toggle-tracking');
  const timerDisplay = document.getElementById('timer');
  
  // Get initial status
  const isTracking = await window.lightTrackAPI.getTrackingStatus();
  updateUI(isTracking);
  
  // Toggle tracking
  toggleBtn.addEventListener('click', async () => {
    const isTracking = await window.lightTrackAPI.toggleTracking();
    updateUI(isTracking);
  });
  
  // Update timer display
  function updateTimer() {
    if (startTime) {
      const elapsed = Date.now() - startTime;
      const hours = Math.floor(elapsed / 3600000);
      const minutes = Math.floor((elapsed % 3600000) / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);
      
      timerDisplay.textContent = 
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
  }
  
  function updateUI(isTracking) {
    if (isTracking) {
      toggleBtn.textContent = 'Stop Tracking';
      toggleBtn.classList.add('tracking');
      startTime = Date.now();
      timerInterval = setInterval(updateTimer, 1000);
    } else {
      toggleBtn.textContent = 'Start Tracking';
      toggleBtn.classList.remove('tracking');
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      startTime = null;
      timerDisplay.textContent = '00:00:00';
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
```

### Step 6: Test Basic Functionality
```bash
npm start
```

### Expected Result
- Electron window opens with basic UI
- Start/Stop tracking button works
- Timer displays elapsed time
- Clean, minimal interface

---

## 🛠️ Phase 2: Essential Features

### Objective
Add core time tracking functionality: window detection, storage, and activity list.

### Step 1: Create Storage Manager
Create file: `src/main/core/storage-manager.js`

```javascript
const Store = require('electron-store');

class StorageManager {
  constructor() {
    this.store = new Store({
      name: 'lighttrack-data',
      defaults: {
        activities: [],
        settings: {
          idleThreshold: 180000, // 3 minutes
          mergeThreshold: 60000, // 1 minute
          projectMappings: {}
        }
      }
    });
  }

  // Activities
  getActivities(date = null) {
    const activities = this.store.get('activities', []);
    if (!date) return activities;
    
    const dateStr = date.toISOString().split('T')[0];
    return activities.filter(a => a.date === dateStr);
  }

  addActivity(activity) {
    const activities = this.getActivities();
    activities.push({
      id: Date.now().toString(),
      ...activity,
      date: new Date().toISOString().split('T')[0]
    });
    this.store.set('activities', activities);
    return activity;
  }

  updateActivity(id, updates) {
    const activities = this.getActivities();
    const index = activities.findIndex(a => a.id === id);
    if (index !== -1) {
      activities[index] = { ...activities[index], ...updates };
      this.store.set('activities', activities);
      return activities[index];
    }
    return null;
  }

  deleteActivity(id) {
    const activities = this.getActivities();
    const filtered = activities.filter(a => a.id !== id);
    this.store.set('activities', filtered);
  }

  // Settings
  getSettings() {
    return this.store.get('settings');
  }

  updateSettings(updates) {
    const settings = this.getSettings();
    const newSettings = { ...settings, ...updates };
    this.store.set('settings', newSettings);
    return newSettings;
  }

  // Project mappings
  getProjectMappings() {
    return this.store.get('settings.projectMappings', {});
  }

  addProjectMapping(pattern, project) {
    const mappings = this.getProjectMappings();
    mappings[pattern] = project;
    this.store.set('settings.projectMappings', mappings);
  }
}

module.exports = StorageManager;
```

### Step 2: Create Activity Tracker
Create file: `src/main/core/activity-tracker.js`

```javascript
const activeWin = require('active-win');

class ActivityTracker {
  constructor(storageManager) {
    this.storage = storageManager;
    this.isTracking = false;
    this.currentActivity = null;
    this.trackingInterval = null;
    this.lastActiveTime = Date.now();
  }

  async start() {
    if (this.isTracking) return;
    
    this.isTracking = true;
    this.lastActiveTime = Date.now();
    
    // Track every 5 seconds
    this.trackingInterval = setInterval(() => {
      this.track();
    }, 5000);
    
    // Initial track
    await this.track();
  }

  stop() {
    if (!this.isTracking) return;
    
    this.isTracking = false;
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }
    
    // Save current activity
    if (this.currentActivity) {
      this.saveActivity();
      this.currentActivity = null;
    }
  }

  async track() {
    try {
      const window = await activeWin();
      if (!window) return;
      
      const now = Date.now();
      const settings = this.storage.getSettings();
      
      // Check if idle
      if (now - this.lastActiveTime > settings.idleThreshold) {
        // Save current activity and pause
        if (this.currentActivity) {
          this.saveActivity();
          this.currentActivity = null;
        }
        return;
      }
      
      // Create activity data
      const activityData = {
        app: window.owner.name,
        title: window.title,
        project: this.detectProject(window.title)
      };
      
      // Check if same activity
      if (this.currentActivity && 
          this.currentActivity.app === activityData.app &&
          this.currentActivity.title === activityData.title) {
        // Update end time
        this.currentActivity.endTime = now;
      } else {
        // Save previous activity
        if (this.currentActivity) {
          this.saveActivity();
        }
        
        // Start new activity
        this.currentActivity = {
          ...activityData,
          startTime: now,
          endTime: now
        };
      }
      
      this.lastActiveTime = now;
    } catch (error) {
      console.error('Error tracking activity:', error);
    }
  }

  detectProject(title) {
    const mappings = this.storage.getProjectMappings();
    
    // Check custom mappings first
    for (const [pattern, project] of Object.entries(mappings)) {
      if (title.toLowerCase().includes(pattern.toLowerCase())) {
        return project;
      }
    }
    
    // Check for JIRA pattern
    const jiraMatch = title.match(/\[([A-Z]+-\d+)\]/);
    if (jiraMatch) return jiraMatch[1];
    
    // Check for common project patterns
    const projectMatch = title.match(/(?:^|\s)([A-Z]{2,}-\d+)(?:\s|$)/);
    if (projectMatch) return projectMatch[1];
    
    return 'General';
  }

  saveActivity() {
    if (!this.currentActivity) return;
    
    const duration = this.currentActivity.endTime - this.currentActivity.startTime;
    
    // Only save if duration > 10 seconds
    if (duration > 10000) {
      this.storage.addActivity({
        ...this.currentActivity,
        duration
      });
    }
  }

  getStatus() {
    return {
      isTracking: this.isTracking,
      currentActivity: this.currentActivity
    };
  }
}

module.exports = ActivityTracker;
```

### Step 3: Update Main Process
Update file: `src/main/index.js`

```javascript
const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');

// Import core modules
const StorageManager = require('./core/storage-manager');
const ActivityTracker = require('./core/activity-tracker');

class LightTrackApp {
  constructor() {
    this.mainWindow = null;
    this.tray = null;
    this.storage = new StorageManager();
    this.tracker = new ActivityTracker(this.storage);
  }

  async init() {
    app.disableHardwareAcceleration();
    await app.whenReady();
    
    this.createWindow();
    this.createTray();
    this.setupIPC();
  }

  createWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      },
      backgroundColor: '#0f172a',
      titleBarStyle: 'hiddenInset',
      frame: process.platform === 'darwin',
      show: false
    });

    this.mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();
    });

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  createTray() {
    // Create tray icon (you'll need to add an icon file)
    this.tray = new Tray(path.join(__dirname, '..', '..', 'assets', 'tray-icon.png'));
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show LightTrack',
        click: () => {
          if (this.mainWindow) {
            this.mainWindow.show();
          }
        }
      },
      {
        label: 'Start Tracking',
        id: 'start-tracking',
        click: () => this.tracker.start()
      },
      {
        label: 'Stop Tracking',
        id: 'stop-tracking',
        click: () => this.tracker.stop(),
        visible: false
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => app.quit()
      }
    ]);
    
    this.tray.setToolTip('LightTrack');
    this.tray.setContextMenu(contextMenu);
  }

  setupIPC() {
    // Tracking controls
    ipcMain.handle('start-tracking', async () => {
      await this.tracker.start();
      this.updateTrayMenu();
      return this.tracker.getStatus();
    });
    
    ipcMain.handle('stop-tracking', () => {
      this.tracker.stop();
      this.updateTrayMenu();
      return this.tracker.getStatus();
    });
    
    ipcMain.handle('get-tracking-status', () => {
      return this.tracker.getStatus();
    });
    
    // Data access
    ipcMain.handle('get-activities', (event, date) => {
      return this.storage.getActivities(date ? new Date(date) : null);
    });
    
    ipcMain.handle('update-activity', (event, id, updates) => {
      return this.storage.updateActivity(id, updates);
    });
    
    ipcMain.handle('delete-activity', (event, id) => {
      return this.storage.deleteActivity(id);
    });
    
    // Settings
    ipcMain.handle('get-settings', () => {
      return this.storage.getSettings();
    });
    
    ipcMain.handle('update-settings', (event, updates) => {
      return this.storage.updateSettings(updates);
    });
  }

  updateTrayMenu() {
    const menu = this.tray.contextMenu;
    const isTracking = this.tracker.isTracking;
    
    menu.getMenuItemById('start-tracking').visible = !isTracking;
    menu.getMenuItemById('stop-tracking').visible = isTracking;
    
    this.tray.setContextMenu(menu);
  }
}

// Initialize app
const app = new LightTrackApp();
app.init();

// Handle app lifecycle
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

### Step 4: Update Preload Script
Update file: `src/preload.js`

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lightTrackAPI', {
  // Tracking
  startTracking: () => ipcRenderer.invoke('start-tracking'),
  stopTracking: () => ipcRenderer.invoke('stop-tracking'),
  getTrackingStatus: () => ipcRenderer.invoke('get-tracking-status'),
  
  // Activities
  getActivities: (date) => ipcRenderer.invoke('get-activities', date),
  updateActivity: (id, updates) => ipcRenderer.invoke('update-activity', id, updates),
  deleteActivity: (id) => ipcRenderer.invoke('delete-activity', id),
  
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (updates) => ipcRenderer.invoke('update-settings', updates),
  
  // Events
  onTrackingUpdate: (callback) => {
    ipcRenderer.on('tracking-update', callback);
  }
});
```

### Step 5: Create Activity List Component
Create file: `src/renderer/components/activity-list.js`

```javascript
class ActivityList {
  constructor(container) {
    this.container = container;
    this.activities = [];
  }

  async refresh() {
    // Get today's activities
    const today = new Date().toISOString().split('T')[0];
    this.activities = await window.lightTrackAPI.getActivities(today);
    this.render();
  }

  render() {
    if (this.activities.length === 0) {
      this.container.innerHTML = `
        <div class="empty-state">
          <span class="icon">📋</span>
          <p>No activities tracked today</p>
          <small>Start tracking to see your time here</small>
        </div>
      `;
      return;
    }

    const html = this.activities.map(activity => {
      const duration = this.formatDuration(activity.duration);
      const timeRange = this.formatTimeRange(activity.startTime, activity.endTime);
      
      return `
        <div class="activity-item" data-id="${activity.id}">
          <div class="activity-info">
            <div class="activity-name">${activity.title}</div>
            <div class="activity-meta">
              <span>💻 ${activity.app}</span>
              <span>📁 ${activity.project}</span>
              <span>🕐 ${timeRange}</span>
            </div>
          </div>
          <div class="activity-duration">${duration}</div>
          <div class="activity-actions">
            <button class="btn-icon edit" title="Edit">✏️</button>
            <button class="btn-icon delete" title="Delete">🗑️</button>
          </div>
        </div>
      `;
    }).join('');

    this.container.innerHTML = `
      <div class="activity-list">
        ${html}
      </div>
    `;

    // Add event listeners
    this.container.querySelectorAll('.delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.closest('.activity-item').dataset.id;
        this.deleteActivity(id);
      });
    });
  }

  async deleteActivity(id) {
    if (confirm('Delete this activity?')) {
      await window.lightTrackAPI.deleteActivity(id);
      this.refresh();
    }
  }

  formatDuration(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  formatTimeRange(start, end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    const formatTime = (date) => {
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
    };
    
    return `${formatTime(startDate)} - ${formatTime(endDate)}`;
  }
}

export default ActivityList;
```

### Expected Result
- Window tracking works when clicking Start
- Activities are saved to electron-store
- System tray shows and controls tracking
- Basic activity list displays tracked time

---

## 🎨 Phase 3: UI/UX Implementation

### Objective
Implement the VSCode/Notion-inspired UI design EXACTLY as shown in the mockup.

### Step 1: Complete HTML Structure
Update file: `src/renderer/index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LightTrack - Smart Time Tracking</title>
    <link rel="stylesheet" href="styles/app.css">
</head>
<body>
    <!-- Main App Container -->
    <div class="app-container">
        <!-- Activity Bar (VSCode Style) -->
        <div class="activity-bar">
            <div class="activity-icon active" data-view="timer" title="Timer">
                <span class="icon">⏱️</span>
            </div>
            <div class="activity-icon" data-view="analytics" title="Analytics">
                <span class="icon">📊</span>
            </div>
            <div class="activity-icon" data-view="projects" title="Projects">
                <span class="icon">📁</span>
            </div>
            <div class="activity-icon" data-view="goals" title="Goals">
                <span class="icon">🎯</span>
            </div>
            <div class="activity-icon" data-view="settings" title="Settings">
                <span class="icon">⚙️</span>
            </div>
        </div>

        <!-- Sidebar -->
        <div class="sidebar" id="sidebar">
            <div class="sidebar-header">
                <span id="sidebar-title">TRACKER</span>
                <button class="sidebar-toggle" id="sidebar-toggle">◀</button>
            </div>
            <div class="sidebar-content" id="sidebar-content">
                <!-- Dynamic content based on active view -->
            </div>
        </div>

        <!-- Main Content Area -->
        <div class="main-content">
            <!-- Editor Tabs -->
            <div class="editor-tabs">
                <button class="tab active" data-tab="dashboard">Dashboard</button>
                <button class="tab" data-tab="timeline">Timeline</button>
                <button class="tab" data-tab="analytics">Analytics</button>
            </div>

            <!-- Editor Content -->
            <div class="editor-content" id="editor-content">
                <!-- Dynamic content based on active tab -->
            </div>
        </div>
    </div>

    <!-- Status Bar -->
    <div class="status-bar">
        <div class="status-item">
            <span class="icon" id="status-icon">🔴</span>
            <span id="status-text">Tracking Stopped</span>
        </div>
        <div class="status-item">
            <span class="icon">💾</span>
            <span>Auto-save enabled</span>
        </div>
        <div class="status-item">
            <span class="icon">🔌</span>
            <span id="extension-status">No extensions</span>
        </div>
        <div class="status-item">
            <span class="icon">⌨️</span>
            <span>Ctrl+Shift+P for commands</span>
        </div>
    </div>

    <!-- Command Palette (Hidden by default) -->
    <div class="command-palette" id="command-palette">
        <input type="text" class="command-input" id="command-input" 
               placeholder="Type a command or search...">
        <div class="command-results" id="command-results">
            <!-- Dynamic command list -->
        </div>
    </div>

    <!-- Floating Timer (Minimized Mode) -->
    <div class="floating-timer" id="floating-timer">
        <span class="icon">⏱️</span>
        <span class="floating-time" id="floating-time">00:00:00</span>
        <span class="floating-project" id="floating-project">No Project</span>
        <button class="floating-close" id="floating-close">×</button>
    </div>

    <!-- Load JavaScript modules -->
    <script type="module" src="js/app.js"></script>
</body>
</html>
```

### Step 2: Complete CSS Styles
Update file: `src/renderer/styles/app.css`

```css
/* Design System Variables */
:root {
    --bg-primary: #0f172a;
    --bg-secondary: #1e293b;
    --bg-tertiary: #334155;
    --text-primary: #f1f5f9;
    --text-secondary: #e2e8f0;
    --text-muted: #94a3b8;
    --text-dim: #64748b;
    --accent-primary: #00bcd4;
    --accent-secondary: #0097a7;
    --accent-light: #4dd0e1;
    --color-success: #22c55e;
    --color-error: #ef4444;
    --color-warning: #f59e0b;
    --color-info: #3b82f6;
    --border-color: rgba(255, 255, 255, 0.1);
    --sidebar-width: 260px;
    --activity-bar-width: 48px;
    --status-bar-height: 32px;
    --header-height: 40px;
}

/* Reset and Base Styles */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    height: 100vh;
    overflow: hidden;
    font-size: 14px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}

/* Scrollbar Styles */
::-webkit-scrollbar {
    width: 10px;
    height: 10px;
}

::-webkit-scrollbar-track {
    background: var(--bg-primary);
}

::-webkit-scrollbar-thumb {
    background: var(--bg-tertiary);
    border-radius: 5px;
}

::-webkit-scrollbar-thumb:hover {
    background: var(--text-dim);
}

/* Main Layout */
.app-container {
    display: flex;
    height: calc(100vh - var(--status-bar-height));
    position: relative;
}

/* Activity Bar */
.activity-bar {
    width: var(--activity-bar-width);
    background: var(--bg-primary);
    border-right: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 0;
    gap: 8px;
}

.activity-icon {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 6px;
    color: var(--text-muted);
    transition: all 0.2s ease;
    position: relative;
}

.activity-icon:hover {
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.05);
}

.activity-icon.active {
    color: var(--accent-primary);
}

.activity-icon.active::before {
    content: '';
    position: absolute;
    left: -12px;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 20px;
    background: var(--accent-primary);
    border-radius: 0 3px 3px 0;
}

/* Sidebar */
.sidebar {
    width: var(--sidebar-width);
    background: var(--bg-secondary);
    border-right: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    transition: width 0.3s ease;
}

.sidebar.collapsed {
    width: 0;
    overflow: hidden;
}

.sidebar-header {
    padding: 16px;
    border-bottom: 1px solid var(--border-color);
    font-weight: 600;
    color: var(--text-secondary);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.sidebar-toggle {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 12px;
    padding: 4px;
    transition: transform 0.3s ease;
}

.sidebar.collapsed .sidebar-toggle {
    transform: rotate(180deg);
}

.sidebar-content {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
}

/* Tree View Items */
.tree-item {
    padding: 6px 12px;
    cursor: pointer;
    border-radius: 6px;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-secondary);
    font-size: 13px;
    transition: all 0.2s ease;
    margin-bottom: 2px;
}

.tree-item:hover {
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-primary);
}

.tree-item.active {
    background: rgba(0, 188, 212, 0.1);
    color: var(--accent-primary);
}

.tree-icon {
    width: 16px;
    height: 16px;
    opacity: 0.7;
}

/* Main Content Area */
.main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--bg-primary);
}

/* Editor Tabs */
.editor-tabs {
    height: var(--header-height);
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    padding: 0 12px;
    gap: 4px;
}

.tab {
    padding: 6px 16px;
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 6px 6px 0 0;
    font-size: 13px;
    transition: all 0.2s ease;
    position: relative;
}

.tab:hover {
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.05);
}

.tab.active {
    background: var(--bg-primary);
    color: var(--text-primary);
}

/* Editor Content */
.editor-content {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
}

/* Current Activity Widget */
.current-activity {
    background: var(--bg-secondary);
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 24px;
    border: 1px solid var(--border-color);
    position: relative;
    overflow: hidden;
}

.current-activity::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--accent-primary) 0%, var(--accent-secondary) 100%);
}

.activity-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
}

.activity-title {
    font-size: 20px;
    font-weight: 600;
    color: var(--text-primary);
}

.activity-timer {
    font-size: 32px;
    font-weight: 700;
    color: var(--accent-primary);
    font-variant-numeric: tabular-nums;
    margin-bottom: 8px;
}

.activity-details {
    display: flex;
    gap: 16px;
    color: var(--text-muted);
    font-size: 13px;
}

.activity-detail {
    display: flex;
    align-items: center;
    gap: 6px;
}

/* Control Buttons */
.control-buttons {
    display: flex;
    gap: 8px;
}

.btn {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: inherit;
}

.btn-primary {
    background: var(--accent-primary);
    color: white;
}

.btn-primary:hover {
    background: var(--accent-light);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 188, 212, 0.3);
}

.btn-secondary {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-primary);
}

.btn-secondary:hover {
    background: rgba(255, 255, 255, 0.15);
}

.btn-icon {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    transition: all 0.2s ease;
}

.btn-icon:hover {
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.1);
}

/* Activities List */
.activities-section {
    margin-top: 24px;
}

.section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
}

.section-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
}

.activity-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.activity-item {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 16px;
    display: flex;
    align-items: center;
    transition: all 0.2s ease;
    cursor: pointer;
}

.activity-item:hover {
    border-color: rgba(0, 188, 212, 0.3);
    transform: translateX(2px);
}

.activity-info {
    flex: 1;
}

.activity-name {
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 4px;
}

.activity-meta {
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: var(--text-muted);
}

.activity-duration {
    font-weight: 600;
    color: var(--accent-primary);
    font-variant-numeric: tabular-nums;
    margin-right: 12px;
}

.activity-actions {
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.2s ease;
}

.activity-item:hover .activity-actions {
    opacity: 1;
}

/* Quick Stats */
.quick-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
}

.stat-card {
    background: var(--bg-secondary);
    padding: 16px;
    border-radius: 8px;
    border: 1px solid var(--border-color);
    transition: all 0.2s ease;
}

.stat-card:hover {
    border-color: rgba(0, 188, 212, 0.3);
    transform: translateY(-2px);
}

.stat-value {
    font-size: 24px;
    font-weight: 700;
    color: var(--accent-primary);
    margin-bottom: 4px;
    font-variant-numeric: tabular-nums;
}

.stat-label {
    font-size: 12px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

/* Status Bar */
.status-bar {
    height: var(--status-bar-height);
    background: var(--bg-secondary);
    border-top: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    padding: 0 16px;
    font-size: 12px;
    color: var(--text-muted);
}

.status-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    height: 100%;
    border-right: 1px solid var(--border-color);
}

.status-item:last-child {
    border-right: none;
    margin-left: auto;
}

/* Command Palette */
.command-palette {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 600px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
    display: none;
    z-index: 1000;
    animation: slideDown 0.2s ease;
}

.command-palette.active {
    display: block;
}

@keyframes slideDown {
    from {
        opacity: 0;
        transform: translate(-50%, -55%);
    }
    to {
        opacity: 1;
        transform: translate(-50%, -50%);
    }
}

.command-input {
    width: 100%;
    padding: 16px 20px;
    background: transparent;
    border: none;
    color: var(--text-primary);
    font-size: 16px;
    border-bottom: 1px solid var(--border-color);
    font-family: inherit;
}

.command-input:focus {
    outline: none;
}

.command-results {
    max-height: 400px;
    overflow-y: auto;
    padding: 8px;
}

.command-item {
    padding: 12px 16px;
    cursor: pointer;
    border-radius: 6px;
    display: flex;
    align-items: center;
    gap: 12px;
    transition: all 0.2s ease;
}

.command-item:hover,
.command-item.selected {
    background: rgba(0, 188, 212, 0.1);
}

.command-label {
    flex: 1;
    color: var(--text-primary);
}

.command-shortcut {
    color: var(--text-muted);
    font-size: 12px;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
}

/* Floating Timer */
.floating-timer {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 12px 16px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    display: none;
    align-items: center;
    gap: 12px;
    z-index: 999;
}

.floating-timer.active {
    display: flex;
}

.floating-time {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
}

.floating-project {
    color: var(--text-muted);
    font-size: 12px;
}

.floating-close {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    padding: 0;
    margin-left: 8px;
}

/* Icons */
.icon {
    font-size: 18px;
    line-height: 1;
}

/* Empty State */
.empty-state {
    text-align: center;
    padding: 48px 24px;
    color: var(--text-muted);
}

.empty-state .icon {
    font-size: 48px;
    opacity: 0.5;
    margin-bottom: 16px;
}

.empty-state p {
    font-size: 16px;
    margin-bottom: 8px;
}

.empty-state small {
    font-size: 13px;
    color: var(--text-dim);
}

/* Loading States */
.loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 48px;
    color: var(--text-muted);
}

.spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--border-color);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

/* Utility Classes */
.hidden {
    display: none !important;
}

.text-muted {
    color: var(--text-muted);
}

.text-small {
    font-size: 12px;
}

.mt-1 { margin-top: 8px; }
.mt-2 { margin-top: 16px; }
.mt-3 { margin-top: 24px; }
.mb-1 { margin-bottom: 8px; }
.mb-2 { margin-bottom: 16px; }
.mb-3 { margin-bottom: 24px; }
```

### Step 3: Create Main App Controller
Create file: `src/renderer/js/app.js`

```javascript
// Import components
import CommandPalette from './components/command-palette.js';
import ActivityList from './components/activity-list.js';
import Dashboard from './views/dashboard.js';
import SidebarManager from './components/sidebar-manager.js';

class LightTrackApp {
  constructor() {
    this.currentView = 'timer';
    this.currentTab = 'dashboard';
    this.isTracking = false;
    this.currentActivity = null;
    this.timerInterval = null;
    
    // Initialize components
    this.commandPalette = new CommandPalette();
    this.sidebar = new SidebarManager();
    
    // Bind methods
    this.init = this.init.bind(this);
    this.setupEventListeners = this.setupEventListeners.bind(this);
    this.updateTrackingUI = this.updateTrackingUI.bind(this);
  }

  async init() {
    await this.loadInitialState();
    this.setupEventListeners();
    this.renderCurrentView();
  }

  async loadInitialState() {
    // Get tracking status
    const status = await window.lightTrackAPI.getTrackingStatus();
    this.isTracking = status.isTracking;
    this.currentActivity = status.currentActivity;
    
    this.updateTrackingUI();
  }

  setupEventListeners() {
    // Activity bar navigation
    document.querySelectorAll('.activity-icon').forEach(icon => {
      icon.addEventListener('click', (e) => {
        const view = e.currentTarget.dataset.view;
        this.switchView(view);
      });
    });

    // Tab navigation
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const tabName = e.currentTarget.dataset.tab;
        this.switchTab(tabName);
      });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Command palette
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        this.commandPalette.toggle();
      }
      
      // Toggle tracking
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        this.toggleTracking();
      }
    });

    // Sidebar toggle
    document.getElementById('sidebar-toggle').addEventListener('click', () => {
      this.sidebar.toggle();
    });
  }

  switchView(view) {
    // Update active state
    document.querySelectorAll('.activity-icon').forEach(icon => {
      icon.classList.toggle('active', icon.dataset.view === view);
    });
    
    this.currentView = view;
    this.sidebar.loadView(view);
    this.renderCurrentView();
  }

  switchTab(tab) {
    // Update active state
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    
    this.currentTab = tab;
    this.renderCurrentView();
  }

  renderCurrentView() {
    const container = document.getElementById('editor-content');
    
    // For now, always show dashboard
    // In Phase 4, we'll add other views
    if (this.currentTab === 'dashboard') {
      const dashboard = new Dashboard();
      dashboard.render(container);
    }
  }

  async toggleTracking() {
    if (this.isTracking) {
      const status = await window.lightTrackAPI.stopTracking();
      this.isTracking = false;
      this.currentActivity = null;
    } else {
      const status = await window.lightTrackAPI.startTracking();
      this.isTracking = status.isTracking;
      this.currentActivity = status.currentActivity;
    }
    
    this.updateTrackingUI();
  }

  updateTrackingUI() {
    // Update status bar
    const statusIcon = document.getElementById('status-icon');
    const statusText = document.getElementById('status-text');
    
    if (this.isTracking) {
      statusIcon.textContent = '🟢';
      statusText.textContent = 'Tracking Active';
      
      // Start timer update
      if (!this.timerInterval) {
        this.timerInterval = setInterval(() => {
          this.updateTimer();
        }, 1000);
      }
    } else {
      statusIcon.textContent = '🔴';
      statusText.textContent = 'Tracking Stopped';
      
      // Stop timer update
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
    }
  }

  updateTimer() {
    // Update timer display in current view
    const timerElement = document.querySelector('.activity-timer');
    if (timerElement && this.currentActivity) {
      const elapsed = Date.now() - this.currentActivity.startTime;
      timerElement.textContent = this.formatDuration(elapsed);
    }
    
    // Update floating timer
    const floatingTime = document.getElementById('floating-time');
    if (floatingTime && this.currentActivity) {
      const elapsed = Date.now() - this.currentActivity.startTime;
      floatingTime.textContent = this.formatDuration(elapsed);
    }
  }

  formatDuration(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new LightTrackApp();
  app.init();
});
```

### Step 4: Create Command Palette Component
Create file: `src/renderer/js/components/command-palette.js`

```javascript
export default class CommandPalette {
  constructor() {
    this.isOpen = false;
    this.commands = [
      {
        label: 'Start/Stop Tracking',
        shortcut: 'Ctrl+Shift+T',
        action: 'toggle-tracking',
        icon: '⏱️'
      },
      {
        label: 'Add Manual Entry',
        shortcut: 'Ctrl+M',
        action: 'add-manual-entry',
        icon: '➕'
      },
      {
        label: 'Start Pomodoro',
        shortcut: 'Ctrl+P',
        action: 'start-pomodoro',
        icon: '🍅'
      },
      {
        label: 'View Analytics',
        shortcut: 'Ctrl+A',
        action: 'view-analytics',
        icon: '📊'
      },
      {
        label: 'Export to CSV',
        shortcut: 'Ctrl+E',
        action: 'export-csv',
        icon: '📤'
      },
      {
        label: 'Toggle Focus Mode',
        shortcut: 'Ctrl+F',
        action: 'toggle-focus',
        icon: '🎯'
      },
      {
        label: 'Settings',
        shortcut: 'Ctrl+,',
        action: 'open-settings',
        icon: '⚙️'
      }
    ];
    
    this.selectedIndex = 0;
    this.filteredCommands = [...this.commands];
    
    this.setupElements();
    this.setupEventListeners();
  }

  setupElements() {
    this.palette = document.getElementById('command-palette');
    this.input = document.getElementById('command-input');
    this.results = document.getElementById('command-results');
  }

  setupEventListeners() {
    // Input handling
    this.input.addEventListener('input', (e) => {
      this.filterCommands(e.target.value);
    });

    // Keyboard navigation
    this.input.addEventListener('keydown', (e) => {
      switch(e.key) {
        case 'ArrowDown':
          e.preventDefault();
          this.selectNext();
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.selectPrevious();
          break;
        case 'Enter':
          e.preventDefault();
          this.executeSelected();
          break;
        case 'Escape':
          e.preventDefault();
          this.close();
          break;
      }
    });

    // Click outside to close
    document.addEventListener('click', (e) => {
      if (this.isOpen && !this.palette.contains(e.target)) {
        this.close();
      }
    });
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    this.isOpen = true;
    this.palette.classList.add('active');
    this.input.value = '';
    this.input.focus();
    this.filterCommands('');
    this.selectedIndex = 0;
    this.render();
  }

  close() {
    this.isOpen = false;
    this.palette.classList.remove('active');
  }

  filterCommands(query) {
    if (!query) {
      this.filteredCommands = [...this.commands];
    } else {
      const lowerQuery = query.toLowerCase();
      this.filteredCommands = this.commands.filter(cmd => 
        cmd.label.toLowerCase().includes(lowerQuery) ||
        cmd.action.toLowerCase().includes(lowerQuery)
      );
    }
    
    this.selectedIndex = 0;
    this.render();
  }

  render() {
    const html = this.filteredCommands.map((cmd, index) => `
      <div class="command-item ${index === this.selectedIndex ? 'selected' : ''}" 
           data-action="${cmd.action}">
        <span class="icon">${cmd.icon}</span>
        <span class="command-label">${cmd.label}</span>
        <span class="command-shortcut">${cmd.shortcut}</span>
      </div>
    `).join('');

    this.results.innerHTML = html;

    // Add click listeners
    this.results.querySelectorAll('.command-item').forEach((item, index) => {
      item.addEventListener('click', () => {
        this.selectedIndex = index;
        this.executeSelected();
      });
    });
  }

  selectNext() {
    this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredCommands.length - 1);
    this.render();
  }

  selectPrevious() {
    this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
    this.render();
  }

  executeSelected() {
    if (this.filteredCommands.length === 0) return;
    
    const command = this.filteredCommands[this.selectedIndex];
    this.executeCommand(command.action);
    this.close();
  }

  executeCommand(action) {
    // Emit custom event for the app to handle
    window.dispatchEvent(new CustomEvent('command-execute', { 
      detail: { action } 
    }));
  }
}
```

### Step 5: Create Dashboard View
Create file: `src/renderer/js/views/dashboard.js`

```javascript
import ActivityList from '../components/activity-list.js';

export default class Dashboard {
  constructor() {
    this.stats = {
      todayTotal: 0,
      projectCount: 0,
      productivePercentage: 0,
      breaksTaken: 0
    };
  }

  async render(container) {
    // Show loading state
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    
    // Load data
    await this.loadStats();
    const activities = await window.lightTrackAPI.getActivities(new Date().toISOString().split('T')[0]);
    
    // Get tracking status
    const status = await window.lightTrackAPI.getTrackingStatus();
    
    // Render dashboard
    container.innerHTML = `
      <!-- Current Activity Widget -->
      <div class="current-activity">
        <div class="activity-header">
          <h2 class="activity-title">Currently Tracking</h2>
          <div class="control-buttons">
            ${status.isTracking ? `
              <button class="btn btn-secondary" id="pause-tracking">
                <span class="icon">⏸️</span>
                Pause
              </button>
              <button class="btn btn-primary" id="stop-tracking">
                <span class="icon">⏹️</span>
                Stop
              </button>
            ` : `
              <button class="btn btn-primary" id="start-tracking">
                <span class="icon">▶️</span>
                Start Tracking
              </button>
            `}
          </div>
        </div>
        ${status.isTracking && status.currentActivity ? `
          <div class="activity-timer">00:00:00</div>
          <div class="activity-details">
            <div class="activity-detail">
              <span class="icon">💼</span>
              <span>${status.currentActivity.project}</span>
            </div>
            <div class="activity-detail">
              <span class="icon">💻</span>
              <span>${status.currentActivity.app}</span>
            </div>
          </div>
        ` : `
          <div class="empty-state">
            <p>Not tracking any activity</p>
            <small>Click "Start Tracking" to begin</small>
          </div>
        `}
      </div>

      <!-- Quick Stats -->
      <div class="quick-stats">
        <div class="stat-card">
          <div class="stat-value">${this.formatDuration(this.stats.todayTotal)}</div>
          <div class="stat-label">Today Total</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${this.stats.projectCount}</div>
          <div class="stat-label">Projects</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${this.stats.productivePercentage}%</div>
          <div class="stat-label">Productive</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${this.stats.breaksTaken}</div>
          <div class="stat-label">Breaks Taken</div>
        </div>
      </div>

      <!-- Activities List -->
      <div class="activities-section">
        <div class="section-header">
          <h3 class="section-title">Today's Activities</h3>
          <button class="btn btn-secondary" id="add-manual-entry">
            <span class="icon">➕</span>
            Add Manual Entry
          </button>
        </div>
        <div id="activity-list-container"></div>
      </div>
    `;

    // Initialize activity list
    const activityList = new ActivityList(document.getElementById('activity-list-container'));
    activityList.refresh();

    // Setup event listeners
    this.setupEventListeners();
  }

  async loadStats() {
    const activities = await window.lightTrackAPI.getActivities(new Date().toISOString().split('T')[0]);
    
    // Calculate today's total
    this.stats.todayTotal = activities.reduce((sum, a) => sum + (a.duration || 0), 0);
    
    // Count unique projects
    const projects = new Set(activities.map(a => a.project));
    this.stats.projectCount = projects.size;
    
    // Calculate productive percentage (non-break time)
    const breakTime = activities
      .filter(a => a.project === 'Break' || a.app === 'Idle')
      .reduce((sum, a) => sum + (a.duration || 0), 0);
    
    const productiveTime = this.stats.todayTotal - breakTime;
    this.stats.productivePercentage = this.stats.todayTotal > 0 
      ? Math.round((productiveTime / this.stats.todayTotal) * 100)
      : 0;
    
    // Count breaks
    this.stats.breaksTaken = activities.filter(a => a.project === 'Break').length;
  }

  setupEventListeners() {
    // Tracking buttons
    const startBtn = document.getElementById('start-tracking');
    const stopBtn = document.getElementById('stop-tracking');
    const pauseBtn = document.getElementById('pause-tracking');

    if (startBtn) {
      startBtn.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('command-execute', { 
          detail: { action: 'toggle-tracking' } 
        }));
      });
    }

    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('command-execute', { 
          detail: { action: 'toggle-tracking' } 
        }));
      });
    }

    // Manual entry button
    const manualBtn = document.getElementById('add-manual-entry');
    if (manualBtn) {
      manualBtn.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('command-execute', { 
          detail: { action: 'add-manual-entry' } 
        }));
      });
    }
  }

  formatDuration(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }
}
```

### Expected Result
- Complete VSCode/Notion-style UI implemented
- Command palette with keyboard navigation
- Activity bar with view switching
- Collapsible sidebar
- Dashboard with current activity and stats
- Smooth animations and transitions

---

## 🔧 Phase 4: Feature Modules

### Objective
Implement optional features as modular components that can be enabled/disabled.

### Step 1: Create Feature Manager
Create file: `src/shared/feature-manager.js`

```javascript
export default class FeatureManager {
  constructor() {
    this.features = new Map();
    this.enabled = new Set();
    
    // Load enabled features from settings
    this.loadEnabledFeatures();
  }

  async loadEnabledFeatures() {
    const settings = await window.lightTrackAPI.getSettings();
    const enabledFeatures = settings.enabledFeatures || ['core'];
    enabledFeatures.forEach(f => this.enabled.add(f));
  }

  register(name, feature) {
    this.features.set(name, {
      name,
      displayName: feature.displayName,
      description: feature.description,
      icon: feature.icon,
      init: feature.init,
      cleanup: feature.cleanup,
      dependencies: feature.dependencies || []
    });
  }

  async enable(featureName) {
    if (this.enabled.has(featureName)) return;
    
    const feature = this.features.get(featureName);
    if (!feature) throw new Error(`Unknown feature: ${featureName}`);
    
    // Enable dependencies first
    for (const dep of feature.dependencies) {
      await this.enable(dep);
    }
    
    // Initialize feature
    await feature.init();
    this.enabled.add(featureName);
    
    // Save to settings
    await this.saveEnabledFeatures();
  }

  async disable(featureName) {
    if (!this.enabled.has(featureName)) return;
    
    const feature = this.features.get(featureName);
    if (!feature) return;
    
    // Cleanup feature
    if (feature.cleanup) {
      await feature.cleanup();
    }
    
    this.enabled.delete(featureName);
    await this.saveEnabledFeatures();
  }

  async saveEnabledFeatures() {
    const enabledArray = Array.from(this.enabled);
    await window.lightTrackAPI.updateSettings({
      enabledFeatures: enabledArray
    });
  }

  isEnabled(featureName) {
    return this.enabled.has(featureName);
  }

  getAllFeatures() {
    return Array.from(this.features.values());
  }
}
```

### Step 2: Create Pomodoro Feature
Create file: `src/renderer/features/pomodoro/index.js`

```javascript
export default {
  displayName: 'Pomodoro Timer',
  description: 'Work in focused 25-minute sessions with regular breaks',
  icon: '🍅',
  
  async init() {
    // Add pomodoro commands to command palette
    const commands = [
      {
        label: 'Start Pomodoro',
        shortcut: 'Ctrl+Alt+P',
        action: 'start-pomodoro',
        icon: '🍅'
      },
      {
        label: 'Stop Pomodoro',
        action: 'stop-pomodoro',
        icon: '⏹️'
      }
    ];
    
    // Register commands
    window.pomodoroCommands = commands;
    
    // Initialize pomodoro state
    window.pomodoroState = {
      isActive: false,
      type: 'work', // work or break
      timeRemaining: 25 * 60 * 1000, // 25 minutes
      interval: null
    };
  },
  
  async cleanup() {
    // Stop any active timers
    if (window.pomodoroState && window.pomodoroState.interval) {
      clearInterval(window.pomodoroState.interval);
    }
    
    delete window.pomodoroCommands;
    delete window.pomodoroState;
  }
};
```

### Step 3: Create Goals Feature
Create file: `src/renderer/features/goals/index.js`

```javascript
export default {
  displayName: 'Goals & Targets',
  description: 'Set daily and weekly productivity goals',
  icon: '🎯',
  
  async init() {
    // Add goals view to sidebar
    window.goalsViewEnabled = true;
    
    // Initialize goals state
    const settings = await window.lightTrackAPI.getSettings();
    window.goalsState = {
      dailyTarget: settings.dailyTarget || 8 * 60 * 60 * 1000, // 8 hours
      weeklyTarget: settings.weeklyTarget || 40 * 60 * 60 * 1000, // 40 hours
      progress: {
        daily: 0,
        weekly: 0
      }
    };
  },
  
  async cleanup() {
    window.goalsViewEnabled = false;
    delete window.goalsState;
  }
};
```

### Step 4: Create Natural Language Entry
Create file: `src/renderer/features/natural-language/parser.js`

```javascript
export default class NaturalLanguageParser {
  constructor() {
    this.patterns = {
      // Duration patterns
      duration: {
        hoursMinutes: /(\d+)\s*(?:hours?|hrs?|h)\s*(?:and\s*)?(\d+)\s*(?:minutes?|mins?|m)?/i,
        hours: /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)/i,
        minutes: /(\d+)\s*(?:minutes?|mins?|m)/i,
      },
      
      // Time range patterns
      timeRange: {
        standard: /from\s*(\d{1,2}):?(\d{2})?\s*(am|pm)?\s*(?:to|until|-)\s*(\d{1,2}):?(\d{2})?\s*(am|pm)?/i,
        simple: /(\d{1,2})\s*(am|pm)\s*-\s*(\d{1,2})\s*(am|pm)/i
      },
      
      // Relative time
      relative: {
        ago: /(\d+)\s*(hours?|hrs?|minutes?|mins?)\s*ago/i,
        last: /last\s*(\d+)\s*(hours?|hrs?|minutes?|mins?)/i
      },
      
      // Activity patterns
      activity: {
        worked: /worked\s*(?:on\s*)?(.+?)(?:for|from|\d)/i,
        spent: /spent\s*(.+?)\s*(?:on|working|doing)\s*(.+)/i
      }
    };
  }

  parse(input) {
    const result = {
      duration: null,
      startTime: null,
      endTime: null,
      description: '',
      project: null
    };

    // Try to extract duration
    const durationMatch = this.extractDuration(input);
    if (durationMatch) {
      result.duration = durationMatch.duration;
      input = durationMatch.remaining;
    }

    // Try to extract time range
    const timeRangeMatch = this.extractTimeRange(input);
    if (timeRangeMatch) {
      result.startTime = timeRangeMatch.startTime;
      result.endTime = timeRangeMatch.endTime;
      result.duration = timeRangeMatch.endTime - timeRangeMatch.startTime;
      input = timeRangeMatch.remaining;
    }

    // Extract activity description
    const activityMatch = this.extractActivity(input);
    if (activityMatch) {
      result.description = activityMatch.description;
      result.project = this.detectProject(activityMatch.description);
    } else {
      result.description = input.trim();
      result.project = this.detectProject(input);
    }

    return result;
  }

  extractDuration(input) {
    // Try hours and minutes
    let match = input.match(this.patterns.duration.hoursMinutes);
    if (match) {
      const hours = parseInt(match[1]) || 0;
      const minutes = parseInt(match[2]) || 0;
      return {
        duration: (hours * 60 + minutes) * 60 * 1000,
        remaining: input.replace(match[0], '').trim()
      };
    }

    // Try just hours
    match = input.match(this.patterns.duration.hours);
    if (match) {
      const hours = parseFloat(match[1]);
      return {
        duration: hours * 60 * 60 * 1000,
        remaining: input.replace(match[0], '').trim()
      };
    }

    // Try just minutes
    match = input.match(this.patterns.duration.minutes);
    if (match) {
      const minutes = parseInt(match[1]);
      return {
        duration: minutes * 60 * 1000,
        remaining: input.replace(match[0], '').trim()
      };
    }

    return null;
  }

  extractTimeRange(input) {
    const match = input.match(this.patterns.timeRange.standard) || 
                  input.match(this.patterns.timeRange.simple);
    
    if (!match) return null;

    // Parse start and end times
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // This is simplified - in real implementation, handle AM/PM properly
    const startHour = parseInt(match[1]);
    const startMinute = parseInt(match[2] || 0);
    const endHour = parseInt(match[4] || match[3]);
    const endMinute = parseInt(match[5] || 0);

    const startTime = today.getTime() + (startHour * 60 + startMinute) * 60 * 1000;
    const endTime = today.getTime() + (endHour * 60 + endMinute) * 60 * 1000;

    return {
      startTime,
      endTime,
      remaining: input.replace(match[0], '').trim()
    };
  }

  extractActivity(input) {
    let match = input.match(this.patterns.activity.worked);
    if (match) {
      return {
        description: match[1].trim()
      };
    }

    match = input.match(this.patterns.activity.spent);
    if (match) {
      return {
        description: match[2].trim()
      };
    }

    return null;
  }

  detectProject(text) {
    // Check for JIRA pattern
    const jiraMatch = text.match(/\[([A-Z]+-\d+)\]/);
    if (jiraMatch) return jiraMatch[1];
    
    // Check for project keywords
    const projectMatch = text.match(/(?:project|proj):\s*(\w+)/i);
    if (projectMatch) return projectMatch[1];
    
    return 'General';
  }
}
```

### Step 5: Create Manual Entry Dialog
Create file: `src/renderer/components/manual-entry-dialog.js`

```javascript
import NaturalLanguageParser from '../features/natural-language/parser.js';

export default class ManualEntryDialog {
  constructor() {
    this.parser = new NaturalLanguageParser();
    this.isOpen = false;
  }

  open() {
    this.isOpen = true;
    this.render();
    this.setupEventListeners();
    
    // Focus natural language input
    const nlInput = document.getElementById('nl-input');
    if (nlInput) nlInput.focus();
  }

  close() {
    this.isOpen = false;
    const dialog = document.getElementById('manual-entry-dialog');
    if (dialog) dialog.remove();
  }

  render() {
    const dialog = document.createElement('div');
    dialog.id = 'manual-entry-dialog';
    dialog.className = 'modal-backdrop';
    dialog.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">Add Time Entry</h2>
          <button class="modal-close" id="close-dialog">&times;</button>
        </div>
        <div class="modal-body">
          <!-- Natural Language Input -->
          <div class="form-group">
            <label>Quick Entry</label>
            <input type="text" id="nl-input" class="input" 
                   placeholder="e.g., worked 2h 30m on JIRA-123 fixing bugs">
            <small class="text-muted">
              Try: "2 hours on project X" or "from 9am to 11am meeting"
            </small>
          </div>
          
          <div class="divider">or enter manually</div>
          
          <!-- Manual Fields -->
          <div class="form-row">
            <div class="form-group">
              <label>Duration</label>
              <input type="text" id="duration-input" class="input" placeholder="1h 30m">
            </div>
            <div class="form-group">
              <label>Project</label>
              <input type="text" id="project-input" class="input" placeholder="Project name">
            </div>
          </div>
          
          <div class="form-group">
            <label>Description</label>
            <textarea id="description-input" class="input" rows="3" 
                      placeholder="What did you work on?"></textarea>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label>Date</label>
              <input type="date" id="date-input" class="input" value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
              <label>Time</label>
              <input type="time" id="time-input" class="input">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="cancel-entry">Cancel</button>
          <button class="btn btn-primary" id="save-entry">Save Entry</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);
  }

  setupEventListeners() {
    // Natural language input
    const nlInput = document.getElementById('nl-input');
    nlInput.addEventListener('input', (e) => {
      this.parseNaturalLanguage(e.target.value);
    });

    // Save button
    document.getElementById('save-entry').addEventListener('click', () => {
      this.saveEntry();
    });

    // Cancel button
    document.getElementById('cancel-entry').addEventListener('click', () => {
      this.close();
    });

    // Close button
    document.getElementById('close-dialog').addEventListener('click', () => {
      this.close();
    });

    // Click outside to close
    document.getElementById('manual-entry-dialog').addEventListener('click', (e) => {
      if (e.target.id === 'manual-entry-dialog') {
        this.close();
      }
    });
  }

  parseNaturalLanguage(input) {
    if (!input) return;

    const parsed = this.parser.parse(input);
    
    // Update form fields
    if (parsed.duration) {
      const hours = Math.floor(parsed.duration / 3600000);
      const minutes = Math.floor((parsed.duration % 3600000) / 60000);
      document.getElementById('duration-input').value = 
        hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    }

    if (parsed.project) {
      document.getElementById('project-input').value = parsed.project;
    }

    if (parsed.description) {
      document.getElementById('description-input').value = parsed.description;
    }
  }

  async saveEntry() {
    // Gather form data
    const duration = this.parseDuration(document.getElementById('duration-input').value);
    const project = document.getElementById('project-input').value || 'General';
    const description = document.getElementById('description-input').value;
    const date = document.getElementById('date-input').value;
    const time = document.getElementById('time-input').value;

    if (!duration || duration === 0) {
      alert('Please enter a duration');
      return;
    }

    // Calculate timestamps
    const endTime = time ? 
      new Date(`${date}T${time}`).getTime() : 
      Date.now();
    const startTime = endTime - duration;

    // Create activity
    const activity = {
      app: 'Manual Entry',
      title: description || 'Manual time entry',
      project,
      startTime,
      endTime,
      duration,
      date,
      isManual: true
    };

    // Save activity
    await window.lightTrackAPI.addActivity(activity);

    // Refresh UI
    window.dispatchEvent(new Event('activities-updated'));

    // Close dialog
    this.close();
  }

  parseDuration(input) {
    if (!input) return 0;

    let totalMinutes = 0;
    
    // Parse hours
    const hoursMatch = input.match(/(\d+)\s*h/i);
    if (hoursMatch) {
      totalMinutes += parseInt(hoursMatch[1]) * 60;
    }

    // Parse minutes
    const minutesMatch = input.match(/(\d+)\s*m/i);
    if (minutesMatch) {
      totalMinutes += parseInt(minutesMatch[1]);
    }

    // If no h/m specified, assume minutes if < 10, otherwise hours
    if (!hoursMatch && !minutesMatch) {
      const number = parseFloat(input);
      if (number < 10) {
        totalMinutes = number * 60; // Assume hours
      } else {
        totalMinutes = number; // Assume minutes
      }
    }

    return totalMinutes * 60 * 1000; // Convert to milliseconds
  }
}
```

### Step 6: Add Modal Styles
Add to file: `src/renderer/styles/app.css`

```css
/* Modal Styles */
.modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    animation: fadeIn 0.2s ease;
}

.modal {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    width: 90%;
    max-width: 600px;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.3s ease;
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes slideUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.modal-header {
    padding: 20px 24px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.modal-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
}

.modal-close {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 24px;
    cursor: pointer;
    line-height: 1;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s ease;
}

.modal-close:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-primary);
}

.modal-body {
    padding: 24px;
    overflow-y: auto;
    flex: 1;
}

.modal-footer {
    padding: 16px 24px;
    border-top: 1px solid var(--border-color);
    display: flex;
    justify-content: flex-end;
    gap: 12px;
}

/* Form Styles */
.form-group {
    margin-bottom: 20px;
}

.form-group label {
    display: block;
    margin-bottom: 8px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
}

.form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
}

.input {
    width: 100%;
    padding: 10px 14px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 14px;
    font-family: inherit;
    transition: all 0.2s ease;
}

.input:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px rgba(0, 188, 212, 0.1);
}

.input::placeholder {
    color: var(--text-dim);
}

textarea.input {
    resize: vertical;
    min-height: 80px;
}

.divider {
    text-align: center;
    margin: 24px 0;
    color: var(--text-muted);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    position: relative;
}

.divider::before,
.divider::after {
    content: '';
    position: absolute;
    top: 50%;
    width: calc(50% - 40px);
    height: 1px;
    background: var(--border-color);
}

.divider::before {
    left: 0;
}

.divider::after {
    right: 0;
}
```

### Expected Result
- Feature manager system implemented
- Pomodoro timer feature ready
- Goals system ready
- Natural language entry working
- Manual entry dialog with smart parsing
- Features can be enabled/disabled

---

## 📦 Phase 5: Polish & Distribution

### Objective
Final polish, testing, and prepare for distribution.

### Step 1: Add Settings UI
Create file: `src/renderer/views/settings.js`

```javascript
export default class SettingsView {
  constructor(featureManager) {
    this.featureManager = featureManager;
  }

  async render(container) {
    const settings = await window.lightTrackAPI.getSettings();
    const features = this.featureManager.getAllFeatures();

    container.innerHTML = `
      <div class="settings-container">
        <h2 class="settings-title">Settings</h2>
        
        <!-- General Settings -->
        <div class="settings-section">
          <h3 class="section-title">General</h3>
          
          <div class="setting-item">
            <label>Idle Threshold</label>
            <div class="setting-control">
              <input type="number" id="idle-threshold" class="input" 
                     value="${settings.idleThreshold / 60000}" min="1" max="30">
              <span class="setting-unit">minutes</span>
            </div>
            <small class="setting-description">
              Stop tracking after this period of inactivity
            </small>
          </div>
          
          <div class="setting-item">
            <label>Merge Similar Activities</label>
            <div class="setting-control">
              <label class="toggle">
                <input type="checkbox" id="merge-activities" 
                       ${settings.mergeActivities ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </div>
            <small class="setting-description">
              Combine consecutive activities in the same app
            </small>
          </div>
        </div>
        
        <!-- Features -->
        <div class="settings-section">
          <h3 class="section-title">Features</h3>
          
          ${features.map(feature => `
            <div class="setting-item">
              <label>
                <span class="feature-icon">${feature.icon}</span>
                ${feature.displayName}
              </label>
              <div class="setting-control">
                <label class="toggle">
                  <input type="checkbox" 
                         data-feature="${feature.name}"
                         ${this.featureManager.isEnabled(feature.name) ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>
              <small class="setting-description">
                ${feature.description}
              </small>
            </div>
          `).join('')}
        </div>
        
        <!-- Data Management -->
        <div class="settings-section">
          <h3 class="section-title">Data Management</h3>
          
          <div class="setting-item">
            <label>Export Data</label>
            <div class="setting-control">
              <button class="btn btn-secondary" id="export-data">
                Export to CSV
              </button>
            </div>
            <small class="setting-description">
              Download all your tracking data
            </small>
          </div>
          
          <div class="setting-item">
            <label>Clear Old Data</label>
            <div class="setting-control">
              <button class="btn btn-secondary" id="clear-old-data">
                Clear Data Older Than 30 Days
              </button>
            </div>
            <small class="setting-description">
              Remove old tracking data to save space
            </small>
          </div>
        </div>
        
        <div class="settings-footer">
          <button class="btn btn-primary" id="save-settings">
            Save Settings
          </button>
        </div>
      </div>
    `;

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Save settings
    document.getElementById('save-settings').addEventListener('click', async () => {
      const settings = {
        idleThreshold: parseInt(document.getElementById('idle-threshold').value) * 60000,
        mergeActivities: document.getElementById('merge-activities').checked
      };
      
      await window.lightTrackAPI.updateSettings(settings);
      
      // Show success notification
      this.showNotification('Settings saved successfully!');
    });

    // Feature toggles
    document.querySelectorAll('[data-feature]').forEach(toggle => {
      toggle.addEventListener('change', async (e) => {
        const feature = e.target.dataset.feature;
        if (e.target.checked) {
          await this.featureManager.enable(feature);
        } else {
          await this.featureManager.disable(feature);
        }
      });
    });

    // Export data
    document.getElementById('export-data').addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('command-execute', { 
        detail: { action: 'export-csv' } 
      }));
    });
  }

  showNotification(message) {
    // Simple notification implementation
    const notification = document.createElement('div');
    notification.className = 'notification success';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
}
```

### Step 2: Add Settings Styles
Add to file: `src/renderer/styles/app.css`

```css
/* Settings Styles */
.settings-container {
    max-width: 800px;
}

.settings-title {
    font-size: 24px;
    font-weight: 600;
    margin-bottom: 32px;
    color: var(--text-primary);
}

.settings-section {
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 24px;
}

.setting-item {
    margin-bottom: 24px;
}

.setting-item:last-child {
    margin-bottom: 0;
}

.setting-item label {
    display: block;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 8px;
}

.setting-control {
    display: flex;
    align-items: center;
    gap: 12px;
}

.setting-unit {
    color: var(--text-muted);
    font-size: 13px;
}

.setting-description {
    display: block;
    margin-top: 6px;
    font-size: 12px;
    color: var(--text-muted);
}

.feature-icon {
    margin-right: 8px;
}

/* Toggle Switch */
.toggle {
    position: relative;
    display: inline-block;
    width: 48px;
    height: 24px;
}

.toggle input {
    opacity: 0;
    width: 0;
    height: 0;
}

.toggle-slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--bg-tertiary);
    border-radius: 24px;
    transition: all 0.3s ease;
}

.toggle-slider:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background: var(--text-muted);
    border-radius: 50%;
    transition: all 0.3s ease;
}

.toggle input:checked + .toggle-slider {
    background: var(--accent-primary);
}

.toggle input:checked + .toggle-slider:before {
    transform: translateX(24px);
    background: white;
}

.settings-footer {
    margin-top: 32px;
    display: flex;
    justify-content: flex-end;
}

/* Notifications */
.notification {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 16px 24px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 3000;
    animation: slideInRight 0.3s ease;
}

.notification.success {
    border-left: 4px solid var(--color-success);
}

.notification.fade-out {
    animation: slideOutRight 0.3s ease;
}

@keyframes slideInRight {
    from {
        transform: translateX(100%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

@keyframes slideOutRight {
    from {
        transform: translateX(0);
        opacity: 1;
    }
    to {
        transform: translateX(100%);
        opacity: 0;
    }
}
```

### Step 3: Create Export Functionality
Create file: `src/renderer/utils/export-csv.js`

```javascript
export async function exportToCSV() {
  // Get all activities
  const activities = await window.lightTrackAPI.getActivities();
  
  if (activities.length === 0) {
    alert('No activities to export');
    return;
  }

  // Prepare CSV content
  const headers = ['Date', 'Start Time', 'End Time', 'Duration', 'Project', 'Application', 'Title'];
  const rows = activities.map(activity => {
    const startDate = new Date(activity.startTime);
    const endDate = new Date(activity.endTime);
    const duration = formatDuration(activity.duration);
    
    return [
      activity.date,
      startDate.toLocaleTimeString(),
      endDate.toLocaleTimeString(),
      duration,
      activity.project,
      activity.app,
      activity.title
    ];
  });

  // Convert to CSV
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  // Download file
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lighttrack-export-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatDuration(ms) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}
```

### Step 4: Add Icon Files
Create these files in the `build/` directory:
- `icon.ico` (Windows icon - 256x256)
- `icon.icns` (macOS icon)
- `icon.png` (Linux icon - 512x512)

### Step 5: Final Build Configuration
Update file: `package.json`

```json
{
  "name": "lighttrack",
  "version": "3.0.0",
  "description": "Lightweight time tracking with automatic project detection",
  "main": "src/main/index.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder",
    "dist": "electron-builder --publish=never"
  },
  "build": {
    "appId": "com.lightsuite.lighttrack",
    "productName": "LightTrack",
    "copyright": "Copyright © 2025 LightSuite",
    "directories": {
      "output": "dist",
      "buildResources": "build"
    },
    "files": [
      "src/**/*",
      "!src/**/*.test.js",
      "!src/**/*.spec.js",
      "node_modules/**/*"
    ],
    "extraResources": [
      {
        "from": "assets",
        "to": "assets"
      }
    ],
    "win": {
      "target": [
        {
          "target": "nsis",
          "arch": ["x64"]
        }
      ],
      "icon": "build/icon.ico",
      "publisherName": "LightSuite"
    },
    "nsis": {
      "oneClick": false,
      "perMachine": false,
      "allowToChangeInstallationDirectory": true,
      "deleteAppDataOnUninstall": false,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "LightTrack"
    },
    "mac": {
      "category": "public.app-category.productivity",
      "icon": "build/icon.icns",
      "hardenedRuntime": true,
      "gatekeeperAssess": false
    },
    "linux": {
      "target": ["AppImage", "deb"],
      "icon": "build/icon.png",
      "category": "Office",
      "desktop": {
        "StartupNotify": "true",
        "Encoding": "UTF-8",
        "MimeType": "x-scheme-handler/lighttrack"
      }
    }
  }
}
```

### Step 6: Build and Test
```bash
# Test the application
npm start

# Build for current platform
npm run build

# Build for all platforms
npm run dist
```

### Expected Result
- Settings UI with feature toggles
- Export functionality
- Clean build process
- Installer ready for distribution
- < 50MB installer size
- Professional, polished application

---

## 🎨 UI/UX Design Specifications

### Color Palette
```css
/* Primary Colors */
--bg-primary: #0f172a;      /* Main background - Dark blue-gray */
--bg-secondary: #1e293b;    /* Cards and elevated surfaces */
--bg-tertiary: #334155;     /* Hover states, borders */

/* Text Colors */
--text-primary: #f1f5f9;    /* Main text - Almost white */
--text-secondary: #e2e8f0;  /* Secondary text */
--text-muted: #94a3b8;      /* Muted/helper text */
--text-dim: #64748b;        /* Disabled/very muted */

/* Accent Colors */
--accent-primary: #00bcd4;  /* Cyan - Primary brand color */
--accent-secondary: #0097a7; /* Darker cyan for gradients */
--accent-light: #4dd0e1;    /* Lighter cyan for hover */

/* Semantic Colors */
--color-success: #22c55e;   /* Green for success/active */
--color-error: #ef4444;     /* Red for errors/stop */
--color-warning: #f59e0b;   /* Amber for warnings */
--color-info: #3b82f6;      /* Blue for information */
```

### Typography
```css
/* Font Stack */
-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif

/* Font Sizes */
--text-h1: 32px;     /* Page titles */
--text-h2: 24px;     /* Section headers */
--text-h3: 20px;     /* Sub-sections */
--text-h4: 18px;     /* Card headers */
--text-body: 14px;   /* Default body text */
--text-small: 13px;  /* Secondary text */
--text-tiny: 12px;   /* Helper text */
```

### Layout Specifications
- **Activity Bar**: 48px wide, fixed left
- **Sidebar**: 260px wide, collapsible
- **Status Bar**: 32px height, fixed bottom
- **Editor Tabs**: 40px height
- **Border Radius**: 6px (small), 8px (medium), 12px (large)
- **Spacing**: 8px grid system (8, 16, 24, 32, 48)

### Animations
- **Transitions**: 0.2s ease for hover, 0.3s ease for state changes
- **Command Palette**: Slide down animation
- **Modals**: Fade backdrop + slide up content
- **Notifications**: Slide in from right

### Interaction States
- **Hover**: Subtle elevation, color lightening
- **Active**: Accent color, left border indicator
- **Focus**: 3px accent color ring
- **Disabled**: 50% opacity, no cursor

---

## ✅ Validation Checklist

### Phase 0: Cleanup
- [ ] All fix-*.js files archived
- [ ] Clean directory structure created
- [ ] Dependencies installed
- [ ] No console errors on startup

### Phase 1: Core
- [ ] Electron window opens
- [ ] Start/Stop tracking works
- [ ] Timer displays correctly
- [ ] No memory leaks

### Phase 2: Features
- [ ] Window tracking captures correct app
- [ ] Activities save to storage
- [ ] System tray works
- [ ] Project detection works

### Phase 3: UI/UX
- [ ] VSCode-style layout renders
- [ ] Command palette opens with Ctrl+Shift+P
- [ ] Sidebar collapses/expands
- [ ] All animations smooth

### Phase 4: Modules
- [ ] Features can be enabled/disabled
- [ ] Natural language parsing works
- [ ] Manual entry saves correctly
- [ ] Pomodoro timer functions

### Phase 5: Polish
- [ ] Settings save and persist
- [ ] Export creates valid CSV
- [ ] Build creates < 50MB installer
- [ ] No console errors or warnings

---

## 🚀 Final Notes

This guide transforms LightTrack from a chaotic codebase into a professional, lightweight time tracking application. The key principles:

1. **Start Simple**: Get core functionality working first
2. **Build Incrementally**: Add features one at a time
3. **Test Continuously**: Verify each phase before moving on
4. **Stay Lightweight**: Avoid unnecessary dependencies
5. **Focus on UX**: Make it beautiful and intuitive

The result will be a clean, maintainable application that users will love to use daily for their time tracking needs.