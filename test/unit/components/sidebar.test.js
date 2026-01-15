/**
 * Unit Tests for Sidebar Component
 */

// Mock DOM environment
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
  resources: 'usable'
});

global.window = dom.window;
global.document = dom.window.document;
global.Event = dom.window.Event;
global.CustomEvent = dom.window.CustomEvent;

// Mock global APIs
global.lightTrackAPI = {
  on: jest.fn(),
  removeAllListeners: jest.fn()
};

// Import after DOM setup
const { UnifiedSidebar } = require('../../../src/renderer/components/sidebar');

describe('UnifiedSidebar', () => {
  let sidebar;
  let mockContainer;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    
    // Create container element
    mockContainer = document.createElement('div');
    mockContainer.id = 'sidebar-container';
    document.body.appendChild(mockContainer);
    
    // Create new sidebar instance
    sidebar = new UnifiedSidebar(mockContainer);
    
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (sidebar) {
      sidebar.destroy();
    }
    document.body.innerHTML = '';
  });

  describe('Constructor and Initialization', () => {
    test('should initialize with container element', () => {
      expect(sidebar.container).toBe(mockContainer);
      expect(sidebar.isVisible).toBe(true);
      expect(sidebar.eventListeners).toEqual([]);
    });

    test('should throw error without container', () => {
      expect(() => {
        new UnifiedSidebar(null);
      }).toThrow('Container element is required');
    });

    test('should create sidebar structure', () => {
      const sidebarElement = mockContainer.querySelector('.unified-sidebar');
      expect(sidebarElement).toBeTruthy();
      
      const nav = sidebarElement.querySelector('.sidebar-nav');
      expect(nav).toBeTruthy();
      
      const toggle = sidebarElement.querySelector('.sidebar-toggle');
      expect(toggle).toBeTruthy();
    });

    test('should create navigation items', () => {
      const navItems = mockContainer.querySelectorAll('.nav-item');
      expect(navItems.length).toBeGreaterThan(0);
      
      // Check for essential navigation items
      const dashboardItem = Array.from(navItems).find(item => 
        item.getAttribute('data-page') === 'dashboard'
      );
      expect(dashboardItem).toBeTruthy();
    });
  });

  describe('Navigation Structure', () => {
    test('should create correct navigation items', () => {
      const expectedPages = ['dashboard', 'activities', 'timeline', 'insights', 'integrations'];
      
      expectedPages.forEach(page => {
        const navItem = mockContainer.querySelector(`[data-page="${page}"]`);
        expect(navItem).toBeTruthy();
        expect(navItem.classList.contains('nav-item')).toBe(true);
      });
    });

    test('should set dashboard as active by default', () => {
      const dashboardItem = mockContainer.querySelector('[data-page="dashboard"]');
      expect(dashboardItem.classList.contains('active')).toBe(true);
    });

    test('should include icons for navigation items', () => {
      const navItems = mockContainer.querySelectorAll('.nav-item');
      
      navItems.forEach(item => {
        const icon = item.querySelector('.nav-icon');
        expect(icon).toBeTruthy();
      });
    });

    test('should include labels for navigation items', () => {
      const navItems = mockContainer.querySelectorAll('.nav-item');
      
      navItems.forEach(item => {
        const label = item.querySelector('.nav-label');
        expect(label).toBeTruthy();
        expect(label.textContent.trim()).not.toBe('');
      });
    });
  });

  describe('Toggle Functionality', () => {
    test('should toggle sidebar visibility', () => {
      const toggleButton = mockContainer.querySelector('.sidebar-toggle');
      
      // Initially visible
      expect(sidebar.isVisible).toBe(true);
      
      // Click toggle
      toggleButton.click();
      
      expect(sidebar.isVisible).toBe(false);
      expect(mockContainer.classList.contains('collapsed')).toBe(true);
    });

    test('should update toggle button state', () => {
      const toggleButton = mockContainer.querySelector('.sidebar-toggle');
      
      sidebar.toggle();
      
      expect(toggleButton.getAttribute('aria-expanded')).toBe('false');
      expect(toggleButton.getAttribute('title')).toBe('Expand sidebar');
    });

    test('should emit toggle events', () => {
      let eventFired = false;
      sidebar.container.addEventListener('sidebar-toggled', () => {
        eventFired = true;
      });
      
      sidebar.toggle();
      
      expect(eventFired).toBe(true);
    });
  });

  describe('Navigation Events', () => {
    test('should handle navigation item clicks', () => {
      let navigatedTo = null;
      sidebar.container.addEventListener('page-requested', (e) => {
        navigatedTo = e.detail.page;
      });
      
      const activitiesItem = mockContainer.querySelector('[data-page="activities"]');
      activitiesItem.click();
      
      expect(navigatedTo).toBe('activities');
    });

    test('should update active state on navigation', () => {
      const dashboardItem = mockContainer.querySelector('[data-page="dashboard"]');
      const activitiesItem = mockContainer.querySelector('[data-page="activities"]');
      
      // Initially dashboard is active
      expect(dashboardItem.classList.contains('active')).toBe(true);
      
      // Navigate to activities
      sidebar.setActivePage('activities');
      
      expect(dashboardItem.classList.contains('active')).toBe(false);
      expect(activitiesItem.classList.contains('active')).toBe(true);
    });

    test('should handle keyboard navigation', () => {
      const navItem = mockContainer.querySelector('.nav-item');
      
      // Simulate Enter key
      const enterEvent = new KeyboardEvent('keydown', { 
        key: 'Enter',
        bubbles: true 
      });
      
      let eventFired = false;
      sidebar.container.addEventListener('page-requested', () => {
        eventFired = true;
      });
      
      navItem.dispatchEvent(enterEvent);
      
      expect(eventFired).toBe(true);
    });

    test('should handle space key navigation', () => {
      const navItem = mockContainer.querySelector('.nav-item');
      
      // Simulate Space key
      const spaceEvent = new KeyboardEvent('keydown', { 
        key: ' ',
        bubbles: true 
      });
      
      let eventFired = false;
      sidebar.container.addEventListener('page-requested', () => {
        eventFired = true;
      });
      
      navItem.dispatchEvent(spaceEvent);
      
      expect(eventFired).toBe(true);
    });
  });

  describe('Accessibility', () => {
    test('should have proper ARIA attributes', () => {
      const sidebarElement = mockContainer.querySelector('.unified-sidebar');
      
      expect(sidebarElement.getAttribute('role')).toBe('navigation');
      expect(sidebarElement.getAttribute('aria-label')).toBe('Main navigation');
    });

    test('should have proper toggle button attributes', () => {
      const toggleButton = mockContainer.querySelector('.sidebar-toggle');
      
      expect(toggleButton.getAttribute('aria-expanded')).toBe('true');
      expect(toggleButton.getAttribute('aria-label')).toBe('Toggle sidebar');
    });

    test('should make navigation items focusable', () => {
      const navItems = mockContainer.querySelectorAll('.nav-item');
      
      navItems.forEach(item => {
        expect(item.getAttribute('tabindex')).toBe('0');
        expect(item.getAttribute('role')).toBe('button');
      });
    });

    test('should have proper aria-current for active item', () => {
      const activePage = mockContainer.querySelector('.nav-item.active');
      expect(activePage.getAttribute('aria-current')).toBe('page');
    });
  });

  describe('Store Integration', () => {
    test('should connect to store if available', () => {
      const mockStore = {
        subscribe: jest.fn(),
        getState: jest.fn().mockReturnValue({
          ui: { activePage: 'dashboard', sidebarCollapsed: false }
        })
      };
      
      // Test with store
      const sidebarWithStore = new UnifiedSidebar(mockContainer, mockStore);
      
      expect(mockStore.subscribe).toHaveBeenCalled();
      expect(sidebarWithStore.store).toBe(mockStore);
    });

    test('should handle store state changes', () => {
      const mockStore = {
        subscribe: jest.fn(),
        getState: jest.fn().mockReturnValue({
          ui: { activePage: 'activities', sidebarCollapsed: true }
        })
      };
      
      const sidebarWithStore = new UnifiedSidebar(mockContainer, mockStore);
      
      // Simulate store state change
      const stateChangeCallback = mockStore.subscribe.mock.calls[0][0];
      stateChangeCallback({
        ui: { activePage: 'timeline', sidebarCollapsed: false }
      });
      
      const timelineItem = mockContainer.querySelector('[data-page="timeline"]');
      expect(timelineItem.classList.contains('active')).toBe(true);
    });

    test('should work without store', () => {
      expect(() => {
        new UnifiedSidebar(mockContainer, null);
      }).not.toThrow();
    });
  });

  describe('Event Listener Management', () => {
    test('should track event listeners for cleanup', () => {
      expect(sidebar.eventListeners.length).toBeGreaterThan(0);
    });

    test('should handle external events', () => {
      // Simulate external page change event
      window.dispatchEvent(new CustomEvent('page-changed', {
        detail: { page: 'insights' }
      }));
      
      const insightsItem = mockContainer.querySelector('[data-page="insights"]');
      expect(insightsItem.classList.contains('active')).toBe(true);
    });

    test('should remove event listeners on destroy', () => {
      const initialListenerCount = sidebar.eventListeners.length;
      expect(initialListenerCount).toBeGreaterThan(0);
      
      sidebar.destroy();
      
      // Event listeners should be cleaned up
      expect(sidebar.eventListeners).toEqual([]);
    });
  });

  describe('Responsive Behavior', () => {
    test('should handle mobile breakpoint', () => {
      // Simulate mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 640
      });
      
      window.dispatchEvent(new Event('resize'));
      
      // Should automatically collapse on mobile
      expect(sidebar.isVisible).toBe(false);
      expect(mockContainer.classList.contains('collapsed')).toBe(true);
    });

    test('should restore on desktop', () => {
      // Start collapsed on mobile
      sidebar.toggle(); // Collapse
      
      // Simulate desktop viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024
      });
      
      window.dispatchEvent(new Event('resize'));
      
      // Should expand on desktop
      expect(sidebar.isVisible).toBe(true);
    });
  });

  describe('State Persistence', () => {
    test('should save state to localStorage', () => {
      const mockStorage = {
        setItem: jest.fn(),
        getItem: jest.fn()
      };
      
      Object.defineProperty(window, 'localStorage', {
        value: mockStorage,
        writable: true
      });
      
      sidebar.toggle();
      
      expect(mockStorage.setItem).toHaveBeenCalledWith(
        'sidebar-state',
        JSON.stringify({ collapsed: true })
      );
    });

    test('should restore state from localStorage', () => {
      const mockStorage = {
        getItem: jest.fn().mockReturnValue(JSON.stringify({ collapsed: true })),
        setItem: jest.fn()
      };
      
      Object.defineProperty(window, 'localStorage', {
        value: mockStorage,
        writable: true
      });
      
      // Create new sidebar - should restore collapsed state
      const newSidebar = new UnifiedSidebar(mockContainer);
      
      expect(newSidebar.isVisible).toBe(false);
      expect(mockContainer.classList.contains('collapsed')).toBe(true);
      
      newSidebar.destroy();
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid page navigation', () => {
      expect(() => {
        sidebar.setActivePage('non-existent-page');
      }).not.toThrow();
      
      // Should keep current active page
      const dashboardItem = mockContainer.querySelector('[data-page="dashboard"]');
      expect(dashboardItem.classList.contains('active')).toBe(true);
    });

    test('should handle missing DOM elements gracefully', () => {
      // Remove a nav item
      const navItem = mockContainer.querySelector('.nav-item');
      navItem.remove();
      
      expect(() => {
        sidebar.setActivePage('dashboard');
      }).not.toThrow();
    });

    test('should handle localStorage errors', () => {
      // Mock localStorage to throw error
      const mockStorage = {
        setItem: jest.fn(() => {
          throw new Error('Storage failed');
        }),
        getItem: jest.fn()
      };
      
      Object.defineProperty(window, 'localStorage', {
        value: mockStorage,
        writable: true
      });
      
      expect(() => {
        sidebar.toggle();
      }).not.toThrow();
    });
  });

  describe('Memory Management', () => {
    test('should clean up all resources on destroy', () => {
      const initialHTML = mockContainer.innerHTML;
      expect(initialHTML).not.toBe('');
      
      sidebar.destroy();
      
      expect(mockContainer.innerHTML).toBe('');
      expect(sidebar.eventListeners).toEqual([]);
    });

    test('should handle multiple destroy calls', () => {
      sidebar.destroy();
      
      expect(() => {
        sidebar.destroy();
      }).not.toThrow();
    });

    test('should remove window event listeners', () => {
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
      
      sidebar.destroy();
      
      expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    });
  });

  describe('Performance', () => {
    test('should debounce resize events', (done) => {
      let resizeCallCount = 0;
      
      // Override the resize handler to count calls
      sidebar.handleResize = jest.fn(() => {
        resizeCallCount++;
      });
      
      // Trigger multiple resize events quickly
      for (let i = 0; i < 5; i++) {
        window.dispatchEvent(new Event('resize'));
      }
      
      // Should debounce to single call
      setTimeout(() => {
        expect(sidebar.handleResize).toHaveBeenCalledTimes(1);
        done();
      }, 300);
    });

    test('should minimize DOM queries', () => {
      const querySelectorSpy = jest.spyOn(document, 'querySelector');
      
      // Perform multiple operations
      sidebar.setActivePage('activities');
      sidebar.setActivePage('timeline');
      sidebar.setActivePage('insights');
      
      // Should cache DOM references
      expect(querySelectorSpy.mock.calls.length).toBeLessThan(10);
    });
  });
});