/**
 * Rate Limiter Unit Tests
 */

const RateLimiter = require('../../../src/main/security/rate-limiter');

describe('RateLimiter', () => {
  let rateLimiter;
  
  beforeEach(() => {
    rateLimiter = new RateLimiter({
      defaultLimit: 10,
      defaultWindow: 60000, // 1 minute
      burstLimit: 20,
      burstWindow: 5000, // 5 seconds
      adaptive: true
    });
  });
  
  afterEach(() => {
    if (rateLimiter) {
      rateLimiter.destroy();
    }
  });
  
  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(rateLimiter.options.defaultLimit).toBe(10);
      expect(rateLimiter.options.defaultWindow).toBe(60000);
      expect(rateLimiter.store).toBeInstanceOf(Map);
      expect(rateLimiter.configs).toBeInstanceOf(Map);
    });
    
    it('should set up cleanup interval', () => {
      expect(rateLimiter.cleanupInterval).toBeDefined();
    });
  });
  
  describe('sliding window rate limiting', () => {
    it('should allow requests within limit', () => {
      const key = 'test-user-1';
      const config = { limit: 5, window: 60000 };
      
      for (let i = 0; i < 5; i++) {
        const result = rateLimiter.checkSlidingWindow(key, config, Date.now());
        expect(result.allowed).toBe(true);
      }
    });
    
    it('should block requests exceeding limit', () => {
      const key = 'test-user-2';
      const config = { limit: 3, window: 60000 };
      const now = Date.now();
      
      // Use up the limit
      for (let i = 0; i < 3; i++) {
        rateLimiter.checkSlidingWindow(key, config, now);
      }
      
      // Next request should be blocked
      const result = rateLimiter.checkSlidingWindow(key, config, now);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('rate_limit_exceeded');
    });
    
    it('should allow requests after window expires', () => {
      const key = 'test-user-3';
      const config = { limit: 2, window: 1000 }; // 1 second window
      const baseTime = Date.now();
      
      // Use up the limit
      rateLimiter.checkSlidingWindow(key, config, baseTime);
      rateLimiter.checkSlidingWindow(key, config, baseTime);
      
      // Should be blocked
      let result = rateLimiter.checkSlidingWindow(key, config, baseTime);
      expect(result.allowed).toBe(false);
      
      // After window expires, should be allowed
      result = rateLimiter.checkSlidingWindow(key, config, baseTime + 1100);
      expect(result.allowed).toBe(true);
    });
  });
  
  describe('token bucket rate limiting', () => {
    it('should allow requests when tokens available', () => {
      const key = 'bucket-user-1';
      const config = { 
        limit: 5, 
        window: 60000, 
        algorithm: 'token_bucket',
        refillRate: 1 
      };
      
      for (let i = 0; i < 5; i++) {
        const result = rateLimiter.checkTokenBucket(key, config, Date.now());
        expect(result.allowed).toBe(true);
      }
    });
    
    it('should block when no tokens available', () => {
      const key = 'bucket-user-2';
      const config = { 
        limit: 2, 
        window: 60000, 
        algorithm: 'token_bucket',
        refillRate: 0.1 
      };
      const now = Date.now();
      
      // Use up tokens
      rateLimiter.checkTokenBucket(key, config, now);
      rateLimiter.checkTokenBucket(key, config, now);
      
      // Should be blocked
      const result = rateLimiter.checkTokenBucket(key, config, now);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('rate_limit_exceeded');
    });
    
    it('should refill tokens over time', () => {
      const key = 'bucket-user-3';
      const config = { 
        limit: 3, 
        window: 60000, 
        algorithm: 'token_bucket',
        refillRate: 2 // 2 tokens per second
      };
      const baseTime = Date.now();
      
      // Use up tokens
      rateLimiter.checkTokenBucket(key, config, baseTime);
      rateLimiter.checkTokenBucket(key, config, baseTime);
      rateLimiter.checkTokenBucket(key, config, baseTime);
      
      // Should be blocked
      let result = rateLimiter.checkTokenBucket(key, config, baseTime);
      expect(result.allowed).toBe(false);
      
      // After 1 second, should have 2 new tokens
      result = rateLimiter.checkTokenBucket(key, config, baseTime + 1000);
      expect(result.allowed).toBe(true);
    });
  });
  
  describe('adaptive rate limiting', () => {
    it('should reduce limits when errors detected', () => {
      const key = 'adaptive-user-1';
      const config = { 
        limit: 10, 
        window: 60000, 
        adaptive: true 
      };
      
      // Simulate error conditions
      for (let i = 0; i < 5; i++) {
        rateLimiter.reportError(key, 'validation_error');
      }
      
      const result = rateLimiter.checkAdaptive(key, config, Date.now());
      expect(result.adaptiveLimit).toBeLessThan(config.limit);
    });
    
    it('should increase limits when performance is good', () => {
      const key = 'adaptive-user-2';
      const config = { 
        limit: 5, 
        window: 60000, 
        adaptive: true 
      };
      
      // Simulate good performance
      for (let i = 0; i < 10; i++) {
        rateLimiter.reportSuccess(key);
      }
      
      const result = rateLimiter.checkAdaptive(key, config, Date.now());
      expect(result.adaptiveLimit).toBeGreaterThan(config.limit);
    });
    
    it('should cap adaptive limits', () => {
      const key = 'adaptive-user-3';
      const config = { 
        limit: 10, 
        window: 60000, 
        adaptive: true,
        maxAdaptiveMultiplier: 2
      };
      
      // Simulate excellent performance
      for (let i = 0; i < 100; i++) {
        rateLimiter.reportSuccess(key);
      }
      
      const result = rateLimiter.checkAdaptive(key, config, Date.now());
      expect(result.adaptiveLimit).toBeLessThanOrEqual(config.limit * 2);
    });
  });
  
  describe('middleware', () => {
    it('should create middleware function', () => {
      const middleware = rateLimiter.middleware();
      
      expect(typeof middleware).toBe('function');
    });
    
    it('should allow requests within limits', () => {
      const middleware = rateLimiter.middleware({
        keyGenerator: (endpoint, data, context) => context.sessionId || 'anonymous'
      });
      
      const data = { test: 'data' };
      const context = { sessionId: 'test-session' };
      
      for (let i = 0; i < 5; i++) {
        const result = middleware('test:endpoint', data, context);
        expect(result).toBeDefined();
      }
    });
    
    it('should block requests exceeding limits', () => {
      const middleware = rateLimiter.middleware({
        keyGenerator: (endpoint, data, context) => context.sessionId || 'anonymous'
      });
      
      const data = { test: 'data' };
      const context = { sessionId: 'blocked-session' };
      
      // Use up the default limit
      for (let i = 0; i < 10; i++) {
        middleware('test:endpoint', data, context);
      }
      
      // Next request should be blocked
      expect(() => {
        middleware('test:endpoint', data, context);
      }).toThrow('Rate limit exceeded');
    });
    
    it('should use endpoint-specific configuration', () => {
      rateLimiter.setEndpointConfig('special:endpoint', {
        limit: 2,
        window: 60000
      });
      
      const middleware = rateLimiter.middleware();
      const context = { sessionId: 'special-session' };
      
      // Should only allow 2 requests
      middleware('special:endpoint', {}, context);
      middleware('special:endpoint', {}, context);
      
      expect(() => {
        middleware('special:endpoint', {}, context);
      }).toThrow('Rate limit exceeded');
    });
    
    it('should include rate limit headers', () => {
      const middleware = rateLimiter.middleware({
        includeHeaders: true
      });
      
      const context = { sessionId: 'header-session' };
      const result = middleware('test:endpoint', {}, context);
      
      expect(result.rateLimitHeaders).toBeDefined();
      expect(result.rateLimitHeaders['X-RateLimit-Limit']).toBeDefined();
      expect(result.rateLimitHeaders['X-RateLimit-Remaining']).toBeDefined();
    });
  });
  
  describe('configuration management', () => {
    it('should set endpoint-specific configuration', () => {
      const config = { limit: 50, window: 300000 };
      
      rateLimiter.setEndpointConfig('high-volume:endpoint', config);
      
      const storedConfig = rateLimiter.configs.get('high-volume:endpoint');
      expect(storedConfig).toEqual(config);
    });
    
    it('should support pattern-based configuration', () => {
      rateLimiter.setEndpointConfig('api:*', { limit: 100, window: 60000 });
      
      const config = rateLimiter.getConfigForEndpoint('api:users:list');
      expect(config.limit).toBe(100);
    });
    
    it('should handle configuration inheritance', () => {
      rateLimiter.setEndpointConfig('api:*', { limit: 100, window: 60000 });
      rateLimiter.setEndpointConfig('api:admin:*', { limit: 50, window: 60000 });
      
      const generalConfig = rateLimiter.getConfigForEndpoint('api:users:list');
      const adminConfig = rateLimiter.getConfigForEndpoint('api:admin:delete');
      
      expect(generalConfig.limit).toBe(100);
      expect(adminConfig.limit).toBe(50);
    });
  });
  
  describe('burst protection', () => {
    it('should detect burst patterns', () => {
      const key = 'burst-user';
      const config = { 
        limit: 10, 
        window: 60000,
        burstLimit: 5,
        burstWindow: 1000
      };
      const baseTime = Date.now();
      
      // Send burst requests
      for (let i = 0; i < 6; i++) {
        rateLimiter.checkSlidingWindow(key, config, baseTime + i * 100);
      }
      
      const burstDetected = rateLimiter.detectBurst(key, config, baseTime + 600);
      expect(burstDetected).toBe(true);
    });
    
    it('should apply burst penalties', () => {
      const key = 'penalty-user';
      
      // Trigger burst detection
      rateLimiter.applyBurstPenalty(key, 2); // 2x penalty
      
      const penalty = rateLimiter.getBurstPenalty(key);
      expect(penalty.multiplier).toBe(2);
    });
  });
  
  describe('statistics and monitoring', () => {
    it('should track rate limiting statistics', () => {
      const key = 'stats-user';
      const config = { limit: 5, window: 60000 };
      
      // Generate some activity
      for (let i = 0; i < 7; i++) {
        rateLimiter.checkSlidingWindow(key, config, Date.now());
      }
      
      const stats = rateLimiter.getStats();
      
      expect(stats.totalRequests).toBeGreaterThan(0);
      expect(stats.blockedRequests).toBeGreaterThan(0);
      expect(stats.activeKeys).toBeGreaterThan(0);
    });
    
    it('should track per-key statistics', () => {
      const key = 'tracked-user';
      const config = { limit: 3, window: 60000 };
      
      rateLimiter.checkSlidingWindow(key, config, Date.now());
      rateLimiter.checkSlidingWindow(key, config, Date.now());
      
      const keyStats = rateLimiter.getKeyStats(key);
      
      expect(keyStats.requestCount).toBe(2);
      expect(keyStats.remaining).toBe(1);
    });
    
    it('should calculate success rates', () => {
      const key = 'success-user';
      
      // Mix of successes and failures
      rateLimiter.reportSuccess(key);
      rateLimiter.reportSuccess(key);
      rateLimiter.reportError(key, 'error');
      
      const stats = rateLimiter.getKeyStats(key);
      expect(stats.successRate).toBeCloseTo(66.67, 1);
    });
  });
  
  describe('cleanup and memory management', () => {
    it('should clean up expired entries', () => {
      const key = 'cleanup-user';
      const config = { limit: 5, window: 1000 }; // 1 second window
      const oldTime = Date.now() - 2000; // 2 seconds ago
      
      // Add old entries
      rateLimiter.checkSlidingWindow(key, config, oldTime);
      
      // Clean up
      rateLimiter.cleanup();
      
      // Should have removed old entries
      const data = rateLimiter.store.get(key);
      expect(!data || data.requests.length === 0).toBe(true);
    });
    
    it('should limit memory usage', () => {
      // Create many entries
      for (let i = 0; i < 1000; i++) {
        const key = `user-${i}`;
        rateLimiter.checkSlidingWindow(key, { limit: 10, window: 60000 }, Date.now());
      }
      
      const initialSize = rateLimiter.store.size;
      
      // Force cleanup
      rateLimiter.cleanup();
      
      // Size should be managed
      expect(rateLimiter.store.size).toBeLessThanOrEqual(500); // Based on maxEntries option
    });
  });
  
  describe('error handling', () => {
    it('should handle storage errors gracefully', () => {
      // Mock store.set to throw error
      const originalSet = rateLimiter.store.set;
      rateLimiter.store.set = jest.fn().mockImplementation(() => {
        throw new Error('Storage error');
      });
      
      expect(() => {
        rateLimiter.checkSlidingWindow('error-user', { limit: 5, window: 60000 }, Date.now());
      }).toThrow('Storage error');
      
      // Restore original method
      rateLimiter.store.set = originalSet;
    });
    
    it('should handle invalid configurations', () => {
      expect(() => {
        rateLimiter.setEndpointConfig('invalid:endpoint', {
          limit: -1, // Invalid limit
          window: 0  // Invalid window
        });
      }).toThrow();
    });
    
    it('should handle malformed keys', () => {
      const invalidKeys = [null, undefined, '', 123];
      
      invalidKeys.forEach(key => {
        expect(() => {
          rateLimiter.checkSlidingWindow(key, { limit: 5, window: 60000 }, Date.now());
        }).toThrow();
      });
    });
  });
  
  describe('reset and management', () => {
    it('should reset limits for specific key', () => {
      const key = 'reset-user';
      const config = { limit: 2, window: 60000 };
      
      // Use up the limit
      rateLimiter.checkSlidingWindow(key, config, Date.now());
      rateLimiter.checkSlidingWindow(key, config, Date.now());
      
      // Should be blocked
      let result = rateLimiter.checkSlidingWindow(key, config, Date.now());
      expect(result.allowed).toBe(false);
      
      // Reset the limit
      rateLimiter.reset(key);
      
      // Should be allowed again
      result = rateLimiter.checkSlidingWindow(key, config, Date.now());
      expect(result.allowed).toBe(true);
    });
    
    it('should reset all limits', () => {
      // Create multiple entries
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkSlidingWindow(`user-${i}`, { limit: 1, window: 60000 }, Date.now());
      }
      
      expect(rateLimiter.store.size).toBeGreaterThan(0);
      
      rateLimiter.resetAll();
      
      expect(rateLimiter.store.size).toBe(0);
    });
  });
  
  describe('integration scenarios', () => {
    it('should handle concurrent requests', () => {
      const key = 'concurrent-user';
      const config = { limit: 10, window: 60000 };
      const now = Date.now();
      
      const promises = [];
      for (let i = 0; i < 15; i++) {
        promises.push(Promise.resolve().then(() => {
          return rateLimiter.checkSlidingWindow(key, config, now);
        }));
      }
      
      return Promise.all(promises).then(results => {
        const allowed = results.filter(r => r.allowed).length;
        const blocked = results.filter(r => !r.allowed).length;
        
        expect(allowed).toBeLessThanOrEqual(10);
        expect(blocked).toBeGreaterThan(0);
      });
    });
    
    it('should work with multiple algorithms simultaneously', () => {
      const key = 'multi-algo-user';
      const slidingResult = rateLimiter.checkSlidingWindow(key, 
        { limit: 5, window: 60000 }, Date.now());
      const bucketResult = rateLimiter.checkTokenBucket(key, 
        { limit: 3, window: 60000, algorithm: 'token_bucket' }, Date.now());
      
      expect(slidingResult.allowed).toBe(true);
      expect(bucketResult.allowed).toBe(true);
    });
  });
});