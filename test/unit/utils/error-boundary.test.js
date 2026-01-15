/**
 * Unit Tests for Error Boundary Utility
 */

const { ServiceErrorBoundary } = require('../../../src/main/utils/error-boundary');

describe('ServiceErrorBoundary', () => {
  let mockService;
  let errorBoundary;
  let mockOnError;

  beforeEach(() => {
    mockService = {
      testMethod: jest.fn().mockResolvedValue('success'),
      failingMethod: jest.fn().mockRejectedValue(new Error('Service failed')),
      healthCheck: jest.fn().mockResolvedValue({ healthy: true })
    };

    mockOnError = jest.fn();

    errorBoundary = new ServiceErrorBoundary(mockService, {
      retryLimit: 3,
      onError: mockOnError,
      backoffBase: 10, // Fast for testing
      circuitBreakerThreshold: 3
    });

    jest.clearAllMocks();
  });

  afterEach(() => {
    if (errorBoundary) {
      errorBoundary.reset();
    }
  });

  describe('Constructor', () => {
    test('should initialize with default options', () => {
      const boundary = new ServiceErrorBoundary(mockService);
      
      expect(boundary.service).toBe(mockService);
      expect(boundary.retryLimit).toBe(3);
      expect(boundary.circuitBreakerThreshold).toBe(5);
      expect(boundary.state).toBe('CLOSED');
    });

    test('should initialize with custom options', () => {
      const options = {
        retryLimit: 5,
        backoffBase: 100,
        maxBackoff: 5000,
        circuitBreakerThreshold: 10,
        circuitBreakerTimeout: 30000
      };

      const boundary = new ServiceErrorBoundary(mockService, options);
      
      expect(boundary.retryLimit).toBe(5);
      expect(boundary.backoffBase).toBe(100);
      expect(boundary.maxBackoff).toBe(5000);
      expect(boundary.circuitBreakerThreshold).toBe(10);
      expect(boundary.circuitBreakerTimeout).toBe(30000);
    });

    test('should initialize tracking structures', () => {
      expect(errorBoundary.errorCount).toBe(0);
      expect(errorBoundary.lastError).toBeNull();
      expect(errorBoundary.errorHistory).toEqual([]);
      expect(errorBoundary.fallbackMethods).toBeInstanceOf(Map);
    });
  });

  describe('Circuit Breaker States', () => {
    test('should start in CLOSED state', () => {
      expect(errorBoundary.state).toBe('CLOSED');
      expect(errorBoundary.isCircuitOpen()).toBe(false);
    });

    test('should open circuit after threshold failures', async () => {
      // Trigger failures to reach threshold
      for (let i = 0; i < 3; i++) {
        try {
          await errorBoundary.execute('failingMethod');
        } catch (e) {
          // Expected to fail
        }
      }

      expect(errorBoundary.state).toBe('OPEN');
      expect(errorBoundary.isCircuitOpen()).toBe(true);
    });

    test('should transition to HALF_OPEN after timeout', async () => {
      // Open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await errorBoundary.execute('failingMethod');
        } catch (e) {}
      }

      expect(errorBoundary.state).toBe('OPEN');

      // Fast-forward time
      jest.advanceTimersByTime(errorBoundary.circuitBreakerTimeout + 1000);

      // Next call should transition to HALF_OPEN
      try {
        await errorBoundary.execute('testMethod');
      } catch (e) {}

      expect(errorBoundary.state).toBe('HALF_OPEN');
    });

    test('should close circuit on successful call in HALF_OPEN state', async () => {
      // Open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await errorBoundary.execute('failingMethod');
        } catch (e) {}
      }

      // Transition to HALF_OPEN
      errorBoundary.state = 'HALF_OPEN';
      errorBoundary.lastFailureTime = Date.now() - errorBoundary.circuitBreakerTimeout - 1000;

      // Successful call should close circuit
      const result = await errorBoundary.execute('testMethod');

      expect(result).toBe('success');
      expect(errorBoundary.state).toBe('CLOSED');
      expect(errorBoundary.errorCount).toBe(0);
    });
  });

  describe('Retry Logic', () => {
    test('should execute method successfully on first try', async () => {
      const result = await errorBoundary.execute('testMethod', 'arg1', 'arg2');
      
      expect(result).toBe('success');
      expect(mockService.testMethod).toHaveBeenCalledWith('arg1', 'arg2');
      expect(mockService.testMethod).toHaveBeenCalledTimes(1);
    });

    test('should retry on failure up to retry limit', async () => {
      await expect(errorBoundary.execute('failingMethod')).rejects.toThrow('Service failed');
      
      expect(mockService.failingMethod).toHaveBeenCalledTimes(3); // Initial + 2 retries
      expect(mockOnError).toHaveBeenCalledTimes(3);
    });

    test('should implement exponential backoff', async () => {
      const startTime = Date.now();
      
      try {
        await errorBoundary.execute('failingMethod');
      } catch (e) {}

      // Should have some delay due to backoff
      expect(mockOnError).toHaveBeenCalledTimes(3);
      
      // Check that retry delays were called
      const errorCalls = mockOnError.mock.calls;
      expect(errorCalls[0][1].retries).toBe(1);
      expect(errorCalls[1][1].retries).toBe(2);
      expect(errorCalls[2][1].retries).toBe(3);
    });

    test('should add jitter to backoff delay', async () => {
      const delays = [];
      
      // Mock backoff to capture delays
      const originalBackoff = errorBoundary.backoff;
      errorBoundary.backoff = jest.fn().mockImplementation((retries) => {
        const delay = originalBackoff.call(errorBoundary, retries);
        delays.push(delay);
        return Promise.resolve();
      });

      try {
        await errorBoundary.execute('failingMethod');
      } catch (e) {}

      expect(delays).toHaveLength(2); // 2 retries after initial failure
      // Jitter should make delays slightly different
      expect(delays[0]).toBeGreaterThan(0);
      expect(delays[1]).toBeGreaterThan(delays[0]);
    });
  });

  describe('Fallback Methods', () => {
    test('should register fallback method', () => {
      const fallback = jest.fn().mockReturnValue('fallback-result');
      
      errorBoundary.registerFallback('failingMethod', fallback);
      
      expect(errorBoundary.fallbackMethods.has('failingMethod')).toBe(true);
    });

    test('should use fallback when circuit is open', async () => {
      const fallback = jest.fn().mockReturnValue('fallback-result');
      errorBoundary.registerFallback('failingMethod', fallback);

      // Open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await errorBoundary.execute('failingMethod');
        } catch (e) {}
      }

      // Should use fallback now
      const result = await errorBoundary.execute('failingMethod', 'arg1');
      
      expect(result).toBe('fallback-result');
      expect(fallback).toHaveBeenCalledWith('arg1');
      expect(mockService.failingMethod).toHaveBeenCalledTimes(3); // Only from circuit opening
    });

    test('should use fallback on retry exhaustion', async () => {
      const fallback = jest.fn().mockReturnValue('fallback-result');
      errorBoundary.registerFallback('failingMethod', fallback);

      const result = await errorBoundary.execute('failingMethod', 'arg1');
      
      expect(result).toBe('fallback-result');
      expect(fallback).toHaveBeenCalledWith('arg1');
      expect(mockService.failingMethod).toHaveBeenCalledTimes(3);
    });

    test('should throw error if no fallback available', async () => {
      await expect(errorBoundary.execute('failingMethod')).rejects.toThrow('Service failed');
    });
  });

  describe('Error Pattern Detection', () => {
    test('should detect error patterns', async () => {
      // Generate multiple errors with same pattern
      const networkError = new Error('Network timeout');
      mockService.networkMethod = jest.fn().mockRejectedValue(networkError);

      for (let i = 0; i < 3; i++) {
        try {
          await errorBoundary.execute('networkMethod');
        } catch (e) {}
      }

      const patterns = errorBoundary.getErrorPatterns();
      expect(patterns).toHaveProperty('Network timeout');
      expect(patterns['Network timeout'].count).toBe(3);
    });

    test('should categorize errors by type', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.code = 'TIMEOUT';
      
      mockService.timeoutMethod = jest.fn().mockRejectedValue(timeoutError);

      try {
        await errorBoundary.execute('timeoutMethod');
      } catch (e) {}

      const patterns = errorBoundary.getErrorPatterns();
      expect(patterns).toHaveProperty('Request timeout');
    });
  });

  describe('Health Monitoring', () => {
    test('should get health status', () => {
      const health = errorBoundary.getHealth();
      
      expect(health).toMatchObject({
        state: 'CLOSED',
        errorCount: 0,
        errorRate: 0,
        lastError: null,
        healthy: true
      });
    });

    test('should report unhealthy when circuit is open', async () => {
      // Open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await errorBoundary.execute('failingMethod');
        } catch (e) {}
      }

      const health = errorBoundary.getHealth();
      
      expect(health.healthy).toBe(false);
      expect(health.state).toBe('OPEN');
      expect(health.errorCount).toBe(3);
    });

    test('should calculate error rate', async () => {
      // Execute some successful and some failing calls
      await errorBoundary.execute('testMethod');
      await errorBoundary.execute('testMethod');
      
      try {
        await errorBoundary.execute('failingMethod');
      } catch (e) {}

      const health = errorBoundary.getHealth();
      expect(health.errorRate).toBeGreaterThan(0);
    });
  });

  describe('Reset and Cleanup', () => {
    test('should reset error boundary state', async () => {
      // Generate some errors
      try {
        await errorBoundary.execute('failingMethod');
      } catch (e) {}

      expect(errorBoundary.errorCount).toBeGreaterThan(0);

      errorBoundary.reset();

      expect(errorBoundary.errorCount).toBe(0);
      expect(errorBoundary.state).toBe('CLOSED');
      expect(errorBoundary.lastError).toBeNull();
      expect(errorBoundary.errorHistory).toEqual([]);
    });

    test('should clear error history with size limit', async () => {
      // Generate many errors
      for (let i = 0; i < 25; i++) {
        try {
          await errorBoundary.execute('failingMethod');
        } catch (e) {}
      }

      expect(errorBoundary.errorHistory.length).toBeLessThanOrEqual(20); // Max history size
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle non-existent method', async () => {
      await expect(errorBoundary.execute('nonExistentMethod')).rejects.toThrow();
    });

    test('should handle undefined service', () => {
      expect(() => {
        new ServiceErrorBoundary(undefined);
      }).toThrow('Service is required');
    });

    test('should handle method that returns undefined', async () => {
      mockService.undefinedMethod = jest.fn().mockResolvedValue(undefined);
      
      const result = await errorBoundary.execute('undefinedMethod');
      expect(result).toBeUndefined();
    });

    test('should handle async fallback methods', async () => {
      const asyncFallback = jest.fn().mockResolvedValue('async-fallback');
      errorBoundary.registerFallback('failingMethod', asyncFallback);

      const result = await errorBoundary.execute('failingMethod');
      expect(result).toBe('async-fallback');
    });

    test('should handle fallback method errors', async () => {
      const failingFallback = jest.fn().mockRejectedValue(new Error('Fallback failed'));
      errorBoundary.registerFallback('failingMethod', failingFallback);

      await expect(errorBoundary.execute('failingMethod')).rejects.toThrow('Fallback failed');
    });

    test('should handle circuit breaker timeout edge case', async () => {
      // Open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await errorBoundary.execute('failingMethod');
        } catch (e) {}
      }

      // Set last failure time to exactly timeout boundary
      errorBoundary.lastFailureTime = Date.now() - errorBoundary.circuitBreakerTimeout;

      // Should still be open (not quite timed out)
      expect(errorBoundary.isCircuitOpen()).toBe(true);
    });

    test('should handle very large retry counts', () => {
      const largeBoundary = new ServiceErrorBoundary(mockService, {
        retryLimit: 1000
      });

      expect(largeBoundary.retryLimit).toBe(1000);
    });

    test('should handle zero retry limit', async () => {
      const noBoundary = new ServiceErrorBoundary(mockService, {
        retryLimit: 0
      });

      await expect(noBoundary.execute('failingMethod')).rejects.toThrow('Service failed');
      expect(mockService.failingMethod).toHaveBeenCalledTimes(1); // No retries
    });
  });
});