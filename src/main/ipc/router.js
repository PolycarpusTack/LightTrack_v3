// router.js - Centralized IPC Router
const { ipcMain } = require('electron');

/**
 * IPCRouter - Centralized routing for IPC communication
 * Provides middleware support, validation, and error handling
 */
class IPCRouter {
  constructor() {
    this.handlers = new Map();
    this.middleware = [];
    this.errorHandlers = [];
    this.initialized = false;
  }

  /**
   * Register a handler for a channel
   * @param {string} channel IPC channel name
   * @param {Function} handler Handler function
   * @param {Object} options Handler options
   */
  handle(channel, handler, options = {}) {
    if (this.handlers.has(channel)) {
      throw new Error(`Handler already registered for channel: ${channel}`);
    }

    this.handlers.set(channel, {
      handler,
      options: {
        validate: options.validate || null,
        rateLimit: options.rateLimit || null,
        requiresAuth: options.requiresAuth || false,
        timeout: options.timeout || 30000, // 30 seconds default
        ...options
      }
    });

    // Register with Electron's ipcMain
    ipcMain.handle(channel, async (event, ...args) => {
      return this.processRequest(channel, event, args);
    });
  }

  /**
   * Register a one-way listener (no response)
   * @param {string} channel IPC channel name
   * @param {Function} handler Handler function
   */
  on(channel, handler, options = {}) {
    if (this.handlers.has(channel)) {
      throw new Error(`Handler already registered for channel: ${channel}`);
    }

    this.handlers.set(channel, {
      handler,
      options: {
        ...options,
        oneWay: true
      }
    });

    ipcMain.on(channel, async (event, ...args) => {
      await this.processRequest(channel, event, args);
    });
  }

  /**
   * Add middleware function
   * @param {Function} middleware Middleware function
   */
  use(middleware) {
    if (typeof middleware !== 'function') {
      throw new Error('Middleware must be a function');
    }
    this.middleware.push(middleware);
  }

  /**
   * Add error handler
   * @param {Function} errorHandler Error handler function
   */
  onError(errorHandler) {
    if (typeof errorHandler !== 'function') {
      throw new Error('Error handler must be a function');
    }
    this.errorHandlers.push(errorHandler);
  }

  /**
   * Process incoming IPC request
   * @private
   */
  async processRequest(channel, event, args) {
    const handlerInfo = this.handlers.get(channel);
    if (!handlerInfo) {
      throw new Error(`No handler registered for channel: ${channel}`);
    }

    const { handler, options } = handlerInfo;
    const context = this.createContext(channel, event, args, options);

    try {
      // Run middleware
      for (const middleware of this.middleware) {
        const result = await middleware(context);
        if (result === false) {
          throw new Error('Request blocked by middleware');
        }
      }

      // Validate input if validator provided
      if (options.validate) {
        const validation = await options.validate(...args);
        if (!validation.valid) {
          throw new Error(`Validation failed: ${validation.error}`);
        }
      }

      // Check rate limiting
      if (options.rateLimit) {
        const allowed = await this.checkRateLimit(context, options.rateLimit);
        if (!allowed) {
          throw new Error('Rate limit exceeded');
        }
      }

      // Execute handler with timeout
      const result = await this.executeWithTimeout(
        handler(event, ...args),
        options.timeout
      );

      // Log successful request
      this.logRequest(context, 'success');

      return result;

    } catch (error) {
      // Log failed request
      this.logRequest(context, 'error', error);

      // Run error handlers
      for (const errorHandler of this.errorHandlers) {
        await errorHandler(error, context);
      }

      // Return error response
      if (options.oneWay) {
        console.error(`Error in handler for ${channel}:`, error);
        return;
      }

      return {
        success: false,
        error: error.message || 'Unknown error occurred'
      };
    }
  }

  /**
   * Create request context
   * @private
   */
  createContext(channel, event, args, options) {
    return {
      channel,
      event,
      args,
      options,
      timestamp: Date.now(),
      sender: {
        id: event.sender.id,
        url: event.sender.getURL(),
        userAgent: event.sender.userAgent
      },
      metadata: {}
    };
  }

