/**
 * @module test/setup
 * @description Test setup and configuration for LightTrack
 */

// Mock Electron APIs
global.window = {
  lightTrackAPI: {
    // Time tracking APIs
    startTracking: jest.fn().mockResolvedValue({ isTracking: true }),
    stopTracking: jest.fn().mockResolvedValue({ isTracking: false }),
    getTrackingStatus: jest.fn().mockResolvedValue({
      isTracking: false,
      isPaused: false,
      currentActivity: null
    }),
    
    // Activity APIs
    getActivities: jest.fn().mockResolvedValue([]),
    addActivity: jest.fn().mockResolvedValue({ success: true }),
    deleteActivity: jest.fn().mockResolvedValue({ success: true }),
    updateActivity: jest.fn().mockResolvedValue({ success: true }),
    
    // Stats APIs
    getTodayTotal: jest.fn().mockResolvedValue(0),
    getWeekTotal: jest.fn().mockResolvedValue(0),
    getMonthTotal: jest.fn().mockResolvedValue(0),
    
    // Settings APIs
    getSettings: jest.fn().mockResolvedValue({}),
    updateSettings: jest.fn().mockResolvedValue({ success: true }),
    
    // Export/Import APIs
    exportData: jest.fn().mockResolvedValue({ success: true, path: '/test/export.csv' }),
    importData: jest.fn().mockResolvedValue({ success: true, imported: 10 }),
    
    // File APIs
    saveFile: jest.fn().mockResolvedValue({ success: true, path: '/test/file.txt' }),
    readFile: jest.fn().mockResolvedValue('file content'),
    
    // IPC Event Listeners
    onTrackingStatusChanged: jest.fn((callback) => {
      // Return cleanup function
      return () => {};
    }),
    onActivityCreated: jest.fn((callback) => () => {}),
    onTrackingStarted: jest.fn((callback) => () => {}),
    onTrackingStopped: jest.fn((callback) => () => {}),
    
    // Cleanup
    cleanupAll: jest.fn()
  },
  
  // Browser APIs
  localStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn()
  },
  
  location: {
    reload: jest.fn()
  },
  
  // Performance API
  performance: {
    now: jest.fn(() => Date.now())
  }
};

// Mock DOM elements
global.document = {
  getElementById: jest.fn((id) => {
    return {
      id,
      textContent: '',
      innerHTML: '',
      style: {},
      classList: {
        add: jest.fn(),
        remove: jest.fn(),
        toggle: jest.fn(),
        contains: jest.fn(() => false)
      },
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      querySelector: jest.fn(),
      querySelectorAll: jest.fn(() => []),
      appendChild: jest.fn(),
      removeChild: jest.fn(),
      setAttribute: jest.fn(),
      getAttribute: jest.fn(),
      disabled: false,
      value: ''
    };
  }),
  
  querySelector: jest.fn(),
  querySelectorAll: jest.fn(() => []),
  createElement: jest.fn((tag) => ({
    tagName: tag,
    textContent: '',
    innerHTML: '',
    style: {},
    classList: {
      add: jest.fn(),
      remove: jest.fn()
    },
    appendChild: jest.fn(),
    addEventListener: jest.fn(),
    setAttribute: jest.fn()
  })),
  
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  
  body: {
    appendChild: jest.fn(),
    removeChild: jest.fn()
  },
  
  hidden: false
};

// Mock fetch for API tests
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve('')
  })
);

// Mock timers
global.setInterval = jest.fn((callback, ms) => {
  const id = Math.random();
  return id;
});

global.clearInterval = jest.fn();
global.setTimeout = jest.fn((callback, ms) => {
  const id = Math.random();
  return id;
});

global.clearTimeout = jest.fn();

// Mock console methods for cleaner test output
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Test utilities
global.TestUtils = {
  /**
   * Create a mock activity
   */
  createMockActivity: (overrides = {}) => ({
    id: Math.random().toString(36).substr(2, 9),
    startTime: Date.now() - 3600000,
    endTime: Date.now(),
    duration: 3600000,
    project: 'Test Project',
    app: 'Test App',
    title: 'Test Activity',
    idle: false,
    ...overrides
  }),
  
  /**
   * Create multiple mock activities
   */
  createMockActivities: (count = 5, overrides = {}) => {
    return Array.from({ length: count }, (_, i) => 
      TestUtils.createMockActivity({
        id: `activity_${i}`,
        startTime: Date.now() - (3600000 * (count - i)),
        endTime: Date.now() - (3600000 * (count - i - 1)),
        project: `Project ${i % 3}`,
        app: `App ${i % 2}`,
        ...overrides
      })
    );
  },
  
  /**
   * Wait for async operations
   */
  waitFor: (condition, timeout = 5000) => {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (condition()) {
          resolve();
        } else if (Date.now() - start > timeout) {
          reject(new Error('Timeout waiting for condition'));
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  },
  
  /**
   * Trigger event on element
   */
  triggerEvent: (element, eventType, eventData = {}) => {
    const event = { type: eventType, ...eventData };
    if (element.addEventListener.mock) {
      // Find and call the handler
      const calls = element.addEventListener.mock.calls;
      const handler = calls.find(call => call[0] === eventType)?.[1];
      if (handler) handler(event);
    }
  },
  
  /**
   * Mock date/time
   */
  mockDate: (date) => {
    const RealDate = Date;
    global.Date = class extends RealDate {
      constructor(...args) {
        if (args.length === 0) {
          return new RealDate(date);
        }
        return new RealDate(...args);
      }
      
      static now() {
        return new RealDate(date).getTime();
      }
    };
  },
  
  /**
   * Restore original date
   */
  restoreDate: () => {
    global.Date = Date;
  },
  
  /**
   * Clear all mocks
   */
  clearAllMocks: () => {
    jest.clearAllMocks();
    localStorage.clear();
  }
};

// Export for use in tests
module.exports = {
  window: global.window,
  document: global.document,
  TestUtils: global.TestUtils
};