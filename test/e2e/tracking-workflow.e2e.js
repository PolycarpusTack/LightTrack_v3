/**
 * @module test/e2e/tracking-workflow.e2e
 * @description End-to-end tests for time tracking workflows
 */

const { TestUtils } = require('../setup');

describe('E2E: Time Tracking Workflow', () => {
  let page;
  
  beforeAll(async () => {
    // In real E2E tests, this would launch a browser
    // For now, we'll simulate the page object
    page = {
      goto: jest.fn(),
      click: jest.fn(),
      type: jest.fn(),
      waitForSelector: jest.fn(),
      evaluate: jest.fn(),
      screenshot: jest.fn(),
      $: jest.fn(),
      $$: jest.fn()
    };
  });
  
  beforeEach(async () => {
    TestUtils.clearAllMocks();
    
    // Navigate to app
    await page.goto('http://localhost:3000');
  });
  
  describe('Basic Time Tracking', () => {
    test('user can start and stop tracking', async () => {
      // Wait for app to load
      await page.waitForSelector('#toggle-tracking');
      
      // Click start button
      await page.click('#toggle-tracking');
      
      // Verify tracking started
      const isTracking = await page.evaluate(() => {
        const status = document.querySelector('#tracking-status');
        return status.textContent === 'Tracking Active';
      });
      expect(isTracking).toBe(true);
      
      // Wait for some activity
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Click stop button
      await page.click('#toggle-tracking');
      
      // Verify tracking stopped
      const isStopped = await page.evaluate(() => {
        const status = document.querySelector('#tracking-status');
        return status.textContent === 'Ready to track';
      });
      expect(isStopped).toBe(true);
      
      // Verify activity was recorded
      const activityCount = await page.evaluate(() => {
        const activities = document.querySelectorAll('.activity-item');
        return activities.length;
      });
      expect(activityCount).toBeGreaterThan(0);
    });
    
    test('timer displays elapsed time correctly', async () => {
      // Start tracking
      await page.click('#toggle-tracking');
      
      // Check initial timer
      let timerText = await page.evaluate(() => {
        return document.querySelector('#timer').textContent;
      });
      expect(timerText).toMatch(/00:00:0[0-9]/);
      
      // Wait 5 seconds
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Check timer after 5 seconds
      timerText = await page.evaluate(() => {
        return document.querySelector('#timer').textContent;
      });
      expect(timerText).toMatch(/00:00:0[5-9]/);
      
      // Stop tracking
      await page.click('#toggle-tracking');
    });
  });
  
  describe('Manual Entry', () => {
    test('user can add manual time entry', async () => {
      // Open manual entry dialog
      await page.click('#add-manual-entry');
      
      // Wait for dialog
      await page.waitForSelector('.manual-entry-dialog');
      
      // Fill form
      await page.type('#manual-project', 'Client Meeting');
      await page.type('#manual-description', 'Weekly status update');
      
      // Set times (in real test, would use date picker)
      await page.evaluate(() => {
        document.querySelector('#manual-start-time').value = '09:00';
        document.querySelector('#manual-end-time').value = '10:00';
        document.querySelector('#manual-date').value = new Date().toISOString().split('T')[0];
      });
      
      // Submit
      await page.click('#manual-entry-submit');
      
      // Verify entry was added
      const hasEntry = await page.evaluate(() => {
        const activities = Array.from(document.querySelectorAll('.activity-item'));
        return activities.some(a => a.textContent.includes('Client Meeting'));
      });
      expect(hasEntry).toBe(true);
    });
    
    test('validates manual entry data', async () => {
      // Open dialog
      await page.click('#add-manual-entry');
      
      // Try to submit empty form
      await page.click('#manual-entry-submit');
      
      // Check for validation errors
      const hasErrors = await page.evaluate(() => {
        const errors = document.querySelectorAll('.error-message');
        return errors.length > 0;
      });
      expect(hasErrors).toBe(true);
      
      // Fill required fields
      await page.type('#manual-project', 'Test Project');
      await page.evaluate(() => {
        document.querySelector('#manual-start-time').value = '14:00';
        document.querySelector('#manual-end-time').value = '13:00'; // End before start
      });
      
      await page.click('#manual-entry-submit');
      
      // Check for time validation error
      const timeError = await page.evaluate(() => {
        const errors = Array.from(document.querySelectorAll('.error-message'));
        return errors.some(e => e.textContent.includes('End time must be after start time'));
      });
      expect(timeError).toBe(true);
    });
  });
  
  describe('Activity Management', () => {
    beforeEach(async () => {
      // Add some test activities
      await page.evaluate(() => {
        const activities = [
          { id: '1', project: 'Project A', duration: 3600000 },
          { id: '2', project: 'Project B', duration: 1800000 },
          { id: '3', project: 'Project A', duration: 2700000 }
        ];
        // Simulate adding activities to the list
        window.testActivities = activities;
      });
    });
    
    test('user can filter activities', async () => {
      // Type in search box
      await page.type('#activity-search', 'Project A');
      
      // Wait for filter to apply
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Check filtered results
      const visibleCount = await page.evaluate(() => {
        const activities = document.querySelectorAll('.activity-item:not(.hidden)');
        return activities.length;
      });
      expect(visibleCount).toBe(2);
      
      // Clear filter
      await page.evaluate(() => {
        document.querySelector('#activity-search').value = '';
        document.querySelector('#activity-search').dispatchEvent(new Event('input'));
      });
      
      // All should be visible
      const allCount = await page.evaluate(() => {
        const activities = document.querySelectorAll('.activity-item:not(.hidden)');
        return activities.length;
      });
      expect(allCount).toBe(3);
    });
    
    test('user can delete activities', async () => {
      // Select first activity
      await page.click('.activity-item:first-child .activity-checkbox');
      
      // Click delete button
      await page.click('#delete-selected');
      
      // Confirm deletion
      await page.waitForSelector('.confirm-dialog');
      await page.click('#confirm-delete');
      
      // Verify activity was removed
      const remainingCount = await page.evaluate(() => {
        const activities = document.querySelectorAll('.activity-item');
        return activities.length;
      });
      expect(remainingCount).toBe(2);
    });
    
    test('user can bulk select activities', async () => {
      // Click select all
      await page.click('#select-all-activities');
      
      // Verify all selected
      const allSelected = await page.evaluate(() => {
        const checkboxes = document.querySelectorAll('.activity-checkbox:checked');
        return checkboxes.length;
      });
      expect(allSelected).toBe(3);
      
      // Click select all again to deselect
      await page.click('#select-all-activities');
      
      // Verify none selected
      const noneSelected = await page.evaluate(() => {
        const checkboxes = document.querySelectorAll('.activity-checkbox:checked');
        return checkboxes.length;
      });
      expect(noneSelected).toBe(0);
    });
  });
  
  describe('Statistics and Reports', () => {
    test('displays daily statistics correctly', async () => {
      // Add activities for today
      await page.evaluate(() => {
        const now = Date.now();
        window.lightTrackAPI.getTodayTotal = () => Promise.resolve(7200000); // 2 hours
        window.lightTrackAPI.getActivities = () => Promise.resolve([
          { project: 'Work', duration: 5400000 },
          { project: 'Personal', duration: 1800000 }
        ]);
      });
      
      // Refresh stats
      await page.click('#refresh-stats');
      
      // Check today's total
      const todayTotal = await page.evaluate(() => {
        return document.querySelector('#today-total').textContent;
      });
      expect(todayTotal).toBe('2h 0m');
      
      // Check project count
      const projectCount = await page.evaluate(() => {
        return document.querySelector('#project-count').textContent;
      });
      expect(projectCount).toBe('2');
    });
    
    test('generates daily report', async () => {
      // Click today's report
      await page.click('#today-report');
      
      // Wait for report modal
      await page.waitForSelector('.report-modal');
      
      // Verify report content
      const hasReportData = await page.evaluate(() => {
        const modal = document.querySelector('.report-modal');
        return modal.textContent.includes('Daily Summary') &&
               modal.textContent.includes('Total Time') &&
               modal.textContent.includes('Activities');
      });
      expect(hasReportData).toBe(true);
      
      // Export report
      await page.click('#export-report');
      
      // Verify download initiated
      const downloadStarted = await page.evaluate(() => {
        return window.lastDownloadedFile !== undefined;
      });
      expect(downloadStarted).toBe(true);
    });
  });
  
  describe('Keyboard Shortcuts', () => {
    test('Ctrl+Shift+T toggles tracking', async () => {
      // Press shortcut
      await page.keyboard.down('Control');
      await page.keyboard.down('Shift');
      await page.keyboard.press('T');
      await page.keyboard.up('Shift');
      await page.keyboard.up('Control');
      
      // Verify tracking started
      const isTracking = await page.evaluate(() => {
        const btn = document.querySelector('#toggle-tracking');
        return btn.classList.contains('tracking');
      });
      expect(isTracking).toBe(true);
      
      // Press again to stop
      await page.keyboard.down('Control');
      await page.keyboard.down('Shift');
      await page.keyboard.press('T');
      await page.keyboard.up('Shift');
      await page.keyboard.up('Control');
      
      // Verify tracking stopped
      const isStopped = await page.evaluate(() => {
        const btn = document.querySelector('#toggle-tracking');
        return !btn.classList.contains('tracking');
      });
      expect(isStopped).toBe(true);
    });
    
    test('Ctrl+M opens manual entry', async () => {
      // Press shortcut
      await page.keyboard.down('Control');
      await page.keyboard.press('M');
      await page.keyboard.up('Control');
      
      // Verify dialog opened
      const dialogOpen = await page.evaluate(() => {
        const dialog = document.querySelector('.manual-entry-dialog');
        return dialog && dialog.style.display !== 'none';
      });
      expect(dialogOpen).toBe(true);
      
      // Press Escape to close
      await page.keyboard.press('Escape');
      
      // Verify dialog closed
      const dialogClosed = await page.evaluate(() => {
        const dialog = document.querySelector('.manual-entry-dialog');
        return !dialog || dialog.style.display === 'none';
      });
      expect(dialogClosed).toBe(true);
    });
  });
  
  describe('Export and Import', () => {
    test('exports data in CSV format', async () => {
      // Open export dialog
      await page.click('#export-data');
      
      // Select CSV format
      await page.click('#export-format-csv');
      
      // Set date range
      await page.evaluate(() => {
        const today = new Date();
        const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        document.querySelector('#export-start-date').value = lastWeek.toISOString().split('T')[0];
        document.querySelector('#export-end-date').value = today.toISOString().split('T')[0];
      });
      
      // Export
      await page.click('#export-submit');
      
      // Verify export completed
      const exportSuccess = await page.evaluate(() => {
        const notification = document.querySelector('.notification.success');
        return notification && notification.textContent.includes('exported successfully');
      });
      expect(exportSuccess).toBe(true);
    });
    
    test('imports data from file', async () => {
      // Open import dialog
      await page.click('#import-data');
      
      // Simulate file selection
      const fileInput = await page.$('#import-file-input');
      await fileInput.uploadFile('./test-data/sample-activities.csv');
      
      // Preview import
      await page.click('#preview-import');
      
      // Verify preview shows data
      const previewCount = await page.evaluate(() => {
        const items = document.querySelectorAll('.import-preview-item');
        return items.length;
      });
      expect(previewCount).toBeGreaterThan(0);
      
      // Confirm import
      await page.click('#confirm-import');
      
      // Verify import success
      const importSuccess = await page.evaluate(() => {
        const notification = document.querySelector('.notification.success');
        return notification && notification.textContent.includes('imported successfully');
      });
      expect(importSuccess).toBe(true);
    });
  });
  
  describe('Accessibility', () => {
    test('app is keyboard navigable', async () => {
      // Tab through main controls
      await page.keyboard.press('Tab'); // Focus on toggle button
      
      let focusedElement = await page.evaluate(() => {
        return document.activeElement.id;
      });
      expect(focusedElement).toBe('toggle-tracking');
      
      // Press Enter to start tracking
      await page.keyboard.press('Enter');
      
      // Tab to manual entry
      await page.keyboard.press('Tab');
      focusedElement = await page.evaluate(() => {
        return document.activeElement.id;
      });
      expect(focusedElement).toBe('add-manual-entry');
      
      // Continue tabbing through interface
      const tabbableElements = await page.evaluate(() => {
        const elements = [];
        let current = document.activeElement;
        
        for (let i = 0; i < 10; i++) {
          current.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
          // Simulate tab behavior
          const next = document.querySelector('[tabindex]:not([tabindex="-1"])');
          if (next) {
            next.focus();
            elements.push(next.id || next.className);
            current = next;
          }
        }
        
        return elements;
      });
      
      expect(tabbableElements.length).toBeGreaterThan(0);
    });
    
    test('screen reader announcements work', async () => {
      // Start tracking
      await page.click('#toggle-tracking');
      
      // Check for ARIA live region update
      const announcement = await page.evaluate(() => {
        const liveRegion = document.querySelector('[aria-live="polite"]');
        return liveRegion ? liveRegion.textContent : null;
      });
      
      expect(announcement).toContain('Tracking started');
      
      // Stop tracking
      await page.click('#toggle-tracking');
      
      // Check for stop announcement
      const stopAnnouncement = await page.evaluate(() => {
        const liveRegion = document.querySelector('[aria-live="polite"]');
        return liveRegion ? liveRegion.textContent : null;
      });
      
      expect(stopAnnouncement).toContain('Tracking stopped');
    });
  });
});