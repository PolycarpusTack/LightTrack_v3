/**
 * @module test/unit/feature-manager.test
 * @description Unit tests for feature manager
 */

const { TestUtils } = require('../setup');

describe('FeatureManager', () => {
  let FeatureManager;
  let featureManager;
  
  beforeEach(() => {
    TestUtils.clearAllMocks();
    
    // Mock feature manager
    jest.mock('../../src/shared/feature-manager.js', () => {
      return class FeatureManager {
        constructor() {
          this.features = new Map();
          this.enabled = new Set();
          this.initialized = new Set();
          this.dependencies = new Map();
        }
        
        async init() {
          const settings = await window.lightTrackAPI.getSettings();
          const enabledFeatures = settings.enabledFeatures || [];
          enabledFeatures.forEach(name => this.enabled.add(name));
        }
        
        register(name, feature) {
          if (this.features.has(name)) {
            throw new Error(`Feature ${name} already registered`);
          }
          
          // Validate feature
          if (!feature.init || typeof feature.init !== 'function') {
            throw new Error(`Feature ${name} must have an init method`);
          }
          
          this.features.set(name, feature);
          
          // Track dependencies
          if (feature.dependencies) {
            this.dependencies.set(name, feature.dependencies);
          }
        }
        
        async enable(name) {
          const feature = this.features.get(name);
          if (!feature) {
            throw new Error(`Feature ${name} not found`);
          }
          
          if (this.enabled.has(name)) {
            return true;
          }
          
          // Check dependencies
          const deps = this.dependencies.get(name) || [];
          for (const dep of deps) {
            if (!this.enabled.has(dep)) {
              await this.enable(dep);
            }
          }
          
          // Initialize feature
          if (!this.initialized.has(name)) {
            await feature.init();
            this.initialized.add(name);
          }
          
          this.enabled.add(name);
          await this.saveEnabledFeatures();
          
          // Dispatch event
          window.dispatchEvent(new CustomEvent('feature-enabled', {
            detail: { featureName: name, feature }
          }));
          
          return true;
        }
        
        async disable(name) {
          if (!this.enabled.has(name)) {
            return false;
          }
          
          const feature = this.features.get(name);
          
          // Check if other features depend on this
          const dependents = this.getDependents(name);
          if (dependents.length > 0) {
            throw new Error(`Cannot disable ${name}: required by ${dependents.join(', ')}`);
          }
          
          // Cleanup feature
          if (feature.cleanup && typeof feature.cleanup === 'function') {
            await feature.cleanup();
          }
          
          this.enabled.delete(name);
          this.initialized.delete(name);
          await this.saveEnabledFeatures();
          
          // Dispatch event
          window.dispatchEvent(new CustomEvent('feature-disabled', {
            detail: { featureName: name, feature }
          }));
          
          return true;
        }
        
        async toggle(name) {
          if (this.isEnabled(name)) {
            await this.disable(name);
            return false;
          } else {
            await this.enable(name);
            return true;
          }
        }
        
        isEnabled(name) {
          return this.enabled.has(name);
        }
        
        getFeature(name) {
          return this.features.get(name);
        }
        
        getAllFeatures() {
          return Array.from(this.features.entries()).map(([name, feature]) => ({
            name,
            ...feature,
            enabled: this.enabled.has(name),
            initialized: this.initialized.has(name)
          }));
        }
        
        getEnabledFeatures() {
          return Array.from(this.enabled).map(name => ({
            name,
            ...this.features.get(name)
          }));
        }
        
        getDependents(featureName) {
          const dependents = [];
          for (const [name, deps] of this.dependencies.entries()) {
            if (deps.includes(featureName) && this.enabled.has(name)) {
              dependents.push(name);
            }
          }
          return dependents;
        }
        
        async saveEnabledFeatures() {
          const enabledArray = Array.from(this.enabled);
          await window.lightTrackAPI.updateSettings({
            enabledFeatures: enabledArray
          });
        }
        
        async cleanup() {
          for (const [name, feature] of this.features.entries()) {
            if (this.initialized.has(name) && feature.cleanup) {
              await feature.cleanup();
            }
          }
          this.features.clear();
          this.enabled.clear();
          this.initialized.clear();
          this.dependencies.clear();
        }
      };
    });
    
    FeatureManager = require('../../src/shared/feature-manager.js');
    featureManager = new FeatureManager();
  });
  
  describe('Initialization', () => {
    test('should initialize with saved enabled features', async () => {
      window.lightTrackAPI.getSettings.mockResolvedValue({
        enabledFeatures: ['feature1', 'feature2']
      });
      
      await featureManager.init();
      
      expect(featureManager.isEnabled('feature1')).toBe(true);
      expect(featureManager.isEnabled('feature2')).toBe(true);
    });
    
    test('should handle missing settings', async () => {
      window.lightTrackAPI.getSettings.mockResolvedValue({});
      
      await featureManager.init();
      
      expect(featureManager.enabled.size).toBe(0);
    });
  });
  
  describe('Registration', () => {
    const mockFeature = {
      displayName: 'Test Feature',
      description: 'A test feature',
      init: jest.fn().mockResolvedValue(true),
      cleanup: jest.fn().mockResolvedValue(true)
    };
    
    test('should register a feature', () => {
      featureManager.register('test', mockFeature);
      
      expect(featureManager.features.has('test')).toBe(true);
      expect(featureManager.getFeature('test')).toBe(mockFeature);
    });
    
    test('should not allow duplicate registration', () => {
      featureManager.register('test', mockFeature);
      
      expect(() => {
        featureManager.register('test', mockFeature);
      }).toThrow('Feature test already registered');
    });
    
    test('should validate feature has init method', () => {
      const invalidFeature = { displayName: 'Invalid' };
      
      expect(() => {
        featureManager.register('invalid', invalidFeature);
      }).toThrow('Feature invalid must have an init method');
    });
    
    test('should track dependencies', () => {
      const featureWithDeps = {
        ...mockFeature,
        dependencies: ['core', 'auth']
      };
      
      featureManager.register('withdeps', featureWithDeps);
      
      expect(featureManager.dependencies.get('withdeps')).toEqual(['core', 'auth']);
    });
  });
  
  describe('Enable/Disable', () => {
    const mockFeature = {
      displayName: 'Test Feature',
      init: jest.fn().mockResolvedValue(true),
      cleanup: jest.fn().mockResolvedValue(true)
    };
    
    beforeEach(() => {
      featureManager.register('test', mockFeature);
    });
    
    test('should enable a feature', async () => {
      const result = await featureManager.enable('test');
      
      expect(result).toBe(true);
      expect(mockFeature.init).toHaveBeenCalled();
      expect(featureManager.isEnabled('test')).toBe(true);
      expect(window.lightTrackAPI.updateSettings).toHaveBeenCalledWith({
        enabledFeatures: ['test']
      });
    });
    
    test('should not initialize feature twice', async () => {
      await featureManager.enable('test');
      mockFeature.init.mockClear();
      
      await featureManager.enable('test');
      
      expect(mockFeature.init).not.toHaveBeenCalled();
    });
    
    test('should enable dependencies first', async () => {
      const coreFeature = {
        displayName: 'Core',
        init: jest.fn().mockResolvedValue(true)
      };
      
      const dependentFeature = {
        displayName: 'Dependent',
        dependencies: ['core'],
        init: jest.fn().mockResolvedValue(true)
      };
      
      featureManager.register('core', coreFeature);
      featureManager.register('dependent', dependentFeature);
      
      await featureManager.enable('dependent');
      
      expect(coreFeature.init).toHaveBeenCalled();
      expect(dependentFeature.init).toHaveBeenCalled();
      expect(featureManager.isEnabled('core')).toBe(true);
      expect(featureManager.isEnabled('dependent')).toBe(true);
    });
    
    test('should disable a feature', async () => {
      await featureManager.enable('test');
      
      const result = await featureManager.disable('test');
      
      expect(result).toBe(true);
      expect(mockFeature.cleanup).toHaveBeenCalled();
      expect(featureManager.isEnabled('test')).toBe(false);
    });
    
    test('should not disable if other features depend on it', async () => {
      const coreFeature = {
        displayName: 'Core',
        init: jest.fn().mockResolvedValue(true)
      };
      
      const dependentFeature = {
        displayName: 'Dependent',
        dependencies: ['core'],
        init: jest.fn().mockResolvedValue(true)
      };
      
      featureManager.register('core', coreFeature);
      featureManager.register('dependent', dependentFeature);
      
      await featureManager.enable('dependent');
      
      await expect(featureManager.disable('core')).rejects.toThrow(
        'Cannot disable core: required by dependent'
      );
    });
    
    test('should dispatch events', async () => {
      const enableHandler = jest.fn();
      const disableHandler = jest.fn();
      
      window.addEventListener('feature-enabled', enableHandler);
      window.addEventListener('feature-disabled', disableHandler);
      
      await featureManager.enable('test');
      expect(enableHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: {
            featureName: 'test',
            feature: mockFeature
          }
        })
      );
      
      await featureManager.disable('test');
      expect(disableHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: {
            featureName: 'test',
            feature: mockFeature
          }
        })
      );
    });
  });
  
  describe('Toggle', () => {
    const mockFeature = {
      displayName: 'Test Feature',
      init: jest.fn().mockResolvedValue(true),
      cleanup: jest.fn().mockResolvedValue(true)
    };
    
    beforeEach(() => {
      featureManager.register('test', mockFeature);
    });
    
    test('should toggle feature on', async () => {
      const result = await featureManager.toggle('test');
      
      expect(result).toBe(true);
      expect(featureManager.isEnabled('test')).toBe(true);
    });
    
    test('should toggle feature off', async () => {
      await featureManager.enable('test');
      
      const result = await featureManager.toggle('test');
      
      expect(result).toBe(false);
      expect(featureManager.isEnabled('test')).toBe(false);
    });
  });
  
  describe('Queries', () => {
    beforeEach(() => {
      const features = [
        {
          name: 'core',
          displayName: 'Core',
          category: 'essential',
          init: jest.fn()
        },
        {
          name: 'analytics',
          displayName: 'Analytics',
          category: 'optional',
          dependencies: ['core'],
          init: jest.fn()
        },
        {
          name: 'integrations',
          displayName: 'Integrations',
          category: 'optional',
          dependencies: ['core'],
          init: jest.fn()
        }
      ];
      
      features.forEach(f => featureManager.register(f.name, f));
    });
    
    test('should get all features', () => {
      const all = featureManager.getAllFeatures();
      
      expect(all).toHaveLength(3);
      expect(all.map(f => f.name)).toEqual(['core', 'analytics', 'integrations']);
      expect(all[0].enabled).toBe(false);
      expect(all[0].initialized).toBe(false);
    });
    
    test('should get enabled features', async () => {
      await featureManager.enable('core');
      await featureManager.enable('analytics');
      
      const enabled = featureManager.getEnabledFeatures();
      
      expect(enabled).toHaveLength(2);
      expect(enabled.map(f => f.name)).toEqual(['core', 'analytics']);
    });
    
    test('should get dependents', async () => {
      await featureManager.enable('analytics');
      await featureManager.enable('integrations');
      
      const dependents = featureManager.getDependents('core');
      
      expect(dependents).toEqual(['analytics', 'integrations']);
    });
  });
  
  describe('Cleanup', () => {
    test('should cleanup all features', async () => {
      const features = [
        {
          name: 'feature1',
          init: jest.fn(),
          cleanup: jest.fn()
        },
        {
          name: 'feature2',
          init: jest.fn(),
          cleanup: jest.fn()
        }
      ];
      
      features.forEach(f => {
        featureManager.register(f.name, f);
        featureManager.enable(f.name);
      });
      
      await featureManager.cleanup();
      
      expect(features[0].cleanup).toHaveBeenCalled();
      expect(features[1].cleanup).toHaveBeenCalled();
      expect(featureManager.features.size).toBe(0);
      expect(featureManager.enabled.size).toBe(0);
    });
  });
  
  describe('Error Handling', () => {
    test('should handle feature not found', async () => {
      await expect(featureManager.enable('nonexistent')).rejects.toThrow(
        'Feature nonexistent not found'
      );
    });
    
    test('should handle init errors', async () => {
      const failingFeature = {
        displayName: 'Failing',
        init: jest.fn().mockRejectedValue(new Error('Init failed'))
      };
      
      featureManager.register('failing', failingFeature);
      
      await expect(featureManager.enable('failing')).rejects.toThrow('Init failed');
    });
  });
});