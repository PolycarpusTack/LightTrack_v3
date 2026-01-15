/**
 * FocusSessionTracker - Tracks focus sessions and distractions
 * Extracted from ActivityTracker to improve maintainability and testability
 */
const logger = require('../logger');
const {
  MIN_FOCUS_SESSION_DURATION_SECONDS,
  FOCUS_SESSION_RETENTION_DAYS,
  FOCUS_BASE_QUALITY,
  FOCUS_DISTRACTION_PENALTY,
  FOCUS_LONG_SESSION_BONUS,
  LONG_FOCUS_SESSION_THRESHOLD_SECONDS
} = require('../../shared/constants');

class FocusSessionTracker {
  constructor(options = {}) {
    // Storage access callback
    this.getStorage = options.getStorage || (() => null);

    // Current focus session state
    this.session = {
      startTime: null,
      project: null,
      distractions: 0,
      duration: 0
    };

    // Apps considered distractions for focus tracking
    this.distractionApps = [
      'slack', 'discord', 'teams', 'whatsapp',
      'telegram', 'facebook', 'twitter'
    ];
  }

  /**
   * Update focus session based on current activity
   * @param {Object} activityData - Current activity data from TitleParser
   */
  update(activityData) {
    const storage = this.getStorage();
    const settings = storage?.getSettings() || {};

    if (!settings.trackFocusSessions) return;

    if (!this.session.startTime) {
      // Start new focus session
      this.session.startTime = Date.now();
      this.session.project = activityData.project;
      this.session.distractions = 0;
    } else if (activityData.project !== this.session.project) {
      // Check if this is a distraction
      if (this.distractionApps.some(app => activityData.app.toLowerCase().includes(app))) {
        this.session.distractions++;
      } else {
        // Different project - save and start new session
        this.save();
        this.session.startTime = Date.now();
        this.session.project = activityData.project;
        this.session.distractions = 0;
      }
    }

    // Update duration
    this.session.duration = Math.floor((Date.now() - this.session.startTime) / 1000);
  }

  /**
   * Save current focus session to storage
   */
  save() {
    if (!this.session.startTime || this.session.duration < MIN_FOCUS_SESSION_DURATION_SECONDS) return;

    const storage = this.getStorage();
    if (!storage) return;

    const focusSessions = storage.store.get('focusSessions', []);
    const quality = this.calculateQuality();

    focusSessions.push({
      id: Date.now().toString(),
      date: new Date(this.session.startTime).toISOString(),
      project: this.session.project,
      duration: this.session.duration,
      distractions: this.session.distractions,
      quality
    });

    // Keep only last N days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - FOCUS_SESSION_RETENTION_DAYS);
    const filtered = focusSessions.filter(s => new Date(s.date) > cutoffDate);

    storage.store.set('focusSessions', filtered);
    logger.debug('Focus session saved:', { project: this.session.project, quality });
  }

  /**
   * Calculate focus quality score for current session
   * @returns {number} Quality score 0-100
   */
  calculateQuality() {
    let quality = FOCUS_BASE_QUALITY;

    // Reduce by penalty points per distraction
    quality -= this.session.distractions * FOCUS_DISTRACTION_PENALTY;

    // Bonus for long uninterrupted sessions (> 1 hour)
    if (this.session.duration > LONG_FOCUS_SESSION_THRESHOLD_SECONDS) {
      quality += FOCUS_LONG_SESSION_BONUS;
    }

    return Math.max(0, Math.min(FOCUS_BASE_QUALITY + FOCUS_LONG_SESSION_BONUS, quality));
  }

  /**
   * Get current session info for status reporting
   * @returns {Object|null} Current session info or null if no active session
   */
  getCurrentSession() {
    if (!this.session.startTime) return null;

    return {
      project: this.session.project,
      duration: this.session.duration,
      distractions: this.session.distractions,
      quality: this.calculateQuality()
    };
  }

  /**
   * Get focus session statistics
   * @returns {Object} Statistics about focus sessions
   */
  getStats() {
    const storage = this.getStorage();
    if (!storage) {
      return {
        totalSessions: 0,
        todaySessions: 0,
        totalFocusTime: 0,
        averageSessionLength: 0,
        averageQuality: 0,
        todayQuality: 0
      };
    }

    const focusSessions = storage.store.get('focusSessions', []);
    const today = new Date().toDateString();
    const todaySessions = focusSessions.filter(s => new Date(s.date).toDateString() === today);

    return {
      totalSessions: focusSessions.length,
      todaySessions: todaySessions.length,
      totalFocusTime: focusSessions.reduce((sum, s) => sum + (s.duration || 0), 0),
      averageSessionLength: focusSessions.length > 0
        ? focusSessions.reduce((sum, s) => sum + (s.duration || 0), 0) / focusSessions.length
        : 0,
      averageQuality: focusSessions.length > 0
        ? focusSessions.reduce((sum, s) => sum + (s.quality || 0), 0) / focusSessions.length
        : 0,
      todayQuality: todaySessions.length > 0
        ? todaySessions.reduce((sum, s) => sum + (s.quality || 0), 0) / todaySessions.length
        : 0
    };
  }

  /**
   * Check if there's an active focus session
   * @returns {boolean}
   */
  hasActiveSession() {
    return this.session.startTime !== null;
  }

  /**
   * Reset the current focus session
   */
  reset() {
    this.session = {
      startTime: null,
      project: null,
      distractions: 0,
      duration: 0
    };
  }
}

module.exports = FocusSessionTracker;
