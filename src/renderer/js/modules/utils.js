/**
 * LightTrack Utility Functions
 * Common helper functions used across the application
 */

// Namespace
window.LightTrack = window.LightTrack || {};

window.LightTrack.Utils = {
  /**
   * Debounce utility function
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Format seconds to HH:MM:SS
   */
  formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  },

  /**
   * Format seconds as human-readable duration (Xh Xm)
   */
  formatDuration(seconds) {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    return `${minutes}m`;
  },

  /**
   * Format date as ISO string (YYYY-MM-DD)
   */
  formatDateISO(date) {
    return date.toISOString().split('T')[0];
  },

  /**
   * Format date for display
   */
  formatDateDisplay(date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },

  /**
   * Capitalize first letter
   */
  capitalize(text) {
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
  },

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  /**
   * Escape a string for safe use in JavaScript
   */
  escapeJsString(str) {
    if (!str) return '';
    return str
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');
  },

  /**
   * Check if a regex pattern is valid
   */
  isValidRegex(pattern) {
    try {
      new RegExp(pattern);
      return true;
    } catch (e) {
      return false;
    }
  },

  /**
   * Get color class for progress bar
   */
  getBarFillClass(percent) {
    if (percent >= 80) return 'bar-fill-high';
    if (percent >= 50) return 'bar-fill-medium';
    return 'bar-fill-low';
  }
};

// Export for module compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.LightTrack.Utils;
}
