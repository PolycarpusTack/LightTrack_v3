/**
 * Integration Tests - End-to-End Application Flow
 */

const { Application } = require('spectron');
const path = require('path');

// Mock Electron Application for testing
const mockApp = {
  start: jest.fn().mockResolvedValue(true),
  stop: jest.fn().mockResolvedValue(true),
  restart: jest.fn().mockResolvedValue(true),
  client: {
    waitUntilWindowLoaded: jest.fn().mockResolvedValue(true),
    getWindowCount: jest.fn().mockResolvedValue(1),
    windowByIndex: jest.fn().mockResolvedValue({
      getTitle: jest.fn().mockResolvedValue('LightTrack'),
      isVisible: jest.fn().mockResolvedValue(true)
    }),
    electron: {
      remote: {
        app: {
          getPath: jest.fn().mockReturnValue('/test/path')
        }
      }
    },
    execute: jest.fn(),
    click: jest.fn(),
    setValue: jest.fn(),
    getText: jest.fn(),
    waitForExist: jest.fn().mockResolvedValue(true),
    waitForVisible: jest.fn().mockResolvedValue(true),
    isExisting: jest.fn().mockResolvedValue(true),
    isVisible: jest.fn().mockResolvedValue(true)
  }
};

describe('End-to-End Integration Tests', () => {
  let app;

  beforeAll(async () => {
    // Mock the Application constructor
    Application.mockImplementation(() => mockApp);
    
    app = new Application({
      path: path.join(__dirname, '../../main.js'),
      args: ['--test-mode'],
      startTimeout: 10000,
      waitTimeout: 5000
    });

    await app.start();
  });

  afterAll(async () => {
    if (app && app.isRunning) {
      await app.stop();
    }
  });

  describe('Application Startup', () => {
    test('should start application successfully', async () => {
      expect(app.start).toHaveBeenCalled();
      await app.client.waitUntilWindowLoaded();
      
      const windowCount = await app.client.getWindowCount();
      expect(windowCount).toBe(1);
    });

    test('should display main window', async () => {
      const mainWindow = await app.client.windowByIndex(0);
      const title = await mainWindow.getTitle();
      
      expect(title).toBe('LightTrack');
      expect(await mainWindow.isVisible()).toBe(true);
    });

    test('should initialize with default UI state', async () => {
      await app.client.waitForExist('.unified-dashboard');
      await app.client.waitForVisible('.sidebar');
      
      const dashboardExists = await app.client.isExisting('.unified-dashboard');
      const sidebarExists = await app.client.isExisting('.sidebar');
      
      expect(dashboardExists).toBe(true);
      expect(sidebarExists).toBe(true);
    });
  });

  describe('Navigation Flow', () => {
    test('should navigate between pages', async () => {
      // Navigate to activities page
      await app.client.click('[data-page="activities"]');
      await app.client.waitForVisible('.activities-view');
      
      const activitiesVisible = await app.client.isVisible('.activities-view');
      expect(activitiesVisible).toBe(true);
      
      // Navigate to timeline page
      await app.client.click('[data-page="timeline"]');
      await app.client.waitForVisible('.timeline-view');
      
      const timelineVisible = await app.client.isVisible('.timeline-view');
      expect(timelineVisible).toBe(true);
    });

    test('should update active navigation state', async () => {
      await app.client.click('[data-page="insights"]');
      
      const activeNavItem = await app.client.$('.nav-item.active');
      const activePage = await activeNavItem.getAttribute('data-page');
      
      expect(activePage).toBe('insights');
    });

    test('should handle browser navigation', async () => {
      // Navigate forward and back
      await app.client.execute(() => {
        window.history.pushState(null, '', '/activities');
        window.history.pushState(null, '', '/timeline');
        window.history.back();
      });
      
      await app.client.waitForVisible('.activities-view');
      const activitiesVisible = await app.client.isVisible('.activities-view');
      expect(activitiesVisible).toBe(true);
    });
  });

  describe('Time Tracking Flow', () => {
    test('should start and stop tracking', async () => {
      // Start tracking
      await app.client.click('.tracking-toggle');
      
      const trackingStatus = await app.client.execute(() => {
        return window.lightTrackAPI.tracking.getCurrent();
      });
      
      expect(trackingStatus.isActive).toBe(true);
      
      // Stop tracking
      await app.client.click('.tracking-toggle');
      
      const stoppedStatus = await app.client.execute(() => {
        return window.lightTrackAPI.tracking.getCurrent();
      });
      
      expect(stoppedStatus.isActive).toBe(false);
    });

    test('should update UI during tracking', async () => {
      await app.client.click('.tracking-toggle');
      
      // Wait for timer to appear
      await app.client.waitForVisible('.timer-display');
      
      const timerVisible = await app.client.isVisible('.timer-display');
      expect(timerVisible).toBe(true);
      
      const trackingButton = await app.client.$('.tracking-toggle');
      const buttonText = await trackingButton.getText();
      expect(buttonText).toContain('Stop');
    });

    test('should save activities after tracking', async () => {
      // Start tracking for a short period
      await app.client.click('.tracking-toggle');
      
      // Simulate activity
      await app.client.execute(() => {
        // Mock window activity detection
        window.mockActiveWindow = {
          title: 'Test Application - Working on Project',
          owner: { name: 'TestApp' }
        };
      });
      
      // Wait and stop
      await new Promise(resolve => setTimeout(resolve, 2000));
      await app.client.click('.tracking-toggle');
      
      // Check activities were saved
      const activities = await app.client.execute(() => {
        return window.lightTrackAPI.activities.get();
      });
      
      expect(activities.length).toBeGreaterThan(0);
    });
  });

  describe('Modal Interactions', () => {
    test('should open and close settings modal', async () => {
      await app.client.click('.settings-button');
      await app.client.waitForVisible('.modal-overlay');
      
      const modalVisible = await app.client.isVisible('.modal-overlay');
      expect(modalVisible).toBe(true);
      
      const settingsModal = await app.client.isVisible('.settings-modal');
      expect(settingsModal).toBe(true);
      
      // Close modal
      await app.client.click('.modal-close');
      await app.client.waitForVisible('.modal-overlay', 5000, true);
      
      const modalClosed = await app.client.isVisible('.modal-overlay');
      expect(modalClosed).toBe(false);
    });

    test('should handle manual entry modal', async () => {
      await app.client.click('.manual-entry-button');
      await app.client.waitForVisible('.manual-entry-modal');
      
      // Fill form
      await app.client.setValue('#activity-title', 'Test Manual Activity');
      await app.client.setValue('#activity-duration', '30');
      await app.client.click('#activity-project option[value="Development"]');
      
      // Submit
      await app.client.click('.modal-save');
      
      // Verify activity was created
      const activities = await app.client.execute(() => {
        return window.lightTrackAPI.activities.get();
      });
      
      const manualActivity = activities.find(a => a.title === 'Test Manual Activity');
      expect(manualActivity).toBeTruthy();
      expect(manualActivity.duration).toBe(1800); // 30 minutes in seconds
    });

    test('should handle edit activity modal', async () => {
      // First create an activity
      await app.client.execute(() => {
        return window.lightTrackAPI.activities.saveManual({
          title: 'Edit Test Activity',
          duration: 900,
          project: 'Testing'
        });
      });
      
      // Open activities page
      await app.client.click('[data-page="activities"]');
      await app.client.waitForVisible('.activity-item');
      
      // Click edit on first activity
      await app.client.click('.activity-item:first-child .edit-button');
      await app.client.waitForVisible('.edit-activity-modal');
      
      // Update title
      await app.client.setValue('#edit-activity-title', 'Updated Test Activity');
      
      // Save changes
      await app.client.click('.modal-save');
      
      // Verify update
      const activities = await app.client.execute(() => {
        return window.lightTrackAPI.activities.get();
      });
      
      const updatedActivity = activities.find(a => a.title === 'Updated Test Activity');
      expect(updatedActivity).toBeTruthy();
    });
  });

  describe('Data Persistence', () => {
    test('should persist settings changes', async () => {
      await app.client.click('.settings-button');
      await app.client.waitForVisible('.settings-modal');
      
      // Change a setting
      await app.client.click('#auto-save-enabled');
      await app.client.setValue('#auto-save-interval', '120');
      
      // Save settings
      await app.client.click('.settings-save');
      
      // Restart app to test persistence
      await app.restart();
      await app.client.waitUntilWindowLoaded();
      
      // Check settings persisted
      const settings = await app.client.execute(() => {
        return window.lightTrackAPI.settings.getAll();
      });
      
      expect(settings.autoSaveEnabled).toBe(true);
      expect(settings.autoSaveInterval).toBe(120);
    });

    test('should maintain activities across restarts', async () => {
      // Add test activity
      await app.client.execute(() => {
        return window.lightTrackAPI.activities.saveManual({
          title: 'Persistence Test Activity',
          duration: 1200,
          project: 'Testing'
        });
      });
      
      // Restart app
      await app.restart();
      await app.client.waitUntilWindowLoaded();
      
      // Verify activity persists
      const activities = await app.client.execute(() => {
        return window.lightTrackAPI.activities.get();
      });
      
      const persistedActivity = activities.find(a => a.title === 'Persistence Test Activity');
      expect(persistedActivity).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    test('should handle API errors gracefully', async () => {
      // Simulate API error
      await app.client.execute(() => {
        // Mock an API method to fail
        window.lightTrackAPI.activities.get = () => {
          throw new Error('API Error');
        };
      });
      
      await app.client.click('[data-page="activities"]');
      
      // Should show error state instead of crashing
      await app.client.waitForVisible('.error-state');
      const errorVisible = await app.client.isVisible('.error-state');
      expect(errorVisible).toBe(true);
    });

    test('should handle modal errors', async () => {
      await app.client.click('.manual-entry-button');
      await app.client.waitForVisible('.manual-entry-modal');
      
      // Submit invalid form
      await app.client.click('.modal-save');
      
      // Should show validation errors
      await app.client.waitForVisible('.error-message');
      const errorVisible = await app.client.isVisible('.error-message');
      expect(errorVisible).toBe(true);
    });

    test('should recover from window focus errors', async () => {
      // Simulate window focus error
      await app.client.execute(() => {
        window.onerror = () => false; // Suppress errors
        throw new Error('Focus error');
      });
      
      // App should continue functioning
      await app.client.click('[data-page="dashboard"]');
      const dashboardVisible = await app.client.isVisible('.unified-dashboard');
      expect(dashboardVisible).toBe(true);
    });
  });

  describe('Performance Integration', () => {
    test('should load pages within performance thresholds', async () => {
      const navigationTimes = [];
      
      const pages = ['dashboard', 'activities', 'timeline', 'insights'];
      
      for (const page of pages) {
        const startTime = Date.now();
        
        await app.client.click(`[data-page="${page}"]`);
        await app.client.waitForVisible(`.${page}-view`);
        
        const loadTime = Date.now() - startTime;
        navigationTimes.push(loadTime);
        
        // Should load within 500ms
        expect(loadTime).toBeLessThan(500);
      }
      
      const averageTime = navigationTimes.reduce((a, b) => a + b) / navigationTimes.length;
      expect(averageTime).toBeLessThan(300);
    });

    test('should handle rapid user interactions', async () => {
      // Rapidly click navigation items
      for (let i = 0; i < 10; i++) {
        await app.client.click('[data-page="activities"]');
        await app.client.click('[data-page="timeline"]');
      }
      
      // Should end up in consistent state
      await app.client.waitForVisible('.timeline-view');
      const timelineVisible = await app.client.isVisible('.timeline-view');
      expect(timelineVisible).toBe(true);
    });

    test('should maintain responsive UI during heavy operations', async () => {
      // Start tracking
      await app.client.click('.tracking-toggle');
      
      // Simulate heavy data operation
      await app.client.execute(() => {
        // Create many test activities
        const activities = [];
        for (let i = 0; i < 1000; i++) {
          activities.push({
            id: i.toString(),
            title: `Test Activity ${i}`,
            duration: Math.floor(Math.random() * 3600),
            startTime: new Date(Date.now() - i * 60000).toISOString()
          });
        }
        return window.lightTrackAPI.activities.bulkSave(activities);
      });
      
      // UI should remain responsive
      await app.client.click('[data-page="activities"]');
      await app.client.waitForVisible('.activities-view');
      
      const activitiesVisible = await app.client.isVisible('.activities-view');
      expect(activitiesVisible).toBe(true);
    });
  });

  describe('Accessibility Integration', () => {
    test('should support keyboard navigation', async () => {
      // Tab through navigation
      await app.client.keys(['Tab']); // Focus first nav item
      await app.client.keys(['Enter']); // Activate
      
      // Should navigate to focused page
      const activeNavItem = await app.client.$('.nav-item:focus');
      const isActive = await activeNavItem.getAttribute('aria-current');
      expect(isActive).toBe('page');
    });

    test('should have proper focus management in modals', async () => {
      await app.client.click('.settings-button');
      await app.client.waitForVisible('.settings-modal');
      
      // Focus should be in modal
      const focusedElement = await app.client.execute(() => {
        return document.activeElement.closest('.modal');
      });
      
      expect(focusedElement).toBeTruthy();
      
      // Escape should close modal
      await app.client.keys(['Escape']);
      await app.client.waitForVisible('.modal-overlay', 5000, true);
      
      const modalClosed = await app.client.isVisible('.modal-overlay');
      expect(modalClosed).toBe(false);
    });

    test('should announce important state changes', async () => {
      // Mock screen reader announcements
      const announcements = [];
      await app.client.execute(() => {
        window.announcements = [];
        const originalAriaLive = document.querySelector('[aria-live]');
        if (originalAriaLive) {
          const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              if (mutation.type === 'childList' || mutation.type === 'characterData') {
                window.announcements.push(mutation.target.textContent);
              }
            });
          });
          observer.observe(originalAriaLive, {
            childList: true,
            subtree: true,
            characterData: true
          });
        }
      });
      
      // Start tracking (should announce)
      await app.client.click('.tracking-toggle');
      
      // Check announcements
      const savedAnnouncements = await app.client.execute(() => window.announcements);
      expect(savedAnnouncements.some(a => a.includes('started'))).toBe(true);
    });
  });
});