/**
 * WindowManager Unit Tests
 */

const WindowManager = require('../../../src/main/services/windowManager');
const { mockApp, mockBrowserWindow, mockTray } = require('../../setup');

describe('WindowManager', () => {
  let windowManager;
  let mockStore;
  
  beforeEach(() => {
    mockStore = global.createMockStore({
      'settings.floatingTimerOpacity': 0.9,
      'settings.showFloatingTimer': false
    });
    
    windowManager = new WindowManager(mockApp, mockStore);
  });
  
  afterEach(() => {
    if (windowManager) {
      windowManager.cleanup();
    }
  });
  
  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(windowManager.app).toBe(mockApp);
      expect(windowManager.store).toBe(mockStore);
      expect(windowManager.windows).toEqual({
        main: null,
        splash: null,
        floatingTimer: null,
        help: null,
        characterSheet: null,
        dialogs: expect.any(Set)
      });
    });
    
    it('should initialize tracking structures', () => {
      expect(windowManager.eventListeners).toBeInstanceOf(Map);
      expect(windowManager.dialogMetadata).toBeInstanceOf(WeakMap);
      expect(windowManager.cleanupHandlers).toBeInstanceOf(Set);
    });
  });
  
  describe('createMainWindow', () => {
    it('should create main window with correct options', () => {
      const window = windowManager.createMainWindow();
      
      expect(window).toBeInstanceOf(mockBrowserWindow);
      expect(window.options).toMatchObject({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });
    });
    
    it('should set up event listeners for main window', () => {
      const window = windowManager.createMainWindow();
      
      expect(window.events.has('close')).toBe(true);
      expect(window.events.has('closed')).toBe(true);
      expect(windowManager.eventListeners.has(window.id)).toBe(true);
    });
    
    it('should store window reference', () => {
      const window = windowManager.createMainWindow();
      expect(windowManager.windows.main).toBe(window);
    });
  });
  
  describe('createSplashWindow', () => {
    it('should create splash window with correct dimensions', () => {
      windowManager.createSplashWindow();
      const window = windowManager.windows.splash;
      
      expect(window).toBeInstanceOf(mockBrowserWindow);
      expect(window.options).toMatchObject({
        width: 500,
        height: 600,
        frame: false,
        alwaysOnTop: true
      });
    });
    
    it('should set up closed event listener', () => {
      windowManager.createSplashWindow();
      const window = windowManager.windows.splash;
      
      expect(window.events.has('closed')).toBe(true);
      expect(windowManager.eventListeners.has(window.id)).toBe(true);
    });
  });
  
  describe('createFloatingTimer', () => {
    it('should create floating timer with correct properties', () => {
      const window = windowManager.createFloatingTimer();
      
      expect(window).toBeInstanceOf(mockBrowserWindow);
      expect(window.options).toMatchObject({
        width: 300,
        height: 100,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true
      });
    });
    
    it('should set opacity from settings', () => {
      const window = windowManager.createFloatingTimer();
      expect(window.setOpacity).toHaveBeenCalledWith(0.9);
    });
    
    it('should set up multiple event listeners', () => {
      const window = windowManager.createFloatingTimer();
      
      expect(window.events.has('blur')).toBe(true);
      expect(window.events.has('focus')).toBe(true);
      expect(window.events.has('closed')).toBe(true);
    });
  });
  
  describe('createDialog', () => {
    it('should create dialog with correct type', () => {
      const dialog = windowManager.createDialog('settings');
      
      expect(dialog).toBeInstanceOf(mockBrowserWindow);
      expect(dialog.options).toMatchObject({
        width: 800,
        height: 600,
        modal: true,
        show: false
      });
    });
    
    it('should store dialog in dialogs set', () => {
      const dialog = windowManager.createDialog('settings');
      expect(windowManager.windows.dialogs.has(dialog)).toBe(true);
    });
    
    it('should store metadata in WeakMap', () => {
      const data = { activityId: '123' };
      const dialog = windowManager.createDialog('edit-activity', data);
      
      const metadata = windowManager.dialogMetadata.get(dialog);
      expect(metadata).toMatchObject({
        type: 'edit-activity',
        data
      });
    });
    
    it('should throw error for unknown dialog type', () => {
      expect(() => {
        windowManager.createDialog('unknown-type');
      }).toThrow('Unknown dialog type: unknown-type');
    });
  });
  
  describe('createTray', () => {
    it('should create tray with icon', () => {
      const tray = windowManager.createTray();
      
      expect(tray).toBeInstanceOf(mockTray);
      expect(windowManager.tray).toBe(tray);
    });
    
    it('should set up tray event listeners', () => {
      const tray = windowManager.createTray();
      
      expect(tray.events.has('click')).toBe(true);
      expect(tray.events.has('double-click')).toBe(true);
    });
    
    it('should register cleanup handler', () => {
      const initialSize = windowManager.cleanupHandlers.size;
      windowManager.createTray();
      
      expect(windowManager.cleanupHandlers.size).toBe(initialSize + 1);
    });
  });
  
  describe('event listener management', () => {
    it('should track event listeners for cleanup', () => {
      const window = global.createMockWindow();
      const handler = jest.fn();
      
      windowManager.addWindowListener(window, 'test-event', handler);
      
      expect(windowManager.eventListeners.has(window.id)).toBe(true);
      expect(window.events.has('test-event')).toBe(true);
    });
    
    it('should remove tracked event listeners', () => {
      const window = global.createMockWindow();
      const handler = jest.fn();
      
      windowManager.addWindowListener(window, 'test-event', handler);
      windowManager.removeWindowListeners(window);
      
      expect(windowManager.eventListeners.has(window.id)).toBe(false);
    });
    
    it('should handle destroyed windows gracefully', () => {
      const window = global.createMockWindow();
      window.isDestroyed = () => true;
      
      expect(() => {
        windowManager.addWindowListener(window, 'test-event', jest.fn());
      }).not.toThrow();
    });
  });
  
  describe('window destruction', () => {
    it('should destroy window and clean up resources', () => {
      const window = windowManager.createMainWindow();
      const windowId = window.id;
      
      windowManager.destroyWindow('main');
      
      expect(window.destroy).toHaveBeenCalled();
      expect(windowManager.windows.main).toBe(null);
      expect(windowManager.eventListeners.has(windowId)).toBe(false);
    });
    
    it('should handle non-existent windows gracefully', () => {
      expect(() => {
        windowManager.destroyWindow('nonexistent');
      }).not.toThrow();
    });
  });
  
  describe('cleanup', () => {
    it('should execute all cleanup handlers', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      windowManager.registerCleanupHandler(handler1);
      windowManager.registerCleanupHandler(handler2);
      
      windowManager.cleanup();
      
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(windowManager.cleanupHandlers.size).toBe(0);
    });
    
    it('should close all dialogs', () => {
      const dialog1 = windowManager.createDialog('settings');
      const dialog2 = windowManager.createDialog('manual-entry');
      
      windowManager.cleanup();
      
      expect(dialog1.close).toHaveBeenCalled();
      expect(dialog2.close).toHaveBeenCalled();
      expect(windowManager.windows.dialogs.size).toBe(0);
    });
    
    it('should destroy tray if it exists', () => {
      const tray = windowManager.createTray();
      
      windowManager.cleanup();
      
      expect(tray.destroy).toHaveBeenCalled();
      expect(windowManager.tray).toBe(null);
    });
    
    it('should clear all event listeners', () => {
      windowManager.createMainWindow();
      windowManager.createSplashWindow();
      
      const initialListeners = windowManager.eventListeners.size;
      expect(initialListeners).toBeGreaterThan(0);
      
      windowManager.cleanup();
      
      expect(windowManager.eventListeners.size).toBe(0);
    });
    
    it('should handle cleanup errors gracefully', () => {
      const faultyHandler = jest.fn(() => {
        throw new Error('Cleanup error');
      });
      
      windowManager.registerCleanupHandler(faultyHandler);
      
      expect(() => {
        windowManager.cleanup();
      }).not.toThrow();
      
      expect(faultyHandler).toHaveBeenCalled();
    });
  });
  
  describe('memory leak prevention', () => {
    it('should use WeakMap for dialog metadata', () => {
      const dialog = windowManager.createDialog('settings');
      
      // WeakMap should not prevent garbage collection
      expect(windowManager.dialogMetadata).toBeInstanceOf(WeakMap);
    });
    
    it('should clear window references on close', () => {
      const window = windowManager.createMainWindow();
      
      // Simulate window close event
      const closeHandler = window.events.get('closed')[0];
      closeHandler();
      
      expect(windowManager.windows.main).toBe(null);
    });
    
    it('should remove dialog from set on close', () => {
      const dialog = windowManager.createDialog('settings');
      
      // Simulate dialog close event
      const closeHandler = dialog.events.get('closed')[0];
      closeHandler();
      
      expect(windowManager.windows.dialogs.has(dialog)).toBe(false);
    });
  });
});