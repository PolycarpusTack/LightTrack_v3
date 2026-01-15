// Input Validation and Sanitization Module
// Provides secure input handling for LightTrack

const path = require('path');
const { app } = require('electron');

class InputValidator {
  // Maximum lengths for different field types
  static MAX_LENGTHS = {
    name: 200,
    description: 5000,
    project: 100,
    tag: 50,
    url: 2048,
    filepath: 260, // Windows MAX_PATH
    general: 1000
  };

  // Dangerous patterns to check
  static DANGEROUS_PATTERNS = {
    sqlInjection: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|CREATE|ALTER|EXEC|EXECUTE)\b)|(-{2})|(\||;|'|")/gi,
    pathTraversal: /(\.\.[\/\\])|([\/\\]\.\.[\/\\]?)/g,
    scriptInjection: /<script[^>]*>|<\/script>|javascript:|onerror=|onclick=|onload=/gi,
    commandInjection: /[;&|`$(){}[\]<>]/g
  };

  /**
   * Sanitize string input to prevent XSS
   * @param {string} input - Raw input string
   * @param {string} fieldType - Type of field for length limits
   * @returns {string} Sanitized string
   */
  static sanitizeString(input, fieldType = 'general') {
    if (typeof input !== 'string') {
      return '';
    }

    // Remove null bytes
    let sanitized = input.replace(/\0/g, '');

    // HTML entity encoding for dangerous characters
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');

    // Trim and apply length limit
    const maxLength = this.MAX_LENGTHS[fieldType] || this.MAX_LENGTHS.general;
    sanitized = sanitized.trim().substring(0, maxLength);

    return sanitized;
  }

  /**
   * Validate and sanitize file paths
   * @param {string} filepath - File path to validate
   * @param {boolean} mustExist - Whether the path must exist
   * @returns {object} { valid: boolean, sanitized: string, error?: string }
   */
  static validateFilePath(filepath, mustExist = false) {
    if (!filepath || typeof filepath !== 'string') {
      return { valid: false, sanitized: '', error: 'Invalid file path' };
    }

    // Remove null bytes and trim
    let sanitized = filepath.replace(/\0/g, '').trim();

    // Check for path traversal attempts
    if (this.DANGEROUS_PATTERNS.pathTraversal.test(sanitized)) {
      return { valid: false, sanitized: '', error: 'Path traversal detected' };
    }

    // Normalize the path
    sanitized = path.normalize(sanitized);

    // Ensure it's within app boundaries if relative
    if (!path.isAbsolute(sanitized)) {
      const allowedPaths = [
        app.getPath('userData'),
        app.getPath('documents'),
        app.getPath('downloads'),
        app.getPath('temp')
      ];

      const resolvedPath = path.resolve(sanitized);
      const isAllowed = allowedPaths.some(allowed =>
        resolvedPath.startsWith(allowed)
      );

      if (!isAllowed) {
        return { valid: false, sanitized: '', error: 'Path outside allowed directories' };
      }
    }

    // Check length
    if (sanitized.length > this.MAX_LENGTHS.filepath) {
      return { valid: false, sanitized: '', error: 'Path too long' };
    }

    return { valid: true, sanitized };
  }

  /**
   * Validate activity object
   * @param {object} activity - Activity object to validate
   * @returns {object} { valid: boolean, sanitized: object, errors: string[] }
   */
  static validateActivity(activity) {
    const errors = [];
    const sanitized = {};

    // Required fields
    if (!activity || typeof activity !== 'object') {
      return { valid: false, sanitized: {}, errors: ['Invalid activity object'] };
    }

    // Name validation (required)
    if (!activity.name || typeof activity.name !== 'string') {
      errors.push('Activity name is required');
    } else {
      sanitized.name = this.sanitizeString(activity.name, 'name');
      if (sanitized.name.length < 1) {
        errors.push('Activity name cannot be empty');
      }
    }

    // StartTime validation (required)
    if (!activity.startTime) {
      errors.push('Start time is required');
    } else {
      const startTime = new Date(activity.startTime);
      if (isNaN(startTime.getTime())) {
        errors.push('Invalid start time');
      } else {
        sanitized.startTime = startTime.toISOString();
      }
    }

    // Optional fields
    if (activity.endTime) {
      const endTime = new Date(activity.endTime);
      if (isNaN(endTime.getTime())) {
        errors.push('Invalid end time');
      } else {
        sanitized.endTime = endTime.toISOString();

        // Validate time range
        if (sanitized.startTime && endTime < new Date(sanitized.startTime)) {
          errors.push('End time cannot be before start time');
        }
      }
    }

    // Project validation
    if (activity.project) {
      sanitized.project = this.sanitizeString(activity.project, 'project');
    }

    // Tags validation
    if (activity.tags) {
      if (Array.isArray(activity.tags)) {
        sanitized.tags = activity.tags
          .filter(tag => typeof tag === 'string')
          .map(tag => this.sanitizeString(tag, 'tag'))
          .filter(tag => tag.length > 0)
          .slice(0, 20); // Limit number of tags
      } else {
        errors.push('Tags must be an array');
      }
    }

    // Description validation
    if (activity.description) {
      sanitized.description = this.sanitizeString(activity.description, 'description');
    }

    // Billable validation
    if (activity.billable !== undefined) {
      sanitized.billable = Boolean(activity.billable);
    }

    // App and title validation
    if (activity.app) {
      sanitized.app = this.sanitizeString(activity.app, 'name');
    }

    if (activity.title) {
      sanitized.title = this.sanitizeString(activity.title, 'name');
    }

    // Duration validation
    if (activity.duration !== undefined) {
      const duration = Number(activity.duration);
      if (isNaN(duration) || duration < 0) {
        errors.push('Invalid duration');
      } else {
        sanitized.duration = Math.floor(duration);
      }
    }

    // ID validation (if updating)
    if (activity.id) {
      sanitized.id = String(activity.id).substring(0, 50);
    }

    return {
      valid: errors.length === 0,
      sanitized,
      errors
    };
  }

  /**
   * Validate settings object
   * @param {object} settings - Settings object to validate
   * @returns {object} { valid: boolean, sanitized: object, errors: string[] }
   */
  static validateSettings(settings) {
    const errors = [];
    const sanitized = {};

    if (!settings || typeof settings !== 'object') {
      return { valid: false, sanitized: {}, errors: ['Invalid settings object'] };
    }

    // Validate each setting type
    const validators = {
      string: (value, key) => this.sanitizeString(value, 'general'),
      number: (value, key, min = 0, max = Infinity) => {
        const num = Number(value);
        if (isNaN(num)) {
          errors.push(`Invalid number for ${key}`);
          return null;
        }
        return Math.max(min, Math.min(max, num));
      },
      boolean: (value) => Boolean(value),
      array: (value, key, itemValidator) => {
        if (!Array.isArray(value)) {
          errors.push(`${key} must be an array`);
          return [];
        }
        return value.map(itemValidator).filter(item => item !== null);
      }
    };

    // Define setting schemas
    const settingSchemas = {
      trackingInterval: { type: 'number', min: 1000, max: 3600000 },
      autoStart: { type: 'boolean' },
      minimizeToTray: { type: 'boolean' },
      theme: { type: 'string' },
      shortcuts: { type: 'object' },
      breakReminders: { type: 'object' },
      notifications: { type: 'boolean' },
      sound: { type: 'boolean' }
    };

    // Validate each setting
    for (const [key, value] of Object.entries(settings)) {
      const schema = settingSchemas[key];

      if (!schema) {
        // Unknown setting, skip
        continue;
      }

      switch (schema.type) {
        case 'string':
          sanitized[key] = validators.string(value, key);
          break;
        case 'number':
          const numValue = validators.number(value, key, schema.min, schema.max);
          if (numValue !== null) {
            sanitized[key] = numValue;
          }
          break;
        case 'boolean':
          sanitized[key] = validators.boolean(value);
          break;
        case 'object':
          // Deep validation for nested objects would go here
          // For now, just check it's an object
          if (typeof value === 'object' && value !== null) {
            sanitized[key] = value;
          } else {
            errors.push(`${key} must be an object`);
          }
          break;
      }
    }

    return {
      valid: errors.length === 0,
      sanitized,
      errors
    };
  }

  /**
   * Check for SQL injection patterns
   * @param {string} input - Input to check
   * @returns {boolean} True if potentially dangerous
   */
  static hasSQLInjectionRisk(input) {
    if (typeof input !== 'string') return false;
    return this.DANGEROUS_PATTERNS.sqlInjection.test(input);
  }

  /**
   * Check for script injection patterns
   * @param {string} input - Input to check
   * @returns {boolean} True if potentially dangerous
   */
  static hasScriptInjectionRisk(input) {
    if (typeof input !== 'string') return false;
    return this.DANGEROUS_PATTERNS.scriptInjection.test(input);
  }

  /**
   * Check for command injection patterns
   * @param {string} input - Input to check
   * @returns {boolean} True if potentially dangerous
   */
  static hasCommandInjectionRisk(input) {
    if (typeof input !== 'string') return false;
    return this.DANGEROUS_PATTERNS.commandInjection.test(input);
  }
}

module.exports = InputValidator;
