// Security Configuration for LightTrack
// Centralizes all security settings and validations

const InputValidator = require('./input-validator');
const CSPGenerator = require('./csp-generator');

class SecurityConfig {
  /**
   * Get secure BrowserWindow options
   * @param {object} additionalOptions - Additional window options
   * @returns {object} Secure window configuration
   */
  static getSecureWindowOptions(additionalOptions = {}) {
    const defaultSecure = {
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        experimentalFeatures: false,
        enableBlinkFeatures: '',
        navigateOnDragDrop: false,
        spellcheck: false,
        // Disable features that could be security risks
        plugins: false,
        webgl: false,
        audio: false,
        images: true
      }
    };

    // Merge with additional options, ensuring security settings are preserved
    const merged = {
      ...additionalOptions,
      webPreferences: {
        ...defaultSecure.webPreferences,
        ...(additionalOptions.webPreferences || {})
      }
    };

    // Ensure critical security settings cannot be overridden
    merged.webPreferences.nodeIntegration = false;
    merged.webPreferences.contextIsolation = true;
    merged.webPreferences.webSecurity = true;

    return merged;
  }

  /**
   * Validate IPC channel name
   * @param {string} channel - Channel name to validate
   * @returns {boolean} True if valid
   */
  static isValidIPCChannel(channel) {
    const validChannels = [
      // Activity channels
      'activities:get',
      'activities:add',
      'activities:update',
      'activities:delete',
      'activities:export',
      'activities:get-by-date-range',
      'activities:get-projects',
      'activities:search',

      // Settings channels
      'settings:get',
      'settings:set',
      'settings:get-value',
      'settings:set-value',

      // Tracking channels
      'tracking:toggle',
      'tracking:start',
      'tracking:stop',
      'tracking:pause',
      'tracking:resume',
      'tracking:get-current',
      'tracking:set-activity',

      // UI channels
      'ui:show-dashboard',
      'ui:show-dialog',
      'ui:show-help',
      'ui:minimize',
      'ui:restore',
      'ui:export-dialog',

      // Break channels
      'break:start',
      'break:end',
      'break:get-state',
      'break:snooze',

      // Pomodoro channels
      'pomodoro:start',
      'pomodoro:stop',
      'pomodoro:pause',
      'pomodoro:resume',
      'pomodoro:get-state',

      // App channels
      'app:quit',
      'app:get-version',
      'app:check-for-updates',
      'app:open-external',

      // Storage channels
      'storage:get-stats',
      'storage:optimize',
      'storage:clear-old-data'
    ];

    return validChannels.includes(channel);
  }

  /**
   * Create a secure IPC handler wrapper
   * @param {function} handler - Handler function
   * @param {object} options - Security options
   * @returns {function} Wrapped handler
   */
  static createSecureHandler(handler, options = {}) {
    const {
      validateInput = true,
      rateLimit = null,
      requireAuth = false,
      logAccess = true
    } = options;

    // Rate limiting map
    const rateLimitMap = new Map();

    return async (event, ...args) => {
      try {
        // Check if window is destroyed
        if (event.sender.isDestroyed()) {
          throw new Error('Window is destroyed');
        }

        // Rate limiting
        if (rateLimit) {
          const key = `${event.sender.id}:${handler.name}`;
          const now = Date.now();
          const lastCall = rateLimitMap.get(key) || 0;

          if (now - lastCall < rateLimit) {
            throw new Error('Rate limit exceeded');
          }

          rateLimitMap.set(key, now);
        }

        // Input validation
        if (validateInput && args.length > 0) {
          // Validate based on handler name
          const handlerName = handler.name;

          if (handlerName.includes('activity') || handlerName.includes('Activity')) {
            const validation = InputValidator.validateActivity(args[0]);
            if (!validation.valid) {
              throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
            }
            args[0] = validation.sanitized;
          } else if (handlerName.includes('settings') || handlerName.includes('Settings')) {
            const validation = InputValidator.validateSettings(args[0]);
            if (!validation.valid) {
              throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
            }
            args[0] = validation.sanitized;
          } else {
            // Generic string sanitization for other inputs
            args = args.map(arg => {
              if (typeof arg === 'string') {
                return InputValidator.sanitizeString(arg);
              }
              return arg;
            });
          }
        }

        // Execute handler
        const result = await handler(event, ...args);

        // Log access if enabled
        if (logAccess && process.env.NODE_ENV === 'development') {
          console.log(`[IPC] ${handler.name} called by window ${event.sender.id}`);
        }

        return result;
      } catch (error) {
        console.error(`[IPC Error] ${handler.name}:`, error.message);

        // Return safe error object
        return {
          success: false,
          error: error.message.substring(0, 200) // Limit error message length
        };
      }
    };
  }

  /**
   * Get security headers for HTTP responses
   * @returns {object} Security headers
   */
  static getSecurityHeaders() {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
    };
  }

  /**
   * Check if URL is safe to open
   * @param {string} url - URL to check
   * @returns {boolean} True if safe
   */
  static isSafeURL(url) {
    try {
      const parsed = new URL(url);

      // Only allow http(s) protocols
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return false;
      }

      // Block known dangerous domains
      const blockedDomains = [
        'javascript:',
        'data:',
        'vbscript:',
        'file:'
      ];

      if (blockedDomains.some(domain => url.toLowerCase().includes(domain))) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sanitize file export data
   * @param {object} data - Data to export
   * @returns {object} Sanitized data
   */
  static sanitizeExportData(data) {
    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeExportData(item));
    }

    if (typeof data === 'object' && data !== null) {
      const sanitized = {};

      for (const [key, value] of Object.entries(data)) {
        // Skip sensitive fields
        if (['password', 'token', 'secret', 'key'].some(sensitive =>
          key.toLowerCase().includes(sensitive)
        )) {
          continue;
        }

        if (typeof value === 'string') {
          sanitized[key] = InputValidator.sanitizeString(value);
        } else if (typeof value === 'object') {
          sanitized[key] = this.sanitizeExportData(value);
        } else {
          sanitized[key] = value;
        }
      }

      return sanitized;
    }

    return data;
  }

  /**
   * Get recommended session configuration
   * @returns {object} Session configuration
   */
  static getSessionConfig() {
    return {
      // Partition for isolation
      partition: 'persist:lighttrack',

      // Clear data on startup
      clearStorageData: {
        storages: ['appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers'],
        quotas: ['temporary', 'persistent', 'syncable']
      },

      // Cookie configuration
      cookies: {
        httpOnly: true,
        secure: true,
        sameSite: 'strict'
      }
    };
  }

  /**
   * Remove dangerous content from HTML
   * @param {string} html - HTML content
   * @returns {string} Sanitized HTML
   */
  static sanitizeHTML(html) {
    if (typeof html !== 'string') return '';

    // Remove script tags and event handlers
    let sanitized = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/on\w+\s*=\s*'[^']*'/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/vbscript:/gi, '');

    // Remove dangerous tags
    const dangerousTags = ['iframe', 'object', 'embed', 'link', 'style', 'meta', 'base'];
    dangerousTags.forEach(tag => {
      const regex = new RegExp(`<${tag}[^>]*>.*?</${tag}>|<${tag}[^>]*/>`, 'gi');
      sanitized = sanitized.replace(regex, '');
    });

    return sanitized;
  }
}

module.exports = SecurityConfig;
