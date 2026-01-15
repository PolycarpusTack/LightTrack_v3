/**
 * ServiceBridge Unit Tests
 */

const ServiceBridge = require('../../../src/main/integration/bridge');

describe('ServiceBridge', () => {
  let bridge;
  let mockOldService;
  let mockNewService;
  
  beforeEach(() => {
    // Mock services
    mockOldService = {
      testMethod: jest.fn().mockResolvedValue('old-result'),
      initialize: jest.fn().mockResolvedValue(),
      cleanup: jest.fn().mockResolvedValue()
    };
    
    mockNewService = {
      testMethod: jest.fn().mockResolvedValue('new-result'),
      initialize: jest.fn().mockResolvedValue(),
      cleanup: jest.fn().mockResolvedValue()
    };
    
    bridge = new ServiceBridge({
      useNewArchitecture: false,
      enableLogging: false
    });
  });
  
  afterEach(async () => {
    if (bridge) {
      await bridge.cleanup();
    }
  });
  
  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultBridge = new ServiceBridge();
      
      expect(defaultBridge.options.useNewArchitecture).toBe(false);
      expect(defaultBridge.options.enableLogging).toBe(true);
      expect(defaultBridge.services).toBeInstanceOf(Map);
      expect(defaultBridge.metrics).toBeInstanceOf(Map);
    });
    
    it('should override default options', () => {
      const customBridge = new ServiceBridge({
        useNewArchitecture: true,
        enableLogging: false,
        logLevel: 'error'
      });
      
      expect(customBridge.options.useNewArchitecture).toBe(true);
      expect(customBridge.options.enableLogging).toBe(false);
      expect(customBridge.options.logLevel).toBe('error');
    });
  });
  
  describe('registerService', () => {
    it('should register service with old and new implementations', () => {
      bridge.registerService('TestService', {
        old: mockOldService,
        new: mockNewService
      });
      
      expect(bridge.services.has('TestService')).toBe(true);
      expect(bridge.metrics.has('TestService')).toBe(true);
      
      const serviceConfig = bridge.services.get('TestService');
      expect(serviceConfig.old).toBe(mockOldService);
      expect(serviceConfig.new).toBe(mockNewService);
      expect(serviceConfig.featureFlag).toBe('useNewTestService');
    });
    
    it('should throw error for missing implementations', () => {
      expect(() => {
        bridge.registerService('TestService', { old: mockOldService });
      }).toThrow('Service TestService must have both old and new implementations');
      
      expect(() => {
        bridge.registerService('TestService', { new: mockNewService });
      }).toThrow('Service TestService must have both old and new implementations');
    });
    
    it('should allow custom feature flag name', () => {
      bridge.registerService('TestService', {
        old: mockOldService,
        new: mockNewService,
        featureFlag: 'customFlag'
      });
      
      const serviceConfig = bridge.services.get('TestService');
      expect(serviceConfig.featureFlag).toBe('customFlag');
    });
    
    it('should initialize metrics for service', () => {
      bridge.registerService('TestService', {
        old: mockOldService,
        new: mockNewService
      });
      
      const metrics = bridge.metrics.get('TestService');
      expect(metrics).toMatchObject({
        oldCalls: 0,
        newCalls: 0,
        errors: { old: 0, new: 0 },
        avgResponseTime: { old: 0, new: 0 }
      });
    });
  });
  
  describe('shouldUseNewService', () => {
    beforeEach(() => {
      bridge.registerService('TestService', {
        old: mockOldService,
        new: mockNewService
      });
    });
    
    it('should return false by default', () => {
      expect(bridge.shouldUseNewService('TestService')).toBe(false);
    });
    
    it('should return true when global flag is set', () => {
      bridge.options.useNewArchitecture = true;
      expect(bridge.shouldUseNewService('TestService')).toBe(true);
    });
    
    it('should return true when service-specific flag is set', () => {
      bridge.options.useNewTestService = true;
      expect(bridge.shouldUseNewService('TestService')).toBe(true);
    });
    
    it('should prioritize feature flags over global setting', () => {
      // Mock feature flags
      bridge.featureFlags = {
        isEnabled: jest.fn().mockReturnValue(true)
      };
      
      expect(bridge.shouldUseNewService('TestService')).toBe(true);
      expect(bridge.featureFlags.isEnabled).toHaveBeenCalledWith('useNewTestService');
    });
  });
  
  describe('getService', () => {
    beforeEach(() => {
      bridge.registerService('TestService', {
        old: mockOldService,
        new: mockNewService
      });
    });
    
    it('should return old service by default', async () => {
      const service = await bridge.getService('TestService');
      expect(service).toBeDefined();
      expect(mockOldService.initialize).toHaveBeenCalled();
    });
    
    it('should return new service when flag is enabled', async () => {
      bridge.options.useNewTestService = true;
      
      const service = await bridge.getService('TestService');
      expect(service).toBeDefined();
      expect(mockNewService.initialize).toHaveBeenCalled();
    });
    
    it('should cache service instances', async () => {
      const service1 = await bridge.getService('TestService');
      const service2 = await bridge.getService('TestService');
      
      expect(service1).toBe(service2);
      expect(mockOldService.initialize).toHaveBeenCalledTimes(1);
    });
    
    it('should throw error for unregistered service', async () => {
      await expect(bridge.getService('UnknownService')).rejects.toThrow(
        'Service UnknownService not registered'
      );
    });
    
    it('should wrap service with metrics collection', async () => {
      const service = await bridge.getService('TestService');
      
      await service.testMethod();
      
      const metrics = bridge.metrics.get('TestService');
      expect(metrics.oldCalls).toBe(1);
      expect(metrics.newCalls).toBe(0);
    });
  });
  
  describe('toggleService', () => {
    beforeEach(() => {
      bridge.registerService('TestService', {
        old: mockOldService,
        new: mockNewService
      });
    });
    
    it('should toggle from old to new', async () => {
      expect(bridge.shouldUseNewService('TestService')).toBe(false);
      
      await bridge.toggleService('TestService');
      
      expect(bridge.shouldUseNewService('TestService')).toBe(true);
    });
    
    it('should toggle from new to old', async () => {
      bridge.options.useNewTestService = true;
      expect(bridge.shouldUseNewService('TestService')).toBe(true);
      
      await bridge.toggleService('TestService');
      
      expect(bridge.shouldUseNewService('TestService')).toBe(false);
    });
    
    it('should set specific value', async () => {
      await bridge.toggleService('TestService', true);
      expect(bridge.shouldUseNewService('TestService')).toBe(true);
      
      await bridge.toggleService('TestService', false);
      expect(bridge.shouldUseNewService('TestService')).toBe(false);
    });
    
    it('should clear cached instances after toggle', async () => {
      const service1 = await bridge.getService('TestService');
      
      await bridge.toggleService('TestService');
      
      const service2 = await bridge.getService('TestService');
      expect(service1).not.toBe(service2);
    });
  });
  
  describe('metrics collection', () => {
    beforeEach(() => {
      bridge.registerService('TestService', {
        old: mockOldService,
        new: mockNewService
      });
    });
    
    it('should track method calls', async () => {
      const service = await bridge.getService('TestService');
      
      await service.testMethod();
      await service.testMethod();
      
      const metrics = bridge.metrics.get('TestService');
      expect(metrics.oldCalls).toBe(2);
    });
    
    it('should track errors', async () => {
      mockOldService.testMethod.mockRejectedValue(new Error('Test error'));
      
      const service = await bridge.getService('TestService');
      
      await expect(service.testMethod()).rejects.toThrow('Test error');
      
      const metrics = bridge.metrics.get('TestService');
      expect(metrics.errors.old).toBe(1);
    });
    
    it('should track response times', async () => {
      // Mock slow service
      mockOldService.testMethod.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('result'), 100))
      );
      
      const service = await bridge.getService('TestService');
      
      await service.testMethod();
      
      const metrics = bridge.metrics.get('TestService');
      expect(metrics.avgResponseTime.old).toBeGreaterThan(0);
    });
  });
  
  describe('getMetrics', () => {
    beforeEach(() => {
      bridge.registerService('TestService', {
        old: mockOldService,
        new: mockNewService
      });
    });
    
    it('should return metrics for all services', async () => {
      const service = await bridge.getService('TestService');
      await service.testMethod();
      
      const report = bridge.getMetrics();
      
      expect(report.TestService).toMatchObject({
        currentImplementation: 'old',
        metrics: {
          old: {
            calls: 1,
            errors: 0,
            errorRate: 0
          },
          new: {
            calls: 0,
            errors: 0,
            errorRate: 0
          }
        }
      });
    });
    
    it('should calculate error rates correctly', async () => {
      mockOldService.testMethod
        .mockResolvedValueOnce('success')
        .mockRejectedValueOnce(new Error('error'));
      
      const service = await bridge.getService('TestService');
      
      await service.testMethod();
      await expect(service.testMethod()).rejects.toThrow();
      
      const report = bridge.getMetrics();
      expect(report.TestService.metrics.old.errorRate).toBe(0.5);
    });
  });
  
  describe('healthCheck', () => {
    beforeEach(() => {
      bridge.registerService('TestService', {
        old: mockOldService,
        new: mockNewService
      });
    });
    
    it('should check health of all implementations', async () => {
      const results = await bridge.healthCheck();
      
      expect(results.TestService).toMatchObject({
        old: { healthy: true },
        new: { healthy: true }
      });
    });
    
    it('should use service health check method if available', async () => {
      mockOldService.healthCheck = jest.fn().mockResolvedValue({
        healthy: true,
        message: 'Custom health check'
      });
      
      const results = await bridge.healthCheck();
      
      expect(mockOldService.healthCheck).toHaveBeenCalled();
      expect(results.TestService.old).toMatchObject({
        healthy: true,
        message: 'Custom health check'
      });
    });
    
    it('should handle health check failures', async () => {
      mockNewService.initialize = jest.fn().mockRejectedValue(new Error('Init failed'));
      
      const results = await bridge.healthCheck();
      
      expect(results.TestService.new).toMatchObject({
        healthy: false,
        message: 'Init failed'
      });
    });
  });
  
  describe('cleanup', () => {
    beforeEach(() => {
      bridge.registerService('TestService', {
        old: mockOldService,
        new: mockNewService
      });
    });
    
    it('should cleanup all service instances', async () => {
      const service = await bridge.getService('TestService');
      
      await bridge.cleanup();
      
      expect(mockOldService.cleanup).toHaveBeenCalled();
      expect(bridge.services.size).toBe(0);
      expect(bridge.metrics.size).toBe(0);
    });
    
    it('should handle cleanup errors gracefully', async () => {
      mockOldService.cleanup.mockRejectedValue(new Error('Cleanup failed'));
      
      await bridge.getService('TestService');
      
      await expect(bridge.cleanup()).resolves.not.toThrow();
    });
  });
});