// browser-extension-server.js - HTTP API server for browser extension
// Handles communication between browser extension and LightTrack desktop app

const http = require('http');
const crypto = require('crypto');
const { BROWSER_EXTENSION_PORT } = require('../../shared/constants');

// Rate limiting: max requests per minute per endpoint
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60000;

class BrowserExtensionServer {
  constructor(activityTracker, storage) {
    this.activityTracker = activityTracker;
    this.storage = storage;
    this.server = null;
    this.isRunning = false;

    // Security: session token for authenticated requests
    this.sessionToken = crypto.randomBytes(32).toString('hex');

    // Rate limiting state
    this.requestCounts = new Map();
  }

  /**
   * Check if request origin is allowed
   * Only allow: browser extensions (chrome-extension://, moz-extension://)
   * or no origin (direct requests from CLI tools, Electron, etc.)
   */
  isOriginAllowed(origin) {
    if (!origin) return true; // No origin = direct request, allowed
    if (origin.startsWith('chrome-extension://')) return true;
    if (origin.startsWith('moz-extension://')) return true;
    if (origin.startsWith('safari-extension://')) return true;
    return false;
  }

  /**
   * Validate session token from Authorization header
   * Token format: "Bearer <token>"
   */
  validateToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return false;

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return false;

    return parts[1] === this.sessionToken;
  }

  /**
   * Check rate limit for endpoint
   */
  isRateLimited(endpoint) {
    const now = Date.now();
    const key = endpoint;

    if (!this.requestCounts.has(key)) {
      this.requestCounts.set(key, { count: 1, windowStart: now });
      return false;
    }

    const data = this.requestCounts.get(key);
    if (now - data.windowStart > RATE_WINDOW_MS) {
      // Reset window
      data.count = 1;
      data.windowStart = now;
      return false;
    }

    data.count++;
    return data.count > RATE_LIMIT;
  }

  /**
   * Start the HTTP server for browser extension communication
   */
  start() {
    if (this.isRunning) {
      console.log('Browser extension server already running');
      return;
    }

    this.server = http.createServer((req, res) => {
      const origin = req.headers.origin;

      // Security: Check origin for non-GET requests
      if (req.method !== 'GET' && req.method !== 'OPTIONS') {
        if (!this.isOriginAllowed(origin)) {
          console.warn(`Rejected request from disallowed origin: ${origin}`);
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Forbidden: Invalid origin' }));
          return;
        }
      }

      // Rate limiting
      if (this.isRateLimited(req.url)) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Too many requests' }));
        return;
      }

      // Set CORS headers - only for allowed origins
      if (origin && this.isOriginAllowed(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Route requests
      if (req.method === 'GET' && req.url === '/status') {
        this.handleStatus(req, res);
      } else if (req.method === 'POST' && req.url === '/browser-activity') {
        // Validate session token for POST requests
        if (!this.validateToken(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized: Invalid or missing token' }));
          return;
        }
        this.handleBrowserActivity(req, res);
      } else if (req.method === 'POST' && req.url === '/page-context') {
        // Validate session token for POST requests
        if (!this.validateToken(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized: Invalid or missing token' }));
          return;
        }
        this.handlePageContext(req, res);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    this.server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${BROWSER_EXTENSION_PORT} is already in use. Browser extension server not started.`);
      } else {
        console.error('Browser extension server error:', err);
      }
    });

    this.server.listen(BROWSER_EXTENSION_PORT, '127.0.0.1', () => {
      console.log(`Browser extension server listening on http://127.0.0.1:${BROWSER_EXTENSION_PORT}`);
      this.isRunning = true;
    });
  }

  /**
   * Stop the HTTP server
   */
  stop() {
    if (this.server) {
      this.server.close(() => {
        console.log('Browser extension server stopped');
        this.isRunning = false;
      });
    }
  }

  /**
   * Handle GET /status - Check if LightTrack is running
   * Returns session token only to allowed origins (browser extensions)
   */
  handleStatus(req, res) {
    const origin = req.headers.origin;
    const isTracking = this.activityTracker?.isTracking || false;

    const response = {
      status: 'ok',
      version: '3.0.0',
      tracking: isTracking
    };

    // Only provide token to browser extensions (not web pages)
    // Web pages have an origin like https://example.com
    // Extensions have chrome-extension://, moz-extension://, etc.
    if (this.isOriginAllowed(origin)) {
      response.token = this.sessionToken;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
  }

  /**
   * Handle POST /browser-activity - Receive activity from browser extension
   */
  handleBrowserActivity(req, res) {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
      // Limit body size to prevent abuse
      if (body.length > 10000) {
        req.destroy();
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request too large' }));
        return;
      }
    });

    req.on('end', () => {
      try {
        const activity = JSON.parse(body);

        // Validate required fields
        if (!activity.url || !activity.title) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing required fields: url, title' }));
          return;
        }

        // Sanitize and process the activity
        const sanitizedActivity = {
          url: String(activity.url).substring(0, 2000),
          title: String(activity.title).substring(0, 500),
          browser: String(activity.browser || 'Unknown').substring(0, 50),
          timestamp: activity.timestamp || new Date().toISOString()
        };

        // Forward to activity tracker if available
        if (this.activityTracker && this.activityTracker.processBrowserActivity) {
          this.activityTracker.processBrowserActivity(sanitizedActivity);
        } else {
          // Store activity reference for when tracker is available
          console.log('Browser activity received:', sanitizedActivity.title);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        console.error('Error processing browser activity:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  }

  /**
   * Handle POST /page-context - Receive page context (JIRA/GitHub metadata)
   */
  handlePageContext(req, res) {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 50000) {
        req.destroy();
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request too large' }));
        return;
      }
    });

    req.on('end', () => {
      try {
        const context = JSON.parse(body);

        // Validate and sanitize
        const sanitizedContext = {
          url: String(context.url || '').substring(0, 2000),
          type: String(context.type || '').substring(0, 50),
          data: {}
        };

        // Process based on type
        if (context.type === 'jira' && context.data) {
          sanitizedContext.data = {
            issueKey: String(context.data.issueKey || '').substring(0, 50),
            summary: String(context.data.summary || '').substring(0, 500),
            projectKey: String(context.data.projectKey || '').substring(0, 50),
            status: String(context.data.status || '').substring(0, 50)
          };
        } else if (context.type === 'github' && context.data) {
          sanitizedContext.data = {
            repo: String(context.data.repo || '').substring(0, 200),
            owner: String(context.data.owner || '').substring(0, 100),
            type: String(context.data.type || '').substring(0, 50),
            number: context.data.number ? Number(context.data.number) : null
          };
        }

        // Forward to activity tracker if available
        if (this.activityTracker && this.activityTracker.processPageContext) {
          this.activityTracker.processPageContext(sanitizedContext);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        console.error('Error processing page context:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  }
}

module.exports = BrowserExtensionServer;
