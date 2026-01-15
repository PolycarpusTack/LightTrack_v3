/**
 * Security Middleware Unit Tests
 */

const SecurityMiddleware = require('../../../src/main/security/security-middleware');

// Mock the security components
jest.mock('../../../src/main/security/input-validator');
jest.mock('../../../src/main/security/csrf-protection');
jest.mock('../../../src/main/security/rate-limiter');

const MockInputValidator = require('../../../src/main/security/input-validator');
const MockCSRFProtection = require('../../../src/main/security/csrf-protection');
const MockRateLimiter = require('../../../src/main/security/rate-limiter');

describe('SecurityMiddleware', () => {
  let middleware;
  let mockValidator;
  let mockCsrf;
  let mockRateLimiter;
  
  beforeEach(() => {
    // Setup mocks
    mockValidator = {
      createMiddleware: jest.fn(() => (endpoint, data) => data),
      getStats: jest.fn(() => ({ totalValidations: 10 })),
      on: jest.fn()
    };
    
    mockCsrf = {
      middleware: jest.fn(() => (endpoint, data) => data),
      generateToken: jest.fn(() => ({ token: 'mock-token', expiryTime: Date.now() + 3600000 })),
      invalidateSession: jest.fn(),
      getStats: jest.fn(() => ({ totalTokens: 5 })),
      on: jest.fn(),
      destroy: jest.fn()
    };
    
    mockRateLimiter = {
      middleware: jest.fn(() => (endpoint, data) => data),
      reset: jest.fn(),
      getStats: jest.fn(() => ({ totalRequests: 100 })),
      on: jest.fn(),
      destroy: jest.fn()
    };
    
    MockInputValidator.mockImplementation(() => mockValidator);
    MockCSRFProtection.mockImplementation(() => mockCsrf);
    MockRateLimiter.mockImplementation(() => mockRateLimiter);
    
    middleware = new SecurityMiddleware({
      securityLevel: 'standard',
      enableValidation: true,
      enableCSRF: true,
      enableRateLimit: true,
      enableAuditLog: true
    });
  });
  
  afterEach(() => {
    if (middleware) {
      middleware.destroy();
    }
    jest.clearAllMocks();
  });
  
  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(middleware.options.securityLevel).toBe('standard');
      expect(middleware.options.enableValidation).toBe(true);
      expect(middleware.stats.totalRequests).toBe(0);
      expect(middleware.auditLog).toEqual([]);
    });
    
    it('should initialize security components', () => {
      expect(MockInputValidator).toHaveBeenCalled();
      expect(MockCSRFProtection).toHaveBeenCalled();
      expect(MockRateLimiter).toHaveBeenCalled();
    });
    
    it('should configure components based on security level', () => {
      const strictMiddleware = new SecurityMiddleware({ securityLevel: 'strict' });
      
      expect(MockInputValidator).toHaveBeenCalledWith({
        strict: true,
        allErrors: true
      });
      
      strictMiddleware.destroy();
    });
  });
  
  describe('security level configuration', () => {
    it('should use strict settings for strict level', () => {
      const strictMiddleware = new SecurityMiddleware({ securityLevel: 'strict' });
      
      expect(strictMiddleware.getTokenExpiry()).toBe(1800000); // 30 minutes
      expect(strictMiddleware.getMaxTokens()).toBe(500);
      expect(strictMiddleware.getDefaultRateLimit()).toBe(50);
      
      strictMiddleware.destroy();
    });
    
    it('should use relaxed settings for relaxed level', () => {
      const relaxedMiddleware = new SecurityMiddleware({ securityLevel: 'relaxed' });
      
      expect(relaxedMiddleware.getTokenExpiry()).toBe(7200000); // 2 hours
      expect(relaxedMiddleware.getMaxTokens()).toBe(2000);
      expect(relaxedMiddleware.getDefaultRateLimit()).toBe(200);
      
      relaxedMiddleware.destroy();
    });
  });
  
  describe('middleware function', () => {
    it('should process requests through security checks', async () => {
      const middlewareFn = middleware.middleware();
      const data = { test: 'data' };
      const context = { sessionId: 'test-session' };
      
      const result = await middlewareFn('test:endpoint', data, context);
      
      expect(result).toBeDefined();
      expect(middleware.stats.totalRequests).toBe(1);
    });
    
    it('should bypass security for configured endpoints', async () => {
      middleware.options.bypassEndpoints = ['test:bypass'];
      const middlewareFn = middleware.middleware();
      
      const result = await middlewareFn('test:bypass', { data: 'test' }, {});
      
      expect(result).toBeDefined();
      expect(middleware.stats.bypassedRequests).toBe(1);
    });
    
    it('should handle pattern-based bypasses', async () => {
      middleware.options.bypassEndpoints = ['get:*'];
      const middlewareFn = middleware.middleware();
      
      const result = await middlewareFn('get:activities', { data: 'test' }, {});
      
      expect(result).toBeDefined();
      expect(middleware.stats.bypassedRequests).toBe(1);
    });
    
    it('should increment blocked requests on security failure', async () => {
      // Make validator throw error
      mockValidator.createMiddleware = jest.fn(() => {
        return () => {
          const error = new Error('Validation failed');
          error.code = 'VALIDATION_FAILED';
          throw error;
        };
      });
      
      const middlewareFn = middleware.middleware();
      
      await expect(middlewareFn('test:endpoint', {}, {})).rejects.toThrow('Validation failed');
      expect(middleware.stats.blockedRequests).toBe(1);
    });
  });
  
  describe('request context creation', () => {
    it('should create comprehensive request context', () => {
      const context = middleware.createRequestContext('test:endpoint', { data: 'test' }, {
        sessionId: 'session-123',
        ip: '192.168.1.1',
        userAgent: 'Test-Agent'
      });
      
      expect(context.endpoint).toBe('test:endpoint');
      expect(context.sessionId).toBe('session-123');
      expect(context.ip).toBe('192.168.1.1');
      expect(context.userAgent).toBe('Test-Agent');
      expect(context.requestId).toBeDefined();
      expect(context.dataSize).toBeGreaterThan(0);
    });
    
    it('should handle missing context properties', () => {
      const context = middleware.createRequestContext('test:endpoint', {}, {});
      
      expect(context.sessionId).toBe('anonymous');
      expect(context.ip).toBe('unknown');
      expect(context.userAgent).toBe('unknown');
    });
  });
  
  describe('suspicious activity detection', () => {
    it('should detect rapid requests', () => {
      const context = { sessionId: 'rapid-user' };
      
      // Simulate rapid requests
      for (let i = 0; i < 25; i++) {
        middleware.detectRapidRequests(context);
      }
      
      const result = middleware.detectRapidRequests(context);
      expect(result).toBe('rapid_requests');
    });
    
    it('should detect unusual data patterns', () => {
      const largeData = { payload: 'x'.repeat(200000) };
      const result = middleware.detectUnusualData(largeData);
      
      expect(result).toBe('large_payload');
    });
    
    it('should detect injection attempts', () => {
      const maliciousData = { 
        title: '<script>alert("xss")</script>',
        query: 'DROP TABLE users'
      };
      
      const result = middleware.detectUnusualData(maliciousData);
      expect(result).toBe('injection_attempt');
    });
    
    it('should detect parameter pollution', () => {
      const pollutedData = {};
      // Create many parameters
      for (let i = 0; i < 60; i++) {
        pollutedData[`param${i}`] = 'value';
      }
      
      const result = middleware.detectParameterPollution(pollutedData);
      expect(result).toBe('parameter_pollution');
    });
    
    it('should detect duplicate parameters', () => {
      const duplicateData = {
        'user_id': '123',
        'userId': '456',
        'user-id': '789'
      };
      
      const result = middleware.detectParameterPollution(duplicateData);
      expect(result).toBe('duplicate_parameters');
    });
  });
  
  describe('privilege escalation checks', () => {
    it('should block admin endpoints for non-admin users', () => {
      expect(() => {
        middleware.checkPrivilegeEscalation('settings:setGlobal', {}, { isAdmin: false });
      }).toThrow('Insufficient privileges');
    });
    
    it('should allow admin endpoints for admin users', () => {
      expect(() => {
        middleware.checkPrivilegeEscalation('settings:setGlobal', {}, { isAdmin: true });
      }).not.toThrow();
    });
    
    it('should allow regular endpoints for all users', () => {
      expect(() => {
        middleware.checkPrivilegeEscalation('activities:list', {}, { isAdmin: false });
      }).not.toThrow();
    });
  });
  
  describe('data exfiltration detection', () => {
    it('should detect excessive export requests', () => {
      const context = { sessionId: 'export-user' };
      
      // Simulate multiple exports
      for (let i = 0; i < 6; i++) {
        middleware.checkDataExfiltration('data:export', {}, context);
      }
      
      expect(() => {
        middleware.checkDataExfiltration('data:export', {}, context);
      }).toThrow('Too many export requests');
    });
    
    it('should allow reasonable export frequency', () => {
      const context = { sessionId: 'normal-user' };
      
      expect(() => {
        middleware.checkDataExfiltration('data:export', {}, context);
        middleware.checkDataExfiltration('data:backup', {}, context);
      }).not.toThrow();
    });
  });
  
  describe('validation caching', () => {
    it('should cache validation results', () => {
      middleware.options.cacheValidation = true;
      const endpoint = 'test:endpoint';
      const data = { test: 'data' };
      
      // First call should hit validator
      middleware.validateInput(endpoint, data, {});
      expect(mockValidator.createMiddleware).toHaveBeenCalledTimes(1);
      
      // Second call should use cache
      middleware.validateInput(endpoint, data, {});
      expect(mockValidator.createMiddleware).toHaveBeenCalledTimes(1);
    });
    
    it('should clean up validation cache when too large', () => {
      middleware.options.cacheValidation = true;
      middleware.options.maxCacheSize = 2;
      
      // Add more items than cache size
      middleware.validateInput('endpoint1', { data: 1 }, {});
      middleware.validateInput('endpoint2', { data: 2 }, {});
      middleware.validateInput('endpoint3', { data: 3 }, {});
      
      expect(middleware.validationCache.size).toBeLessThanOrEqual(2);
    });
  });
  
  describe('error enhancement', () => {
    it('should enhance security errors with context', () => {
      const error = new Error('Security error');
      error.code = 'VALIDATION_FAILED';
      
      middleware.enhanceSecurityError(error, 'test:endpoint', { sessionId: 'test' }, Date.now());
      
      expect(error.endpoint).toBe('test:endpoint');
      expect(error.severity).toBe('medium');
      expect(error.recommendedActions).toBeDefined();
      expect(Array.isArray(error.recommendedActions)).toBe(true);
    });
    
    it('should assign correct severity levels', () => {
      expect(middleware.getErrorSeverity('SUSPICIOUS_ACTIVITY')).toBe('high');
      expect(middleware.getErrorSeverity('VALIDATION_FAILED')).toBe('medium');
      expect(middleware.getErrorSeverity('UNKNOWN_ERROR')).toBe('low');
    });
    
    it('should provide relevant recommended actions', () => {
      const actions = middleware.getRecommendedActions('RATE_LIMIT_EXCEEDED');
      expect(actions).toContain('Wait for rate limit reset');
      
      const defaultActions = middleware.getRecommendedActions('UNKNOWN_ERROR');
      expect(defaultActions).toContain('Contact support for assistance');
    });
  });
  
  describe('audit logging', () => {
    it('should log security events', () => {
      middleware.auditEvent('test_event', { data: 'test' });
      
      expect(middleware.auditLog).toHaveLength(1);
      expect(middleware.auditLog[0].type).toBe('test_event');
      expect(middleware.stats.auditEvents).toBe(1);
    });
    
    it('should sanitize sensitive data in audit logs', () => {
      const sensitiveData = {
        username: 'user123',
        password: 'secret123',
        token: 'auth-token'
      };
      
      const sanitized = middleware.sanitizeAuditData(sensitiveData);
      
      expect(sanitized.username).toBe('user123');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
    });
    
    it('should limit audit log size', () => {
      // Generate many events
      for (let i = 0; i < 12000; i++) {
        middleware.auditEvent('bulk_event', { index: i });
      }
      
      expect(middleware.auditLog.length).toBeLessThanOrEqual(5000);
    });
    
    it('should respect log level settings', () => {
      middleware.options.logLevel = 'warn';
      
      expect(middleware.shouldLog('debug')).toBe(false);
      expect(middleware.shouldLog('info')).toBe(false);
      expect(middleware.shouldLog('warn')).toBe(true);
      expect(middleware.shouldLog('error')).toBe(true);
    });
  });
  
  describe('statistics and monitoring', () => {
    it('should provide comprehensive statistics', () => {
      middleware.stats.totalRequests = 100;
      middleware.stats.blockedRequests = 10;
      
      const stats = middleware.getStats();
      
      expect(stats.totalRequests).toBe(100);
      expect(stats.blockedRequests).toBe(10);
      expect(stats.blockRate).toBe(10);
      expect(stats.components.validation).toBeDefined();
      expect(stats.components.csrf).toBeDefined();
      expect(stats.components.rateLimiter).toBeDefined();
    });
    
    it('should handle zero request scenarios', () => {
      const stats = middleware.getStats();
      expect(stats.blockRate).toBe(0);
    });
  });
  
  describe('CSRF integration', () => {
    it('should generate CSRF tokens', () => {
      const token = middleware.generateCSRFToken('session-123');
      
      expect(mockCsrf.generateToken).toHaveBeenCalledWith('session-123');
      expect(token).toBeDefined();
    });
    
    it('should get CSRF exempt endpoints', () => {
      const exemptEndpoints = middleware.getCSRFExemptEndpoints();
      
      expect(Array.isArray(exemptEndpoints)).toBe(true);
      expect(exemptEndpoints).toContain('tracking:getState');
    });
  });
  
  describe('session management', () => {
    it('should reset session security state', () => {
      const sessionId = 'test-session';
      
      middleware.resetSession(sessionId);
      
      expect(mockCsrf.invalidateSession).toHaveBeenCalledWith(sessionId);
      expect(mockRateLimiter.reset).toHaveBeenCalledWith(sessionId);
    });
    
    it('should clean up session-specific security context', () => {
      const sessionId = 'cleanup-session';
      
      // Add some session-specific context
      middleware.securityContext.set(`rapid:${sessionId}`, []);
      middleware.securityContext.set(`export:${sessionId}`, []);
      middleware.securityContext.set('global:setting', 'value');
      
      middleware.resetSession(sessionId);
      
      expect(middleware.securityContext.has(`rapid:${sessionId}`)).toBe(false);
      expect(middleware.securityContext.has(`export:${sessionId}`)).toBe(false);
      expect(middleware.securityContext.has('global:setting')).toBe(true);
    });
  });
  
  describe('strict mode behavior', () => {
    it('should be more restrictive in strict mode', () => {
      const strictMiddleware = new SecurityMiddleware({ securityLevel: 'strict' });
      
      // In strict mode, data exfiltration detection should throw
      const context = { sessionId: 'strict-user' };
      for (let i = 0; i < 6; i++) {
        strictMiddleware.checkDataExfiltration('data:export', {}, context);
      }
      
      expect(() => {
        strictMiddleware.checkDataExfiltration('data:export', {}, context);
      }).toThrow('Too many export requests');
      
      strictMiddleware.destroy();
    });
    
    it('should throw on suspicious activity in strict mode', () => {
      const strictMiddleware = new SecurityMiddleware({ securityLevel: 'strict' });
      
      expect(() => {
        strictMiddleware.checkSuspiciousPatterns('test:endpoint', { 
          malicious: '<script>alert(1)</script>' 
        }, { sessionId: 'test' });
      }).toThrow('Suspicious activity detected');
      
      strictMiddleware.destroy();
    });
  });
  
  describe('cleanup and destruction', () => {
    it('should clean up all resources on destroy', () => {
      middleware.destroy();
      
      expect(mockCsrf.destroy).toHaveBeenCalled();
      expect(mockRateLimiter.destroy).toHaveBeenCalled();
      expect(middleware.validationCache.size).toBe(0);
      expect(middleware.securityContext.size).toBe(0);
      expect(middleware.auditLog.length).toBe(0);
    });
  });
});