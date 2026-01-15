// Content Security Policy Generator
// Provides secure CSP generation for LightTrack

class CSPGenerator {
  /**
   * Generate a secure Content Security Policy
   * @param {object} options - CSP options
   * @returns {string} CSP meta tag content
   */
  static generateCSP(options = {}) {
    const {
      allowInlineScripts = false,
      allowInlineStyles = false,
      allowEval = false,
      allowExternalScripts = [],
      allowExternalStyles = [],
      allowExternalImages = [],
      allowDataImages = true,
      allowWebSockets = false
    } = options;

    const directives = {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'"],
      'img-src': ["'self'"],
      'font-src': ["'self'"],
      'connect-src': ["'self'"],
      'media-src': ["'self'"],
      'object-src': ["'none'"],
      'frame-src': ["'none'"],
      'worker-src': ["'self'"],
      'form-action': ["'self'"],
      'base-uri': ["'self'"],
      'manifest-src': ["'self'"]
    };

    // Script sources
    if (allowInlineScripts) {
      // Use nonce-based approach instead of unsafe-inline
      directives['script-src'].push("'nonce-{{nonce}}'");
    }
    if (allowEval) {
      directives['script-src'].push("'unsafe-eval'");
    }
    if (allowExternalScripts.length > 0) {
      directives['script-src'].push(...allowExternalScripts);
    }

    // Style sources
    if (allowInlineStyles) {
      // Use nonce-based approach for styles too
      directives['style-src'].push("'nonce-{{nonce}}'");
    }
    if (allowExternalStyles.length > 0) {
      directives['style-src'].push(...allowExternalStyles);
    }

    // Image sources
    if (allowDataImages) {
      directives['img-src'].push('data:');
    }
    if (allowExternalImages.length > 0) {
      directives['img-src'].push(...allowExternalImages);
    }

    // WebSocket connections
    if (allowWebSockets) {
      directives['connect-src'].push('ws:', 'wss:');
    }

    // Build CSP string
    const cspString = Object.entries(directives)
      .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
      .join('; ');

    return cspString;
  }

  /**
   * Generate a nonce for inline scripts/styles
   * @returns {string} Base64 encoded nonce
   */
  static generateNonce() {
    const crypto = require('crypto');
    return crypto.randomBytes(16).toString('base64');
  }

  /**
   * Apply CSP to BrowserWindow
   * @param {BrowserWindow} window - Electron BrowserWindow
   * @param {object} options - CSP options
   */
  static applyToWindow(window, options = {}) {
    const csp = this.generateCSP(options);
    const nonce = this.generateNonce();

    // Replace nonce placeholder
    const finalCSP = csp.replace(/{{nonce}}/g, nonce);

    // Set CSP via HTTP headers (more secure than meta tags)
    window.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = {
        ...details.responseHeaders,
        'Content-Security-Policy': [finalCSP]
      };
      callback({ responseHeaders });
    });

    // Send CSP info to renderer via IPC
    window.webContents.on('did-finish-load', () => {
      window.webContents.send('csp-update', { csp: finalCSP, nonce });
    });

    return { csp: finalCSP, nonce };
  }

  /**
   * Generate report-only CSP for testing
   * @param {object} options - CSP options
   * @param {string} reportUri - URI to send violation reports
   * @returns {string} CSP header value
   */
  static generateReportOnly(options = {}, reportUri = null) {
    let csp = this.generateCSP(options);

    if (reportUri) {
      csp += `; report-uri ${reportUri}`;
    }

    return csp;
  }

  /**
   * Get recommended CSP for LightTrack
   * @param {boolean} development - Whether in development mode
   * @returns {object} CSP options
   */
  static getRecommendedCSP(development = false) {
    const options = {
      allowInlineScripts: false,
      allowInlineStyles: false,
      allowEval: false,
      allowExternalScripts: [],
      allowExternalStyles: [],
      allowExternalImages: [],
      allowDataImages: true,
      allowWebSockets: false
    };

    if (development) {
      // More permissive in development
      options.allowInlineScripts = true;
      options.allowInlineStyles = true;
      options.allowEval = true;
      options.allowWebSockets = true;
    }

    return options;
  }

  /**
   * Validate CSP string
   * @param {string} csp - CSP string to validate
   * @returns {object} { valid: boolean, errors: string[] }
   */
  static validateCSP(csp) {
    const errors = [];

    if (!csp || typeof csp !== 'string') {
      return { valid: false, errors: ['Invalid CSP string'] };
    }

    // Check for dangerous directives
    if (csp.includes("'unsafe-inline'") && !csp.includes('nonce-')) {
      errors.push("Using 'unsafe-inline' without nonce is insecure");
    }

    if (csp.includes("'unsafe-eval'")) {
      errors.push("Using 'unsafe-eval' is dangerous");
    }

    if (csp.includes('*') && !csp.includes('https://*')) {
      errors.push('Using wildcard (*) sources is too permissive');
    }

    // Check for required directives
    const requiredDirectives = ['default-src', 'script-src', 'style-src'];
    for (const directive of requiredDirectives) {
      if (!csp.includes(directive)) {
        errors.push(`Missing required directive: ${directive}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = CSPGenerator;
