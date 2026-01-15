/**
 * Unit Tests for ActivityTracker Service
 */

const ActivityTracker = require('../../../src/main/services/activityTracker');
const { mockStore } = require('../../setup');

// Mock dependencies
jest.mock('active-win', () => jest.fn());
jest.mock('electron', () => ({
  Notification: jest.fn()
}));

describe('ActivityTracker', () => {
  let activityTracker;
  let mockStoreInstance;
  let mockStorage;
  let mockDoNotTrackManager;
  let activeWin;

  beforeEach(() => {
    activeWin = require('active-win');
    
    // Mock store
    mockStoreInstance = global.createMockStore({
      'settings.autoSaveInterval': 60,
      'settings.showNotifications': true,
      'settings.minActivityDuration': 60,
      'settings.idleThreshold': 180,
      'settings.pauseOnIdle': false,
      'settings.consolidateActivities': true,
      'settings.mergeGapThreshold': 300,
      'settings.dataRetention': 90,
      'settings.defaultProject': 'Uncategorized',
      'urlProjectMappings': {},
      'projectMappings': {}
    });

    // Mock storage
    mockStorage = {
      getActivities: jest.fn().mockReturnValue([]),
      setActivities: jest.fn()
    };

    // Mock do not track manager
    mockDoNotTrackManager = {
      checkWindow: jest.fn().mockResolvedValue({ doNotTrack: false })
    };

    activityTracker = new ActivityTracker(mockStoreInstance, mockStorage, mockDoNotTrackManager);
    jest.clearAllMocks();
    
    // Clear any global state
    global.isTracking = false;
  });

  afterEach(() => {
    if (activityTracker) {
      activityTracker.cleanup();
    }
  });

  describe('Constructor', () => {
    test('should initialize with default state', () => {
      expect(activityTracker.state.isActive).toBe(false);
      expect(activityTracker.state.currentActivity).toBeNull();
      expect(activityTracker.intervals).toBeInstanceOf(Map);
      expect(activityTracker.timeouts).toBeInstanceOf(Map);
    });

    test('should initialize activity cache with size limit', () => {
      expect(activityTracker.activityCache.recent).toEqual([]);
      expect(activityTracker.activityCache.maxSize).toBe(100);
    });
  });

  describe('Interval Management', () => {
    test('should create and track intervals', () => {
      const callback = jest.fn();
      const intervalId = activityTracker.createInterval('test', callback, 1000);
      
      expect(typeof intervalId).toBe('number');
      expect(activityTracker.intervals.has('test')).toBe(true);
    });

    test('should clear intervals by name', () => {
      const callback = jest.fn();
      activityTracker.createInterval('test', callback, 1000);
      
      activityTracker.clearInterval('test');
      
      expect(activityTracker.intervals.has('test')).toBe(false);
    });

    test('should create and track timeouts', () => {
      const callback = jest.fn();
      const timeoutId = activityTracker.createTimeout('test', callback, 1000);
      
      expect(typeof timeoutId).toBe('number');
      expect(activityTracker.timeouts.has('test')).toBe(true);
    });

    test('should clear all timers', () => {
      activityTracker.createInterval('test1', jest.fn(), 1000);
      activityTracker.createTimeout('test2', jest.fn(), 1000);
      
      activityTracker.clearAllTimers();
      
      expect(activityTracker.intervals.size).toBe(0);
      expect(activityTracker.timeouts.size).toBe(0);
    });

    test('should handle clearing non-existent timers', () => {
      expect(() => {
        activityTracker.clearInterval('nonexistent');
        activityTracker.clearTimeout('nonexistent');
      }).not.toThrow();
    });
  });

  describe('Core Tracking Methods', () => {
    test('should start tracking', () => {
      const result = activityTracker.startTracking();
      
      expect(activityTracker.state.isActive).toBe(true);
      expect(global.isTracking).toBe(true);
      expect(activityTracker.state.sessionStartTime).toBeTruthy();
      expect(activityTracker.intervals.has('tracking')).toBe(true);
      expect(activityTracker.intervals.has('autoSave')).toBe(true);
    });

    test('should stop tracking', () => {
      activityTracker.startTracking();
      
      activityTracker.stopTracking();
      
      expect(activityTracker.state.isActive).toBe(false);
      expect(global.isTracking).toBe(false);
      expect(activityTracker.state.currentActivity).toBeNull();
      expect(activityTracker.intervals.size).toBe(0);
    });

    test('should toggle tracking', () => {
      // Start from stopped
      let result = activityTracker.toggleTracking();
      expect(result).toBe(true);
      expect(activityTracker.state.isActive).toBe(true);
      
      // Toggle to stopped
      result = activityTracker.toggleTracking();
      expect(result).toBe(false);
      expect(activityTracker.state.isActive).toBe(false);
    });
  });

  describe('Activity Detection', () => {
    test('should get active window info', async () => {
      activeWin.mockResolvedValue({
        title: 'Test Window',
        owner: { name: 'TestApp' }
      });

      const windowInfo = await activityTracker.getActiveWindowInfo();
      
      expect(windowInfo).toEqual({
        app: 'TestApp',
        title: 'Test Window',
        doNotTrack: false
      });
      expect(mockDoNotTrackManager.checkWindow).toHaveBeenCalled();
    });

    test('should handle no active window', async () => {
      activeWin.mockResolvedValue(null);

      const windowInfo = await activityTracker.getActiveWindowInfo();
      
      expect(windowInfo).toBeNull();
    });

    test('should handle active-win errors gracefully', async () => {
      activeWin.mockRejectedValue(new Error('Window detection failed'));

      const windowInfo = await activityTracker.getActiveWindowInfo();
      
      expect(windowInfo).toBeNull();
    });

    test('should detect window changes', () => {
      activityTracker.state.currentActivity = {
        app: 'OldApp',
        title: 'Old Title'
      };

      const windowInfo = { app: 'NewApp', title: 'New Title' };
      const hasChanged = activityTracker.hasWindowChanged(windowInfo);
      
      expect(hasChanged).toBe(true);
    });

    test('should detect no change when window is same', () => {
      activityTracker.state.currentActivity = {
        app: 'TestApp',
        title: 'Test Title'
      };

      const windowInfo = { app: 'TestApp', title: 'Test Title' };
      const hasChanged = activityTracker.hasWindowChanged(windowInfo);
      
      expect(hasChanged).toBe(false);
    });
  });

  describe('Activity Management', () => {
    test('should start new activity', () => {
      const windowInfo = {
        app: 'TestApp',
        title: 'Test Window - JIRA-123',
        doNotTrack: false
      };

      activityTracker.startNewActivity(windowInfo);
      
      expect(activityTracker.state.currentActivity).toMatchObject({
        app: 'TestApp',
        title: 'Test Window - JIRA-123',
        project: 'Uncategorized',
        tickets: ['JIRA-123'],
        duration: 0,
        billable: true,
        doNotTrack: false
      });
    });

    test('should update current activity duration', () => {
      const startTime = new Date();
      activityTracker.state.currentActivity = {
        id: '123',
        startTime: startTime.toISOString(),
        duration: 0
      };

      // Wait a moment then update
      setTimeout(() => {
        activityTracker.updateCurrentActivity();
        expect(activityTracker.state.currentActivity.duration).toBeGreaterThan(0);
      }, 10);
    });

    test('should validate activity data', () => {
      const validActivity = {
        id: '123',
        startTime: new Date().toISOString(),
        duration: 60,
        tickets: ['JIRA-123'],
        tags: ['work']
      };

      const invalidActivity = {
        id: null,
        startTime: 'invalid-date',
        duration: -1,
        tickets: 'not-array'
      };

      expect(activityTracker.validateActivity(validActivity)).toBe(true);
      expect(activityTracker.validateActivity(invalidActivity)).toBe(false);
    });

    test('should check if activity should be saved', () => {
      const shortActivity = { duration: 30 }; // Below 60s minimum
      const longActivity = { 
        id: '123',
        startTime: new Date().toISOString(),
        duration: 120,
        tickets: [],
        tags: []
      };

      expect(activityTracker.shouldSaveActivity(shortActivity)).toBe(false);
      expect(activityTracker.shouldSaveActivity(longActivity)).toBe(true);
    });
  });

  describe('Activity Metadata Extraction', () => {
    test('should extract ticket numbers from title', () => {
      const windowInfo = { title: 'Working on JIRA-123 and PROJ-456' };
      const extracted = activityTracker.extractActivityMetadata(windowInfo);
      
      expect(extracted.tickets).toEqual(['JIRA-123', 'PROJ-456']);
    });

    test('should extract meeting tags', () => {
      const windowInfo = { title: 'Team Meeting - Project Discussion' };
      const extracted = activityTracker.extractActivityMetadata(windowInfo);
      
      expect(extracted.tags).toContain('meeting');
    });

    test('should extract review tags', () => {
      const windowInfo = { title: 'Code Review for Feature X' };
      const extracted = activityTracker.extractActivityMetadata(windowInfo);
      
      expect(extracted.tags).toContain('review');
    });
  });

  describe('Project Determination', () => {
    test('should use URL mappings for browser activities', () => {
      mockStoreInstance.set('urlProjectMappings', {
        'github.com': 'Development',
        'confluence.com': 'Documentation'
      });

      const windowInfo = { url: 'https://github.com/myorg/repo' };
      const project = activityTracker.determineProject(windowInfo, {});
      
      expect(project).toBe('Development');
    });

    test('should use extracted project', () => {
      const extracted = { project: 'CustomProject' };
      const project = activityTracker.determineProject({}, extracted);
      
      expect(project).toBe('CustomProject');
    });

    test('should fall back to default project', () => {
      const project = activityTracker.determineProject({}, {});
      
      expect(project).toBe('Uncategorized');
    });
  });

  describe('Activity Saving and Storage', () => {
    test('should save activity to store', () => {
      const activity = {
        id: '123',
        startTime: new Date().toISOString(),
        app: 'TestApp',
        duration: 120
      };

      activityTracker.saveActivityToStore(activity);
      
      expect(mockStorage.setActivities).toHaveBeenCalledWith([activity]);
    });

    test('should apply data retention policy', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100); // 100 days old
      
      const oldActivity = {
        id: '1',
        startTime: oldDate.toISOString(),
        duration: 120
      };
      
      const newActivity = {
        id: '2',
        startTime: new Date().toISOString(),
        duration: 120
      };

      mockStorage.getActivities.mockReturnValue([oldActivity]);
      
      activityTracker.saveActivityToStore(newActivity);
      
      // Should only keep new activity (old one filtered out)
      expect(mockStorage.setActivities).toHaveBeenCalledWith([newActivity]);
    });

    test('should add activity to cache with size limit', () => {
      const activity = {
        id: '123',
        app: 'TestApp',
        project: 'TestProject',
        startTime: new Date().toISOString()
      };

      activityTracker.addToActivityCache(activity);
      
      expect(activityTracker.activityCache.recent).toHaveLength(1);
      expect(activityTracker.activityCache.recent[0]).toMatchObject({
        id: '123',
        app: 'TestApp',
        project: 'TestProject'
      });
    });

    test('should trim cache when exceeding size limit', () => {
      // Fill cache beyond limit
      for (let i = 0; i < 105; i++) {
        activityTracker.addToActivityCache({
          id: i.toString(),
          app: 'TestApp',
          project: 'TestProject',
          startTime: new Date().toISOString()
        });
      }
      
      expect(activityTracker.activityCache.recent).toHaveLength(100);
      // Should keep the most recent ones (100-104)
      expect(activityTracker.activityCache.recent[0].id).toBe('5');
    });
  });

  describe('Activity Merging', () => {
    test('should determine when activities should merge', () => {
      const activity1 = {
        app: 'TestApp',
        project: 'TestProject',
        billable: true,
        endTime: new Date().toISOString()
      };

      const activity2 = {
        app: 'TestApp',
        project: 'TestProject', 
        billable: true,
        startTime: new Date(Date.now() + 60000).toISOString(), // 1 minute later
        duration: 120
      };

      const shouldMerge = activityTracker.shouldMergeActivities(activity1, activity2);
      expect(shouldMerge).toBe(true);
    });

    test('should not merge activities with different apps', () => {
      const activity1 = {
        app: 'App1',
        endTime: new Date().toISOString()
      };

      const activity2 = {
        app: 'App2',
        startTime: new Date(Date.now() + 60000).toISOString(),
        duration: 120
      };

      const shouldMerge = activityTracker.shouldMergeActivities(activity1, activity2);
      expect(shouldMerge).toBe(false);
    });

    test('should not merge activities with large time gaps', () => {
      const activity1 = {
        app: 'TestApp',
        endTime: new Date().toISOString()
      };

      const activity2 = {
        app: 'TestApp',
        startTime: new Date(Date.now() + 600000).toISOString(), // 10 minutes later
        duration: 120
      };

      const shouldMerge = activityTracker.shouldMergeActivities(activity1, activity2);
      expect(shouldMerge).toBe(false);
    });
  });

  describe('Idle Detection', () => {
    test('should handle idle time detection', () => {
      activityTracker.state.lastActivityTime = Date.now() - 200000; // 200 seconds ago
      activityTracker.state.currentActivity = {
        id: '123',
        idlePeriods: []
      };

      activityTracker.handleIdleDetection();
      
      expect(activityTracker.state.currentActivity.idlePeriods).toHaveLength(1);
      expect(activityTracker.state.currentActivity.idlePeriods[0]).toMatchObject({
        excluded: true,
        duration: expect.any(Number)
      });
    });

    test('should not add duplicate idle periods', () => {
      activityTracker.state.currentActivity = {
        id: '123',
        idlePeriods: [{
          start: new Date().toISOString(),
          duration: 200,
          excluded: true
          // No end time = still in idle period
        }]
      };

      activityTracker.handleIdleTime(250);
      
      // Should not add another idle period
      expect(activityTracker.state.currentActivity.idlePeriods).toHaveLength(1);
    });

    test('should calculate actual duration excluding idle time', () => {
      const activity = {
        duration: 600, // 10 minutes
        idlePeriods: [
          {
            start: new Date().toISOString(),
            end: new Date().toISOString(),
            excluded: true,
            // This represents 2 minutes of idle time
          }
        ]
      };

      // Mock the idle period to represent 120 seconds
      const start = new Date();
      const end = new Date(start.getTime() + 120000);
      activity.idlePeriods[0].start = start.toISOString();
      activity.idlePeriods[0].end = end.toISOString();

      activityTracker.calculateActualDuration(activity);
      
      expect(activity.actualDuration).toBe(480); // 600 - 120 = 480 seconds
    });
  });

  describe('Browser Activity Handling', () => {
    test('should handle browser activity when tracking', () => {
      activityTracker.state.isActive = true;
      
      const browserActivity = {
        app: 'Chrome',
        title: 'GitHub - Project Repository',
        url: 'https://github.com/project/repo'
      };

      activityTracker.handleBrowserActivity(browserActivity);
      
      expect(activityTracker.state.currentActivity).toMatchObject({
        app: 'Chrome',
        title: 'GitHub - Project Repository',
        url: 'https://github.com/project/repo'
      });
    });

    test('should ignore browser activity when not tracking', () => {
      activityTracker.state.isActive = false;
      
      const browserActivity = {
        app: 'Chrome',
        title: 'GitHub',
        url: 'https://github.com'
      };

      activityTracker.handleBrowserActivity(browserActivity);
      
      expect(activityTracker.state.currentActivity).toBeNull();
    });
  });

  describe('Public API', () => {
    test('should get current activity', () => {
      const activity = { id: '123', app: 'TestApp' };
      activityTracker.state.currentActivity = activity;
      
      const current = activityTracker.getCurrentActivity();
      expect(current).toBe(activity);
    });

    test('should get tracking state', () => {
      activityTracker.state.isActive = true;
      activityTracker.state.sessionStartTime = '2023-01-01T00:00:00Z';
      
      const state = activityTracker.getTrackingState();
      
      expect(state).toMatchObject({
        isActive: true,
        sessionStartTime: '2023-01-01T00:00:00Z'
      });
    });

    test('should get memory stats', () => {
      activityTracker.createInterval('test', jest.fn(), 1000);
      activityTracker.createTimeout('test', jest.fn(), 1000);
      activityTracker.addToActivityCache({ id: '123', app: 'TestApp' });
      
      const stats = activityTracker.getMemoryStats();
      
      expect(stats).toMatchObject({
        cacheSize: 1,
        activeIntervals: 1,
        activeTimeouts: 1,
        hasCurrentActivity: false
      });
    });
  });

  describe('Cleanup and Memory Management', () => {
    test('should clear activity cache', () => {
      activityTracker.addToActivityCache({ id: '123', app: 'TestApp' });
      
      activityTracker.clearActivityCache();
      
      expect(activityTracker.activityCache.recent).toHaveLength(0);
    });

    test('should perform comprehensive cleanup', () => {
      // Set up some state
      activityTracker.startTracking();
      activityTracker.state.currentActivity = { id: '123' };
      activityTracker.addToActivityCache({ id: '123', app: 'TestApp' });
      
      activityTracker.cleanup();
      
      expect(activityTracker.state.isActive).toBe(false);
      expect(activityTracker.state.currentActivity).toBeNull();
      expect(activityTracker.intervals.size).toBe(0);
      expect(activityTracker.timeouts.size).toBe(0);
      expect(activityTracker.activityCache.recent).toHaveLength(0);
      expect(global.isTracking).toBe(false);
    });

    test('should handle cleanup when already stopped', () => {
      expect(() => {
        activityTracker.cleanup();
      }).not.toThrow();
    });
  });

  describe('Utility Functions', () => {
    test('should format duration correctly', () => {
      expect(activityTracker.formatDuration(30)).toBe('0m');
      expect(activityTracker.formatDuration(90)).toBe('1m');
      expect(activityTracker.formatDuration(3660)).toBe('1h 1m');
      expect(activityTracker.formatDuration(7320)).toBe('2h 2m');
    });

    test('should determine billable status', () => {
      expect(activityTracker.determineBillable(['break'], {})).toBe(false);
      expect(activityTracker.determineBillable([], { billable: false })).toBe(false);
      expect(activityTracker.determineBillable([], { billable: true })).toBe(true);
      expect(activityTracker.determineBillable([], {})).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle detect activity errors gracefully', async () => {
      activeWin.mockRejectedValue(new Error('Detection failed'));
      activityTracker.state.isActive = true;
      
      await expect(activityTracker.detectActivity()).resolves.not.toThrow();
    });

    test('should handle notification errors gracefully', () => {
      const { Notification } = require('electron');
      Notification.mockImplementation(() => {
        throw new Error('Notification failed');
      });

      expect(() => {
        activityTracker.showActivitySavedNotification({
          duration: 120,
          project: 'TestProject'
        });
      }).not.toThrow();
    });

    test('should handle validation errors gracefully', () => {
      const invalidActivity = { 
        id: 123, // should be string
        startTime: null,
        duration: 'invalid'
      };

      expect(activityTracker.validateActivity(invalidActivity)).toBe(false);
    });
  });
});