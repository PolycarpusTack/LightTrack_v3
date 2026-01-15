# LightTrack Suite - Implementation Guide

## Quick Start for Developers

### 1. Base App Template
```javascript
// Template for any companion app
const { app, Tray, Menu, globalShortcut } = require('electron');
const { SuiteConnector } = require('@lighttrack/suite-sdk');

class CompanionApp {
  constructor(config) {
    this.name = config.name;
    this.version = config.version;
    this.port = config.port;
    
    // Connect to suite
    this.suite = new SuiteConnector({
      appName: this.name,
      apiPort: this.port,
      capabilities: config.capabilities
    });
  }
  
  async init() {
    // Register with suite
    await this.suite.register();
    
    // Setup IPC listeners
    this.setupListeners();
    
    // Initialize UI
    this.createTray();
    this.registerShortcuts();
  }
  
  setupListeners() {
    // Listen for suite events
    this.suite.on('activity.changed', this.onActivityChanged);
    this.suite.on('focus.started', this.onFocusStarted);
    this.suite.on('suite.query', this.onDataRequest);
  }
}
```

### 2. Shared SDK Structure
```javascript
// @lighttrack/suite-sdk
module.exports = {
  SuiteConnector,      // IPC communication
  SuiteDatabase,       // Shared data access
  SuiteUI,            // Common UI components
  SuiteAuth,          // Inter-app authentication
  SuiteEvents,        // Event system
  SuiteStorage,       // Shared storage
  SuitePreferences,   // User preferences
  SuiteAnalytics      // Privacy-preserving analytics
};
```

### 3. Data Models
```typescript
// Shared TypeScript interfaces
interface Activity {
  id: string;
  app: string;
  title: string;
  project?: string;
  startTime: Date;
  endTime?: Date;
  metadata: Record<string, any>;
}

interface SuiteContext {
  currentActivity: Activity;
  activeProject: string;
  recentApps: string[];
  focusMode: boolean;
  lastMood?: number;
  lastEnergy?: number;
}

interface SuiteEvent {
  type: string;
  source: string;
  timestamp: Date;
  data: any;
}
```### 4. Communication Protocol

#### REST API Endpoints
```javascript
// Each app exposes these endpoints
const routes = {
  // Status
  'GET /api/status': getStatus,
  'GET /api/health': getHealth,
  
  // Capabilities
  'GET /api/capabilities': getCapabilities,
  'GET /api/version': getVersion,
  
  // Data
  'GET /api/data/:type': getData,
  'POST /api/data/:type': postData,
  
  // Events
  'POST /api/event': receiveEvent,
  'GET /api/events/subscribe': subscribeEvents,
  
  // Actions
  'POST /api/action/:name': triggerAction,
  'GET /api/actions': listActions
};
```

#### WebSocket for Real-time
```javascript
// Real-time communication
class SuiteWebSocket {
  constructor(app) {
    this.ws = new WebSocket(`ws://localhost:41418/${app.name}`);
    this.setupHandlers();
  }
  
  broadcast(event, data) {
    this.ws.send(JSON.stringify({
      type: 'broadcast',
      event,
      data,
      timestamp: Date.now()
    }));
  }
  
  subscribe(events) {
    this.ws.send(JSON.stringify({
      type: 'subscribe',
      events
    }));
  }
}
```### 5. Security & Privacy

```javascript
// Inter-app authentication
class SuiteAuth {
  constructor() {
    this.token = this.generateToken();
    this.permissions = new Map();
  }
  
  // Apps must authenticate to access data
  async authenticate(appName, signature) {
    const verified = await this.verifySignature(appName, signature);
    if (verified) {
      this.permissions.set(appName, this.getDefaultPermissions(appName));
    }
    return verified;
  }
  
  // Granular permissions
  canAccess(appName, resource) {
    const perms = this.permissions.get(appName);
    return perms && perms.includes(resource);
  }
}
```

### 6. Development Workflow

```bash
# Clone suite template
git clone https://github.com/lighttrack/suite-template my-app
cd my-app

# Install dependencies
npm install @lighttrack/suite-sdk

# Configure app
npm run configure

# Development mode (with hot reload)
npm run dev

# Build standalone
npm run build:standalone

# Build for suite
npm run build:suite

# Run tests
npm test
```

### 7. Testing Integration

```javascript
// Test suite for companion apps
const { SuiteTestHarness } = require('@lighttrack/test-utils');

describe('MyApp Integration', () => {
  let harness;
  let app;
  
  beforeEach(() => {
    harness = new SuiteTestHarness();
    app = harness.createApp('MyApp');
  });
  
  test('responds to activity changes', async () => {
    await harness.simulateActivityChange({
      app: 'VSCode',
      project: 'TestProject'
    });
    
    expect(app.getState().currentProject).toBe('TestProject');
  });
  
  test('broadcasts events correctly', async () => {
    const listener = harness.createListener();
    
    await app.createNote('Test note');
    
    expect(listener.received).toContainEvent({
      type: 'note.created',
      source: 'MyApp'
    });
  });
});
```

### 8. Deployment Checklist

- [ ] App runs standalone
- [ ] Suite integration tested
- [ ] Memory usage < 50MB
- [ ] Startup time < 1s
- [ ] All data stored locally
- [ ] No external dependencies
- [ ] Keyboard shortcuts work
- [ ] Tray icon displays
- [ ] Auto-update configured
- [ ] Privacy policy included