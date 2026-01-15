/**
 * @module test/unit/timer.test
 * @description Unit tests for timer functionality
 */

const { TestUtils } = require('../setup');

describe('Timer Functionality', () => {
  let timer;
  
  beforeEach(() => {
    // Clear all mocks
    TestUtils.clearAllMocks();
    
    // Mock DOM elements
    document.getElementById.mockImplementation((id) => {
      const element = {
        id,
        textContent: '',
        innerHTML: '',
        style: { display: 'none' },
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
        click: jest.fn(),
        disabled: false
      };
      
      // Specific elements
      if (id === 'toggle-tracking') {
        element.querySelector = jest.fn(() => ({ textContent: '▶️' }));
      }
      
      return element;
    });
    
    // Create timer instance
    const LightTrackTimer = require('../../src/renderer/js/app.js');
    timer = new LightTrackTimer();
  });
  
  afterEach(() => {
    if (timer && timer.cleanup) {
      timer.cleanup();
    }
  });
  
  describe('Initialization', () => {
    test('should initialize without errors', async () => {
      await expect(timer.init()).resolves.not.toThrow();
      expect(timer.isInitialized).toBe(true);
    });
    
    test('should prevent multiple initializations', async () => {
      await timer.init();
      const consoleWarnSpy = jest.spyOn(console, 'warn');
      await timer.init();
      expect(consoleWarnSpy).toHaveBeenCalledWith('Timer already initialized');
    });
    
    test('should get DOM elements', async () => {
      await timer.init();
      expect(timer.toggleBtn).toBeDefined();
      expect(timer.timerDisplay).toBeDefined();
      expect(timer.trackingStatusEl).toBeDefined();
    });
    
    test('should load initial tracking status', async () => {
      window.lightTrackAPI.getTrackingStatus.mockResolvedValue({
        isTracking: true,
        currentActivity: TestUtils.createMockActivity()
      });
      
      await timer.init();
      expect(window.lightTrackAPI.getTrackingStatus).toHaveBeenCalled();
      expect(timer.trackingStatus.isTracking).toBe(true);
    });
  });
  
  describe('Tracking Control', () => {
    beforeEach(async () => {
      await timer.init();
    });
    
    test('should start tracking', async () => {
      window.lightTrackAPI.startTracking.mockResolvedValue({
        isTracking: true,
        currentActivity: TestUtils.createMockActivity()
      });
      
      await timer.toggleBtn.click();
      
      expect(window.lightTrackAPI.startTracking).toHaveBeenCalled();
      expect(timer.trackingStatus.isTracking).toBe(true);
    });
    
    test('should stop tracking', async () => {
      timer.trackingStatus = { isTracking: true };
      window.lightTrackAPI.stopTracking.mockResolvedValue({
        isTracking: false
      });
      
      await timer.toggleBtn.click();
      
      expect(window.lightTrackAPI.stopTracking).toHaveBeenCalled();
      expect(timer.trackingStatus.isTracking).toBe(false);
    });
    
    test('should update UI when tracking starts', async () => {
      timer.updateUI(true);
      
      expect(timer.toggleBtn.classList.add).toHaveBeenCalledWith('tracking');
      expect(timer.trackingStatusEl.textContent).toBe('Tracking Active');
      expect(timer.activityDetails.style.display).toBe('flex');
    });
    
    test('should update UI when tracking stops', () => {
      timer.updateUI(false);
      
      expect(timer.toggleBtn.classList.remove).toHaveBeenCalledWith('tracking');
      expect(timer.trackingStatusEl.textContent).toBe('Ready to track');
      expect(timer.activityDetails.style.display).toBe('none');
    });
  });
  
  describe('Timer Display', () => {
    beforeEach(async () => {
      await timer.init();
      TestUtils.mockDate('2024-01-01T10:00:00Z');
    });
    
    afterEach(() => {
      TestUtils.restoreDate();
    });
    
    test('should update timer display', () => {
      timer.trackingStatus = {
        isTracking: true,
        currentActivity: {
          startTime: Date.now() - 3661000 // 1 hour, 1 minute, 1 second ago
        }
      };
      
      timer.updateTimer();
      
      expect(timer.timerDisplay.textContent).toBe('01:01:01');
      expect(timer.floatingTimerDisplay.textContent).toBe('01:01:01');
    });
    
    test('should format time correctly', () => {
      const testCases = [
        { elapsed: 0, expected: '00:00:00' },
        { elapsed: 1000, expected: '00:00:01' },
        { elapsed: 60000, expected: '00:01:00' },
        { elapsed: 3600000, expected: '01:00:00' },
        { elapsed: 3661000, expected: '01:01:01' },
        { elapsed: 36610000, expected: '10:10:10' }
      ];
      
      testCases.forEach(({ elapsed, expected }) => {
        timer.trackingStatus = {
          isTracking: true,
          currentActivity: {
            startTime: Date.now() - elapsed
          }
        };
        
        timer.updateTimer();
        expect(timer.timerDisplay.textContent).toBe(expected);
      });
    });
    
    test('should start timer interval when tracking starts', () => {
      timer.updateUI(true);
      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 1000);
      expect(timer.timerInterval).toBeDefined();
    });
    
    test('should stop timer interval when tracking stops', () => {
      timer.timerInterval = 123;
      timer.updateUI(false);
      expect(clearInterval).toHaveBeenCalledWith(123);
      expect(timer.timerInterval).toBeNull();
    });
  });
  
  describe('Statistics', () => {
    beforeEach(async () => {
      await timer.init();
    });
    
    test('should calculate today total correctly', async () => {
      window.lightTrackAPI.getTodayTotal.mockResolvedValue(7200000); // 2 hours
      
      await timer.refreshStats();
      
      expect(timer.todayTotalEl.textContent).toBe('2h 0m');
    });
    
    test('should count unique projects', async () => {
      const activities = TestUtils.createMockActivities(5, {});
      window.lightTrackAPI.getActivities.mockResolvedValue(activities);
      
      await timer.refreshStats();
      
      expect(timer.projectCountEl.textContent).toBe('3'); // Project 0, 1, 2
    });
    
    test('should calculate productivity percentage', async () => {
      const activities = [
        TestUtils.createMockActivity({ app: 'Visual Studio Code', duration: 3600000 }),
        TestUtils.createMockActivity({ app: 'YouTube', duration: 1800000 }),
        TestUtils.createMockActivity({ app: 'Slack', duration: 600000 })
      ];
      window.lightTrackAPI.getActivities.mockResolvedValue(activities);
      
      await timer.refreshStats();
      
      // Visual Studio Code is productive (3600000 / 6000000 = 60%)
      expect(timer.productivePercentageEl.textContent).toBe('60%');
    });
    
    test('should count breaks', async () => {
      const now = Date.now();
      const activities = [
        { startTime: now - 7200000, endTime: now - 5400000, duration: 1800000 },
        { startTime: now - 3600000, endTime: now - 1800000, duration: 1800000 }, // 1.5 hour gap = break
        { startTime: now - 1700000, endTime: now, duration: 1700000 } // 100 second gap = no break
      ];
      window.lightTrackAPI.getActivities.mockResolvedValue(activities);
      
      await timer.refreshStats();
      
      expect(timer.breaksTakenEl.textContent).toBe('1');
    });
  });
  
  describe('Error Handling', () => {
    beforeEach(async () => {
      await timer.init();
    });
    
    test('should handle tracking start error', async () => {
      window.lightTrackAPI.startTracking.mockRejectedValue(new Error('Start failed'));
      
      await timer.toggleBtn.click();
      
      expect(timer.toggleBtn.disabled).toBe(false);
    });
    
    test('should handle stats refresh error', async () => {
      window.lightTrackAPI.getActivities.mockRejectedValue(new Error('Load failed'));
      
      await timer.refreshStats();
      
      // Should show default values
      expect(timer.todayTotalEl.textContent).toBe('0h 0m');
      expect(timer.projectCountEl.textContent).toBe('0');
      expect(timer.productivePercentageEl.textContent).toBe('0%');
      expect(timer.breaksTakenEl.textContent).toBe('0');
    });
    
    test('should display error notifications', () => {
      const error = new Error('Test error');
      timer.handleError(error);
      
      const errorContainer = document.getElementById('error-container');
      expect(errorContainer.appendChild).toHaveBeenCalled();
    });
  });
  
  describe('Visibility Change', () => {
    beforeEach(async () => {
      await timer.init();
    });
    
    test('should pause timer updates when page is hidden', () => {
      timer.timerInterval = 123;
      document.hidden = true;
      
      timer.handleVisibilityChange();
      
      expect(clearInterval).toHaveBeenCalledWith(123);
      expect(timer.timerInterval).toBeNull();
    });
    
    test('should resume timer updates when page is visible', () => {
      timer.trackingStatus = { isTracking: true };
      document.hidden = false;
      
      timer.handleVisibilityChange();
      
      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 1000);
      expect(timer.timerInterval).toBeDefined();
    });
  });
  
  describe('Cleanup', () => {
    test('should cleanup resources', async () => {
      await timer.init();
      timer.timerInterval = 123;
      
      await timer.cleanup();
      
      expect(clearInterval).toHaveBeenCalledWith(123);
      expect(window.lightTrackAPI.cleanupAll).toHaveBeenCalled();
    });
  });
});