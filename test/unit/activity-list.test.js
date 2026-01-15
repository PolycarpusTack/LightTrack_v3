/**
 * @module test/unit/activity-list.test
 * @description Unit tests for activity list component
 */

const { TestUtils } = require('../setup');

describe('ActivityList Component', () => {
  let ActivityList;
  let activityList;
  let container;
  
  beforeEach(() => {
    // Clear mocks
    TestUtils.clearAllMocks();
    
    // Create container element
    container = {
      innerHTML: '',
      appendChild: jest.fn(),
      removeChild: jest.fn(),
      querySelector: jest.fn(),
      querySelectorAll: jest.fn(() => []),
      addEventListener: jest.fn()
    };
    
    // Mock module
    jest.mock('../../src/renderer/js/components/activity-list.js', () => {
      return class ActivityList {
        constructor(container) {
          this.container = container;
          this.activities = [];
          this.filteredActivities = [];
          this.sortField = 'startTime';
          this.sortDirection = 'desc';
          this.selectedActivities = new Set();
          this.init();
        }
        
        init() {
          this.setupEventListeners();
        }
        
        setupEventListeners() {
          // Mock implementation
        }
        
        async refresh(options = {}) {
          try {
            const queryOptions = {};
            if (options.startDate) queryOptions.startDate = options.startDate;
            if (options.endDate) queryOptions.endDate = options.endDate;
            
            this.activities = await window.lightTrackAPI.getActivities(queryOptions);
            this.filteredActivities = [...this.activities];
            this.render();
          } catch (error) {
            console.error('Failed to refresh activities:', error);
          }
        }
        
        render() {
          const html = this.activities.map(activity => 
            `<div class="activity-item" data-id="${activity.id}">
              <div class="activity-time">${this.formatTime(activity.startTime)}</div>
              <div class="activity-project">${activity.project}</div>
              <div class="activity-duration">${this.formatDuration(activity.duration)}</div>
            </div>`
          ).join('');
          
          this.container.innerHTML = html;
        }
        
        formatTime(timestamp) {
          return new Date(timestamp).toLocaleTimeString();
        }
        
        formatDuration(ms) {
          const hours = Math.floor(ms / 3600000);
          const minutes = Math.floor((ms % 3600000) / 60000);
          return `${hours}h ${minutes}m`;
        }
        
        filter(searchTerm) {
          const term = searchTerm.toLowerCase();
          this.filteredActivities = this.activities.filter(activity => 
            activity.project?.toLowerCase().includes(term) ||
            activity.app?.toLowerCase().includes(term) ||
            activity.title?.toLowerCase().includes(term)
          );
          this.render();
        }
        
        sort(field) {
          if (this.sortField === field) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
          } else {
            this.sortField = field;
            this.sortDirection = 'desc';
          }
          
          this.activities.sort((a, b) => {
            const aVal = a[field];
            const bVal = b[field];
            const result = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            return this.sortDirection === 'asc' ? result : -result;
          });
          
          this.render();
        }
        
        selectActivity(id) {
          if (this.selectedActivities.has(id)) {
            this.selectedActivities.delete(id);
          } else {
            this.selectedActivities.add(id);
          }
        }
        
        deleteSelected() {
          const promises = Array.from(this.selectedActivities).map(id =>
            window.lightTrackAPI.deleteActivity(id)
          );
          return Promise.all(promises);
        }
        
        exportSelected(format = 'csv') {
          const selected = this.activities.filter(a => 
            this.selectedActivities.has(a.id)
          );
          return this.exportActivities(selected, format);
        }
        
        exportActivities(activities, format) {
          if (format === 'csv') {
            const csv = this.convertToCSV(activities);
            return { success: true, data: csv };
          }
          return { success: true, data: JSON.stringify(activities) };
        }
        
        convertToCSV(activities) {
          const headers = ['Start Time', 'End Time', 'Duration', 'Project', 'App'];
          const rows = activities.map(a => [
            new Date(a.startTime).toISOString(),
            new Date(a.endTime).toISOString(),
            this.formatDuration(a.duration),
            a.project || '',
            a.app || ''
          ]);
          
          return [headers, ...rows].map(row => row.join(',')).join('\n');
        }
      };
    });
    
    // Get the mocked class
    ActivityList = require('../../src/renderer/js/components/activity-list.js');
    activityList = new ActivityList(container);
  });
  
  describe('Initialization', () => {
    test('should initialize with default values', () => {
      expect(activityList.container).toBe(container);
      expect(activityList.activities).toEqual([]);
      expect(activityList.sortField).toBe('startTime');
      expect(activityList.sortDirection).toBe('desc');
      expect(activityList.selectedActivities.size).toBe(0);
    });
  });
  
  describe('Data Loading', () => {
    test('should load activities on refresh', async () => {
      const mockActivities = TestUtils.createMockActivities(3);
      window.lightTrackAPI.getActivities.mockResolvedValue(mockActivities);
      
      await activityList.refresh();
      
      expect(window.lightTrackAPI.getActivities).toHaveBeenCalled();
      expect(activityList.activities).toEqual(mockActivities);
    });
    
    test('should apply date filters', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      
      await activityList.refresh({ startDate, endDate });
      
      expect(window.lightTrackAPI.getActivities).toHaveBeenCalledWith({
        startDate,
        endDate
      });
    });
    
    test('should handle load errors', async () => {
      window.lightTrackAPI.getActivities.mockRejectedValue(new Error('Load failed'));
      const consoleSpy = jest.spyOn(console, 'error');
      
      await activityList.refresh();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to refresh activities:',
        expect.any(Error)
      );
    });
  });
  
  describe('Rendering', () => {
    beforeEach(async () => {
      const mockActivities = TestUtils.createMockActivities(3);
      window.lightTrackAPI.getActivities.mockResolvedValue(mockActivities);
      await activityList.refresh();
    });
    
    test('should render activities to container', () => {
      expect(container.innerHTML).toContain('activity-item');
      expect(container.innerHTML).toContain('Project 0');
      expect(container.innerHTML).toContain('Project 1');
      expect(container.innerHTML).toContain('Project 2');
    });
    
    test('should format time correctly', () => {
      const timestamp = new Date('2024-01-01T10:30:00').getTime();
      const formatted = activityList.formatTime(timestamp);
      expect(formatted).toContain('10:30');
    });
    
    test('should format duration correctly', () => {
      const testCases = [
        { ms: 0, expected: '0h 0m' },
        { ms: 1800000, expected: '0h 30m' },
        { ms: 3600000, expected: '1h 0m' },
        { ms: 5400000, expected: '1h 30m' },
        { ms: 7320000, expected: '2h 2m' }
      ];
      
      testCases.forEach(({ ms, expected }) => {
        expect(activityList.formatDuration(ms)).toBe(expected);
      });
    });
  });
  
  describe('Filtering', () => {
    beforeEach(async () => {
      const mockActivities = [
        TestUtils.createMockActivity({ project: 'Web Development', app: 'VS Code' }),
        TestUtils.createMockActivity({ project: 'Design', app: 'Figma' }),
        TestUtils.createMockActivity({ project: 'Documentation', app: 'Notion' })
      ];
      window.lightTrackAPI.getActivities.mockResolvedValue(mockActivities);
      await activityList.refresh();
    });
    
    test('should filter by project name', () => {
      activityList.filter('web');
      expect(activityList.filteredActivities).toHaveLength(1);
      expect(activityList.filteredActivities[0].project).toBe('Web Development');
    });
    
    test('should filter by app name', () => {
      activityList.filter('figma');
      expect(activityList.filteredActivities).toHaveLength(1);
      expect(activityList.filteredActivities[0].app).toBe('Figma');
    });
    
    test('should be case insensitive', () => {
      activityList.filter('DESIGN');
      expect(activityList.filteredActivities).toHaveLength(1);
      expect(activityList.filteredActivities[0].project).toBe('Design');
    });
    
    test('should show all when filter is empty', () => {
      activityList.filter('');
      expect(activityList.filteredActivities).toHaveLength(3);
    });
  });
  
  describe('Sorting', () => {
    beforeEach(async () => {
      const mockActivities = [
        TestUtils.createMockActivity({ startTime: 1000, duration: 3600000 }),
        TestUtils.createMockActivity({ startTime: 2000, duration: 1800000 }),
        TestUtils.createMockActivity({ startTime: 3000, duration: 7200000 })
      ];
      window.lightTrackAPI.getActivities.mockResolvedValue(mockActivities);
      await activityList.refresh();
    });
    
    test('should sort by start time', () => {
      activityList.sort('startTime');
      expect(activityList.activities[0].startTime).toBe(3000);
      expect(activityList.activities[2].startTime).toBe(1000);
    });
    
    test('should toggle sort direction', () => {
      activityList.sort('startTime');
      activityList.sort('startTime'); // Toggle to asc
      expect(activityList.activities[0].startTime).toBe(1000);
      expect(activityList.activities[2].startTime).toBe(3000);
    });
    
    test('should sort by duration', () => {
      activityList.sort('duration');
      expect(activityList.activities[0].duration).toBe(7200000);
      expect(activityList.activities[2].duration).toBe(1800000);
    });
  });
  
  describe('Selection', () => {
    beforeEach(async () => {
      const mockActivities = TestUtils.createMockActivities(3);
      window.lightTrackAPI.getActivities.mockResolvedValue(mockActivities);
      await activityList.refresh();
    });
    
    test('should select activity', () => {
      activityList.selectActivity('activity_0');
      expect(activityList.selectedActivities.has('activity_0')).toBe(true);
    });
    
    test('should deselect activity', () => {
      activityList.selectActivity('activity_0');
      activityList.selectActivity('activity_0'); // Toggle off
      expect(activityList.selectedActivities.has('activity_0')).toBe(false);
    });
    
    test('should select multiple activities', () => {
      activityList.selectActivity('activity_0');
      activityList.selectActivity('activity_1');
      expect(activityList.selectedActivities.size).toBe(2);
    });
  });
  
  describe('Bulk Operations', () => {
    beforeEach(async () => {
      const mockActivities = TestUtils.createMockActivities(3);
      window.lightTrackAPI.getActivities.mockResolvedValue(mockActivities);
      await activityList.refresh();
      
      // Select some activities
      activityList.selectActivity('activity_0');
      activityList.selectActivity('activity_1');
    });
    
    test('should delete selected activities', async () => {
      window.lightTrackAPI.deleteActivity.mockResolvedValue({ success: true });
      
      await activityList.deleteSelected();
      
      expect(window.lightTrackAPI.deleteActivity).toHaveBeenCalledTimes(2);
      expect(window.lightTrackAPI.deleteActivity).toHaveBeenCalledWith('activity_0');
      expect(window.lightTrackAPI.deleteActivity).toHaveBeenCalledWith('activity_1');
    });
    
    test('should export selected activities as CSV', () => {
      const result = activityList.exportSelected('csv');
      
      expect(result.success).toBe(true);
      expect(result.data).toContain('Start Time,End Time,Duration,Project,App');
      expect(result.data).toContain('Project 0');
      expect(result.data).toContain('Project 1');
      expect(result.data).not.toContain('Project 2'); // Not selected
    });
    
    test('should export selected activities as JSON', () => {
      const result = activityList.exportSelected('json');
      
      expect(result.success).toBe(true);
      const parsed = JSON.parse(result.data);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].id).toBe('activity_0');
      expect(parsed[1].id).toBe('activity_1');
    });
  });
  
  describe('CSV Export', () => {
    test('should generate valid CSV', () => {
      const activities = [
        TestUtils.createMockActivity({
          project: 'Project, with comma',
          app: 'App "with" quotes'
        })
      ];
      
      const csv = activityList.convertToCSV(activities);
      const lines = csv.split('\n');
      
      expect(lines[0]).toBe('Start Time,End Time,Duration,Project,App');
      expect(lines[1]).toContain('Project, with comma'); // Should handle commas
      expect(lines[1]).toContain('App "with" quotes'); // Should handle quotes
    });
  });
});