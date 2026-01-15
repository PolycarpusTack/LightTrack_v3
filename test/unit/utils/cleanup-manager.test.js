/**
 * Unit Tests for CleanupManager Utility
 */

const CleanupManager = require('../../../src/main/utils/cleanup-manager');

describe('CleanupManager', () => {
  let cleanupManager;

  beforeEach(() => {
    cleanupManager = new CleanupManager();
  });

  afterEach(() => {
    if (cleanupManager) {
      cleanupManager.cleanup();
    }
  });

  describe('Constructor', () => {
    test('should initialize with empty cleanup tasks', () => {
      expect(cleanupManager.cleanupTasks).toBeInstanceOf(Map);
      expect(cleanupManager.cleanupTasks.size).toBe(0);
      expect(cleanupManager.cleanupOrder).toEqual([]);
    });

    test('should initialize priority levels', () => {
      expect(cleanupManager.priorities).toEqual({
        CRITICAL: 1,
        HIGH: 2,
        NORMAL: 3,
        LOW: 4
      });
    });
  });

  describe('Task Registration', () => {
    test('should register cleanup task with default priority', () => {
      const cleanupFn = jest.fn();
      
      cleanupManager.register('test-task', cleanupFn);
      
      expect(cleanupManager.cleanupTasks.has('test-task')).toBe(true);
      const task = cleanupManager.cleanupTasks.get('test-task');
      expect(task.cleanup).toBe(cleanupFn);
      expect(task.priority).toBe(cleanupManager.priorities.NORMAL);
    });

    test('should register cleanup task with custom priority', () => {
      const cleanupFn = jest.fn();
      
      cleanupManager.register('critical-task', cleanupFn, cleanupManager.priorities.CRITICAL);
      
      const task = cleanupManager.cleanupTasks.get('critical-task');
      expect(task.priority).toBe(cleanupManager.priorities.CRITICAL);
    });

    test('should replace existing task when registering with same ID', () => {
      const oldCleanupFn = jest.fn();
      const newCleanupFn = jest.fn();
      
      cleanupManager.register('task', oldCleanupFn);
      cleanupManager.register('task', newCleanupFn);
      
      const task = cleanupManager.cleanupTasks.get('task');
      expect(task.cleanup).toBe(newCleanupFn);
      expect(cleanupManager.cleanupTasks.size).toBe(1);
    });

    test('should track registration time', () => {
      const cleanupFn = jest.fn();
      const beforeTime = Date.now();
      
      cleanupManager.register('timed-task', cleanupFn);
      
      const task = cleanupManager.cleanupTasks.get('timed-task');
      expect(task.registeredAt).toBeGreaterThanOrEqual(beforeTime);
      expect(task.registeredAt).toBeLessThanOrEqual(Date.now());
    });

    test('should maintain cleanup order', () => {
      cleanupManager.register('task1', jest.fn());
      cleanupManager.register('task2', jest.fn());
      cleanupManager.register('task3', jest.fn());
      
      expect(cleanupManager.cleanupOrder).toEqual(['task1', 'task2', 'task3']);
    });
  });

  describe('Task Execution', () => {
    test('should execute single cleanup task', () => {
      const cleanupFn = jest.fn();
      cleanupManager.register('test-task', cleanupFn);
      
      cleanupManager.cleanup('test-task');
      
      expect(cleanupFn).toHaveBeenCalledTimes(1);
      expect(cleanupManager.cleanupTasks.has('test-task')).toBe(false);
    });

    test('should handle non-existent task gracefully', () => {
      expect(() => {
        cleanupManager.cleanup('non-existent');
      }).not.toThrow();
    });

    test('should execute cleanup tasks in priority order', () => {
      const executionOrder = [];
      
      const normalTask = jest.fn(() => executionOrder.push('normal'));
      const criticalTask = jest.fn(() => executionOrder.push('critical'));
      const highTask = jest.fn(() => executionOrder.push('high'));
      const lowTask = jest.fn(() => executionOrder.push('low'));
      
      cleanupManager.register('normal', normalTask, cleanupManager.priorities.NORMAL);
      cleanupManager.register('critical', criticalTask, cleanupManager.priorities.CRITICAL);
      cleanupManager.register('high', highTask, cleanupManager.priorities.HIGH);
      cleanupManager.register('low', lowTask, cleanupManager.priorities.LOW);
      
      cleanupManager.cleanupAll();
      
      expect(executionOrder).toEqual(['critical', 'high', 'normal', 'low']);
    });

    test('should execute tasks in registration order within same priority', () => {
      const executionOrder = [];
      
      const task1 = jest.fn(() => executionOrder.push('task1'));
      const task2 = jest.fn(() => executionOrder.push('task2'));
      const task3 = jest.fn(() => executionOrder.push('task3'));
      
      cleanupManager.register('task1', task1, cleanupManager.priorities.NORMAL);
      cleanupManager.register('task2', task2, cleanupManager.priorities.NORMAL);
      cleanupManager.register('task3', task3, cleanupManager.priorities.NORMAL);
      
      cleanupManager.cleanupAll();
      
      expect(executionOrder).toEqual(['task1', 'task2', 'task3']);
    });

    test('should handle cleanup function errors gracefully', () => {
      const errorTask = jest.fn(() => {
        throw new Error('Cleanup failed');
      });
      const normalTask = jest.fn();
      
      cleanupManager.register('error-task', errorTask);
      cleanupManager.register('normal-task', normalTask);
      
      expect(() => {
        cleanupManager.cleanupAll();
      }).not.toThrow();
      
      expect(errorTask).toHaveBeenCalled();
      expect(normalTask).toHaveBeenCalled();
    });

    test('should clear all tasks after cleanup', () => {
      cleanupManager.register('task1', jest.fn());
      cleanupManager.register('task2', jest.fn());
      
      cleanupManager.cleanupAll();
      
      expect(cleanupManager.cleanupTasks.size).toBe(0);
      expect(cleanupManager.cleanupOrder).toEqual([]);
    });
  });

  describe('Task Management', () => {
    test('should unregister tasks', () => {
      const cleanupFn = jest.fn();
      cleanupManager.register('test-task', cleanupFn);
      
      const success = cleanupManager.unregister('test-task');
      
      expect(success).toBe(true);
      expect(cleanupManager.cleanupTasks.has('test-task')).toBe(false);
      expect(cleanupManager.cleanupOrder).not.toContain('test-task');
    });

    test('should return false when unregistering non-existent task', () => {
      const success = cleanupManager.unregister('non-existent');
      expect(success).toBe(false);
    });

    test('should check if task is registered', () => {
      cleanupManager.register('test-task', jest.fn());
      
      expect(cleanupManager.isRegistered('test-task')).toBe(true);
      expect(cleanupManager.isRegistered('non-existent')).toBe(false);
    });

    test('should get task count', () => {
      expect(cleanupManager.getTaskCount()).toBe(0);
      
      cleanupManager.register('task1', jest.fn());
      cleanupManager.register('task2', jest.fn());
      
      expect(cleanupManager.getTaskCount()).toBe(2);
    });

    test('should get registered task IDs', () => {
      cleanupManager.register('task1', jest.fn());
      cleanupManager.register('task2', jest.fn());
      
      const taskIds = cleanupManager.getRegisteredTasks();
      expect(taskIds).toEqual(expect.arrayContaining(['task1', 'task2']));
      expect(taskIds).toHaveLength(2);
    });
  });

  describe('Task Information', () => {
    test('should get task info', () => {
      const cleanupFn = jest.fn();
      const beforeTime = Date.now();
      
      cleanupManager.register('test-task', cleanupFn, cleanupManager.priorities.HIGH);
      
      const info = cleanupManager.getTaskInfo('test-task');
      
      expect(info).toMatchObject({
        id: 'test-task',
        priority: cleanupManager.priorities.HIGH,
        cleanup: cleanupFn
      });
      expect(info.registeredAt).toBeGreaterThanOrEqual(beforeTime);
    });

    test('should return null for non-existent task info', () => {
      const info = cleanupManager.getTaskInfo('non-existent');
      expect(info).toBeNull();
    });

    test('should get tasks by priority', () => {
      cleanupManager.register('critical1', jest.fn(), cleanupManager.priorities.CRITICAL);
      cleanupManager.register('normal1', jest.fn(), cleanupManager.priorities.NORMAL);
      cleanupManager.register('critical2', jest.fn(), cleanupManager.priorities.CRITICAL);
      
      const criticalTasks = cleanupManager.getTasksByPriority(cleanupManager.priorities.CRITICAL);
      expect(criticalTasks).toHaveLength(2);
      expect(criticalTasks.map(t => t.id)).toEqual(expect.arrayContaining(['critical1', 'critical2']));
    });
  });

  describe('Priority Management', () => {
    test('should update task priority', () => {
      cleanupManager.register('test-task', jest.fn(), cleanupManager.priorities.NORMAL);
      
      const success = cleanupManager.updatePriority('test-task', cleanupManager.priorities.CRITICAL);
      
      expect(success).toBe(true);
      const task = cleanupManager.cleanupTasks.get('test-task');
      expect(task.priority).toBe(cleanupManager.priorities.CRITICAL);
    });

    test('should return false when updating priority of non-existent task', () => {
      const success = cleanupManager.updatePriority('non-existent', cleanupManager.priorities.HIGH);
      expect(success).toBe(false);
    });

    test('should maintain order after priority update', () => {
      const executionOrder = [];
      
      cleanupManager.register('task1', () => executionOrder.push('task1'), cleanupManager.priorities.NORMAL);
      cleanupManager.register('task2', () => executionOrder.push('task2'), cleanupManager.priorities.NORMAL);
      
      // Update task2 to critical priority
      cleanupManager.updatePriority('task2', cleanupManager.priorities.CRITICAL);
      
      cleanupManager.cleanupAll();
      
      // task2 should execute first due to critical priority
      expect(executionOrder).toEqual(['task2', 'task1']);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle null cleanup function', () => {
      expect(() => {
        cleanupManager.register('null-task', null);
      }).toThrow('Cleanup function is required');
    });

    test('should handle undefined cleanup function', () => {
      expect(() => {
        cleanupManager.register('undefined-task', undefined);
      }).toThrow('Cleanup function is required');
    });

    test('should handle non-function cleanup parameter', () => {
      expect(() => {
        cleanupManager.register('string-task', 'not-a-function');
      }).toThrow('Cleanup function must be a function');
    });

    test('should handle empty task ID', () => {
      expect(() => {
        cleanupManager.register('', jest.fn());
      }).toThrow('Task ID is required');
    });

    test('should handle invalid priority values', () => {
      expect(() => {
        cleanupManager.register('invalid-priority', jest.fn(), 999);
      }).not.toThrow(); // Should use the provided priority even if not in enum
    });

    test('should handle concurrent access gracefully', () => {
      const task1 = jest.fn();
      const task2 = jest.fn();
      
      cleanupManager.register('task1', task1);
      cleanupManager.register('task2', task2);
      
      // Simulate concurrent cleanup calls
      Promise.all([
        Promise.resolve(cleanupManager.cleanupAll()),
        Promise.resolve(cleanupManager.cleanupAll())
      ]);
      
      // Tasks should only be called once
      expect(task1).toHaveBeenCalledTimes(1);
      expect(task2).toHaveBeenCalledTimes(1);
    });
  });

  describe('Memory Management', () => {
    test('should clear all internal state on cleanup', () => {
      cleanupManager.register('task1', jest.fn());
      cleanupManager.register('task2', jest.fn());
      
      cleanupManager.cleanupAll();
      
      expect(cleanupManager.cleanupTasks.size).toBe(0);
      expect(cleanupManager.cleanupOrder).toEqual([]);
    });

    test('should not leak memory with repeated registrations', () => {
      // Register many tasks to test memory handling
      for (let i = 0; i < 1000; i++) {
        cleanupManager.register(`task-${i}`, jest.fn());
      }
      
      expect(cleanupManager.getTaskCount()).toBe(1000);
      
      cleanupManager.cleanupAll();
      
      expect(cleanupManager.getTaskCount()).toBe(0);
    });

    test('should handle task replacement without memory leaks', () => {
      const originalTask = jest.fn();
      const replacementTask = jest.fn();
      
      cleanupManager.register('replaceable-task', originalTask);
      cleanupManager.register('replaceable-task', replacementTask);
      
      cleanupManager.cleanupAll();
      
      expect(originalTask).not.toHaveBeenCalled();
      expect(replacementTask).toHaveBeenCalledTimes(1);
    });
  });
});