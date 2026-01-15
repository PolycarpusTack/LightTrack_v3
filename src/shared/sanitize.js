/**
 * Input Sanitization Utilities
 * Centralized sanitization functions for consistent input handling
 */

/**
 * Sanitize a string by removing HTML tags and limiting length
 * @param {string} str - String to sanitize
 * @param {number} maxLength - Maximum length (default 500)
 * @returns {string} Sanitized string
 */
function sanitizeString(str, maxLength = 500) {
  if (typeof str !== 'string') return '';
  return str
    .slice(0, maxLength)
    .replace(/<[^>]*>/g, '')        // Strip HTML tags
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
    .trim();
}

/**
 * Sanitize a string for display (escapes HTML entities)
 * @param {string} str - String to sanitize
 * @param {number} maxLength - Maximum length
 * @returns {string} Sanitized string with HTML entities escaped
 */
function sanitizeForDisplay(str, maxLength = 500) {
  if (typeof str !== 'string') return '';
  return str
    .slice(0, maxLength)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
}

/**
 * Sanitize a project name
 * @param {string} name - Project name
 * @returns {string} Sanitized project name
 */
function sanitizeProjectName(name) {
  return sanitizeString(name, 100);
}

/**
 * Sanitize an activity type name
 * @param {string} name - Activity type name
 * @returns {string} Sanitized activity type name
 */
function sanitizeActivityTypeName(name) {
  return sanitizeString(name, 50);
}

/**
 * Sanitize a tag name
 * @param {string} name - Tag name
 * @returns {string} Sanitized tag name (lowercase, alphanumeric with hyphens)
 */
function sanitizeTagName(name) {
  if (typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .slice(0, 50)
    .replace(/[^a-z0-9-]/g, '-')  // Replace non-alphanumeric with hyphens
    .replace(/-+/g, '-')          // Collapse multiple hyphens
    .replace(/^-|-$/g, '')        // Remove leading/trailing hyphens
    .trim();
}

/**
 * Sanitize a SAP code
 * @param {string} code - SAP code
 * @returns {string} Sanitized SAP code
 */
function sanitizeSapCode(code) {
  if (typeof code !== 'string') return '';
  return code
    .slice(0, 50)
    .replace(/[<>"']/g, '')       // Remove potentially dangerous characters
    .trim();
}

/**
 * Sanitize an employee ID
 * @param {string} id - Employee ID
 * @returns {string} Sanitized employee ID
 */
function sanitizeEmployeeId(id) {
  if (typeof id !== 'string') return '';
  return id
    .slice(0, 50)
    .replace(/[<>"'&]/g, '')      // Remove potentially dangerous characters
    .trim();
}

/**
 * Sanitize a pattern string (for app/URL matching rules)
 * @param {string} pattern - Pattern string
 * @returns {string} Sanitized pattern
 */
function sanitizePattern(pattern) {
  if (typeof pattern !== 'string') return '';
  return pattern
    .slice(0, 200)
    .replace(/[<>"']/g, '')       // Remove potentially dangerous characters
    .trim();
}

/**
 * Sanitize a URL
 * @param {string} url - URL to sanitize
 * @returns {string|null} Sanitized URL or null if invalid
 */
function sanitizeUrl(url) {
  if (typeof url !== 'string') return null;

  try {
    const parsed = new URL(url.trim());

    // Only allow http and https protocols
    if (!['http:', 'https:', 'webcal:'].includes(parsed.protocol)) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Sanitize an array of strings
 * @param {Array} arr - Array to sanitize
 * @param {Function} sanitizer - Sanitizer function to apply
 * @param {number} maxItems - Maximum number of items
 * @returns {Array} Sanitized array
 */
function sanitizeArray(arr, sanitizer = sanitizeString, maxItems = 100) {
  if (!Array.isArray(arr)) return [];
  return arr
    .slice(0, maxItems)
    .map(item => sanitizer(item))
    .filter(item => item !== '' && item !== null);
}

/**
 * Validate and sanitize an activity object
 * @param {Object} activity - Activity object
 * @returns {{valid: boolean, sanitized?: Object, error?: string}}
 */
function validateAndSanitizeActivity(activity) {
  if (!activity || typeof activity !== 'object') {
    return { valid: false, error: 'Activity must be an object' };
  }

  // Validate required fields
  if (activity.title && typeof activity.title !== 'string') {
    return { valid: false, error: 'Title must be a string' };
  }
  if (activity.project && typeof activity.project !== 'string') {
    return { valid: false, error: 'Project must be a string' };
  }
  if (activity.duration !== undefined && (typeof activity.duration !== 'number' || activity.duration < 0)) {
    return { valid: false, error: 'Duration must be a non-negative number' };
  }
  if (activity.startTime && isNaN(new Date(activity.startTime).getTime())) {
    return { valid: false, error: 'Invalid startTime' };
  }

  // Sanitize the activity
  const sanitized = {
    ...activity,
    title: sanitizeString(activity.title, 500),
    project: sanitizeProjectName(activity.project),
    app: sanitizeString(activity.app, 100),
    tags: sanitizeArray(activity.tags, sanitizeTagName, 20)
  };

  return { valid: true, sanitized };
}

/**
 * Validate and sanitize a project object
 * @param {Object} project - Project object
 * @returns {{valid: boolean, sanitized?: Object, error?: string}}
 */
function validateAndSanitizeProject(project) {
  if (!project || typeof project !== 'object') {
    return { valid: false, error: 'Project must be an object' };
  }

  if (!project.name || typeof project.name !== 'string') {
    return { valid: false, error: 'Project name is required' };
  }

  const name = sanitizeProjectName(project.name);
  if (!name || name.length < 2) {
    return { valid: false, error: 'Project name must be at least 2 characters' };
  }

  const sanitized = {
    name,
    sapCode: sanitizeSapCode(project.sapCode || ''),
    costCenter: sanitizeSapCode(project.costCenter || ''),
    wbsElement: sanitizeSapCode(project.wbsElement || '')
  };

  return { valid: true, sanitized };
}

module.exports = {
  sanitizeString,
  sanitizeForDisplay,
  sanitizeProjectName,
  sanitizeActivityTypeName,
  sanitizeTagName,
  sanitizeSapCode,
  sanitizeEmployeeId,
  sanitizePattern,
  sanitizeUrl,
  sanitizeArray,
  validateAndSanitizeActivity,
  validateAndSanitizeProject
};
