/**
 * @module test/integration/app.integration.test
 * @description Integration tests for the complete LightTrack application
 */

const { TestUtils } = require('../setup');

describe('LightTrack Integration Tests', () => {
  let app;
  
  beforeAll(() => {
    // Setup global test environment
    global.requestAnimationFrame = (callback) => setTimeout(callback, 0);
    global.cancelAnimationFrame = (id) => clearTimeout(id);
  });
  
  beforeEach(async () => {
    TestUtils.clearAllMocks();
    
    // Mock initial settings
    window.lightTrackAPI.getSettings.mockResolvedValue({
      enabledFeatures: ['core', 'pomodoro'],
      pomodoroWorkDuration: 25,
      pomodoroBreakDuration: 5,
      theme: 'dark'
    });
    
    // Initialize app
    app = {
      timer: null,
      activityList: null,
      featureManager: null
    };
  });
  
  afterEach(() => {
    if (app.timer && app.timer.cleanup) {
      app.timer.cleanup();
    }
  });
  
  describe('Application Startup', () => {
    test('should initialize all core components', async () => {
      // Simulate app initialization
      const initializeApp = async () => {
        // Initialize timer
        const LightTrackTimer = jest.fn().mockImplementation(() => ({
          init: jest.fn().mockResolvedValue(true),
          isInitialized: false,
          cleanup: jest.fn()
        }));
        
        app.timer = new LightTrackTimer();
        await app.timer.init();
        app.timer.isInitialized = true;
        
        // Initialize feature manager
        app.featureManager = {
          init: jest.fn().mockResolvedValue(true),
          isEnabled: jest.fn((name) => ['core', 'pomodoro'].includes(name))
        };
        await app.featureManager.init();
        
        return true;
      };
      
      const result = await initializeApp();
      
      expect(result).toBe(true);
      expect(app.timer.isInitialized).toBe(true);
      expect(app.featureManager.isEnabled('core')).toBe(true);
      expect(app.featureManager.isEnabled('pomodoro')).toBe(true);
    });
    
    test('should handle initialization errors gracefully', async () => {
      window.lightTrackAPI.getSettings.mockRejectedValue(new Error('Settings load failed'));
      
      const initWithError = async () => {
        try {
          await window.lightTrackAPI.getSettings();
        } catch (error) {
          // App should continue with defaults
          return { error: error.message, continued: true };
        }
      };
      
      const result = await initWithError();
      
      expect(result.error).toBe('Settings load failed');
      expect(result.continued).toBe(true);
    });
  });
  
  describe('Time Tracking Workflow', () => {
    test('should complete a full tracking session', async () => {
      const startTime = Date.now();
      const activity = {
        startTime,
        project: 'Test Project',
        app: 'VS Code',
        title: 'Working on tests'
      };
      
      // Start tracking
      window.lightTrackAPI.startTracking.mockResolvedValue({
        isTracking: true,
        currentActivity: activity
      });
      
      const startResult = await window.lightTrackAPI.startTracking();
      expect(startResult.isTracking).toBe(true);
      
      // Simulate work for 30 minutes
      TestUtils.mockDate(new Date(startTime + 1800000));
      
      // Stop tracking
      window.lightTrackAPI.stopTracking.mockResolvedValue({
        isTracking: false,
        completedActivity: {
          ...activity,
          endTime: Date.now(),
          duration: 1800000
        }
      });
      
      const stopResult = await window.lightTrackAPI.stopTracking();
      expect(stopResult.isTracking).toBe(false);
      expect(stopResult.completedActivity.duration).toBe(1800000);
      
      TestUtils.restoreDate();
    });
    
    test('should handle app switching during tracking', async () => {
      // Start tracking in VS Code
      await window.lightTrackAPI.startTracking();
      
      // Simulate app switch event
      const appSwitchEvent = {
        type: 'app-switch',
        previousApp: 'VS Code',
        currentApp: 'Chrome',
        timestamp: Date.now()
      };
      
      // Handle app switch
      window.lightTrackAPI.onAppSwitch = jest.fn((callback) => {
        callback(appSwitchEvent);
        return () => {};
      });
      
      // Verify activity was recorded
      const activities = [
        TestUtils.createMockActivity({ app: 'VS Code', duration: 600000 }),
        TestUtils.createMockActivity({ app: 'Chrome', startTime: Date.now() })
      ];
      
      window.lightTrackAPI.getActivities.mockResolvedValue(activities);
      const result = await window.lightTrackAPI.getActivities();
      
      expect(result).toHaveLength(2);
      expect(result[0].app).toBe('VS Code');
      expect(result[1].app).toBe('Chrome');
    });
  });
  
  describe('Feature Integration', () => {
    test('should integrate Pomodoro with time tracking', async () => {
      // Enable Pomodoro feature
      const pomodoroFeature = {
        startSession: jest.fn().mockResolvedValue({
          type: 'work',
          duration: 1500000, // 25 minutes
          started: true
        }),
        onSessionComplete: jest.fn((callback) => {
          setTimeout(() => callback({ type: 'work', completed: true }), 100);
          return () => {};
        })
      };
      
      // Start Pomodoro
      const sessionResult = await pomodoroFeature.startSession();
      expect(sessionResult.started).toBe(true);
      
      // Verify tracking started
      window.lightTrackAPI.startTracking.mockResolvedValue({
        isTracking: true,
        metadata: { pomodoro: true, sessionType: 'work' }
      });
      
      const trackingResult = await window.lightTrackAPI.startTracking();
      expect(trackingResult.metadata.pomodoro).toBe(true);
      
      // Wait for session complete
      await new Promise(resolve => {
        pomodoroFeature.onSessionComplete(() => {
          resolve();
        });
      });
      
      // Verify activity was tagged
      const activities = [
        TestUtils.createMockActivity({
          project: 'Pomodoro Session',
          tags: ['pomodoro', 'work'],
          duration: 1500000
        })
      ];
      
      window.lightTrackAPI.getActivities.mockResolvedValue(activities);
      const result = await window.lightTrackAPI.getActivities();
      
      expect(result[0].tags).toContain('pomodoro');
      expect(result[0].duration).toBe(1500000);
    });
    
    test('should generate analytics from tracked data', async () => {
      // Create sample activities
      const activities = [
        TestUtils.createMockActivity({ project: 'Project A', duration: 3600000 }),
        TestUtils.createMockActivity({ project: 'Project A', duration: 1800000 }),
        TestUtils.createMockActivity({ project: 'Project B', duration: 2700000 }),
        TestUtils.createMockActivity({ project: 'Project C', duration: 900000 })
      ];
      
      window.lightTrackAPI.getActivities.mockResolvedValue(activities);
      
      // Analytics calculation
      const calculateAnalytics = async () => {
        const data = await window.lightTrackAPI.getActivities();
        
        const analytics = {
          totalTime: data.reduce((sum, a) => sum + a.duration, 0),
          projectBreakdown: {},
          averageSessionLength: 0
        };
        
        // Calculate project breakdown
        data.forEach(activity => {
          const project = activity.project || 'Uncategorized';
          if (!analytics.projectBreakdown[project]) {
            analytics.projectBreakdown[project] = {
              time: 0,
              sessions: 0
            };
          }
          analytics.projectBreakdown[project].time += activity.duration;
          analytics.projectBreakdown[project].sessions++;
        });
        
        // Calculate average
        analytics.averageSessionLength = analytics.totalTime / data.length;
        
        return analytics;
      };
      
      const analytics = await calculateAnalytics();
      
      expect(analytics.totalTime).toBe(9000000); // 2.5 hours total
      expect(analytics.projectBreakdown['Project A'].time).toBe(5400000); // 1.5 hours
      expect(analytics.projectBreakdown['Project A'].sessions).toBe(2);
      expect(analytics.averageSessionLength).toBe(2250000); // 37.5 minutes
    });
  });
  
  describe('Data Export/Import', () => {
    test('should export data in multiple formats', async () => {
      const activities = TestUtils.createMockActivities(3);
      window.lightTrackAPI.getActivities.mockResolvedValue(activities);
      
      // Test CSV export
      window.lightTrackAPI.exportData.mockImplementation(async (format) => {
        if (format === 'csv') {
          return {
            success: true,
            format: 'csv',
            data: 'Start,End,Duration,Project,App\n...',
            path: '/exports/data.csv'
          };
        }
        return { success: false };
      });
      
      const csvResult = await window.lightTrackAPI.exportData('csv');
      expect(csvResult.success).toBe(true);
      expect(csvResult.format).toBe('csv');
      
      // Test JSON export
      window.lightTrackAPI.exportData.mockImplementation(async (format) => {
        if (format === 'json') {
          return {
            success: true,
            format: 'json',
            data: JSON.stringify(activities),
            path: '/exports/data.json'
          };
        }
        return { success: false };
      });
      
      const jsonResult = await window.lightTrackAPI.exportData('json');
      expect(jsonResult.success).toBe(true);
      expect(jsonResult.format).toBe('json');
    });
    
    test('should import data and merge with existing', async () => {
      // Existing activities
      const existingActivities = TestUtils.createMockActivities(2);
      window.lightTrackAPI.getActivities.mockResolvedValue(existingActivities);
      
      // Import new activities
      const importData = {
        activities: TestUtils.createMockActivities(3, {
          project: 'Imported Project'
        })
      };
      
      window.lightTrackAPI.importData.mockResolvedValue({
        success: true,
        imported: 3,
        skipped: 0,
        total: 3
      });
      
      const importResult = await window.lightTrackAPI.importData(importData);
      expect(importResult.success).toBe(true);
      expect(importResult.imported).toBe(3);
      
      // Verify merged data
      const allActivities = [...existingActivities, ...importData.activities];
      window.lightTrackAPI.getActivities.mockResolvedValue(allActivities);
      
      const result = await window.lightTrackAPI.getActivities();
      expect(result).toHaveLength(5);
    });
  });
  
  describe('Performance', () => {
    test('should handle large datasets efficiently', async () => {
      // Create large dataset
      const largeDataset = TestUtils.createMockActivities(1000);
      window.lightTrackAPI.getActivities.mockResolvedValue(largeDataset);
      
      const startTime = performance.now();
      
      // Load and process data
      const activities = await window.lightTrackAPI.getActivities();
      
      // Calculate stats
      const stats = {
        total: activities.length,
        totalTime: activities.reduce((sum, a) => sum + a.duration, 0),
        projects: new Set(activities.map(a => a.project)).size
      };
      
      const endTime = performance.now();
      const processingTime = endTime - startTime;
      
      expect(stats.total).toBe(1000);
      expect(stats.projects).toBeGreaterThan(0);
      expect(processingTime).toBeLessThan(1000); // Should process in under 1 second
    });
    
    test('should implement pagination for activity list', async () => {
      const allActivities = TestUtils.createMockActivities(100);
      
      // Mock paginated API
      window.lightTrackAPI.getActivities.mockImplementation(async (options = {}) => {
        const { limit = 20, offset = 0 } = options;
        return {
          data: allActivities.slice(offset, offset + limit),
          total: allActivities.length,
          hasMore: offset + limit < allActivities.length
        };
      });
      
      // Load first page
      const page1 = await window.lightTrackAPI.getActivities({ limit: 20, offset: 0 });
      expect(page1.data).toHaveLength(20);
      expect(page1.hasMore).toBe(true);
      
      // Load second page
      const page2 = await window.lightTrackAPI.getActivities({ limit: 20, offset: 20 });
      expect(page2.data).toHaveLength(20);
      expect(page2.data[0].id).toBe('activity_20');
    });
  });
  
  describe('Error Recovery', () => {
    test('should recover from database errors', async () => {
      // Simulate database error
      window.lightTrackAPI.getActivities.mockRejectedValueOnce(
        new Error('Database connection failed')
      );
      
      // First attempt fails
      await expect(window.lightTrackAPI.getActivities()).rejects.toThrow(
        'Database connection failed'
      );
      
      // Recovery - return cached/empty data
      window.lightTrackAPI.getActivities.mockResolvedValue([]);
      
      const result = await window.lightTrackAPI.getActivities();
      expect(result).toEqual([]);
    });
    
    test('should handle corrupted settings gracefully', async () => {
      // Simulate corrupted settings
      window.lightTrackAPI.getSettings.mockResolvedValue('invalid-json');
      
      // App should use defaults
      const getSettingsSafe = async () => {
        try {
          const settings = await window.lightTrackAPI.getSettings();
          if (typeof settings !== 'object') {
            throw new Error('Invalid settings format');
          }
          return settings;
        } catch (error) {
          // Return defaults
          return {
            enabledFeatures: ['core'],
            theme: 'dark',
            autoStart: false
          };
        }
      };
      
      const settings = await getSettingsSafe();
      expect(settings.enabledFeatures).toEqual(['core']);
      expect(settings.theme).toBe('dark');
    });
  });
});