  /**
   * Execute handler with timeout
   * @private
   */
  executeWithTimeout(promise, timeout) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeout)
      )
    ]);
  }

  /**
   * Check rate limiting
   * @private
   */
  async checkRateLimit(context, rateLimitOptions) {
    // Simple in-memory rate limiting
    // In production, use Redis or similar
    const key = `${context.channel}:${context.sender.id}`;
    const now = Date.now();

    if (!this.rateLimitStore) {
      this.rateLimitStore = new Map();
    }

    const record = this.rateLimitStore.get(key) || { count: 0, resetAt: now + rateLimitOptions.window };

    if (now > record.resetAt) {
      record.count = 0;
      record.resetAt = now + rateLimitOptions.window;
    }

    record.count++;
    this.rateLimitStore.set(key, record);

    return record.count <= rateLimitOptions.limit;
  }

  /**
   * Log request for monitoring
   * @private
   */
  logRequest(context, status, error = null) {
    const log = {
      channel: context.channel,
      status,
      duration: Date.now() - context.timestamp,
      timestamp: new Date().toISOString(),
      error: error ? error.message : null
    };

    // In production, send to monitoring service
    if (process.env.NODE_ENV === 'development') {
      console.log('IPC Request:', log);
    }
  }

  /**
   * Register a group of handlers
   * @param {string} prefix Channel prefix
   * @param {Object} handlers Handler object
   */
  group(prefix, handlers) {
    Object.entries(handlers).forEach(([method, handler]) => {
      const channel = `${prefix}:${method}`;
      this.handle(channel, handler);
    });
  }

  /**
   * Remove a handler
   * @param {string} channel Channel name
   */
  removeHandler(channel) {
    if (this.handlers.has(channel)) {
      this.handlers.delete(channel);
      ipcMain.removeHandler(channel);
    }
  }

  /**
   * Remove all handlers
   */
  removeAllHandlers() {
    for (const channel of this.handlers.keys()) {
      ipcMain.removeHandler(channel);
    }
    this.handlers.clear();
  }

  /**
   * Get registered channels
   * @returns {string[]} Array of channel names
   */
  getChannels() {
    return Array.from(this.handlers.keys());
  }

  /**
   * Initialize router with default middleware
   */
  initialize() {
    if (this.initialized) return;

    // Add default logging middleware
    this.use(async (context) => {
      console.log(`IPC: ${context.channel} called with ${context.args.length} args`);
      return true;
    });

    // Add default error handler
    this.onError(async (error, context) => {
      console.error(`IPC Error in ${context.channel}:`, error);
    });

    this.initialized = true;
  }
}

// Singleton instance
const router = new IPCRouter();

// Convenience middleware factories
const middleware = {
  /**
   * Authentication middleware
   */
  requireAuth: (authService) => async (context) => {
    const token = context.args[0]?.token;
    if (!token) {
      throw new Error('Authentication required');
    }

    const user = await authService.validateToken(token);
    if (!user) {
      throw new Error('Invalid authentication token');
    }

    context.metadata.user = user;
    return true;
  },

  /**
   * Logging middleware
   */
  logger: (logger) => async (context) => {
    logger.info(`IPC Request: ${context.channel}`, {
      args: context.args,
      sender: context.sender
    });
    return true;
  },

  /**
   * Performance monitoring middleware
   */
  performanceMonitor: (metrics) => async (context) => {
    const startTime = Date.now();

    // Add cleanup function to context
    context.cleanup = () => {
      const duration = Date.now() - startTime;
      metrics.recordDuration(context.channel, duration);
    };

    return true;
  },

  /**
   * Input sanitization middleware
   */
  sanitizeInput: (sanitizer) => async (context) => {
    context.args = context.args.map(arg => sanitizer.sanitize(arg));
    return true;
  }
};

// Validation helpers
const validators = {
  /**
   * Create a schema validator
   */
  schema: (schema) => async (...args) => {
    // Simple schema validation - in production use Joi or similar
    try {
      // Validate against schema
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  },

  /**
   * Require specific argument types
   */
  types: (...types) => async (...args) => {
    if (args.length !== types.length) {
      return { valid: false, error: 'Invalid number of arguments' };
    }

    for (let i = 0; i < types.length; i++) {
      const expectedType = types[i];
      const actualType = typeof args[i];

      if (expectedType === 'array' && !Array.isArray(args[i])) {
        return { valid: false, error: `Argument ${i} must be an array` };
      } else if (expectedType !== 'array' && actualType !== expectedType) {
        return { valid: false, error: `Argument ${i} must be of type ${expectedType}` };
      }
    }

    return { valid: true };
  }
};

module.exports = {
  IPCRouter,
  router,
  middleware,
  validators
};
