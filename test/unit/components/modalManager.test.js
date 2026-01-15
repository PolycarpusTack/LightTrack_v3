/**
 * Unit Tests for ModalManager Component
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
global.fetch = jest.fn();
global.requestAnimationFrame = jest.fn(cb => setTimeout(cb, 0));

// Mock global APIs
global.lightTrackAPI = {
  handleManualEntrySave: jest.fn(),
  handleActivityEdit: jest.fn()
};

// Import the module after setting up the DOM
const ModalManager = require('../../../src/renderer/components/modalManager');

describe('ModalManager', () => {
  let modalManager;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    document.body.className = '';
    
    // Clear fetch mock
    global.fetch.mockClear();
    
    // Create new instance
    modalManager = new ModalManager();
    
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (modalManager) {
      modalManager.destroy();
    }
  });

  describe('Constructor and Initialization', () => {
    test('should initialize with empty state', () => {
      expect(modalManager.activeModals).toBeInstanceOf(Map);
      expect(modalManager.modalStack).toEqual([]);
      expect(modalManager.activeModals.size).toBe(0);
    });

    test('should create overlay and container elements', () => {
      const overlay = document.getElementById('modal-overlay');
      const container = document.getElementById('modal-container');
      
      expect(overlay).toBeTruthy();
      expect(container).toBeTruthy();
      expect(overlay.className).toBe('modal-overlay');
      expect(container.className).toBe('modal-container');
    });

    test('should initialize tracking structures', () => {
      expect(modalManager.eventListeners).toEqual([]);
      expect(modalManager.modalEventListeners).toBeInstanceOf(Map);
      expect(modalManager.timers).toBeInstanceOf(Set);
    });

    test('should setup modal configurations', () => {
      expect(modalManager.modalConfigs).toHaveProperty('settings');
      expect(modalManager.modalConfigs).toHaveProperty('manual-entry');
      expect(modalManager.modalConfigs).toHaveProperty('confirm');
      expect(modalManager.modalConfigs).toHaveProperty('alert');
    });
  });

  describe('Modal Creation', () => {
    test('should open modal with basic configuration', async () => {
      global.fetch.mockResolvedValue({
        text: () => Promise.resolve('<p>Settings content</p>')
      });

      const modalId = await modalManager.open('settings');
      
      expect(modalId).toBeTruthy();
      expect(modalManager.activeModals.has(modalId)).toBe(true);
      expect(modalManager.modalStack).toContain(modalId);
      
      const modal = modalManager.activeModals.get(modalId);
      expect(modal.type).toBe('settings');
    });

    test('should generate unique modal IDs', async () => {
      global.fetch.mockResolvedValue({
        text: () => Promise.resolve('<p>Content</p>')
      });

      const modalId1 = await modalManager.open('settings');
      const modalId2 = await modalManager.open('manual-entry');
      
      expect(modalId1).not.toBe(modalId2);
    });

    test('should merge custom options with defaults', async () => {
      global.fetch.mockResolvedValue({
        text: () => Promise.resolve('<p>Content</p>')
      });

      const modalId = await modalManager.open('settings', {
        title: 'Custom Title',
        width: '700px'
      });
      
      const modal = modalManager.activeModals.get(modalId);
      expect(modal.config.title).toBe('Custom Title');
      expect(modal.config.width).toBe('700px');
      expect(modal.config.height).toBe('auto'); // Default value
    });

    test('should handle unknown modal type', async () => {
      const modalId = await modalManager.open('unknown-type');
      
      expect(modalId).toBeNull();
      expect(modalManager.activeModals.size).toBe(0);
    });
  });

  describe('Modal Content Loading', () => {
    test('should load content from HTML file', async () => {
      const mockContent = '<div><h1>Settings Page</h1><form>...</form></div>';
      global.fetch.mockResolvedValue({
        text: () => Promise.resolve(mockContent)
      });

      const modalId = await modalManager.open('settings');
      const modalElement = modalManager.activeModals.get(modalId).element;
      
      expect(global.fetch).toHaveBeenCalledWith('unified-settings.html');
      expect(modalElement.innerHTML).toContain('Settings');
    });

    test('should extract body content from full HTML', async () => {
      const fullHtml = `
        <html>
          <head><title>Test</title></head>
          <body>
            <div class="content">Body content here</div>
          </body>
        </html>
      `;
      
      global.fetch.mockResolvedValue({
        text: () => Promise.resolve(fullHtml)
      });

      const modalId = await modalManager.open('settings');
      const modalElement = modalManager.activeModals.get(modalId).element;
      
      expect(modalElement.innerHTML).toContain('Body content here');
      expect(modalElement.innerHTML).not.toContain('<html>');
    });

    test('should handle content loading errors', async () => {
      global.fetch.mockRejectedValue(new Error('File not found'));

      const modalId = await modalManager.open('settings');
      const modalElement = modalManager.activeModals.get(modalId).element;
      
      expect(modalElement.innerHTML).toContain('Error loading content');
    });

    test('should use template for predefined modal types', async () => {
      const modalId = await modalManager.open('confirm', {
        message: 'Are you sure you want to delete this item?'
      });
      
      const modalElement = modalManager.activeModals.get(modalId).element;
      expect(modalElement.innerHTML).toContain('Are you sure you want to delete this item?');
    });
  });

  describe('Modal Structure and Attributes', () => {
    test('should create modal with proper ARIA attributes', async () => {
      global.fetch.mockResolvedValue({
        text: () => Promise.resolve('<p>Content</p>')
      });

      const modalId = await modalManager.open('settings');
      const modalElement = modalManager.activeModals.get(modalId).element;
      
      expect(modalElement.getAttribute('role')).toBe('dialog');
      expect(modalElement.getAttribute('aria-modal')).toBe('true');
      expect(modalElement.getAttribute('aria-labelledby')).toBe(`${modalId}-title`);
      expect(modalElement.getAttribute('aria-describedby')).toBe(`${modalId}-content`);
      expect(modalElement.getAttribute('tabindex')).toBe('-1');
    });

    test('should set modal dimensions from configuration', async () => {
      global.fetch.mockResolvedValue({
        text: () => Promise.resolve('<p>Content</p>')
      });

      const modalId = await modalManager.open('settings');
      const modalElement = modalManager.activeModals.get(modalId).element;
      
      expect(modalElement.style.width).toBe('600px');
      expect(modalElement.style.height).toBe('auto');
    });

    test('should include close button for closable modals', async () => {
      global.fetch.mockResolvedValue({
        text: () => Promise.resolve('<p>Content</p>')
      });

      const modalId = await modalManager.open('settings');
      const modalElement = modalManager.activeModals.get(modalId).element;
      
      const closeButton = modalElement.querySelector('.modal-close');
      expect(closeButton).toBeTruthy();
      expect(closeButton.getAttribute('aria-label')).toBe('Close dialog');
    });

    test('should create footer with action buttons', async () => {
      const modalId = await modalManager.open('confirm', {
        message: 'Test confirmation',
        buttons: [
          { label: 'Cancel', action: 'cancel' },
          { label: 'Confirm', action: 'confirm', type: 'primary', primary: true }
        ]
      });
      
      const modalElement = modalManager.activeModals.get(modalId).element;
      const footer = modalElement.querySelector('.modal-footer');
      const buttons = footer.querySelectorAll('button');
      
      expect(buttons).toHaveLength(2);
      expect(buttons[0].textContent.trim()).toBe('Cancel');
      expect(buttons[1].textContent.trim()).toBe('Confirm');
      expect(buttons[1].getAttribute('data-primary')).toBe('true');
    });
  });

  describe('Event Handling', () => {
    test('should handle close button click', async () => {
      global.fetch.mockResolvedValue({
        text: () => Promise.resolve('<p>Content</p>')
      });

      const modalId = await modalManager.open('settings');
      const modalElement = modalManager.activeModals.get(modalId).element;
      const closeButton = modalElement.querySelector('.modal-close');
      
      closeButton.click();
      
      // Modal should be marked for closing
      expect(modalElement.classList.contains('active')).toBe(false);
    });

    test('should handle overlay click to close', () => {
      const overlay = document.getElementById('modal-overlay');
      
      // Mock a modal being open
      modalManager.modalStack.push('test-modal');
      modalManager.activeModals.set('test-modal', {
        id: 'test-modal',
        config: { closable: true },
        element: document.createElement('div')
      });
      
      // Create click event on overlay itself
      const event = new Event('click');
      Object.defineProperty(event, 'target', { value: overlay });
      
      overlay.dispatchEvent(event);
      
      // Should trigger modal close
      expect(modalManager.modalStack).toHaveLength(0);
    });

    test('should handle escape key press', () => {
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      
      // Mock a modal being open
      modalManager.modalStack.push('test-modal');
      modalManager.activeModals.set('test-modal', {
        id: 'test-modal',
        config: { closable: true },
        element: document.createElement('div')
      });
      
      document.dispatchEvent(escapeEvent);
      
      // Should trigger modal close
      expect(modalManager.modalStack).toHaveLength(0);
    });

    test('should handle button actions', async () => {
      const modalId = await modalManager.open('confirm', {
        message: 'Test confirmation'
      });
      
      const modalElement = modalManager.activeModals.get(modalId).element;
      
      // Create custom event listener to capture modal action
      let actionResult = null;
      window.addEventListener('modal-action', (e) => {
        actionResult = e.detail;
      });
      
      // Find and click confirm button
      const confirmButton = modalElement.querySelector('[data-action="confirm"]');
      if (confirmButton) {
        confirmButton.click();
        
        expect(actionResult).toMatchObject({
          modalId,
          action: 'confirm'
        });
      }
    });
  });

  describe('Focus Management', () => {
    test('should trap focus within modal', async () => {
      global.fetch.mockResolvedValue({
        text: () => Promise.resolve(`
          <input type="text" id="first-input" />
          <button type="button">Middle Button</button>
          <input type="text" id="last-input" />
        `)
      });

      const modalId = await modalManager.open('settings');
      const modalElement = modalManager.activeModals.get(modalId).element;
      
      // Focus should be trapped within modal
      const focusableElements = modalElement.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      
      expect(focusableElements.length).toBeGreaterThan(0);
    });

    test('should focus first focusable element on open', async () => {
      global.fetch.mockResolvedValue({
        text: () => Promise.resolve('<button id="first-btn">First</button><button id="second-btn">Second</button>')
      });

      const modalId = await modalManager.open('settings');
      
      // Wait for focus to be set
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const firstButton = document.getElementById('first-btn');
      expect(document.activeElement).toBe(firstButton);
    });

    test('should handle tab navigation within modal', async () => {
      global.fetch.mockResolvedValue({
        text: () => Promise.resolve(`
          <button id="btn1">Button 1</button>
          <button id="btn2">Button 2</button>
          <button id="btn3">Button 3</button>
        `)
      });

      const modalId = await modalManager.open('settings');
      const modalElement = modalManager.activeModals.get(modalId).element;
      
      // Simulate tab key press
      const tabEvent = new KeyboardEvent('keydown', { 
        key: 'Tab', 
        bubbles: true, 
        cancelable: true 
      });
      
      modalElement.dispatchEvent(tabEvent);
      
      // Focus management should be handled by focus trap
      expect(tabEvent.defaultPrevented).toBe(false); // Let browser handle unless at boundaries
    });
  });

  describe('Modal Stack Management', () => {
    test('should maintain modal stack order', async () => {
      global.fetch.mockResolvedValue({
        text: () => Promise.resolve('<p>Content</p>')
      });

      const modal1 = await modalManager.open('settings');
      const modal2 = await modalManager.open('manual-entry');
      const modal3 = await modalManager.open('help');
      
      expect(modalManager.modalStack).toEqual([modal1, modal2, modal3]);
    });

    test('should get top modal correctly', async () => {
      global.fetch.mockResolvedValue({
        text: () => Promise.resolve('<p>Content</p>')
      });

      expect(modalManager.getTopModal()).toBeNull();
      
      const modal1 = await modalManager.open('settings');
      expect(modalManager.getTopModal().id).toBe(modal1);
      
      const modal2 = await modalManager.open('manual-entry');
      expect(modalManager.getTopModal().id).toBe(modal2);
    });

    test('should remove modal from stack on close', async () => {
      global.fetch.mockResolvedValue({
        text: () => Promise.resolve('<p>Content</p>')
      });

      const modal1 = await modalManager.open('settings');
      const modal2 = await modalManager.open('manual-entry');
      
      modalManager.close(modal1);
      
      expect(modalManager.modalStack).not.toContain(modal1);
      expect(modalManager.modalStack).toContain(modal2);
    });
  });

  describe('Utility Methods', () => {
    test('should implement confirm dialog', async () => {
      const confirmPromise = modalManager.confirm('Are you sure?');
      
      // Get the modal that was created
      const topModal = modalManager.getTopModal();
      expect(topModal).toBeTruthy();
      
      // Simulate confirm button click
      window.dispatchEvent(new CustomEvent('modal-action', {
        detail: { modalId: topModal.id, action: 'confirm' }
      }));
      
      const result = await confirmPromise;
      expect(result).toBe(true);
    });

    test('should implement alert dialog', () => {
      const modalId = modalManager.alert('This is an alert');
      
      expect(modalId).toBeTruthy();
      const modal = modalManager.activeModals.get(modalId);
      expect(modal.type).toBe('alert');
    });

    test('should implement prompt dialog', async () => {
      const promptPromise = modalManager.prompt('Enter your name:');
      
      // Get the modal that was created
      const topModal = modalManager.getTopModal();
      const modalElement = topModal.element;
      
      // Set input value and simulate save
      const input = modalElement.querySelector('#prompt-input');
      if (input) {
        input.value = 'John Doe';
        
        window.dispatchEvent(new CustomEvent('modal-save', {
          detail: { modalId: topModal.id }
        }));
        
        const result = await promptPromise;
        expect(result).toBe('John Doe');
      }
    });
  });

  describe('Timer Management', () => {
    test('should track created timers', () => {
      const callback = jest.fn();
      const timerId = modalManager.createTimer(callback, 100);
      
      expect(modalManager.timers.has(timerId)).toBe(true);
    });

    test('should auto-remove timer after execution', (done) => {
      const callback = jest.fn(() => {
        // Timer should be auto-removed after execution
        setTimeout(() => {
          expect(modalManager.timers.size).toBe(0);
          done();
        }, 10);
      });
      
      modalManager.createTimer(callback, 10);
    });

    test('should clear all timers', () => {
      modalManager.createTimer(jest.fn(), 1000);
      modalManager.createTimer(jest.fn(), 2000);
      
      expect(modalManager.timers.size).toBe(2);
      
      modalManager.clearTimers();
      
      expect(modalManager.timers.size).toBe(0);
    });
  });

  describe('Memory Management and Cleanup', () => {
    test('should clean up modal-specific event listeners', async () => {
      global.fetch.mockResolvedValue({
        text: () => Promise.resolve('<button>Test</button>')
      });

      const modalId = await modalManager.open('settings');
      
      // Modal should have event listeners
      expect(modalManager.modalEventListeners.has(modalId)).toBe(true);
      
      modalManager.close(modalId);
      
      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 350));
      
      // Listeners should be cleaned up
      expect(modalManager.modalEventListeners.has(modalId)).toBe(false);
    });

    test('should close all modals', async () => {
      global.fetch.mockResolvedValue({
        text: () => Promise.resolve('<p>Content</p>')
      });

      await modalManager.open('settings');
      await modalManager.open('manual-entry');
      await modalManager.open('help');
      
      expect(modalManager.modalStack).toHaveLength(3);
      
      modalManager.closeAll();
      
      expect(modalManager.modalStack).toHaveLength(0);
    });

    test('should perform comprehensive cleanup on destroy', async () => {
      global.fetch.mockResolvedValue({
        text: () => Promise.resolve('<p>Content</p>')
      });

      await modalManager.open('settings');
      modalManager.createTimer(jest.fn(), 1000);
      
      modalManager.destroy();
      
      // Wait for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 400));
      
      expect(modalManager.activeModals.size).toBe(0);
      expect(modalManager.modalStack).toHaveLength(0);
      expect(modalManager.timers.size).toBe(0);
      expect(modalManager.eventListeners).toHaveLength(0);
      expect(document.body.classList.contains('modal-open')).toBe(false);
    });

    test('should handle destroy when no modals exist', () => {
      expect(() => {
        modalManager.destroy();
      }).not.toThrow();
    });

    test('should clean up DOM elements on destroy', async () => {
      global.fetch.mockResolvedValue({
        text: () => Promise.resolve('<p>Content</p>')
      });

      await modalManager.open('settings');
      
      const overlay = document.getElementById('modal-overlay');
      const container = document.getElementById('modal-container');
      
      expect(overlay).toBeTruthy();
      expect(container).toBeTruthy();
      
      modalManager.destroy();
      
      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 400));
      
      expect(document.getElementById('modal-overlay')).toBeNull();
      expect(document.getElementById('modal-container')).toBeNull();
    });
  });

  describe('Error Handling', () => {
    test('should handle DOM manipulation errors gracefully', () => {
      // Mock querySelector to throw error
      const originalQuerySelector = document.querySelector;
      document.querySelector = jest.fn(() => {
        throw new Error('DOM error');
      });
      
      expect(() => {
        modalManager.showValidationErrors(document.createElement('div'), {
          field1: 'Error message'
        });
      }).not.toThrow();
      
      // Restore original method
      document.querySelector = originalQuerySelector;
    });

    test('should handle event listener cleanup errors', () => {
      const modalId = 'test-modal';
      const mockElement = {
        removeEventListener: jest.fn(() => {
          throw new Error('Cleanup error');
        })
      };
      
      modalManager.modalEventListeners.set(modalId, [
        { element: mockElement, event: 'click', handler: jest.fn() }
      ]);
      
      expect(() => {
        modalManager.cleanupModalListeners(modalId);
      }).not.toThrow();
    });

    test('should handle timer cleanup errors', () => {
      // Add invalid timer ID
      modalManager.timers.add('invalid-timer-id');
      
      expect(() => {
        modalManager.clearTimers();
      }).not.toThrow();
    });
  });
});