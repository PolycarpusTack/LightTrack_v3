# LightTrack API Documentation

This comprehensive API documentation covers all public APIs, IPC channels, event systems, and integration interfaces for LightTrack v3.0.0.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [IPC API Reference](#ipc-api-reference)
3. [Event System](#event-system)
4. [Main Process APIs](#main-process-apis)
5. [Renderer Process APIs](#renderer-process-apis)
6. [Storage APIs](#storage-apis)
7. [Integration APIs](#integration-apis)
8. [Error Handling](#error-handling)
9. [Examples](#examples)

## Architecture Overview

LightTrack uses a multi-process architecture with secure IPC communication:

```
┌─────────────────┐    IPC     ┌─────────────────┐
│   Main Process  │ ◄─────────► │ Renderer Process│
│                 │             │                 │
│ • WindowManager │             │ • UI Components │
│ • ActivityTracker│             │ • Page Loader   │
│ • Storage       │             │ • Modal Manager │
│ • IPC Handlers  │             │ • State Store   │
└─────────────────┘             └─────────────────┘
         │                               │
         ▼                               ▼
┌─────────────────┐             ┌─────────────────┐
│   Services      │             │   Components    │
│                 │             │                 │
│ • Error Boundary│             │ • Sidebar       │
│ • Cleanup Mgr   │             │ • Dashboard     │
│ • Recovery Sys  │             │ • Settings      │
└─────────────────┘             └─────────────────┘
```

### Core Principles

- **Security**: All IPC communication is validated and sandboxed
- **Type Safety**: Comprehensive TypeScript definitions
- **Error Resilience**: Built-in error boundaries and recovery
- **Performance**: Optimized for minimal overhead
- **Extensibility**: Plugin-friendly architecture

## IPC API Reference

All IPC communication goes through the secure `lightTrackAPI` interface exposed in the renderer process.

### Activities API

#### `activities.get()`
Retrieves all activities from storage.

**Signature:**
```typescript
activities.get(): Promise<Activity[]>
```

**Returns:**
```typescript
interface Activity {
  id: string;
  title: string;
  app: string;
  project: string;
  startTime: string; // ISO timestamp
  endTime?: string;  // ISO timestamp
  duration: number;  // seconds
  actualDuration?: number; // seconds (excluding idle)
  tickets: string[];
  tags: string[];
  billable: boolean;
  sapCode?: string;
  costCenter?: string;
  poNumber?: string;
  wbsElement?: string;
  metadata?: Record<string, any>;
  idlePeriods?: IdlePeriod[];
  doNotTrack: boolean;
  doNotTrackCategory?: string;
  doNotTrackReason?: string;
  mergedCount?: number;
}

interface IdlePeriod {
  start: string;
  end?: string;
  duration: number;
  excluded: boolean;
}
```

**Example:**
```javascript
const activities = await window.lightTrackAPI.activities.get();
console.log(`Found ${activities.length} activities`);
```

#### `activities.saveManual(activity)`
Saves a manually created activity.

**Signature:**
```typescript
activities.saveManual(activity: Partial<Activity>): Promise<{success: boolean, id?: string, error?: string}>
```

**Parameters:**
- `activity`: Partial activity object (id, startTime, endTime will be auto-generated if missing)

**Example:**
```javascript
const result = await window.lightTrackAPI.activities.saveManual({
  title: 'Code Review Session',
  app: 'VS Code',
  project: 'LightTrack',
  duration: 1800, // 30 minutes
  tags: ['review', 'development'],
  billable: true
});

if (result.success) {
  console.log(`Activity saved with ID: ${result.id}`);
} else {
  console.error(`Save failed: ${result.error}`);
}
```

#### `activities.update(id, updates)`
Updates an existing activity.

**Signature:**
```typescript
activities.update(id: string, updates: Partial<Activity>): Promise<{success: boolean, error?: string}>
```

**Example:**
```javascript
await window.lightTrackAPI.activities.update('123', {
  project: 'Updated Project Name',
  billable: false,
  tags: ['meeting', 'planning']
});
```

#### `activities.delete(id)`
Deletes an activity by ID.

**Signature:**
```typescript
activities.delete(id: string): Promise<{success: boolean, error?: string}>
```

#### `activities.getById(id)`
Retrieves a specific activity by ID.

**Signature:**
```typescript
activities.getById(id: string): Promise<Activity | null>
```

#### `activities.export(csvData, filename)`
Exports activities to a file.

**Signature:**
```typescript
activities.export(csvData: string, filename: string): Promise<{success: boolean, path?: string, error?: string}>
```

#### `activities.getSummary(date)`
Gets activity summary for a specific date.

**Signature:**
```typescript
activities.getSummary(date: string): Promise<ActivitySummary>

interface ActivitySummary {
  date: string;
  totalDuration: number;
  billableDuration: number;
  projects: Record<string, number>;
  topApps: Array<{app: string, duration: number}>;
  productivity: {
    score: number;
    factors: string[];
  };
}
```

#### `activities.consolidate()`
Consolidates and merges similar activities.

**Signature:**
```typescript
activities.consolidate(): Promise<{success: boolean, merged: number, error?: string}>
```

#### `activities.getStats()`
Gets comprehensive activity statistics.

**Signature:**
```typescript
activities.getStats(): Promise<ActivityStats>

interface ActivityStats {
  total: number;
  thisWeek: number;
  thisMonth: number;
  averageDaily: number;
  mostProductiveHour: number;
  topProjects: Array<{project: string, count: number, duration: number}>;
  topApps: Array<{app: string, count: number, duration: number}>;
}
```

### Settings API

#### `settings.getAll()`
Retrieves all application settings.

**Signature:**
```typescript
settings.getAll(): Promise<Settings>

interface Settings {
  ui: {
    theme: 'light' | 'dark' | 'auto';
    sidebarCollapsed: boolean;
    showFloatingTimer: boolean;
    floatingTimerOpacity: number;
  };
  tracking: {
    autoSave: boolean;
    autoSaveInterval: number; // seconds
    idleThreshold: number;    // seconds
    pauseOnIdle: boolean;
    minActivityDuration: number; // seconds
  };
  notifications: {
    showNotifications: boolean;
    breakReminders: boolean;
    achievementAlerts: boolean;
  };
  data: {
    dataRetention: number; // days
    compression: boolean;
    autoBackup: boolean;
    backupInterval: number; // hours
  };
  privacy: {
    doNotTrackEnabled: boolean;
    anonymizeData: boolean;
    localOnly: boolean;
  };
  performance: {
    enableOptimizations: boolean;
    memoryLimit: number; // MB
    cacheSize: number;   // MB
  };
}
```

#### `settings.save(settings)`
Saves application settings.

**Signature:**
```typescript
settings.save(settings: Partial<Settings>): Promise<{success: boolean, error?: string}>
```

#### `settings.updateSetting(key, value)`
Updates a single setting value.

**Signature:**
```typescript
settings.updateSetting(key: string, value: any): Promise<{success: boolean, error?: string}>
```

**Example:**
```javascript
// Update theme
await window.lightTrackAPI.settings.updateSetting('ui.theme', 'dark');

// Update tracking interval
await window.lightTrackAPI.settings.updateSetting('tracking.autoSaveInterval', 120);
```

### Tracking API

#### `tracking.toggle()`
Toggles time tracking on/off.

**Signature:**
```typescript
tracking.toggle(): Promise<{isActive: boolean, sessionStartTime?: string}>
```

#### `tracking.getCurrent()`
Gets current tracking state and active activity.

**Signature:**
```typescript
tracking.getCurrent(): Promise<TrackingState>

interface TrackingState {
  isActive: boolean;
  currentActivity: Activity | null;
  sessionStartTime: string | null;
  elapsedTime: number; // seconds since session start
}
```

### Pomodoro API

#### `pomodoro.start(type)`
Starts a pomodoro session.

**Signature:**
```typescript
pomodoro.start(type: 'work' | 'short-break' | 'long-break'): Promise<{success: boolean, endTime: string}>
```

#### `pomodoro.stop()`
Stops the current pomodoro session.

**Signature:**
```typescript
pomodoro.stop(): Promise<{success: boolean}>
```

#### `pomodoro.getState()`
Gets current pomodoro state.

**Signature:**
```typescript
pomodoro.getState(): Promise<PomodoroState>

interface PomodoroState {
  active: boolean;
  type: 'work' | 'short-break' | 'long-break' | null;
  startTime: string | null;
  endTime: string | null;
  remainingTime: number; // seconds
  sessionsCompleted: number;
}
```

### UI API

#### `ui.createDialog(type, data)`
Creates and displays a modal dialog.

**Signature:**
```typescript
ui.createDialog(type: DialogType, data?: any): Promise<string> // returns modalId

type DialogType = 'settings' | 'manual-entry' | 'edit-activity' | 'help' | 'character-sheet' | 'confirm' | 'alert';
```

#### `ui.openSettings(section)`
Opens the settings dialog to a specific section.

**Signature:**
```typescript
ui.openSettings(section?: string): Promise<string>
```

#### `ui.openManualEntry(data)`
Opens the manual entry dialog with optional pre-filled data.

**Signature:**
```typescript
ui.openManualEntry(data?: Partial<Activity>): Promise<string>
```

#### `ui.editActivity(activityId)`
Opens the edit dialog for a specific activity.

**Signature:**
```typescript
ui.editActivity(activityId: string): Promise<string>
```

#### `ui.confirm(message, options)`
Shows a confirmation dialog.

**Signature:**
```typescript
ui.confirm(message: string, options?: ConfirmOptions): Promise<boolean>

interface ConfirmOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'info' | 'warning' | 'error' | 'success';
}
```

#### `ui.alert(message, options)`
Shows an alert dialog.

**Signature:**
```typescript
ui.alert(message: string, options?: AlertOptions): Promise<void>

interface AlertOptions {
  title?: string;
  type?: 'info' | 'warning' | 'error' | 'success';
}
```

#### `ui.showNotification(title, body, options)`
Shows a system notification.

**Signature:**
```typescript
ui.showNotification(title: string, body: string, options?: NotificationOptions): Promise<void>

interface NotificationOptions {
  icon?: string;
  tag?: string;
  requireInteraction?: boolean;
  actions?: Array<{action: string, title: string}>;
}
```

### Window API

#### `window.show()`
Shows the main application window.

**Signature:**
```typescript
window.show(): Promise<void>
```

#### `window.openCharacterSheet()`
Opens the RPG character sheet window.

**Signature:**
```typescript
window.openCharacterSheet(): Promise<void>
```

#### `window.resizeFloatingTimer(expanded)`
Resizes the floating timer window.

**Signature:**
```typescript
window.resizeFloatingTimer(expanded: boolean): Promise<void>
```

### RPG API

#### `rpg.getCharacter()`
Gets current RPG character data.

**Signature:**
```typescript
rpg.getCharacter(): Promise<Character>

interface Character {
  level: number;
  experience: number;
  experienceToNext: number;
  skills: Record<string, SkillLevel>;
  achievements: Achievement[];
  stats: {
    totalTimeTracked: number;
    projectsCompleted: number;
    streakDays: number;
    productivityScore: number;
  };
}

interface SkillLevel {
  level: number;
  experience: number;
  bonuses: string[];
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  unlockedAt: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}
```

### Health Monitoring API

#### `health.getOverallHealth()`
Gets overall system health status.

**Signature:**
```typescript
health.getOverallHealth(): Promise<HealthStatus>

interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'critical';
  services: Record<string, ServiceHealth>;
  lastChecked: string;
  uptime: number;
}

interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'critical' | 'offline';
  errorRate: number;
  responseTime: number;
  lastError?: string;
  circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}
```

#### `health.getDiagnostics()`
Gets detailed diagnostic information.

**Signature:**
```typescript
health.getDiagnostics(): Promise<DiagnosticInfo>

interface DiagnosticInfo {
  system: {
    platform: string;
    memory: {used: number, total: number};
    cpu: {usage: number, cores: number};
    disk: {used: number, free: number};
  };
  application: {
    version: string;
    uptime: number;
    memoryUsage: number;
    windowCount: number;
    activeServices: string[];
  };
  performance: {
    startupTime: number;
    averageResponseTime: number;
    errorRate: number;
    cacheHitRatio: number;
  };
}
```

### Configuration API

#### `config.get(path, defaultValue)`
Gets a configuration value by path.

**Signature:**
```typescript
config.get(path: string, defaultValue?: any): Promise<any>
```

**Example:**
```javascript
const theme = await window.lightTrackAPI.config.get('ui.theme', 'light');
const trackingInterval = await window.lightTrackAPI.config.get('tracking.interval', 60);
```

#### `config.set(path, value)`
Sets a configuration value.

**Signature:**
```typescript
config.set(path: string, value: any): Promise<{success: boolean, error?: string}>
```

### Performance API

#### `performance.getMetrics(metricNames)`
Gets specific performance metrics.

**Signature:**
```typescript
performance.getMetrics(metricNames: string[]): Promise<Record<string, number>>
```

**Example:**
```javascript
const metrics = await window.lightTrackAPI.performance.getMetrics([
  'memory.used',
  'cpu.usage',
  'response.time'
]);
```

#### `performance.mark(name, metadata)`
Creates a performance mark.

**Signature:**
```typescript
performance.mark(name: string, metadata?: Record<string, any>): Promise<void>
```

#### `performance.measure(name, startMark, endMark)`
Creates a performance measurement.

**Signature:**
```typescript
performance.measure(name: string, startMark: string, endMark: string): Promise<number>
```

## Event System

LightTrack uses a comprehensive event system for real-time updates and communication between components.

### Event Registration

#### `on(channel, callback)`
Registers an event listener.

**Signature:**
```typescript
on(channel: string, callback: (...args: any[]) => void): () => void // returns unsubscribe function
```

**Available Channels:**
- `activity-update` - Activity data changed
- `activities-updated` - Activities list updated
- `pomodoro-update` - Pomodoro state changed
- `theme-changed` - UI theme changed
- `timer-update` - Timer data updated
- `rpg-update` - RPG character data updated
- `performance-alert` - Performance threshold exceeded
- `service-degraded` - Service health degraded
- `service-recovered` - Service health recovered
- `config-reloaded` - Configuration reloaded
- `recovery-notification` - Error recovery occurred

**Example:**
```javascript
// Listen for activity updates
const unsubscribe = window.lightTrackAPI.on('activity-update', (activity) => {
  console.log('Activity updated:', activity);
  updateUI(activity);
});

// Later, unsubscribe
unsubscribe();
```

### Specific Event Listeners

#### Health Events
```javascript
// Service degradation alerts
window.lightTrackAPI.health.onServiceDegraded((serviceName, health) => {
  console.warn(`Service ${serviceName} is degraded:`, health);
});

// Service recovery notifications
window.lightTrackAPI.health.onServiceRecovered((serviceName, health) => {
  console.info(`Service ${serviceName} has recovered:`, health);
});
```

#### Performance Events
```javascript
// Performance alerts
window.lightTrackAPI.performance.onAlert((alert) => {
  console.warn('Performance alert:', alert);
  // alert = { metric: 'memory.used', value: 150, threshold: 100, severity: 'warning' }
});
```

#### Recovery Events
```javascript
// Error recovery notifications
window.lightTrackAPI.recovery.onRecoveryNotification((recovery) => {
  console.info('System recovered from error:', recovery);
  // recovery = { errorType: 'DatabaseConnection', strategy: 'reconnect', success: true }
});
```

## Main Process APIs

APIs available in the main Electron process for service development and extensions.

### Service Registration

```javascript
// Register a new service
const { ServiceBridge } = require('./src/main/integration/bridge');

const bridge = new ServiceBridge();
bridge.registerService('MyService', {
  old: require('./legacy/MyOldService'),
  new: require('./services/MyNewService'),
  enabledByDefault: false
});
```

### Error Boundary Usage

```javascript
const { ServiceErrorBoundary } = require('./src/main/utils/error-boundary');

const errorBoundary = new ServiceErrorBoundary(myService, {
  retryLimit: 3,
  circuitBreakerThreshold: 5,
  onError: (error, context) => {
    logger.error('Service error:', error, context);
  }
});

// Use with error handling
const result = await errorBoundary.execute('methodName', arg1, arg2);
```

### Cleanup Management

```javascript
const { CleanupManager } = require('./src/main/utils/cleanup-manager');

const cleanup = new CleanupManager();

// Register cleanup tasks
cleanup.register('database', () => {
  database.close();
}, cleanup.priorities.CRITICAL);

cleanup.register('cache', () => {
  cache.clear();
}, cleanup.priorities.LOW);

// Cleanup on shutdown
app.on('before-quit', () => {
  cleanup.cleanupAll();
});
```

## Renderer Process APIs

APIs available in the renderer process for UI development.

### UI Store Usage

```javascript
const { UIStore } = require('./src/renderer/store/uiStore');
const { connect } = require('./src/renderer/store/hooks');

// Create store instance
const store = new UIStore();

// Connect component to store
class MyComponent {
  constructor(element) {
    this.element = element;
    
    // Connect to store
    this.disconnect = connect(store, (state) => {
      this.render(state);
    });
  }
  
  destroy() {
    this.disconnect();
  }
}
```

### Modal Manager Usage

```javascript
const { ModalManager } = require('./src/renderer/components/modalManager');

const modalManager = new ModalManager();

// Open a modal
const modalId = await modalManager.open('settings', {
  title: 'Custom Settings',
  width: '600px'
});

// Confirm dialog
const confirmed = await modalManager.confirm('Are you sure?', {
  confirmText: 'Yes, delete it',
  cancelText: 'Cancel'
});

if (confirmed) {
  deleteItem();
}
```

### Page Loader Usage

```javascript
const { PageLoader } = require('./src/renderer/components/pageLoader');

const pageLoader = new PageLoader(document.getElementById('main-content'));

// Load page
await pageLoader.loadPage('activities');

// Navigate
pageLoader.navigate('timeline', { filter: 'last-week' });
```

## Storage APIs

LightTrack provides multiple storage interfaces for different data types.

### Activity Storage

```javascript
// Get all activities
const activities = await storage.getActivities();

// Save single activity
await storage.saveActivity(activity);

// Bulk operations
await storage.saveActivities(activities);
await storage.deleteActivities(activityIds);

// Query operations
const recent = await storage.getActivitiesByDateRange(startDate, endDate);
const byProject = await storage.getActivitiesByProject('LightTrack');
```

### Settings Storage

```javascript
// Hierarchical settings
await storage.setSetting('ui.theme', 'dark');
const theme = await storage.getSetting('ui.theme', 'light');

// Bulk settings
await storage.setSettings({
  'ui.theme': 'dark',
  'tracking.interval': 120,
  'notifications.enabled': true
});
```

### Cache Storage

```javascript
const cache = new CacheStorage('ui-components');

// Store with TTL
await cache.set('dashboard-data', data, { ttl: 300 }); // 5 minutes

// Retrieve
const cachedData = await cache.get('dashboard-data');

// Clear expired
await cache.clearExpired();
```

## Integration APIs

APIs for integrating with external services and browser extensions.

### Browser Extension API

```javascript
// Register extension
const extension = new BrowserExtension({
  ports: [8080, 8081, 8082],
  allowedOrigins: ['chrome-extension://*', 'moz-extension://*']
});

// Handle messages
extension.onMessage('activity-detected', (activity) => {
  activityTracker.handleBrowserActivity(activity);
});

// Send data to extension
extension.broadcast('settings-updated', newSettings);
```

### Webhook Integration

```javascript
const webhook = new WebhookIntegration({
  endpoint: 'https://api.example.com/webhook',
  secret: 'webhook-secret',
  events: ['activity-created', 'session-completed']
});

// Register webhook
await webhook.register();

// Send event
await webhook.sendEvent('activity-created', {
  activity: activity,
  timestamp: new Date().toISOString()
});
```

### Export Integration

```javascript
const exporter = new ExportIntegration();

// Register custom exporter
exporter.registerFormat('custom-json', {
  extension: '.cjson',
  mimeType: 'application/json',
  export: (activities) => {
    return JSON.stringify({
      version: '1.0',
      exported: new Date().toISOString(),
      activities: activities
    });
  }
});

// Export data
const result = await exporter.export(activities, 'custom-json');
```

## Error Handling

LightTrack implements comprehensive error handling at multiple levels.

### Error Types

```typescript
interface LightTrackError {
  code: string;
  message: string;
  category: 'system' | 'data' | 'network' | 'user' | 'integration';
  severity: 'low' | 'medium' | 'high' | 'critical';
  context?: Record<string, any>;
  recoverable: boolean;
  timestamp: string;
}
```

### Error Codes

| Code | Category | Description | Recovery |
|------|----------|-------------|----------|
| `LT_DB_001` | data | Database connection failed | Automatic retry |
| `LT_DB_002` | data | Database corruption detected | Restore from backup |
| `LT_IPC_001` | system | IPC communication timeout | Restart service |
| `LT_WIN_001` | system | Window creation failed | Fallback window |
| `LT_NET_001` | network | Network request failed | Retry with backoff |
| `LT_AUTH_001` | integration | Authentication failed | Re-authenticate |
| `LT_PERM_001` | system | Permission denied | Request permissions |
| `LT_MEM_001` | system | Out of memory | Clear caches |

### Error Handling Examples

```javascript
try {
  const activities = await window.lightTrackAPI.activities.get();
} catch (error) {
  if (error.code === 'LT_DB_001') {
    // Database connection failed - show user message
    showErrorNotification('Database temporarily unavailable. Retrying...');
    
    // Automatic retry will happen in background
    setTimeout(() => {
      // Retry after a delay
      loadActivities();
    }, 5000);
  } else if (error.recoverable) {
    // Other recoverable error
    showRetryOption(error.message, () => loadActivities());
  } else {
    // Non-recoverable error
    showCriticalError(error.message);
  }
}
```

### Global Error Handler

```javascript
// Set up global error handling
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  
  // Report to error tracking
  errorTracker.reportError(event.reason);
  
  // Show user notification if severe
  if (event.reason.severity === 'critical') {
    showCriticalErrorDialog(event.reason);
  }
});
```

## Examples

### Complete Activity Tracking Example

```javascript
class ActivityTracker {
  constructor() {
    this.isTracking = false;
    this.currentActivity = null;
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    // Listen for tracking updates
    window.lightTrackAPI.on('activity-update', (activity) => {
      this.currentActivity = activity;
      this.updateUI();
    });
    
    // Listen for timer updates
    window.lightTrackAPI.on('timer-update', (data) => {
      this.updateTimer(data);
    });
  }
  
  async startTracking() {
    try {
      const result = await window.lightTrackAPI.tracking.toggle();
      this.isTracking = result.isActive;
      
      if (this.isTracking) {
        this.showNotification('Time tracking started');
        this.startTimer();
      }
    } catch (error) {
      this.handleError('Failed to start tracking', error);
    }
  }
  
  async stopTracking() {
    try {
      const result = await window.lightTrackAPI.tracking.toggle();
      this.isTracking = result.isActive;
      
      if (!this.isTracking) {
        this.showNotification('Time tracking stopped');
        this.stopTimer();
        await this.saveActivity();
      }
    } catch (error) {
      this.handleError('Failed to stop tracking', error);
    }
  }
  
  async saveActivity() {
    if (!this.currentActivity) return;
    
    try {
      const result = await window.lightTrackAPI.activities.saveManual(this.currentActivity);
      
      if (result.success) {
        this.showNotification(`Activity saved: ${this.currentActivity.title}`);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      this.handleError('Failed to save activity', error);
    }
  }
  
  handleError(message, error) {
    console.error(message, error);
    
    // Show user-friendly error
    window.lightTrackAPI.ui.alert(`${message}: ${error.message}`, {
      type: 'error'
    });
  }
  
  showNotification(message) {
    window.lightTrackAPI.ui.showNotification('LightTrack', message);
  }
}

// Usage
const tracker = new ActivityTracker();
```

### Settings Management Example

```javascript
class SettingsManager {
  constructor() {
    this.settings = {};
    this.loadSettings();
    this.setupEventListeners();
  }
  
  async loadSettings() {
    try {
      this.settings = await window.lightTrackAPI.settings.getAll();
      this.applySettings();
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.useDefaultSettings();
    }
  }
  
  async updateSetting(key, value) {
    try {
      const result = await window.lightTrackAPI.settings.updateSetting(key, value);
      
      if (result.success) {
        // Update local copy
        this.setSetting(key, value);
        this.applySettings();
        
        // Show confirmation
        this.showSettingSaved(key);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      this.showSettingError(key, error);
    }
  }
  
  setSetting(key, value) {
    const keys = key.split('.');
    let obj = this.settings;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    
    obj[keys[keys.length - 1]] = value;
  }
  
  getSetting(key, defaultValue = null) {
    const keys = key.split('.');
    let value = this.settings;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }
    
    return value;
  }
  
  applySettings() {
    // Apply theme
    const theme = this.getSetting('ui.theme', 'light');
    document.body.className = `theme-${theme}`;
    
    // Apply other UI settings
    const sidebarCollapsed = this.getSetting('ui.sidebarCollapsed', false);
    if (sidebarCollapsed) {
      document.body.classList.add('sidebar-collapsed');
    }
    
    // Configure tracking
    const trackingInterval = this.getSetting('tracking.autoSaveInterval', 60);
    this.configureTracking(trackingInterval);
  }
  
  setupEventListeners() {
    // Listen for external setting changes
    window.lightTrackAPI.on('config-reloaded', () => {
      this.loadSettings();
    });
  }
  
  showSettingSaved(key) {
    window.lightTrackAPI.ui.showNotification(
      'Setting Updated',
      `${key} has been saved`
    );
  }
  
  showSettingError(key, error) {
    window.lightTrackAPI.ui.alert(
      `Failed to update ${key}: ${error.message}`,
      { type: 'error' }
    );
  }
}

// Usage
const settingsManager = new SettingsManager();

// Update a setting
settingsManager.updateSetting('ui.theme', 'dark');
```

### Dashboard Component Example

```javascript
class Dashboard {
  constructor(container) {
    this.container = container;
    this.data = {};
    this.charts = {};
    this.init();
  }
  
  async init() {
    this.render();
    await this.loadData();
    this.setupEventListeners();
    this.setupAutoRefresh();
  }
  
  async loadData() {
    try {
      // Load multiple data sources in parallel
      const [activities, stats, trackingState, health] = await Promise.all([
        window.lightTrackAPI.activities.get(),
        window.lightTrackAPI.activities.getStats(),
        window.lightTrackAPI.tracking.getCurrent(),
        window.lightTrackAPI.health.getOverallHealth()
      ]);
      
      this.data = { activities, stats, trackingState, health };
      this.updateDashboard();
      
    } catch (error) {
      this.showError('Failed to load dashboard data', error);
    }
  }
  
  render() {
    this.container.innerHTML = `
      <div class="dashboard">
        <div class="dashboard-header">
          <h1>Dashboard</h1>
          <div class="tracking-status" id="tracking-status"></div>
        </div>
        
        <div class="dashboard-grid">
          <div class="card" id="stats-card">
            <h2>Statistics</h2>
            <div id="stats-content"></div>
          </div>
          
          <div class="card" id="activity-chart">
            <h2>Activity Timeline</h2>
            <canvas id="activity-canvas"></canvas>
          </div>
          
          <div class="card" id="health-status">
            <h2>System Health</h2>
            <div id="health-content"></div>
          </div>
        </div>
      </div>
    `;
  }
  
  updateDashboard() {
    this.updateTrackingStatus();
    this.updateStats();
    this.updateActivityChart();
    this.updateHealthStatus();
  }
  
  updateTrackingStatus() {
    const statusEl = document.getElementById('tracking-status');
    const { isTracking, currentActivity } = this.data.trackingState;
    
    statusEl.innerHTML = `
      <div class="status ${isTracking ? 'active' : 'inactive'}">
        <span class="indicator"></span>
        ${isTracking ? 'Tracking' : 'Not Tracking'}
      </div>
      ${currentActivity ? `
        <div class="current-activity">
          <strong>${currentActivity.title}</strong>
          <span>${currentActivity.app}</span>
        </div>
      ` : ''}
    `;
  }
  
  updateStats() {
    const statsEl = document.getElementById('stats-content');
    const { stats } = this.data;
    
    statsEl.innerHTML = `
      <div class="stat-grid">
        <div class="stat-item">
          <span class="stat-value">${stats.total}</span>
          <span class="stat-label">Total Activities</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${stats.thisWeek}</span>
          <span class="stat-label">This Week</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${Math.round(stats.averageDaily)}</span>
          <span class="stat-label">Daily Average</span>
        </div>
      </div>
    `;
  }
  
  updateActivityChart() {
    // Implementation for activity timeline chart
    const canvas = document.getElementById('activity-canvas');
    const ctx = canvas.getContext('2d');
    
    // Draw chart based on activities data
    this.drawActivityTimeline(ctx, this.data.activities);
  }
  
  updateHealthStatus() {
    const healthEl = document.getElementById('health-content');
    const { health } = this.data;
    
    const statusClass = health.overall === 'healthy' ? 'success' :
                       health.overall === 'degraded' ? 'warning' : 'error';
    
    healthEl.innerHTML = `
      <div class="health-overview ${statusClass}">
        <div class="health-status">
          <span class="status-indicator"></span>
          System ${health.overall}
        </div>
        <div class="health-details">
          Uptime: ${Math.round(health.uptime / 3600)}h
        </div>
      </div>
    `;
  }
  
  setupEventListeners() {
    // Listen for real-time updates
    window.lightTrackAPI.on('activity-update', (activity) => {
      this.data.trackingState.currentActivity = activity;
      this.updateTrackingStatus();
    });
    
    window.lightTrackAPI.on('activities-updated', () => {
      this.loadData(); // Refresh all data
    });
    
    window.lightTrackAPI.health.onServiceDegraded((service, health) => {
      this.showHealthAlert(`Service ${service} is experiencing issues`);
    });
  }
  
  setupAutoRefresh() {
    // Refresh data every 30 seconds
    setInterval(() => {
      this.loadData();
    }, 30000);
  }
  
  showError(message, error) {
    console.error(message, error);
    
    // Show error state in dashboard
    this.container.innerHTML = `
      <div class="dashboard-error">
        <h2>Dashboard Error</h2>
        <p>${message}</p>
        <button onclick="location.reload()">Retry</button>
      </div>
    `;
  }
  
  showHealthAlert(message) {
    window.lightTrackAPI.ui.showNotification(
      'System Alert',
      message,
      { type: 'warning' }
    );
  }
}

// Usage
const dashboard = new Dashboard(document.getElementById('dashboard-container'));
```

---

**API Documentation Version**: 3.0.0  
**Last Updated**: 2024-01-15  
**Coverage**: Complete API reference  
**TypeScript Definitions**: Available in `/types/lighttrack.d.ts`