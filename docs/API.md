# LightTrack API Documentation

## Overview

LightTrack is a lightweight time tracking application built with Electron. This document provides comprehensive API documentation for developers working with the codebase.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Renderer Process                      │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │   UI Layer  │  │  Components  │  │    Utils      │  │
│  │             │  │              │  │               │  │
│  │ - app.js    │  │ - ActivityList│  │ - errorHandler│  │
│  │ - index.html│  │ - SidebarMgr │  │               │  │
│  │ - app.css   │  │ - ManualEntry│  │               │  │
│  │             │  │ - Pomodoro   │  │               │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
├─────────────────────────────────────────────────────────┤
│                    IPC Bridge (preload.js)               │
├─────────────────────────────────────────────────────────┤
│                     Main Process                         │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │    Core     │  │   Services   │  │     Storage   │  │
│  │             │  │              │  │               │  │
│  │ - Tracker   │  │ - Tray       │  │ - FileSystem  │  │
│  │ - Timer     │  │ - Shortcuts  │  │ - Settings    │  │
│  │             │  │              │  │               │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Core Classes

### LightTrackTimer

Main application controller that manages the timer and coordinates between components.

```javascript
class LightTrackTimer {
  constructor()
  async init()                    // Initialize the application
  async refreshStatus()           // Get current tracking status
  async refreshStats()            // Calculate and display statistics
  updateTimer()                   // Update timer display
  updateUI(isTracking)           // Update UI based on tracking state
  showNotification(message, type) // Display user notifications
  // ... more methods
}
```

### Components

#### ActivityList
Manages the display of tracked activities.

```javascript
class ActivityList {
  constructor(container)
  async refresh(filter)          // Refresh activity list with optional filtering
  render()                       // Render activities to DOM
  formatDuration(ms)             // Format milliseconds to readable time
  formatTimeRange(start, end)    // Format time range for display
}
```

#### SidebarManager
Handles sidebar navigation and view switching.

```javascript
class SidebarManager {
  constructor()
  toggle()                       // Toggle sidebar visibility
  loadView(viewName)            // Load specific view content
  attachViewListeners(viewName) // Set up event handlers for view
}
```

#### ManualEntryDialog
Provides interface for manually adding time entries.

```javascript
class ManualEntryDialog {
  constructor()
  open(callback)                // Open dialog with callback
  close()                       // Close dialog and clean up
  parseNaturalLanguage(text)    // Parse natural language time input
  save()                        // Save the manual entry
}
```

#### PomodoroTimer
Implements the Pomodoro Technique timer.

```javascript
class PomodoroTimer {
  constructor()
  start()                       // Start timer
  pause()                       // Pause timer
  reset()                       // Reset current session
  skip()                        // Skip to next session
  on(event, callback)           // Set event callbacks
}
```

### Utilities

#### ErrorHandler
Centralized error handling and user feedback system.

```javascript
class ErrorHandler {
  handleError(error, context)    // Handle and display errors
  wrapAsync(fn, context)        // Wrap async functions with error handling
  createBoundary(fn, fallback)  // Create error boundary
}
```

## IPC API (preload.js)

The IPC bridge exposes these methods to the renderer process:

### Tracking Control
- `startTracking()` - Start time tracking
- `stopTracking()` - Stop time tracking
- `getTrackingStatus()` - Get current tracking status

### Data Management
- `getActivities(filter)` - Get filtered activities
- `addActivity(activity)` - Add new activity
- `updateActivity(id, updates)` - Update existing activity
- `deleteActivity(id)` - Delete activity
- `addManualEntry(activity)` - Add manual time entry

### Statistics
- `getTodayTotal()` - Get total time tracked today
- `getStats()` - Get comprehensive statistics

### Settings
- `getSettings()` - Get application settings
- `updateSettings(updates)` - Update settings

### Data Export
- `exportData()` - Export data to CSV

## Event System

### Custom Events

```javascript
// Sidebar filter changed
window.addEventListener('sidebar-filter', (e) => {
  const { filter, type } = e.detail;
  // Handle filter change
});

// Edit activity request
window.addEventListener('edit-activity', (e) => {
  const { activity } = e.detail;
  // Handle edit request
});
```

### IPC Events

```javascript
// Tracking status changed
window.lightTrackAPI.onTrackingStatusChanged((isTracking) => {
  // Handle status change
});

// Tracking update
window.lightTrackAPI.onTrackingUpdate((data) => {
  // Handle tracking update
});
```

## Storage Schema

### Activities
```javascript
{
  id: string,              // Unique identifier
  app: string,             // Application name
  title: string,           // Window title
  project: string,         // Project name
  startTime: number,       // Start timestamp
  endTime: number,         // End timestamp
  duration: number,        // Duration in milliseconds
  date: string,           // Date in YYYY-MM-DD format
  isManual: boolean       // Whether manually entered
}
```

### Settings
```javascript
{
  idleThreshold: number,          // Idle time in milliseconds
  trackingEnabled: boolean,       // Whether tracking is enabled
  projectMappings: object,        // Custom project detection rules
  notifications: {
    enabled: boolean,
    idleReminder: boolean,
    dailySummary: boolean
  }
}
```

## Error Handling

All errors are handled through the centralized ErrorHandler:

1. **Network Errors** - Connection issues, API failures
2. **Permission Errors** - File system access, notifications
3. **Validation Errors** - Invalid input, data constraints
4. **Critical Errors** - Unrecoverable errors requiring restart

## Best Practices

1. **Always use error boundaries** for critical operations
2. **Validate user input** before processing
3. **Use semantic HTML** and ARIA attributes for accessibility
4. **Follow the established component pattern** when adding features
5. **Document new methods** with JSDoc comments
6. **Test keyboard navigation** for all interactive elements

## Development Guidelines

### Adding a New Component

1. Create component file in `src/renderer/js/components/`
2. Export as ES6 module
3. Add JSDoc documentation
4. Import and initialize in `app.js`
5. Add corresponding styles to `app.css`

### Adding IPC Methods

1. Add handler in main process
2. Expose method in `preload.js`
3. Add error handling wrapper
4. Document in this API guide

### Styling Guidelines

- Use CSS variables for colors and dimensions
- Follow BEM naming convention for classes
- Ensure proper contrast ratios for accessibility
- Test with different color schemes