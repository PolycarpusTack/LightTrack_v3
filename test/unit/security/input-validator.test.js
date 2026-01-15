/**
 * Input Validator Unit Tests
 */

const InputValidator = require('../../../src/main/security/input-validator');

// Mock AJV since it's not available in test environment
jest.mock('ajv', () => {
  return class MockAjv {
    constructor() {
      this.schemas = new Map();
    }
    
    compile(schema) {
      return (data) => {
        // Simple mock validation
        if (schema.required) {
          for (const field of schema.required) {
            if (!(field in data)) {
              this.errors = [{ 
                keyword: 'required', 
                params: { missingProperty: field },
                message: `must have required property '${field}'`
              }];
              return false;
            }
          }
        }
        
        if (schema.properties) {
          for (const [field, fieldSchema] of Object.entries(schema.properties)) {
            if (field in data) {
              const value = data[field];
              
              if (fieldSchema.type && typeof value !== fieldSchema.type) {
                this.errors = [{
                  keyword: 'type',
                  instancePath: `/${field}`,
                  message: `must be ${fieldSchema.type}`
                }];
                return false;
              }
              
              if (fieldSchema.maxLength && value.length > fieldSchema.maxLength) {
                this.errors = [{
                  keyword: 'maxLength',
                  instancePath: `/${field}`,
                  params: { limit: fieldSchema.maxLength },
                  message: `must NOT have more than ${fieldSchema.maxLength} characters`
                }];
                return false;
              }
            }
          }
        }
        
        this.errors = [];
        return true;
      };
    }
    
    addKeyword() {}
  };
});

jest.mock('ajv-formats', () => () => {});

