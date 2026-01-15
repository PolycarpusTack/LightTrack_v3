/**
 * CSRF Protection Unit Tests
 */

const CSRFProtection = require('../../../src/main/security/csrf-protection');

// Mock crypto module
jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockReturnValue({
    toString: jest.fn().mockReturnValue('mocked-token-value-123456789abcdef')
  })
}));

describe('CSRFProtection', () => {
  let csrf;
  
  beforeEach(() => {
    csrf = new CSRFProtection({
      tokenExpiry: 3600000, // 1 hour
      maxTokens: 100
    });
  });
  
  afterEach(() => {
    if (csrf) {
      csrf.destroy();
    }
  });
  
  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(csrf.options.tokenExpiry).toBe(3600000);
      expect(csrf.options.maxTokens).toBe(100);
      expect(csrf.tokens).toBeInstanceOf(Map);
      expect(csrf.sessionTokens).toBeInstanceOf(Map);
    });
    
    it('should set up cleanup interval', () => {
      expect(csrf.cleanupInterval).toBeDefined();
    });
  });
  
  describe('generateToken', () => {
    it('should generate a token with default session', () => {
      const result = csrf.generateToken();
      
      expect(result.token).toBe('mocked-token-value-123456789abcdef');
      expect(result.expiryTime).toBeGreaterThan(Date.now());
      expect(csrf.tokens.has(result.token)).toBe(true);
    });
    
    it('should generate a token for specific session', () => {
      const sessionId = 'test-session-123';
      const result = csrf.generateToken(sessionId);
      
      expect(result.token).toBe('mocked-token-value-123456789abcdef');
      expect(csrf.sessionTokens.get(sessionId)).toContain(result.token);
    });
    
    it('should include metadata in token', () => {
      const metadata = { component: 'manual-entry', action: 'create' };
      const result = csrf.generateToken('default', metadata);
      
      const tokenData = csrf.tokens.get(result.token);
      expect(tokenData.metadata).toEqual(metadata);
    });
    
    it('should limit tokens per session', () => {
      const sessionId = 'test-session';
      
      // Generate max tokens + 1
      for (let i = 0; i <= csrf.options.maxTokens; i++) {
        csrf.generateToken(sessionId);
      }
      
      const sessionTokens = csrf.sessionTokens.get(sessionId);
      expect(sessionTokens.length).toBeLessThanOrEqual(csrf.options.maxTokens);
    });
  });
  
  describe('validateToken', () => {
    it('should validate existing token', () => {
      const { token } = csrf.generateToken();
      
      const result = csrf.validateToken(token);
      
      expect(result.valid).toBe(true);
      expect(result.sessionId).toBe('default');
    });
    
    it('should reject non-existent token', () => {
      const result = csrf.validateToken('non-existent-token');
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('token_not_found');
    });
    
    it('should reject expired token', () => {
      // Create CSRF with very short expiry
      const shortCsrf = new CSRFProtection({ tokenExpiry: 1 });
      const { token } = shortCsrf.generateToken();
      
      // Wait for expiry
      setTimeout(() => {
        const result = shortCsrf.validateToken(token);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe('token_expired');
        shortCsrf.destroy();
      }, 10);
    });
    
    it('should mark token as used if singleUse is true', () => {
      const { token } = csrf.generateToken();
      
      csrf.validateToken(token, { singleUse: true });
      const secondResult = csrf.validateToken(token);
      
      expect(secondResult.valid).toBe(false);
      expect(secondResult.reason).toBe('token_already_used');
    });
    
    it('should validate token for specific session', () => {
      const sessionId = 'test-session';
      const { token } = csrf.generateToken(sessionId);
      
      const result = csrf.validateToken(token, { sessionId });
      
      expect(result.valid).toBe(true);
      expect(result.sessionId).toBe(sessionId);
    });
    
    it('should reject token for wrong session', () => {
      const { token } = csrf.generateToken('session-1');
      
      const result = csrf.validateToken(token, { sessionId: 'session-2' });
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('invalid_session');
    });
  });
  
  describe('middleware', () => {
    it('should create middleware function', () => {
      const middleware = csrf.middleware();
      
      expect(typeof middleware).toBe('function');
    });
    
    it('should validate CSRF token for state-changing operations', () => {
      const { token } = csrf.generateToken();
      const middleware = csrf.middleware();
      
      const data = { csrfToken: token, title: 'Test Activity' };
      const context = { sessionId: 'default' };
      
      const result = middleware('activities:create', data, context);
      
      expect(result).toBeDefined();
      expect(result.csrfToken).toBeUndefined(); // Token should be removed
    });
    
    it('should reject request without CSRF token', () => {
      const middleware = csrf.middleware();
      const data = { title: 'Test Activity' };
      
      expect(() => {
        middleware('activities:create', data, {});
      }).toThrow('CSRF token validation failed');
    });
    
    it('should allow exempt endpoints without token', () => {
      const middleware = csrf.middleware({
        exempt: [/^get/, 'activities:list']
      });
      
      const data = { limit: 10 };
      
      expect(() => {
        middleware('activities:list', data, {});
      }).not.toThrow();
    });
    
    it('should handle exempt patterns', () => {
      const middleware = csrf.middleware({
        exempt: [/^get/]
      });
      
      const data = { id: 123 };
      
      expect(() => {
        middleware('getActivities', data, {});
      }).not.toThrow();
    });
  });
  
  describe('token cleanup', () => {
    it('should clean up expired tokens', () => {
      // Generate token with short expiry
      const shortCsrf = new CSRFProtection({ tokenExpiry: 10 });
      const { token } = shortCsrf.generateToken();
      
      expect(shortCsrf.tokens.has(token)).toBe(true);
      
      setTimeout(() => {
        shortCsrf.cleanupExpiredTokens();
        expect(shortCsrf.tokens.has(token)).toBe(false);
        shortCsrf.destroy();
      }, 20);
    });
    
    it('should maintain active tokens during cleanup', () => {
      const { token } = csrf.generateToken();
      
      csrf.cleanupExpiredTokens();
      
      expect(csrf.tokens.has(token)).toBe(true);
    });
    
    it('should limit total token count', () => {
      // Create CSRF with low token limit
      const limitedCsrf = new CSRFProtection({ maxTokens: 3 });
      
      // Generate more tokens than limit
      const tokens = [];
      for (let i = 0; i < 5; i++) {
        const { token } = limitedCsrf.generateToken();
        tokens.push(token);
      }
      
      expect(limitedCsrf.tokens.size).toBeLessThanOrEqual(3);
      limitedCsrf.destroy();
    });
  });
  
  describe('session management', () => {
    it('should invalidate session tokens', () => {
      const sessionId = 'test-session';
      const { token } = csrf.generateToken(sessionId);
      
      csrf.invalidateSession(sessionId);
      
      const result = csrf.validateToken(token);
      expect(result.valid).toBe(false);
      expect(csrf.sessionTokens.has(sessionId)).toBe(false);
    });
    
    it('should get session tokens', () => {
      const sessionId = 'test-session';
      csrf.generateToken(sessionId);
      csrf.generateToken(sessionId);
      
      const tokens = csrf.getSessionTokens(sessionId);
      
      expect(tokens).toHaveLength(2);
    });
    
    it('should count session tokens', () => {
      const sessionId = 'test-session';
      csrf.generateToken(sessionId);
      csrf.generateToken(sessionId);
      
      const count = csrf.getSessionTokenCount(sessionId);
      
      expect(count).toBe(2);
    });
  });
  
  describe('statistics', () => {
    it('should track token statistics', () => {
      const { token } = csrf.generateToken();
      csrf.validateToken(token);
      csrf.validateToken('invalid-token');
      
      const stats = csrf.getStats();
      
      expect(stats.totalTokens).toBeGreaterThan(0);
      expect(stats.validValidations).toBe(1);
      expect(stats.invalidValidations).toBe(1);
      expect(stats.activeTokens).toBeGreaterThan(0);
    });
    
    it('should track token generation rate', () => {
      csrf.generateToken();
      csrf.generateToken();
      
      const stats = csrf.getStats();
      
      expect(stats.generationRate).toBeGreaterThan(0);
    });
  });
  
  describe('security features', () => {
    it('should detect token reuse', () => {
      const { token } = csrf.generateToken();
      
      csrf.validateToken(token, { singleUse: true });
      
      const result = csrf.validateToken(token);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('token_already_used');
    });
    
    it('should validate token format', () => {
      const invalidTokens = [
        '',
        'short',
        'a'.repeat(100), // Too long
        'invalid-chars-!@#',
        null,
        undefined
      ];
      
      invalidTokens.forEach(token => {
        const result = csrf.validateToken(token);
        expect(result.valid).toBe(false);
      });
    });
    
    it('should handle concurrent token generation', () => {
      const tokens = [];
      const promises = [];
      
      // Generate tokens concurrently
      for (let i = 0; i < 10; i++) {
        promises.push(Promise.resolve().then(() => {
          const { token } = csrf.generateToken();
          tokens.push(token);
        }));
      }
      
      return Promise.all(promises).then(() => {
        // All tokens should be unique
        const uniqueTokens = new Set(tokens);
        expect(uniqueTokens.size).toBe(tokens.length);
      });
    });
  });
  
  describe('error handling', () => {
    it('should handle token storage errors gracefully', () => {
      // Mock Map.set to throw error
      const originalSet = csrf.tokens.set;
      csrf.tokens.set = jest.fn().mockImplementation(() => {
        throw new Error('Storage error');
      });
      
      expect(() => {
        csrf.generateToken();
      }).toThrow('Storage error');
      
      // Restore original method
      csrf.tokens.set = originalSet;
    });
    
    it('should handle cleanup errors gracefully', () => {
      // Mock Map.delete to throw error
      csrf.tokens.delete = jest.fn().mockImplementation(() => {
        throw new Error('Delete error');
      });
      
      expect(() => {
        csrf.cleanupExpiredTokens();
      }).not.toThrow();
    });
  });
  
  describe('integration', () => {
    it('should work with multiple sessions', () => {
      const session1 = 'session-1';
      const session2 = 'session-2';
      
      const token1 = csrf.generateToken(session1).token;
      const token2 = csrf.generateToken(session2).token;
      
      expect(csrf.validateToken(token1, { sessionId: session1 }).valid).toBe(true);
      expect(csrf.validateToken(token2, { sessionId: session2 }).valid).toBe(true);
      expect(csrf.validateToken(token1, { sessionId: session2 }).valid).toBe(false);
    });
    
    it('should emit events for monitoring', () => {
      let eventEmitted = false;
      csrf.on('validationFailed', () => {
        eventEmitted = true;
      });
      
      csrf.validateToken('invalid-token');
      
      expect(eventEmitted).toBe(true);
    });
  });
});