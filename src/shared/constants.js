/**
 * LightTrack Shared Constants
 * Centralizes magic numbers and strings for better maintainability
 */

// ============= Timing Constants (milliseconds) =============

/** Initial tracking interval - how often to check active window */
const TRACKING_INTERVAL_MS = 5000;

/** How often to check system idle state */
const IDLE_CHECK_INTERVAL_MS = 10000;

/** Debounce time for window change detection */
const WINDOW_CHANGE_DEBOUNCE_MS = 500;

/** Time to consider activity "new" and be lenient with matching (2 minutes) */
const ACTIVITY_LENIENCY_MS = 120000;

/** Maximum sampling interval for stable activities (60 seconds) */
const MAX_SAMPLING_INTERVAL_MS = 60000;

/** How much to increase sampling interval per stable check */
const SAMPLING_INCREMENT_MS = 5000;

/** Delay between active window retries */
const ACTIVE_WINDOW_RETRY_DELAY_MS = 100;

// ============= Timing Constants (seconds) =============

/** Default idle threshold - time before marking user as idle */
const DEFAULT_IDLE_THRESHOLD_SECONDS = 180;

/** Warning time before going idle */
const IDLE_WARNING_SECONDS = 30;

/** System activity threshold - below this user is considered active */
const IDLE_ACTIVITY_THRESHOLD_SECONDS = 5;

/** Minimum idle minutes to show return prompt */
const MIN_IDLE_MINUTES_FOR_PROMPT = 1;

/** Default minimum activity duration to save */
const DEFAULT_MIN_ACTIVITY_DURATION_SECONDS = 60;

/** Minimum focus session duration to save (5 minutes) */
const MIN_FOCUS_SESSION_DURATION_SECONDS = 300;

/** Long focus session threshold (1 hour) */
const LONG_FOCUS_SESSION_THRESHOLD_SECONDS = 3600;

// ============= Network and Server =============

/** Browser extension server port */
const BROWSER_EXTENSION_PORT = 41417;

/** Calendar sync interval (30 minutes) */
const CALENDAR_SYNC_INTERVAL_MS = 30 * 60 * 1000;

/** HTTP fetch timeout for external requests */
const FETCH_TIMEOUT_MS = 30000;

// ============= Storage Limits =============

/** Maximum activities to keep in storage */
const MAX_ACTIVITIES = 10000;

/** Activity count threshold for compression */
const COMPRESSION_THRESHOLD = 1000;

/** Cache TTL for activity queries */
const ACTIVITY_CACHE_TTL_MS = 5000;

// ============= Counts and Limits =============

/** Number of stable checks before increasing sampling interval */
const STABLE_ACTIVITY_COUNT_THRESHOLD = 3;

/** Number of retries for getting active window */
const ACTIVE_WINDOW_RETRY_COUNT = 3;

/** Maximum size of checksum cache for duplicate detection */
const MAX_CHECKSUM_CACHE_SIZE = 50;

/** Days to retain focus session data */
const FOCUS_SESSION_RETENTION_DAYS = 30;

// ============= Focus Session Scoring =============

/** Starting quality score for focus sessions */
const FOCUS_BASE_QUALITY = 100;

/** Points deducted per distraction */
const FOCUS_DISTRACTION_PENALTY = 10;

/** Bonus points for long uninterrupted sessions */
const FOCUS_LONG_SESSION_BONUS = 10;

// ============= IPC Channel Names =============

const IPC_CHANNELS = {
  /** Activity tracking update */
  TRACKING_UPDATE: 'tracking-update',

  /** Warning before going idle */
  IDLE_WARNING: 'idle-warning',

  /** Tracking paused due to idle */
  TRACKING_PAUSED: 'tracking-paused',

  /** User returned from idle */
  IDLE_RETURN: 'idle-return',

  /** Tracking status changed */
  TRACKING_STATUS_CHANGED: 'tracking-status-changed',

  /** Open settings view */
  OPEN_SETTINGS: 'open-settings'
};

// ============= Export =============

module.exports = {
  // Timing (ms)
  TRACKING_INTERVAL_MS,
  IDLE_CHECK_INTERVAL_MS,
  WINDOW_CHANGE_DEBOUNCE_MS,
  ACTIVITY_LENIENCY_MS,
  MAX_SAMPLING_INTERVAL_MS,
  SAMPLING_INCREMENT_MS,
  ACTIVE_WINDOW_RETRY_DELAY_MS,

  // Timing (seconds)
  DEFAULT_IDLE_THRESHOLD_SECONDS,
  IDLE_WARNING_SECONDS,
  IDLE_ACTIVITY_THRESHOLD_SECONDS,
  MIN_IDLE_MINUTES_FOR_PROMPT,
  DEFAULT_MIN_ACTIVITY_DURATION_SECONDS,
  MIN_FOCUS_SESSION_DURATION_SECONDS,
  LONG_FOCUS_SESSION_THRESHOLD_SECONDS,

  // Network and server
  BROWSER_EXTENSION_PORT,
  CALENDAR_SYNC_INTERVAL_MS,
  FETCH_TIMEOUT_MS,

  // Storage limits
  MAX_ACTIVITIES,
  COMPRESSION_THRESHOLD,
  ACTIVITY_CACHE_TTL_MS,

  // Counts and limits
  STABLE_ACTIVITY_COUNT_THRESHOLD,
  ACTIVE_WINDOW_RETRY_COUNT,
  MAX_CHECKSUM_CACHE_SIZE,
  FOCUS_SESSION_RETENTION_DAYS,

  // Focus scoring
  FOCUS_BASE_QUALITY,
  FOCUS_DISTRACTION_PENALTY,
  FOCUS_LONG_SESSION_BONUS,

  // IPC channels
  IPC_CHANNELS
};