describe('InputValidator', () => {
  let validator;
  
  beforeEach(() => {
    validator = new InputValidator();
  });
  
  afterEach(() => {
    if (validator) {
      // Cleanup if needed
    }
  });
  
  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(validator.options.strict).toBe(true);
      expect(validator.options.allErrors).toBe(true);
      expect(validator.compiledSchemas).toBeInstanceOf(Map);
      expect(validator.stats).toMatchObject({
        totalValidations: 0,
        successfulValidations: 0,
        failedValidations: 0
      });
    });
    
    it('should compile schemas on initialization', () => {
      expect(validator.compiledSchemas.size).toBeGreaterThan(0);
    });
  });
  
  describe('validate', () => {
    it('should validate correct activity creation data', () => {
      const data = {
        app: 'TestApp',
        title: 'Test Activity',
        startTime: Date.now()
      };
      
      const result = validator.validate('activities:create', data);
      
      expect(result.valid).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.sanitized).toBeDefined();
    });
    
    it('should reject data missing required fields', () => {
      const data = {
        app: 'TestApp'
        // Missing title and startTime
      };
      
      const result = validator.validate('activities:create', data);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
    });
    
    it('should reject data with invalid types', () => {
      const data = {
        app: 123, // Should be string
        title: 'Test Activity',
        startTime: Date.now()
      };
      
      const result = validator.validate('activities:create', data);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors[0].code).toBe('INVALID_TYPE');
    });
    
    it('should reject data that exceeds length limits', () => {
      const data = {
        app: 'TestApp',
        title: 'x'.repeat(600), // Exceeds maxLength of 500
        startTime: Date.now()
      };
      
      const result = validator.validate('activities:create', data);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('VALUE_TOO_LONG');
    });
    
    it('should handle unknown endpoints', () => {
      const data = { test: 'value' };
      
      const result = validator.validate('unknown:endpoint', data);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('SCHEMA_NOT_FOUND');
    });
  });
  
  describe('sanitizeData', () => {
    it('should escape HTML entities', () => {
      const data = {
        title: '<script>alert("xss")</script>',
        notes: 'Text with "quotes" & ampersands'
      };
      
      const sanitized = validator.sanitizeData(data);
      
      expect(sanitized.title).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
      expect(sanitized.notes).toBe('Text with &quot;quotes&quot; &amp; ampersands');
    });
    
    it('should handle nested objects', () => {
      const data = {
        metadata: {
          description: '<img src="x" onerror="alert(1)">'
        }
      };
      
      const sanitized = validator.sanitizeData(data);
      
      expect(sanitized.metadata.description).toBe('&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;');
    });
    
    it('should handle arrays', () => {
      const data = {
        tags: ['<script>', 'normal-tag', '"quoted"']
      };
      
      const sanitized = validator.sanitizeData(data);
      
      expect(sanitized.tags[0]).toBe('&lt;script&gt;');
      expect(sanitized.tags[1]).toBe('normal-tag');
      expect(sanitized.tags[2]).toBe('&quot;quoted&quot;');
    });
  });
  
  describe('validateBatch', () => {
    it('should validate multiple inputs', () => {
      const validations = [
        {
          id: 'test1',
          endpoint: 'activities:create',
          data: { app: 'App1', title: 'Title1', startTime: Date.now() }
        },
        {
          id: 'test2',
          endpoint: 'activities:create',
          data: { app: 'App2' } // Missing required fields
        }
      ];
      
      const result = validator.validateBatch(validations);
      
      expect(result.allValid).toBe(false);
      expect(result.results).toHaveLength(2);
      expect(result.errors).toHaveLength(1);
      expect(result.summary.total).toBe(2);
      expect(result.summary.valid).toBe(1);
      expect(result.summary.invalid).toBe(1);
    });
  });
  
  describe('middleware', () => {
    it('should create validation middleware', () => {
      const middleware = validator.createMiddleware();
      
      expect(typeof middleware).toBe('function');
    });
    
    it('should throw error for invalid data', () => {
      const middleware = validator.createMiddleware();
      const invalidData = { app: 'TestApp' }; // Missing required fields
      
      expect(() => {
        middleware('activities:create', invalidData);
      }).toThrow('Input validation failed');
    });
    
    it('should return sanitized data for valid input', () => {
      const middleware = validator.createMiddleware();
      const validData = {
        app: 'TestApp',
        title: '<script>test</script>',
        startTime: Date.now()
      };
      
      const result = middleware('activities:create', validData);
      
      expect(result.title).toBe('&lt;script&gt;test&lt;&#x2F;script&gt;');
    });
  });
  
  describe('statistics', () => {
    it('should track validation statistics', () => {
      const validData = {
        app: 'TestApp',
        title: 'Test',
        startTime: Date.now()
      };
      
      const invalidData = { app: 'TestApp' };
      
      validator.validate('activities:create', validData);
      validator.validate('activities:create', invalidData);
      
      const stats = validator.getStats();
      
      expect(stats.totalValidations).toBe(2);
      expect(stats.successfulValidations).toBe(1);
      expect(stats.failedValidations).toBe(1);
      expect(stats.successRate).toBe(50);
    });
    
    it('should track common errors', () => {
      const invalidData = { app: 'TestApp' };
      
      validator.validate('activities:create', invalidData);
      validator.validate('activities:create', invalidData);
      
      const stats = validator.getStats();
      
      expect(stats.topErrors).toBeDefined();
      expect(stats.topErrors.length).toBeGreaterThan(0);
    });
  });
  
  describe('schema management', () => {
    it('should add custom schema', () => {
      const customSchema = {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      };
      
      const added = validator.addSchema('custom:test', customSchema);
      
      expect(added).toBe(true);
      expect(validator.getAvailableEndpoints()).toContain('custom:test');
    });
    
    it('should remove schema', () => {
      const removed = validator.removeSchema('activities:create');
      
      expect(removed).toBe(true);
      expect(validator.getAvailableEndpoints()).not.toContain('activities:create');
    });
  });
  
  describe('error formatting', () => {
    it('should format validation errors correctly', () => {
      const data = { app: 'TestApp' }; // Missing required fields
      
      const result = validator.validate('activities:create', data);
      
      expect(result.errors[0]).toMatchObject({
        path: expect.any(String),
        field: expect.any(String),
        message: expect.any(String),
        code: expect.any(String),
        severity: expect.any(String)
      });
    });
    
    it('should identify security errors', () => {
      // This would test custom security validators when they're implemented
      expect(true).toBe(true); // Placeholder
    });
  });
  
  describe('custom validators', () => {
    it('should validate timestamps', () => {
      const { CUSTOM_VALIDATORS } = require('../../../src/main/security/validation-schemas');
      
      expect(CUSTOM_VALIDATORS.isValidTimestamp(Date.now())).toBe(true);
      expect(CUSTOM_VALIDATORS.isValidTimestamp('2023-01-01T00:00:00Z')).toBe(true);
      expect(CUSTOM_VALIDATORS.isValidTimestamp('invalid')).toBe(false);
      expect(CUSTOM_VALIDATORS.isValidTimestamp(Date.now() + 100000000)).toBe(false); // Too far in future
    });
    
    it('should validate file paths', () => {
      const { CUSTOM_VALIDATORS } = require('../../../src/main/security/validation-schemas');
      
      expect(CUSTOM_VALIDATORS.isValidFilePath('/valid/path/file.txt')).toBe(true);
      expect(CUSTOM_VALIDATORS.isValidFilePath('../../../etc/passwd')).toBe(false);
      expect(CUSTOM_VALIDATORS.isValidFilePath('~/secret')).toBe(false);
      expect(CUSTOM_VALIDATORS.isValidFilePath('path<with>invalid:chars')).toBe(false);
    });
    
    it('should validate safe text', () => {
      const { CUSTOM_VALIDATORS } = require('../../../src/main/security/validation-schemas');
      
      expect(CUSTOM_VALIDATORS.isSafeText('Normal text')).toBe(true);
      expect(CUSTOM_VALIDATORS.isSafeText('<script>alert(1)</script>')).toBe(false);
      expect(CUSTOM_VALIDATORS.isSafeText('onclick="alert(1)"')).toBe(false);
      expect(CUSTOM_VALIDATORS.isSafeText('javascript:alert(1)')).toBe(false);
    });
    
    it('should validate date ranges', () => {
      const { CUSTOM_VALIDATORS } = require('../../../src/main/security/validation-schemas');
      
      const start = new Date('2023-01-01');
      const end = new Date('2023-01-02');
      const farEnd = new Date('2024-01-01');
      
      expect(CUSTOM_VALIDATORS.isValidDateRange(start, end)).toBe(true);
      expect(CUSTOM_VALIDATORS.isValidDateRange(end, start)).toBe(false); // End before start
      expect(CUSTOM_VALIDATORS.isValidDateRange(start, farEnd)).toBe(false); // Too long range
      expect(CUSTOM_VALIDATORS.isValidDateRange('invalid', end)).toBe(false);
    });
  });
});