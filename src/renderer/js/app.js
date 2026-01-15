/**
 * LightTrack - Mediagenix UI
 * Main application JavaScript (standalone version)
 *
 * Note: This file is being modularized. New modules are in js/modules/
 * Utility functions from LightTrack.Utils, charts from LightTrack.ChartRenderer,
 * notifications from LightTrack.UI, SAP export from LightTrack.SAPExport.
 */

console.log('LightTrack Mediagenix UI - Initializing...');

// Module compatibility layer - use modules if available, fallback to inline
const LT = window.LightTrack || {};
const useModules = !!(LT.Utils && LT.ChartRenderer && LT.UI);

// Application Constants - centralized configuration
const CONSTANTS = {
  // Storage keys (localStorage)
  STORAGE_KEYS: {
    DAILY_SUMMARY_COLLAPSED: 'lighttrack-daily-summary-collapsed',
    EXPORT_HISTORY: 'lighttrack-export-history',
    SETTINGS_GROUPS: 'lighttrack-settings-groups'
  },

  // Limits
  MAX_EXPORT_HISTORY: 20,
  MAX_BACKUP_SIZE_MB: 50,
  MAX_REGEX_LENGTH: 500,
  MAX_TEST_INPUT_LENGTH: 2000,

  // Cache settings
  MAPPINGS_CACHE_TTL_MS: 60000,

  // UI behavior
  AUTO_EXPAND_HOUR: 17,

  // Regex flag validation pattern
  VALID_REGEX_FLAGS: /^[gimsuy]*$/
};

// Standardized error messages
const ERRORS = {
  MERGE_TOO_FEW: 'Select at least 2 activities to merge',
  MERGE_NOT_FOUND: 'Selected activities not found - please refresh',
  MERGE_FAILED: 'Unable to merge activities',
  MERGE_ROLLBACK: 'Merge failed - changes rolled back',
  BACKUP_FAILED: 'Unable to create backup',
  RESTORE_FAILED: 'Unable to restore backup',
  RESTORE_VERSION: 'Incompatible backup version',
  RESTORE_FORMAT: 'Invalid backup format',
  RESTORE_SIZE: 'Backup file too large',
  STORAGE_FULL: 'Storage full - please export or clear data'
};

/**
 * Safe localStorage set with quota error handling
 * @param {string} key - Storage key
 * @param {string} value - Value to store
 * @returns {boolean} - True if successful, false if failed
 */
function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (error.name === 'QuotaExceededError' || error.code === 22) {
      console.error('localStorage quota exceeded for key:', key);
      showNotification?.(ERRORS.STORAGE_FULL, 'warning');
    } else {
      console.error('localStorage error:', error.message);
    }
    return false;
  }
}

/**
 * Fetch all project mappings from API
 * @returns {Promise<Object>} Object with app, url, jira, meeting mappings
 */
async function fetchAllMappings() {
  const [app, url, jira, meeting] = await Promise.all([
    window.lightTrackAPI?.getProjectMappings?.() || {},
    window.lightTrackAPI?.getUrlMappings?.() || {},
    window.lightTrackAPI?.getJiraMappings?.() || {},
    window.lightTrackAPI?.getMeetingMappings?.() || {}
  ]);
  return { app, url, jira, meeting };
}

/**
 * Get mappings with caching support
 * @returns {Promise<Object>} Cached or fresh mappings
 */
async function getCachedMappings() {
  const cache = AppState.mappingsCache;
  const now = Date.now();

  // Return cached data if still valid
  if (cache.data && cache.timestamp && (now - cache.timestamp < CONSTANTS.MAPPINGS_CACHE_TTL_MS)) {
    return cache.data;
  }

  // Fetch fresh data and cache it
  const mappings = await fetchAllMappings();
  cache.data = mappings;
  cache.timestamp = now;
  return mappings;
}

// Application State
const AppState = {
  isTracking: false,
  currentActivity: null,
  currentView: 'timer', // Current active view for keyboard shortcuts
  startTime: null,
  timerInterval: null,
  activities: [],
  filteredActivities: [], // Activities after filters applied
  contextSwitches: 0,
  lastApp: null,
  filterDate: getLocalDateString(new Date()),
  timelineDate: getLocalDateString(new Date()),
  editingActivityId: null,
  analyticsRange: 'week', // week, month, year, all, custom
  analyticsFilter: 'all', // all, billable, non-billable, meetings
  customDateRange: { from: null, to: null }, // For custom date range
  // Analytics cache to avoid re-fetching
  analyticsCache: {
    activities: null,       // Cached activities array
    timestamp: null,        // When cache was last updated
    maxAge: 30000           // Cache valid for 30 seconds
  },
  // Mappings cache for project/URL rule matching
  mappingsCache: {
    data: null,             // Cached mappings object
    timestamp: null         // When cache was last updated
  },
  // Filter state
  filters: {
    dateRange: 'week',      // today, week, month, custom
    project: 'all',         // 'all' or specific project name
    billable: null,         // null (all), true (billable only), false (non-billable only)
    tags: []                // Array of selected tag names (multi-select)
  },
  // Timeline-specific filters
  timelineFilters: {
    project: '',            // '' (all) or specific project name
    billableOnly: false,    // Show only billable activities
    groupByProject: false   // Group activities by project
  },
  // Timeline selection state
  selectedActivities: [],   // Array of selected activity IDs for bulk operations
  // Available tags
  tags: {
    system: [],
    custom: [],
    all: [],
    used: []
  },
  // Available projects
  projects: {
    system: [],
    custom: [],
    all: []
  },
  // Available activity types
  activityTypes: {
    system: [],
    custom: [],
    all: []
  },
  settings: {
    deepWorkTarget: 4,      // hours
    breaksTarget: 4,        // count
    workDayStart: '09:00',  // HH:MM
    workDayEnd: '18:00',    // HH:MM
    weekStartDay: 1,        // 0 = Sunday, 1 = Monday, 6 = Saturday
    defaultProject: 'General',
    launchAtStartup: false,
    autoStartTracking: false,
    closeBehavior: 'minimize',         // 'minimize' or 'close'
    minimizeToTray: true,              // When minimizing, go to tray instead of taskbar
    consolidateActivities: true,       // Whether to merge similar activities
    consolidationMode: 'smart'         // 'smart', 'strict', or 'relaxed'
  }
};

// Debounce utility function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}


// Simple Chart Renderer for Analytics
const ChartRenderer = {
  colors: ['#3805e3', '#b3fc4f', '#9c27b0', '#ff9800', '#00bcd4', '#f44336', '#8bc34a', '#e91e63'],

  // Store chart geometry for hit detection
  chartData: new WeakMap(),

  // Initialize canvas interactions (call once per canvas)
  initCanvasInteractions(canvas, type) {
    if (canvas.dataset.interactionsInit) return;
    canvas.dataset.interactionsInit = 'true';
    canvas.style.cursor = 'pointer';

    // Tooltip element
    let tooltip = document.getElementById('chart-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'chart-tooltip';
      tooltip.className = 'chart-tooltip';
      document.body.appendChild(tooltip);
    }

    // Mouse move for hover
    canvas.addEventListener('mousemove', (e) => {
      const data = this.chartData.get(canvas);
      if (!data) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const hit = this.hitTest(data, x, y, type);
      if (hit) {
        // Escape HTML to prevent XSS
        const safeLabel = (hit.label || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const safeValue = (hit.value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        tooltip.innerHTML = `<strong>${safeLabel}</strong><br>${safeValue}`;
        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX + 10) + 'px';
        tooltip.style.top = (e.clientY - 30) + 'px';
        canvas.style.cursor = 'pointer';
      } else {
        tooltip.style.display = 'none';
        canvas.style.cursor = 'default';
      }
    });

    // Mouse leave to hide tooltip
    canvas.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });

    // Click handler
    canvas.addEventListener('click', (e) => {
      const data = this.chartData.get(canvas);
      if (!data) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const hit = this.hitTest(data, x, y, type);
      if (hit && hit.onClick) {
        hit.onClick(hit);
      }
    });
  },

  // Hit test for mouse interactions
  hitTest(data, x, y, type) {
    if (type === 'bar') {
      for (const bar of data.bars || []) {
        if (x >= bar.x && x <= bar.x + bar.width && y >= bar.y && y <= bar.y + bar.height) {
          return bar;
        }
      }
    } else if (type === 'pie') {
      const dx = x - data.centerX;
      const dy = y - data.centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance >= data.innerRadius && distance <= data.radius) {
        let angle = Math.atan2(dy, dx);
        if (angle < -Math.PI / 2) angle += 2 * Math.PI;

        for (const slice of data.slices || []) {
          if (angle >= slice.startAngle && angle < slice.endAngle) {
            return slice;
          }
        }
      }
    }
    return null;
  },

  // Render a bar chart on canvas
  renderBarChart(canvas, labels, values, options = {}) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    // Set display size
    const displayWidth = canvas.parentElement?.clientWidth || 600;
    const displayHeight = options.height || 180;

    // Set actual size in memory
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;

    // Scale for DPR
    ctx.scale(dpr, dpr);

    // Set CSS size
    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';

    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const width = displayWidth - padding.left - padding.right;
    const height = displayHeight - padding.top - padding.bottom;

    // Clear canvas
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    if (labels.length === 0 || values.length === 0) {
      ctx.fillStyle = '#b6bbca';
      ctx.font = '14px Poppins, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No data for this period', displayWidth / 2, displayHeight / 2);
      return;
    }

    const maxValue = Math.max(...values, 1) * 1.1;
    const barWidth = Math.min(40, (width / labels.length) * 0.7);
    const barSpacing = width / labels.length;

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(displayWidth - padding.right, y);
      ctx.stroke();
    }

    // Draw Y-axis labels
    ctx.fillStyle = '#b6bbca';
    ctx.font = '11px Poppins, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (height / 4) * i;
      const value = maxValue - (maxValue / 4) * i;
      ctx.fillText(value.toFixed(1) + 'h', padding.left - 8, y + 4);
    }

    // Draw bars with gradient and store geometry
    const gradient = ctx.createLinearGradient(0, padding.top + height, 0, padding.top);
    gradient.addColorStop(0, '#3805e3');
    gradient.addColorStop(1, '#b3fc4f');

    const bars = [];
    labels.forEach((label, index) => {
      const x = padding.left + (index * barSpacing) + (barSpacing - barWidth) / 2;
      const barHeight = Math.max((values[index] / maxValue) * height, 4); // Min height for clickability
      const y = padding.top + height - barHeight;

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
      ctx.fill();

      // Store bar geometry for hit testing
      bars.push({
        x, y, width: barWidth, height: barHeight,
        label, value: values[index].toFixed(1) + 'h',
        dateKey: options.dateKeys?.[index] || null,
        onClick: options.onBarClick ? () => options.onBarClick(label, index, options.dateKeys?.[index]) : null
      });

      // X-axis label
      ctx.fillStyle = '#b6bbca';
      ctx.font = '11px Poppins, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + barWidth / 2, displayHeight - padding.bottom + 18);
    });

    // Store chart data and init interactions
    this.chartData.set(canvas, { bars });
    this.initCanvasInteractions(canvas, 'bar');
  },

  // Render a pie/donut chart on canvas
  renderPieChart(canvas, labels, values, options = {}) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const size = Math.min(canvas.parentElement?.clientWidth || 200, 200);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = (size / 2) - 10;
    const innerRadius = radius * 0.5; // Donut hole

    ctx.clearRect(0, 0, size, size);

    const total = values.reduce((sum, v) => sum + v, 0);
    if (total === 0) {
      ctx.fillStyle = '#b6bbca';
      ctx.font = '12px Poppins, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No data', centerX, centerY);
      return;
    }

    let currentAngle = -Math.PI / 2;
    const slices = [];

    values.forEach((value, index) => {
      const sliceAngle = (value / total) * 2 * Math.PI;
      const color = this.colors[index % this.colors.length];
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceAngle;

      // Draw slice
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      // Format duration for tooltip
      const hours = Math.floor(value / 3600);
      const mins = Math.floor((value % 3600) / 60);
      const valueStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      const percent = Math.round((value / total) * 100);

      // Store slice geometry for hit testing
      slices.push({
        startAngle, endAngle,
        label: labels[index],
        value: `${valueStr} (${percent}%)`,
        projectName: labels[index],
        onClick: options.onSliceClick ? () => options.onSliceClick(labels[index], index) : null
      });

      currentAngle = endAngle;
    });

    // Store chart data and init interactions
    this.chartData.set(canvas, { centerX, centerY, radius, innerRadius, slices });
    this.initCanvasInteractions(canvas, 'pie');

    // Center text
    ctx.fillStyle = '#e8e9ee';
    ctx.font = 'bold 16px Poppins, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(values.length.toString(), centerX, centerY - 8);
    ctx.font = '10px Poppins, sans-serif';
    ctx.fillStyle = '#b6bbca';
    ctx.fillText('projects', centerX, centerY + 10);
  }
};

// DOM Elements cache
const Elements = {};

/**
 * Initialize DOM element references
 */
function initElements() {
  Elements.timer = document.getElementById('timer');
  Elements.timerStartTime = document.getElementById('timer-start-time');
  Elements.toggleBtn = document.getElementById('toggle-tracking');
  Elements.toggleText = document.getElementById('toggle-tracking-text');
  Elements.trackingDot = document.getElementById('tracking-dot');
  Elements.trackingStatus = document.getElementById('tracking-status');

  Elements.currentProjectBadge = document.getElementById('current-project-badge');
  Elements.currentAppBadge = document.getElementById('current-app-badge');
  Elements.samplingBadge = document.getElementById('sampling-badge');
  Elements.projectSwitcher = document.getElementById('project-switcher');
  Elements.projectSwitcherList = document.getElementById('project-switcher-list');

  Elements.todayTotal = document.getElementById('today-total');
  Elements.todayCompare = document.getElementById('today-compare');
  Elements.billablePercent = document.getElementById('billable-percent');
  Elements.billableTime = document.getElementById('billable-time');
  Elements.contextSwitches = document.getElementById('context-switches');
  Elements.projectCount = document.getElementById('project-count');
  Elements.focusScore = document.getElementById('focus-score');
  Elements.focusSummary = document.getElementById('focus-summary');
  Elements.topbarTitle = document.getElementById('topbar-title');
  Elements.topbarSubtitle = document.getElementById('topbar-subtitle');
  Elements.weeklyFocusScore = document.getElementById('weekly-focus-score');

  Elements.activityList = document.getElementById('activity-list');
  Elements.topProjects = document.getElementById('top-projects');

  // Daily summary elements
  Elements.dailySummaryCard = document.getElementById('daily-summary-card');
  Elements.dailySummaryContent = document.getElementById('daily-summary-content');
  Elements.toggleDailySummary = document.getElementById('toggle-daily-summary');
  Elements.summaryTotalTime = document.getElementById('summary-total-time');
  Elements.summaryBillable = document.getElementById('summary-billable');
  Elements.summaryGoal = document.getElementById('summary-goal');
  Elements.summaryProjects = document.getElementById('summary-projects');
  Elements.summaryTimeRange = document.getElementById('summary-time-range');

  Elements.floatingTimer = document.getElementById('floating-timer');
  Elements.floatingTimerDisplay = document.getElementById('floating-timer-display');
  Elements.floatingProject = document.getElementById('floating-project');
  Elements.views = document.querySelectorAll('.view');

   // Mapping form elements
  Elements.mappingPattern = document.getElementById('mapping-pattern');
  Elements.mappingProject = document.getElementById('mapping-project');
  Elements.mappingActivity = document.getElementById('mapping-activity');
  Elements.mappingSapCode = document.getElementById('mapping-sap-code');
  Elements.mappingCostCenter = document.getElementById('mapping-cost-center');
  Elements.mappingWbs = document.getElementById('mapping-wbs');
  Elements.updateMappingBtn = document.getElementById('update-mapping-btn');

  // Modal elements
  Elements.modalOverlay = document.getElementById('modal-overlay');
  Elements.modalTitle = document.getElementById('modal-title');
  Elements.editActivityId = document.getElementById('edit-activity-id');
  Elements.matchedRuleInfo = document.getElementById('matched-rule-info');
  Elements.matchedRuleText = document.getElementById('matched-rule-text');
  Elements.entryProject = document.getElementById('entry-project');
  Elements.entryApp = document.getElementById('entry-app');
  Elements.entryStart = document.getElementById('entry-start');
  Elements.entryEnd = document.getElementById('entry-end');
  Elements.entryDate = document.getElementById('entry-date');
  Elements.entryBillable = document.getElementById('entry-billable');

  // Delete modal
  Elements.deleteModalOverlay = document.getElementById('delete-modal-overlay');
  Elements.deleteActivityId = document.getElementById('delete-activity-id');

  // Clear data modal
  Elements.clearDataModalOverlay = document.getElementById('clear-data-modal-overlay');
  Elements.clearDataCount = document.getElementById('clear-data-count');

  // Date filter
  Elements.filterDate = document.getElementById('filter-date');

  // Timeline elements
  Elements.timelineDate = document.getElementById('timeline-date');
  Elements.timelineSummary = document.getElementById('timeline-summary');
  Elements.timelineList = document.getElementById('timeline-list');
  Elements.timelineTracked = document.getElementById('timeline-tracked');
  Elements.timelineGaps = document.getElementById('timeline-gaps');
  Elements.timelineBillable = document.getElementById('timeline-billable');
  Elements.timelineProjects = document.getElementById('timeline-projects');
  Elements.timelineBar = document.getElementById('timeline-bar');
  Elements.timelineBarLabel = document.getElementById('timeline-bar-label');
  Elements.timelinePrev = document.getElementById('timeline-prev');
  Elements.timelineNext = document.getElementById('timeline-next');
  Elements.timelineToday = document.getElementById('timeline-today');
  Elements.timelineProjectFilter = document.getElementById('timeline-project-filter');
  Elements.timelineBillableFilter = document.getElementById('timeline-billable-filter');
  Elements.timelineGroupToggle = document.getElementById('timeline-group-toggle');
  Elements.timelineSelectAll = document.getElementById('timeline-select-all');
  Elements.timelineMergeSelected = document.getElementById('timeline-merge-selected');

  // Analytics elements
  Elements.analyticsWeekTotal = document.getElementById('analytics-week-total');
  Elements.analyticsWeekDays = document.getElementById('analytics-week-days');
  Elements.analyticsAvgDay = document.getElementById('analytics-avg-day');
  Elements.analyticsTopProject = document.getElementById('analytics-top-project');
  Elements.analyticsTopTime = document.getElementById('analytics-top-time');
  Elements.analyticsFocusTime = document.getElementById('analytics-focus-time');
  Elements.analyticsFocusPercent = document.getElementById('analytics-focus-percent');
  Elements.analyticsBillableTime = document.getElementById('analytics-billable-time');
  Elements.analyticsBillableFill = document.getElementById('analytics-billable-fill');
  Elements.analyticsBillablePercent = document.getElementById('analytics-billable-percent');
  Elements.analyticsNonbillable = document.getElementById('analytics-nonbillable');
  Elements.dailyChart = document.getElementById('daily-chart');
  Elements.projectPieChart = document.getElementById('project-pie-chart');
  Elements.analyticsProjectBreakdown = document.getElementById('analytics-project-breakdown');
  Elements.analyticsInsights = document.getElementById('analytics-insights');

  // Custom date range picker elements
  Elements.customRangePicker = document.getElementById('custom-range-picker');
  Elements.analyticsDateFrom = document.getElementById('analytics-date-from');
  Elements.analyticsDateTo = document.getElementById('analytics-date-to');
  Elements.applyCustomRange = document.getElementById('apply-custom-range');
}

/**
 * Format seconds to HH:MM:SS
 */
function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format duration for display (e.g., "2h 15m")
 */
function formatDuration(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  return `${mins}m`;
}

/**
 * Update timer display
 */
function updateTimerDisplay() {
  if (!AppState.isTracking || !AppState.startTime) {
    if (Elements.timer) Elements.timer.textContent = '00:00:00';
    if (Elements.floatingTimerDisplay) Elements.floatingTimerDisplay.textContent = '00:00:00';
    if (Elements.timerStartTime) Elements.timerStartTime.textContent = '';
    return;
  }

  const elapsed = Math.floor((Date.now() - AppState.startTime) / 1000);
  const timeStr = formatTime(elapsed);

  if (Elements.timer) Elements.timer.textContent = timeStr;
  if (Elements.floatingTimerDisplay) Elements.floatingTimerDisplay.textContent = timeStr;
  if (Elements.timerStartTime && AppState.formattedStartTime) {
    Elements.timerStartTime.textContent = `started ${AppState.formattedStartTime}`;
  }
}

/**
 * Update UI based on tracking state
 */
function updateTrackingUI() {
  const isTracking = AppState.isTracking;

  // Update toggle button
  if (Elements.toggleBtn && Elements.toggleText) {
    if (isTracking) {
      Elements.toggleBtn.classList.remove('primary');
      Elements.toggleBtn.classList.add('danger');
      Elements.toggleText.textContent = 'Stop';
    } else {
      Elements.toggleBtn.classList.remove('danger');
      Elements.toggleBtn.classList.add('primary');
      Elements.toggleText.textContent = 'Start';
    }
  }

  // Update timer color
  if (Elements.timer) {
    Elements.timer.classList.toggle('inactive', !isTracking);
  }

  // Update status dot and text
  if (Elements.trackingDot) {
    Elements.trackingDot.classList.toggle('inactive', !isTracking);
  }
  if (Elements.trackingStatus) {
    Elements.trackingStatus.textContent = isTracking ? 'Tracking active' : 'Ready to track';
  }

  // Update activity badges
  if (AppState.currentActivity) {
    if (Elements.currentProjectBadge) {
      Elements.currentProjectBadge.textContent = `Project: ${AppState.currentActivity.project || 'General'}`;
    }
    if (Elements.currentAppBadge) {
      Elements.currentAppBadge.textContent = `App: ${AppState.currentActivity.app || '--'}`;
    }
    if (Elements.floatingProject) {
      Elements.floatingProject.textContent = AppState.currentActivity.project || 'General';
    }
  } else {
    if (Elements.currentProjectBadge) Elements.currentProjectBadge.textContent = 'Project: General';
    if (Elements.currentAppBadge) Elements.currentAppBadge.textContent = 'App: --';
    if (Elements.floatingProject) Elements.floatingProject.textContent = 'General';
  }
}

/**
 * Start tracking
 */
async function startTracking() {
  console.log('Starting tracking...');

  try {
    if (!window.lightTrackAPI) {
      throw new Error('LightTrack API not available');
    }

    const result = await window.lightTrackAPI.startTracking();
    console.log('Start tracking result:', result);

    const isActive = result?.isActive ?? result?.isTracking ?? false;
    AppState.isTracking = isActive;

    if (!isActive) {
      throw new Error('Tracking did not start');
    }

    if (result?.wasAlreadyActive) {
      await getCurrentStatus();
      showNotification('Tracking already active', 'info');
      return;
    }

    AppState.startTime = result?.sessionStartTime || Date.now();
    AppState.formattedStartTime = new Date(AppState.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    AppState.currentActivity = result?.data?.currentActivity || result?.currentActivity || { project: 'General', app: 'LightTrack' };

    // Start timer updates
    if (AppState.timerInterval) clearInterval(AppState.timerInterval);
    AppState.timerInterval = setInterval(updateTimerDisplay, 1000);

    updateTrackingUI();
    updateTimerDisplay();
    showNotification('Tracking started', 'success');

  } catch (error) {
    console.error('Failed to start tracking:', error);
    showNotification(`Failed to start: ${error.message}`, 'error');
  }
}

/**
 * Stop tracking
 */
async function stopTracking() {
  console.log('Stopping tracking...');

  try {
    if (!window.lightTrackAPI) {
      throw new Error('LightTrack API not available');
    }

    const result = await window.lightTrackAPI.stopTracking();
    console.log('Stop tracking result:', result);

    const isActive = result?.isActive ?? result?.isTracking ?? false;
    AppState.isTracking = isActive;

    if (!isActive) {
      AppState.startTime = null;
      AppState.formattedStartTime = null;
      AppState.currentActivity = null;

      // Stop timer updates
      if (AppState.timerInterval) {
        clearInterval(AppState.timerInterval);
        AppState.timerInterval = null;
      }

      updateTrackingUI();
      updateTimerDisplay();
      loadActivities();
      showNotification('Tracking stopped', 'success');
      return;
    }

    updateTrackingUI();
    showNotification('Tracking still active', 'error');

  } catch (error) {
    console.error('Failed to stop tracking:', error);
    showNotification(`Failed to stop: ${error.message}`, 'error');
  }
}

/**
 * Toggle tracking state
 */
async function toggleTracking() {
  if (Elements.toggleBtn) Elements.toggleBtn.disabled = true;

  try {
    if (AppState.isTracking) {
      await stopTracking();
    } else {
      await startTracking();
    }
  } finally {
    if (Elements.toggleBtn) Elements.toggleBtn.disabled = false;
  }
}

/**
 * Load activities from API
 */
async function loadActivities(date) {
  try {
    if (!window.lightTrackAPI) return;

    const targetDate = date || AppState.filterDate;
    const activities = await window.lightTrackAPI.getActivities(targetDate);

    // Filter to match the selected date (exclude activities without startTime)
    // Use activity's stored date field or convert startTime to local date
    AppState.activities = (activities || []).filter(a => {
      if (!a.startTime && !a.date) return false;
      // Prefer stored date field, fallback to local date from startTime
      const activityDate = a.date || getLocalDateString(a.startTime);
      return activityDate === targetDate;
    });

    renderActivityList();

    // Load comparison data (yesterday/weekly average) for today's view
    const today = getLocalDateString(new Date());
    if (targetDate === today) {
      await loadComparisonData();
    }

    updateStats();
    updateTopProjects();
    updateGoals();
    updateWeeklyFocusScore();
    updateStreak();
    updateMiniTimeline();

  } catch (error) {
    console.error('Failed to load activities:', error);
    showNotification('Failed to load activities', 'error');
  }
}

// Default number of activities to show
const ACTIVITIES_PER_PAGE = 10;

/**
 * Render activity list
 */
function renderActivityList() {
  if (!Elements.activityList) return;

  // Initialize visible count if not set
  if (!AppState.activityVisibleCount) {
    AppState.activityVisibleCount = ACTIVITIES_PER_PAGE;
  }

  if (AppState.activities.length === 0) {
    Elements.activityList.innerHTML = `
      <div class="empty-state">
        <div class="icon">📋</div>
        <div>No activities yet today</div>
        <div class="meta-line">Start tracking to see your activity feed</div>
      </div>
    `;
    return;
  }

  // Sort by start time, most recent first
  const sorted = [...AppState.activities].sort((a, b) => {
    return new Date(b.startTime || 0) - new Date(a.startTime || 0);
  });

  // Take visible count
  const visible = sorted.slice(0, AppState.activityVisibleCount);
  const hasMore = sorted.length > AppState.activityVisibleCount;
  const remaining = sorted.length - AppState.activityVisibleCount;

  const activitiesHtml = visible.map(activity => {
    const title = activity.title || activity.app || 'Unknown';
    const app = activity.app || '--';
    const project = activity.project || 'General';
    const duration = formatDuration(activity.duration || 0);
    const startTime = activity.startTime ? new Date(activity.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';
    const endTime = activity.endTime ? new Date(activity.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';
    const activityId = escapeHtml(String(activity.id));

    // Render activity tags
    const tagsHtml = renderActivityTags(activity);

    // Show window title if different from app name (truncate to 60 chars)
    const windowTitle = activity.title && activity.title !== app && activity.title !== activity.app
      ? `<div class="window-title">${escapeHtml(activity.title.length > 60 ? activity.title.substring(0, 60) + '…' : activity.title)}</div>`
      : '';

    return `
      <div class="activity" data-id="${activityId}">
        <div>
          <div class="title">${escapeHtml(app)}</div>
          ${windowTitle}
          <div class="meta-line">
            <span>${escapeHtml(project)}</span>
            <span>• ${startTime}–${endTime}</span>
            <span>• ${duration}</span>
          </div>
          ${tagsHtml}
        </div>
        <div class="activity-actions">
          <button class="btn-edit" data-id="${activityId}">Edit</button>
          <button class="btn-tags btn-small" data-id="${activityId}">Tags</button>
          <button class="btn-delete delete" data-id="${activityId}">Delete</button>
        </div>
        <div class="duration">${duration}</div>
      </div>
    `;
  }).join('');

  // Add load more button if there are more activities
  const loadMoreHtml = hasMore ? `
    <button class="load-more-btn" id="load-more-activities">
      Load more (${remaining} remaining)
    </button>
  ` : '';

  Elements.activityList.innerHTML = activitiesHtml + loadMoreHtml;

  // Attach event listeners using event delegation
  attachActivityListeners();

  // Attach load more handler
  const loadMoreBtn = document.getElementById('load-more-activities');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', loadMoreActivities);
  }
}

/**
 * Load more activities in the feed
 */
function loadMoreActivities() {
  AppState.activityVisibleCount = (AppState.activityVisibleCount || ACTIVITIES_PER_PAGE) + ACTIVITIES_PER_PAGE;
  renderActivityList();
}

/**
 * Initialize activity list event delegation (call once)
 * Uses single container listener instead of per-button listeners
 */
function initActivityListDelegation() {
  if (!Elements.activityList || Elements.activityList.dataset.delegated) return;
  Elements.activityList.dataset.delegated = 'true';

  Elements.activityList.addEventListener('click', (e) => {
    const target = e.target;

    // Handle edit button
    if (target.classList.contains('btn-edit')) {
      e.stopPropagation();
      const id = target.dataset.id;
      if (id) openEditModal(id);
      return;
    }

    // Handle tags button
    if (target.classList.contains('btn-tags')) {
      e.stopPropagation();
      const id = target.dataset.id;
      if (id) openTagEditor(id);
      return;
    }

    // Handle delete button
    if (target.classList.contains('btn-delete')) {
      e.stopPropagation();
      const id = target.dataset.id;
      if (id) openDeleteModal(id);
      return;
    }

    // Handle click on activity row itself (for quick view/edit)
    const activityRow = target.closest('.activity');
    if (activityRow && !target.closest('.activity-actions')) {
      const id = activityRow.dataset.id;
      if (id) openEditModal(id);
    }
  });
}

/**
 * Legacy function - now just ensures delegation is set up
 * @deprecated Use initActivityListDelegation instead
 */
function attachActivityListeners() {
  initActivityListDelegation();
}

/**
 * Load comparison data for today vs yesterday/weekly average
 * Caches results to avoid repeated API calls
 */
async function loadComparisonData() {
  if (!window.lightTrackAPI) return;

  const today = getLocalDateString(new Date());

  // Skip if already loaded for today
  if (AppState.comparisonData?.date === today) return;

  try {
    // Get yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateString(yesterday);

    // Get last 7 days for weekly average (excluding today)
    const weeklyDates = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      weeklyDates.push(getLocalDateString(d));
    }

    // Fetch yesterday's data
    const yesterdayActivities = await window.lightTrackAPI.getActivities(yesterdayStr) || [];
    const yesterdayTotal = yesterdayActivities.reduce((sum, a) => sum + (a.duration || 0), 0);

    // Fetch weekly data (in parallel)
    const weeklyPromises = weeklyDates.map(d => window.lightTrackAPI.getActivities(d));
    const weeklyResults = await Promise.all(weeklyPromises);
    const weeklyTotals = weeklyResults.map(activities =>
      (activities || []).reduce((sum, a) => sum + (a.duration || 0), 0)
    );

    // Calculate average (only days with activity)
    const activeDays = weeklyTotals.filter(t => t > 0);
    const weeklyAverage = activeDays.length > 0
      ? activeDays.reduce((sum, t) => sum + t, 0) / activeDays.length
      : 0;

    AppState.comparisonData = {
      date: today,
      yesterdayTotal,
      weeklyAverage,
      activeDaysCount: activeDays.length
    };

  } catch (error) {
    console.error('Failed to load comparison data:', error);
    // Non-critical: return empty data instead of showing notification
    return null;
  }
}

/**
 * Update statistics display
 */
function updateStats() {
  const activities = AppState.activities;

  // Calculate totals
  let totalSeconds = 0;
  let billableSeconds = 0;
  const projects = new Set();
  let switches = 0;
  let lastApp = null;

  activities.forEach(a => {
    const duration = a.duration || 0;
    totalSeconds += duration;
    if (a.billable !== false) billableSeconds += duration;
    if (a.project) projects.add(a.project);

    // Track context switches
    if (lastApp && a.app !== lastApp) {
      switches++;
    }
    lastApp = a.app;
  });

  AppState.contextSwitches = switches;

  // Update UI
  if (Elements.todayTotal) {
    Elements.todayTotal.textContent = formatDuration(totalSeconds);
  }

  if (Elements.billablePercent) {
    const percent = totalSeconds > 0 ? Math.round((billableSeconds / totalSeconds) * 100) : 0;
    Elements.billablePercent.textContent = `${percent}%`;
  }

  if (Elements.billableTime) {
    Elements.billableTime.textContent = `${formatDuration(billableSeconds)} billed`;
  }

  if (Elements.contextSwitches) {
    Elements.contextSwitches.textContent = switches.toString();
  }

  if (Elements.projectCount) {
    Elements.projectCount.textContent = projects.size.toString();
  }

  // Update focus score (simplified calculation)
  if (Elements.focusScore) {
    const score = activities.length > 0 ? Math.max(50, 100 - (switches * 3)) : '--';
    Elements.focusScore.textContent = score.toString();
  }

  if (Elements.focusSummary) {
    Elements.focusSummary.textContent = activities.length > 0
      ? `${activities.length} activities tracked`
      : 'Start tracking to measure focus';
  }

  // Update today comparison (vs yesterday or weekly average)
  if (Elements.todayCompare) {
    const comparison = AppState.comparisonData;
    if (!comparison || totalSeconds === 0) {
      Elements.todayCompare.textContent = 'Start tracking';
    } else if (comparison.yesterdayTotal > 0) {
      // Compare to yesterday
      const diff = totalSeconds - comparison.yesterdayTotal;
      const percent = Math.round((diff / comparison.yesterdayTotal) * 100);
      const arrow = diff >= 0 ? '↑' : '↓';
      const absPercent = Math.abs(percent);
      Elements.todayCompare.textContent = `${arrow}${absPercent}% vs yesterday`;
    } else if (comparison.weeklyAverage > 0) {
      // Compare to weekly average
      const diff = totalSeconds - comparison.weeklyAverage;
      const percent = Math.round((diff / comparison.weeklyAverage) * 100);
      const arrow = diff >= 0 ? '↑' : '↓';
      const absPercent = Math.abs(percent);
      Elements.todayCompare.textContent = `${arrow}${absPercent}% vs avg`;
    } else {
      Elements.todayCompare.textContent = 'First day tracking';
    }
  }

  // Update daily summary
  updateDailySummary();
}

/**
 * Update top projects chart
 */
function updateTopProjects() {
  if (!Elements.topProjects) return;

  const projectTimes = {};
  AppState.activities.forEach(a => {
    const project = a.project || 'General';
    projectTimes[project] = (projectTimes[project] || 0) + (a.duration || 0);
  });

  const sorted = Object.entries(projectTimes).sort((a, b) => b[1] - a[1]).slice(0, 3);

  if (sorted.length === 0) {
    Elements.topProjects.innerHTML = `
      <div class="bar-row">
        <span class="badge">No data</span>
        <div class="bar"><span class="bar-fill-0"></span></div>
        <div class="duration">0m</div>
      </div>
    `;
    return;
  }

  const maxTime = sorted[0][1] || 1;

  Elements.topProjects.innerHTML = sorted.map(([project, seconds]) => {
    const percent = Math.round((seconds / maxTime) * 100);
    const className = getBarFillClass(percent);
    return `
      <div class="bar-row">
        <span class="badge">${escapeHtml(project)}</span>
        <div class="bar"><span class="${className}"></span></div>
        <div class="duration">${formatDuration(seconds)}</div>
      </div>
    `;
  }).join('');
}

/**
 * Map percentage to nearest 5% fill class
 */
function getBarFillClass(percent) {
  const clamped = Math.max(0, Math.min(100, percent));
  const bucket = Math.round(clamped / 5) * 5;
  return `bar-fill-${bucket}`;
}

/**
 * Calculate daily summary statistics from activities
 * @param {Array} activities - Array of activity objects
 * @returns {Object} Statistics object with totalSeconds, billableSeconds, projectTimes, earliestTime, latestTime
 */
function calculateDailySummaryStats(activities) {
  let totalSeconds = 0;
  let billableSeconds = 0;
  const projectTimes = {};
  let earliestTime = null;
  let latestTime = null;

  activities.forEach(a => {
    const duration = a.duration || 0;
    totalSeconds += duration;
    if (a.billable !== false) billableSeconds += duration;

    const project = a.project || 'General';
    projectTimes[project] = (projectTimes[project] || 0) + duration;

    // Track time range
    if (a.startTime) {
      const start = new Date(a.startTime);
      if (!earliestTime || start < earliestTime) earliestTime = start;
    }
    if (a.endTime) {
      const end = new Date(a.endTime);
      if (!latestTime || end > latestTime) latestTime = end;
    }
  });

  return { totalSeconds, billableSeconds, projectTimes, earliestTime, latestTime };
}

/**
 * Render daily summary statistics to UI elements
 * @param {Object} stats - Statistics object from calculateDailySummaryStats
 */
function renderDailySummaryStats({ totalSeconds, billableSeconds, projectTimes, earliestTime, latestTime }) {
  // Update total time
  if (Elements.summaryTotalTime) {
    Elements.summaryTotalTime.textContent = formatDuration(totalSeconds);
  }

  // Update billable time
  if (Elements.summaryBillable) {
    const billableHours = formatDuration(billableSeconds);
    const percent = totalSeconds > 0 ? Math.round((billableSeconds / totalSeconds) * 100) : 0;
    Elements.summaryBillable.textContent = `${billableHours} (${percent}%)`;
  }

  // Update goal progress
  if (Elements.summaryGoal) {
    const goalHours = (AppState.settings.deepWorkTarget || 4) * 3600;
    const goalPercent = goalHours > 0 ? Math.min(100, Math.round((totalSeconds / goalHours) * 100)) : 0;
    Elements.summaryGoal.textContent = `${goalPercent}%`;
  }

  // Update projects list (top 5)
  if (Elements.summaryProjects) {
    const sorted = Object.entries(projectTimes).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (sorted.length === 0) {
      Elements.summaryProjects.innerHTML = '<div class="meta-line">No activities yet</div>';
    } else {
      Elements.summaryProjects.innerHTML = sorted.map(([project, seconds]) => `
        <div class="summary-project-row">
          <span class="project-name">${escapeHtml(project)}</span>
          <span class="project-time">${formatDuration(seconds)}</span>
        </div>
      `).join('');
    }
  }

  // Update time range
  if (Elements.summaryTimeRange) {
    if (earliestTime && latestTime) {
      const startStr = earliestTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const endStr = latestTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      Elements.summaryTimeRange.textContent = `Active: ${startStr} - ${endStr}`;
    } else {
      Elements.summaryTimeRange.textContent = '--';
    }
  }
}

/**
 * Update the daily summary UI
 */
function updateDailySummary() {
  if (!Elements.dailySummaryCard) return;
  const stats = calculateDailySummaryStats(AppState.activities);
  renderDailySummaryStats(stats);
}

/**
 * Initialize daily summary toggle
 */
function initDailySummary() {
  if (!Elements.toggleDailySummary || !Elements.dailySummaryCard) return;

  // Check if it's after auto-expand hour (5 PM) - auto-expand
  const currentHour = new Date().getHours();
  const isAfternoon = currentHour >= CONSTANTS.AUTO_EXPAND_HOUR;

  // Load saved state with proper validation or use time-based default
  const savedState = localStorage.getItem(CONSTANTS.STORAGE_KEYS.DAILY_SUMMARY_COLLAPSED);
  let isCollapsed;
  if (savedState === 'true') {
    isCollapsed = true;
  } else if (savedState === 'false') {
    isCollapsed = false;
  } else {
    isCollapsed = !isAfternoon; // Default based on time if no valid saved state
  }

  if (isCollapsed) {
    Elements.dailySummaryCard.classList.add('collapsed');
  }

  // Toggle handler
  Elements.toggleDailySummary.addEventListener('click', () => {
    Elements.dailySummaryCard.classList.toggle('collapsed');
    const nowCollapsed = Elements.dailySummaryCard.classList.contains('collapsed');
    safeLocalStorageSet(CONSTANTS.STORAGE_KEYS.DAILY_SUMMARY_COLLAPSED, nowCollapsed.toString());
  });
}

/**
 * Get current tracking status from API
 */
async function getCurrentStatus() {
  try {
    if (!window.lightTrackAPI) {
      console.warn('LightTrack API not available yet');
      return;
    }

    const status = await window.lightTrackAPI.getTrackingStatus();
    console.log('Current status:', status);

    AppState.isTracking = status?.isTracking || status?.isActive || false;
    AppState.currentActivity = status?.currentActivity;

    if (AppState.isTracking) {
      AppState.startTime = status?.sessionStartTime || Date.now();
      AppState.formattedStartTime = new Date(AppState.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      if (AppState.timerInterval) clearInterval(AppState.timerInterval);
      AppState.timerInterval = setInterval(updateTimerDisplay, 1000);
    } else {
      AppState.startTime = null;
      AppState.formattedStartTime = null;
      AppState.currentActivity = null;
      if (AppState.timerInterval) {
        clearInterval(AppState.timerInterval);
        AppState.timerInterval = null;
      }
    }

    // Update sampling badge
    const samplingRate = status?.samplingRate || 5;
    if (Elements.samplingBadge) {
      Elements.samplingBadge.textContent = `Sampling: ${samplingRate}s`;
    }

    updateTrackingUI();
    updateTimerDisplay();

  } catch (error) {
    console.error('Failed to get tracking status:', error);
    showNotification('Failed to sync tracking status', 'warning');
  }
}

/**
 * Show notification toast
 * Uses the LightTrack.UI module if available for enhanced styling
 */
function showNotification(message, type = 'info') {
  console.log(`[${type.toUpperCase()}] ${message}`);

  // Use module if available
  if (LT.UI?.showNotification) {
    return LT.UI.showNotification(message, type);
  }

  // Fallback: inline implementation
  let notification = document.getElementById('notification');
  if (!notification) {
    notification = document.createElement('div');
    notification.id = 'notification';
    notification.className = 'notification';
    document.body.appendChild(notification);
  }

  notification.textContent = message;
  notification.className = `notification ${type}`;

  // Show
  setTimeout(() => notification.classList.add('show'), 10);

  // Hide after 3 seconds
  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

/**
 * Safe API call wrapper with loading state and error notifications
 * @param {Function} apiCall - Async function to execute
 * @param {Object} options - Configuration options
 * @param {string} [options.successMessage] - Message to show on success (null = no message)
 * @param {string} [options.errorMessage] - Message to show on error
 * @param {boolean} [options.showLoading] - Whether to show loading state
 * @param {HTMLElement} [options.loadingElement] - Element to add .loading class to
 * @param {boolean} [options.rethrow] - Whether to rethrow error after notification
 * @returns {Promise<*>} Result of API call
 */
async function safeApiCall(apiCall, options = {}) {
  const {
    successMessage = null,
    errorMessage = 'Operation failed. Please try again.',
    showLoading = false,
    loadingElement = null,
    rethrow = false
  } = options;

  try {
    if (showLoading && loadingElement) {
      loadingElement.classList.add('loading');
      loadingElement.disabled = true;
    }

    const result = await apiCall();

    if (successMessage) {
      showNotification(successMessage, 'success');
    }
    return result;
  } catch (error) {
    console.error(errorMessage, error);
    showNotification(error.message || errorMessage, 'error');
    if (rethrow) throw error;
    return null;
  } finally {
    if (showLoading && loadingElement) {
      loadingElement.classList.remove('loading');
      loadingElement.disabled = false;
    }
  }
}

/**
 * Get local date string (YYYY-MM-DD) from timestamp
 * Avoids UTC conversion issues that cause activities to appear on wrong day
 */
function getLocalDateString(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDateString(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Escape string for safe use in HTML attributes
 * Escapes HTML entities AND quotes to prevent attribute breakout
 */
function escapeAttr(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape string for safe use in JavaScript string literals
 * Used for onclick handlers where patterns might contain quotes
 */
function escapeJsString(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Toggle tracking button
  if (Elements.toggleBtn) {
    Elements.toggleBtn.addEventListener('click', toggleTracking);
  }

  // Navigation buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view, btn.title);
    });
  });

  // Pill filters
  document.querySelectorAll('.pill[data-filter]').forEach(pill => {
    pill.addEventListener('click', () => {
      const row = pill.parentElement;
      row.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
    });
  });

  // Floating timer toggle
  const floatingTimerBtn = document.getElementById('btn-floating-timer');
  if (floatingTimerBtn && Elements.floatingTimer) {
    floatingTimerBtn.addEventListener('click', () => {
      Elements.floatingTimer.classList.toggle('active');
    });
  }

  // Export button
  const exportBtn = document.getElementById('btn-export');
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      try {
        if (window.lightTrackAPI) {
          await window.lightTrackAPI.exportData();
          showNotification('Data exported', 'success');
        }
      } catch (error) {
        showNotification('Export failed', 'error');
      }
    });
  }

  // Snake game button
  const snakeBtn = document.getElementById('btn-snake');
  if (snakeBtn) {
    snakeBtn.addEventListener('click', openSnakeGame);
  }

  // Manual entry button
  const manualEntryBtn = document.getElementById('add-manual-entry');
  if (manualEntryBtn) {
    manualEntryBtn.addEventListener('click', () => {
      openManualEntryModal();
    });
  }

  // Modal close/cancel buttons
  const modalClose = document.getElementById('modal-close');
  const modalCancel = document.getElementById('modal-cancel');
  const modalSave = document.getElementById('modal-save');

  if (modalClose) modalClose.addEventListener('click', closeModal);
  if (modalCancel) modalCancel.addEventListener('click', closeModal);
  if (modalSave) modalSave.addEventListener('click', saveActivity);

  // Delete modal buttons
  const deleteCancel = document.getElementById('delete-cancel');
  const deleteConfirm = document.getElementById('delete-confirm');

  if (deleteCancel) deleteCancel.addEventListener('click', closeDeleteModal);
  if (deleteConfirm) deleteConfirm.addEventListener('click', confirmDelete);

  // Clear data modal buttons
  const clearDataCancel = document.getElementById('clear-data-cancel');
  const clearDataConfirm = document.getElementById('clear-data-confirm');

  if (clearDataCancel) clearDataCancel.addEventListener('click', closeClearDataModal);
  if (clearDataConfirm) clearDataConfirm.addEventListener('click', confirmClearData);

  // New project modal buttons
  const newProjectClose = document.getElementById('new-project-modal-close');
  const newProjectCancel = document.getElementById('new-project-cancel');
  const newProjectSave = document.getElementById('new-project-save');
  const newProjectOverlay = document.getElementById('new-project-modal-overlay');

  if (newProjectClose) newProjectClose.addEventListener('click', closeNewProjectModal);
  if (newProjectCancel) newProjectCancel.addEventListener('click', closeNewProjectModal);
  if (newProjectSave) newProjectSave.addEventListener('click', saveNewProject);
  if (newProjectOverlay) {
    newProjectOverlay.addEventListener('click', (e) => {
      if (e.target === newProjectOverlay) closeNewProjectModal();
    });
  }

  // Close modals on overlay click
  if (Elements.modalOverlay) {
    Elements.modalOverlay.addEventListener('click', (e) => {
      if (e.target === Elements.modalOverlay) closeModal();
    });
  }
  if (Elements.deleteModalOverlay) {
    Elements.deleteModalOverlay.addEventListener('click', (e) => {
      if (e.target === Elements.deleteModalOverlay) closeDeleteModal();
    });
  }
  if (Elements.clearDataModalOverlay) {
    Elements.clearDataModalOverlay.addEventListener('click', (e) => {
      if (e.target === Elements.clearDataModalOverlay) closeClearDataModal();
    });
  }

  // Date filter
  if (Elements.filterDate) {
    Elements.filterDate.value = AppState.filterDate;
    Elements.filterDate.addEventListener('change', (e) => {
      AppState.filterDate = e.target.value;
      loadActivities(AppState.filterDate);
    });
  }

  // Mark break button
  const markBreakBtn = document.getElementById('mark-break');
  if (markBreakBtn) {
    markBreakBtn.addEventListener('click', markBreak);
  }

  // Timeline navigation
  const timelinePrev = document.getElementById('timeline-prev');
  const timelineNext = document.getElementById('timeline-next');
  const timelineToday = document.getElementById('timeline-today');
  const timelineAddEntry = document.getElementById('timeline-add-entry');

  if (timelinePrev) {
    timelinePrev.addEventListener('click', () => navigateTimeline(-1));
  }
  if (timelineNext) {
    timelineNext.addEventListener('click', () => navigateTimeline(1));
  }
  if (timelineToday) {
    timelineToday.addEventListener('click', () => {
      AppState.timelineDate = getLocalDateString(new Date());
      loadTimelineView();
    });
  }
  if (timelineAddEntry) {
    timelineAddEntry.addEventListener('click', () => {
      openManualEntryModal(AppState.timelineDate);
    });
  }

  // Timeline filter event listeners
  if (Elements.timelineProjectFilter) {
    Elements.timelineProjectFilter.addEventListener('change', (e) => {
      AppState.timelineFilters.project = e.target.value;
      loadTimelineView();
    });
  }
  if (Elements.timelineBillableFilter) {
    Elements.timelineBillableFilter.addEventListener('change', (e) => {
      AppState.timelineFilters.billableOnly = e.target.checked;
      loadTimelineView();
    });
  }
  if (Elements.timelineGroupToggle) {
    Elements.timelineGroupToggle.addEventListener('change', (e) => {
      AppState.timelineFilters.groupByProject = e.target.checked;
      loadTimelineView();
    });
  }

  // Timeline selection controls
  if (Elements.timelineSelectAll) {
    Elements.timelineSelectAll.addEventListener('change', (e) => {
      toggleSelectAllActivities(e.target.checked);
    });
  }
  if (Elements.timelineMergeSelected) {
    Elements.timelineMergeSelected.addEventListener('click', mergeSelectedActivities);
  }

  // Listen for tracking updates from main process
  if (window.lightTrackAPI?.onTrackingUpdate) {
    window.lightTrackAPI.onTrackingUpdate((data) => {
      console.log('Tracking update:', data);
      if (typeof data.isTracking === 'boolean') {
        AppState.isTracking = data.isTracking;
      }

      if (data.sessionStartTime) {
        AppState.startTime = data.sessionStartTime;
      }

      if (data.currentActivity || data.currentActivity === null) {
        AppState.currentActivity = data.currentActivity;
      }

      if (AppState.isTracking) {
        if (!AppState.timerInterval) {
          AppState.timerInterval = setInterval(updateTimerDisplay, 1000);
        }
      } else if (AppState.timerInterval) {
        clearInterval(AppState.timerInterval);
        AppState.timerInterval = null;
        AppState.startTime = null;
        AppState.currentActivity = null;
      }

      updateTrackingUI();
      updateTimerDisplay();
    });
  }

  if (window.lightTrackAPI?.onTrackingStatusChanged) {
    window.lightTrackAPI.onTrackingStatusChanged((isTracking) => {
      AppState.isTracking = Boolean(isTracking);
      if (AppState.isTracking) {
        getCurrentStatus();
      } else {
        AppState.startTime = null;
        AppState.currentActivity = null;
        if (AppState.timerInterval) {
          clearInterval(AppState.timerInterval);
          AppState.timerInterval = null;
        }
        updateTrackingUI();
        updateTimerDisplay();
      }
    });
  }

  // Clear tag filters button
  const clearTagFiltersBtn = document.getElementById('clear-tag-filters');
  if (clearTagFiltersBtn) {
    clearTagFiltersBtn.addEventListener('click', clearTagFilters);
  }

  // Close tag editor when clicking outside
  document.addEventListener('click', (e) => {
    const editor = document.getElementById('tag-editor');
    if (editor && !editor.contains(e.target) && !e.target.closest('.activity-actions')) {
      closeTagEditor();
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Skip if user is typing in an input/textarea
    if (e.target.matches('input, textarea, select')) return;

    // Ctrl+Shift+T to toggle tracking
    if (e.ctrlKey && e.shiftKey && e.key === 'T') {
      e.preventDefault();
      toggleTracking();
    }

    // Ctrl+Shift+F for floating timer
    if (e.ctrlKey && e.shiftKey && e.key === 'F') {
      e.preventDefault();
      if (Elements.floatingTimer) {
        Elements.floatingTimer.classList.toggle('active');
      }
    }

    // Timeline keyboard navigation (only when timeline view is active)
    if (AppState.currentView === 'timeline') {
      if (e.key === 'ArrowLeft' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        navigateTimeline(-1);
      } else if (e.key === 'ArrowRight' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        navigateTimeline(1);
      } else if (e.key === 'Home' || (e.key === 't' && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault();
        AppState.timelineDate = getLocalDateString(new Date());
        loadTimelineView();
      }
    }
  });

  // Make floating timer draggable
  if (Elements.floatingTimer) {
    let isDragging = false;
    let startX, startY, initialX, initialY;

    Elements.floatingTimer.style.cursor = 'move';

    Elements.floatingTimer.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = Elements.floatingTimer.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      Elements.floatingTimer.style.right = 'auto';
      Elements.floatingTimer.style.bottom = 'auto';
      Elements.floatingTimer.style.left = (initialX + deltaX) + 'px';
      Elements.floatingTimer.style.top = (initialY + deltaY) + 'px';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  // Event delegation for mapping buttons (CSP-safe, quote-safe)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const pattern = btn.dataset.pattern;
    const key = btn.dataset.key;

    switch (action) {
      case 'edit-mapping':
        if (pattern) editProjectMapping(pattern);
        break;
      case 'remove-mapping':
        if (pattern) removeProjectMapping(pattern);
        break;
      case 'edit-url-mapping':
        if (pattern) editUrlMapping(pattern);
        break;
      case 'remove-url-mapping':
        if (pattern) removeUrlMapping(pattern);
        break;
      case 'edit-jira-mapping':
        if (key) editJiraMapping(key);
        break;
      case 'remove-jira-mapping':
        if (key) removeJiraMapping(key);
        break;
      case 'edit-meeting-mapping':
        if (pattern) editMeetingMapping(pattern);
        break;
      case 'remove-meeting-mapping':
        if (pattern) removeMeetingMapping(pattern);
        break;
    }
  });

  // Keyboard shortcuts for mapping forms (Enter to submit, Escape to cancel)
  document.addEventListener('keydown', (e) => {
    // Only handle when focus is in a mapping form
    const form = e.target.closest('.mapping-form');
    if (!form) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Find the Add or Update button in this form and click it
      const updateBtn = form.querySelector('[id^="update-"][id$="-btn"]:not([disabled])');
      const addBtn = form.querySelector('[id^="add-"][id$="-btn"]');
      if (updateBtn && !updateBtn.disabled) {
        updateBtn.click();
      } else if (addBtn) {
        addBtn.click();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      // Find and click the Cancel button in this form
      const cancelBtn = form.querySelector('[id^="cancel-"][id$="-btn"]');
      if (cancelBtn && cancelBtn.style.display !== 'none') {
        cancelBtn.click();
      }
    }
  });
}

/**
 * Initialize the application
 */
function init() {
  console.log('Initializing LightTrack Mediagenix UI...');

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
    return;
  }

  // Initialize element references
  initElements();

  // Set up event listeners
  setupEventListeners();

  // Set up event delegation for timeline
  setupTimelineEventDelegation();

  // Set up keyboard shortcuts for timer
  setupTimerKeyboardShortcuts();

  // Set up project switcher
  initProjectSwitcher();

  // Initialize daily summary toggle
  initDailySummary();

  // Get initial status after a short delay (wait for preload)
  setTimeout(async () => {
    await loadSettings();
    await loadTags();
    getCurrentStatus();
    loadActivities();
    loadUpcomingMeetings();
    hideSplash();
  }, 500);

  // Refresh activities periodically
  setInterval(() => {
    if (AppState.isTracking) {
      loadActivities();
    }
  }, 60000);

  console.log('LightTrack Mediagenix UI initialized');
  showNotification('LightTrack ready', 'success');
}

function hideSplash() {
  document.body.classList.add('splash-hidden');
}

/**
 * Switch between main views
 */
function switchView(viewName, viewTitle = '') {
  // Track current view for keyboard shortcuts and other features
  AppState.currentView = viewName;

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const targetBtn = document.querySelector(`.nav-btn[data-view="${viewName}"]`);
  if (targetBtn) targetBtn.classList.add('active');

  if (Elements.views) {
    Elements.views.forEach(view => {
      view.classList.toggle('active', view.dataset.view === viewName);
    });
  }

  if (Elements.topbarTitle) {
    Elements.topbarTitle.textContent = viewTitle || capitalize(viewName);
  }
  if (Elements.topbarSubtitle) {
    const subtitles = {
      timer: 'Trusted partner. Clear tracking.',
      timeline: 'Timeline of your day.',
      analytics: 'Weekly trends and insights.',
      projects: 'Time by project.',
      'sap-export': 'Export to SAP ByDesign.',
      settings: 'Data and preferences.'
    };
    Elements.topbarSubtitle.textContent = subtitles[viewName] || 'LightTrack';
  }

  // Load view-specific data
  if (viewName === 'timeline') loadTimelineView();
  if (viewName === 'analytics') loadAnalyticsView();
  if (viewName === 'projects') loadProjectsView();
  if (viewName === 'sap-export') loadSAPExportView();
  if (viewName === 'settings') loadSettingsView();
}

function capitalize(text) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ============= Weekly Focus Score =============

/**
 * Calculate and update weekly focus score
 */
async function updateWeeklyFocusScore() {
  const weeklyFocusEl = document.getElementById('weekly-focus-score');
  const weeklySummaryEl = document.getElementById('weekly-focus-summary');

  if (!weeklyFocusEl) return;

  // Check cache first (5 minute TTL)
  const now = Date.now();
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  if (AppState.weeklyFocusCache &&
      (now - AppState.weeklyFocusCache.timestamp) < CACHE_TTL) {
    // Use cached data
    weeklyFocusEl.textContent = AppState.weeklyFocusCache.score;
    if (weeklySummaryEl) {
      weeklySummaryEl.textContent = AppState.weeklyFocusCache.summary;
    }
    return;
  }

  try {
    if (!window.lightTrackAPI) {
      weeklyFocusEl.textContent = '--';
      return;
    }

    // Get last 7 days of activities (fetch each day individually for better caching)
    const weekActivities = [];
    const today = new Date();

    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = getLocalDateString(date);

      const activities = await window.lightTrackAPI.getActivities(dateStr) || [];
      weekActivities.push(...activities);
    }

    if (weekActivities.length === 0) {
      weeklyFocusEl.textContent = '--';
      if (weeklySummaryEl) weeklySummaryEl.textContent = 'Track more to see insights';

      // Cache the empty result
      AppState.weeklyFocusCache = {
        timestamp: now,
        score: '--',
        summary: 'Track more to see insights'
      };
      return;
    }

    // Group by day and calculate daily focus scores
    const dayStats = {};

    weekActivities.forEach(a => {
      if (!a.startTime) return;
      const day = new Date(a.startTime).toDateString();
      if (!dayStats[day]) {
        dayStats[day] = { apps: [], switches: 0, lastApp: null };
      }

      const app = a.app || 'Unknown';
      if (dayStats[day].lastApp && dayStats[day].lastApp !== app) {
        dayStats[day].switches++;
      }
      dayStats[day].lastApp = app;
      dayStats[day].apps.push(app);
    });

    // Calculate focus score for each day (100 - switches * 3, min 50)
    const dailyScores = Object.values(dayStats).map(d =>
      Math.max(50, 100 - d.switches * 3)
    );

    // Average
    const avgScore = dailyScores.length > 0
      ? Math.round(dailyScores.reduce((sum, s) => sum + s, 0) / dailyScores.length)
      : 0;

    const scoreText = avgScore > 0 ? avgScore.toString() : '--';
    weeklyFocusEl.textContent = scoreText;

    // Summary text
    let summaryText = 'Track more to see insights';
    if (weeklySummaryEl && Object.keys(dayStats).length > 0) {
      const totalSwitches = Object.values(dayStats).reduce((sum, d) => sum + d.switches, 0);
      const daysTracked = Object.keys(dayStats).length;
      summaryText = `${daysTracked} days, ${totalSwitches} switches`;
      weeklySummaryEl.textContent = summaryText;
    }

    // Cache the result
    AppState.weeklyFocusCache = {
      timestamp: now,
      score: scoreText,
      summary: summaryText
    };

  } catch (error) {
    console.error('Failed to calculate weekly focus:', error);
    weeklyFocusEl.textContent = '--';
  }
}

/**
 * Calculate and display tracking streak (consecutive days)
 */
async function updateStreak() {
  const streakCountEl = document.getElementById('streak-count');
  const streakSummaryEl = document.getElementById('streak-summary');

  if (!streakCountEl) return;

  // Check cache (30 minute TTL)
  const now = Date.now();
  const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  if (AppState.streakCache && (now - AppState.streakCache.timestamp) < CACHE_TTL) {
    streakCountEl.textContent = AppState.streakCache.streak;
    if (streakSummaryEl) streakSummaryEl.textContent = AppState.streakCache.summary;
    if (AppState.streakCache.streak >= 7) streakCountEl.classList.add('fire');
    return;
  }

  try {
    if (!window.lightTrackAPI) {
      streakCountEl.textContent = '0';
      return;
    }

    // Check consecutive days going back from today
    let streak = 0;
    const today = new Date();
    const MIN_MINUTES_FOR_DAY = 5; // Minimum 5 minutes to count as a tracking day

    for (let i = 0; i < 365; i++) { // Check up to a year back
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = getLocalDateString(date);

      const activities = await window.lightTrackAPI.getActivities(dateStr) || [];
      const totalSeconds = activities.reduce((sum, a) => sum + (a.duration || 0), 0);
      const totalMinutes = Math.floor(totalSeconds / 60);

      if (totalMinutes >= MIN_MINUTES_FOR_DAY) {
        streak++;
      } else if (i === 0) {
        // Today doesn't count yet, check if we have a streak from yesterday
        continue;
      } else {
        // Streak broken
        break;
      }
    }

    streakCountEl.textContent = streak.toString();

    // Add fire animation for streaks >= 7 days
    if (streak >= 7) {
      streakCountEl.classList.add('fire');
    } else {
      streakCountEl.classList.remove('fire');
    }

    // Summary text
    let summary = 'Start tracking to build your streak';
    if (streak === 0) {
      summary = 'Start tracking to build your streak';
    } else if (streak === 1) {
      summary = 'Great start! Keep it going';
    } else if (streak < 7) {
      summary = `${7 - streak} more days to a week streak`;
    } else if (streak < 30) {
      summary = 'On fire! Keep the momentum';
    } else {
      summary = 'Incredible consistency!';
    }

    if (streakSummaryEl) streakSummaryEl.textContent = summary;

    // Cache the result
    AppState.streakCache = {
      timestamp: now,
      streak: streak.toString(),
      summary
    };

  } catch (error) {
    console.error('Failed to calculate streak:', error);
    streakCountEl.textContent = '0';
  }
}

/**
 * Update mini timeline preview in hero section
 */
function updateMiniTimeline() {
  const timelineBar = document.getElementById('mini-timeline-bar');
  const startLabel = document.querySelector('.mini-timeline-start');
  const endLabel = document.querySelector('.mini-timeline-end');

  if (!timelineBar) return;

  // Get work day bounds
  const dayStartMinutes = getWorkDayStartMinutes();
  const dayEndMinutes = getWorkDayEndMinutes();
  const dayDurationMinutes = dayEndMinutes - dayStartMinutes;

  // Update labels
  if (startLabel) {
    const startHour = Math.floor(dayStartMinutes / 60);
    startLabel.textContent = `${startHour}${startHour < 12 ? 'am' : 'pm'}`;
  }
  if (endLabel) {
    const endHour = Math.floor(dayEndMinutes / 60);
    const displayHour = endHour > 12 ? endHour - 12 : endHour;
    endLabel.textContent = `${displayHour}${endHour < 12 ? 'am' : 'pm'}`;
  }

  // Build segment HTML
  const activities = AppState.activities;
  const projectColors = {};
  const colorPalette = [
    '#3805e3', '#b3fc4f', '#9c27b0', '#ff9800',
    '#00bcd4', '#f44336', '#8bc34a', '#e91e63'
  ];
  let colorIndex = 0;

  const segments = activities
    .filter(a => a.startTime)
    .map(a => {
      const start = new Date(a.startTime);
      const end = a.endTime ? new Date(a.endTime) : new Date();

      const startMinutes = start.getHours() * 60 + start.getMinutes();
      const endMinutes = end.getHours() * 60 + end.getMinutes();

      // Calculate position as percentage of work day
      const leftPercent = Math.max(0, ((startMinutes - dayStartMinutes) / dayDurationMinutes) * 100);
      const widthPercent = Math.min(100 - leftPercent, ((endMinutes - startMinutes) / dayDurationMinutes) * 100);

      // Assign color to project
      const project = a.project || 'General';
      if (!projectColors[project]) {
        projectColors[project] = colorPalette[colorIndex % colorPalette.length];
        colorIndex++;
      }

      return `<div class="mini-timeline-segment"
                   style="left: ${leftPercent}%; width: ${Math.max(0.5, widthPercent)}%; background: ${projectColors[project]};"
                   title="${escapeHtml(project)}: ${formatDuration(a.duration || 0)}"></div>`;
    })
    .join('');

  // Add "now" indicator
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowPercent = ((nowMinutes - dayStartMinutes) / dayDurationMinutes) * 100;

  let nowIndicator = '';
  if (nowPercent >= 0 && nowPercent <= 100) {
    nowIndicator = `<div class="mini-timeline-now" style="left: ${nowPercent}%;"></div>`;
  }

  timelineBar.innerHTML = segments + nowIndicator;
}

// ============= Goals Tracking =============

/**
 * Update goals display based on today's activities
 */
function updateGoals() {
  const activities = AppState.activities;
  const deepWorkTargetSeconds = AppState.settings.deepWorkTarget * 3600;
  const breaksTarget = AppState.settings.breaksTarget;

  // Calculate deep work (total time minus breaks)
  let deepWorkSeconds = 0;
  let breakCount = 0;

  activities.forEach(a => {
    const project = (a.project || '').toLowerCase();
    if (project === 'break') {
      breakCount++;
    } else {
      deepWorkSeconds += (a.duration || 0);
    }
  });

  // Update deep work badge
  const deepWorkBadge = document.getElementById('deep-work-badge');
  if (deepWorkBadge) {
    const hours = Math.floor(deepWorkSeconds / 3600);
    const targetHours = AppState.settings.deepWorkTarget;
    deepWorkBadge.textContent = `${hours}h / ${targetHours}h Deep work`;

    // Visual feedback if goal reached
    if (deepWorkSeconds >= deepWorkTargetSeconds) {
      deepWorkBadge.style.borderColor = 'var(--neon)';
    } else {
      deepWorkBadge.style.borderColor = '';
    }
  }

  // Update breaks badge
  const breaksBadge = document.getElementById('breaks-badge');
  if (breaksBadge) {
    breaksBadge.textContent = `${breakCount} / ${breaksTarget} Breaks`;

    // Visual feedback if breaks taken
    if (breakCount >= breaksTarget) {
      breaksBadge.style.borderColor = 'var(--neon)';
    } else {
      breaksBadge.style.borderColor = '';
    }
  }

  // Update goal progress bar
  const progressBar = document.getElementById('goal-progress-bar');
  const progressText = document.getElementById('goal-progress-text');

  if (progressBar && progressText) {
    const percent = deepWorkTargetSeconds > 0
      ? Math.min(100, Math.round((deepWorkSeconds / deepWorkTargetSeconds) * 100))
      : 0;

    progressBar.style.width = `${percent}%`;

    if (percent >= 100) {
      progressBar.classList.add('complete');
      progressText.textContent = 'Daily goal reached!';
    } else {
      progressBar.classList.remove('complete');
      const remaining = deepWorkTargetSeconds - deepWorkSeconds;
      const remainingHours = Math.floor(remaining / 3600);
      const remainingMins = Math.floor((remaining % 3600) / 60);
      if (remainingHours > 0) {
        progressText.textContent = `${percent}% • ${remainingHours}h ${remainingMins}m to goal`;
      } else if (remainingMins > 0) {
        progressText.textContent = `${percent}% • ${remainingMins}m to goal`;
      } else {
        progressText.textContent = `${percent}% of daily goal`;
      }
    }
  }
}

// ============= Quick Project Switcher =============

/**
 * Toggle project switcher dropdown visibility
 */
function toggleProjectSwitcher() {
  if (!Elements.projectSwitcher) return;

  const isActive = Elements.projectSwitcher.classList.contains('active');

  if (isActive) {
    closeProjectSwitcher();
  } else {
    openProjectSwitcher();
  }
}

/**
 * Open project switcher and populate with recent projects
 */
function openProjectSwitcher() {
  if (!Elements.projectSwitcher || !Elements.projectSwitcherList) return;

  // Get unique projects from today's activities
  const projectTimes = {};
  AppState.activities.forEach(a => {
    const project = a.project || 'General';
    projectTimes[project] = (projectTimes[project] || 0) + (a.duration || 0);
  });

  // Also add projects from mappings
  if (AppState.projectMappings) {
    Object.values(AppState.projectMappings).forEach(m => {
      if (m.project && !projectTimes[m.project]) {
        projectTimes[m.project] = 0;
      }
    });
  }

  // Add General if not present
  if (!projectTimes['General']) {
    projectTimes['General'] = 0;
  }

  // Sort by time spent (most time first)
  const sorted = Object.entries(projectTimes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8); // Limit to 8 projects

  const currentProject = AppState.currentProject || 'General';

  Elements.projectSwitcherList.innerHTML = sorted.map(([project, seconds]) => {
    const isCurrent = project === currentProject;
    const time = seconds > 0 ? formatDuration(seconds) : '';
    return `
      <div class="project-switcher-item${isCurrent ? ' current' : ''}" data-project="${escapeHtml(project)}">
        ${escapeHtml(project)}
        ${time ? `<span class="project-time">${time}</span>` : ''}
      </div>
    `;
  }).join('');

  Elements.projectSwitcher.classList.add('active');
}

/**
 * Close project switcher dropdown
 */
function closeProjectSwitcher() {
  if (Elements.projectSwitcher) {
    Elements.projectSwitcher.classList.remove('active');
  }
}

/**
 * Switch to a different project without stopping tracking
 */
async function switchProject(projectName) {
  if (!projectName) return;

  closeProjectSwitcher();

  // Update current project in state
  AppState.currentProject = projectName;

  // Update the display
  if (Elements.currentProjectBadge) {
    Elements.currentProjectBadge.textContent = `Project: ${projectName}`;
  }

  // If tracking, update the current activity on the backend
  if (AppState.isTracking && window.lightTrackAPI?.switchProject) {
    try {
      await window.lightTrackAPI.switchProject(projectName);
      showNotification(`Switched to ${projectName}`, 'success');
    } catch (error) {
      console.error('Failed to switch project:', error);
      showNotification('Failed to switch project', 'error');
    }
  } else if (AppState.isTracking) {
    // Fallback: just show notification, backend will pick up on next poll
    showNotification(`Switched to ${projectName}`, 'success');
  }
}

/**
 * Initialize project switcher event handlers
 */
function initProjectSwitcher() {
  // Click on project badge to toggle switcher
  if (Elements.currentProjectBadge) {
    Elements.currentProjectBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleProjectSwitcher();
    });
  }

  // Event delegation for project selection
  if (Elements.projectSwitcherList) {
    Elements.projectSwitcherList.addEventListener('click', (e) => {
      const item = e.target.closest('.project-switcher-item');
      if (item) {
        const project = item.dataset.project;
        if (project) {
          switchProject(project);
        }
      }
    });
  }

  // Close switcher when clicking outside
  document.addEventListener('click', (e) => {
    if (Elements.projectSwitcher?.classList.contains('active')) {
      if (!e.target.closest('.project-switcher') && !e.target.closest('#current-project-badge')) {
        closeProjectSwitcher();
      }
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && Elements.projectSwitcher?.classList.contains('active')) {
      closeProjectSwitcher();
    }
  });
}

// ============= Break Handling =============

/**
 * Mark a break - creates a break entry
 */
async function markBreak() {
  const DEFAULT_BREAK_MINUTES = 15;

  try {
    if (!window.lightTrackAPI) {
      showNotification('API not available', 'error');
      return;
    }

    // Prompt for break duration
    const input = prompt('Break duration in minutes:', DEFAULT_BREAK_MINUTES.toString());
    if (input === null) return; // Cancelled

    const minutes = parseInt(input, 10);
    if (isNaN(minutes) || minutes <= 0) {
      showNotification('Invalid duration', 'error');
      return;
    }

    const now = new Date();
    const startTime = new Date(now.getTime() - minutes * 60 * 1000);

    await window.lightTrackAPI.addManualEntry({
      project: 'Break',
      app: 'Break',
      title: 'Break',
      startTime: startTime.toISOString(),
      endTime: now.toISOString(),
      duration: minutes * 60,
      billable: false,
      isManual: true
    });

    showNotification(`Break logged: ${minutes} min`, 'success');
    loadActivities();
    updateGoals(); // Update break counter

    // Reset break reminder timer when break is taken
    resetBreakReminderTimer();

  } catch (error) {
    console.error('Failed to mark break:', error);
    showNotification('Failed to log break', 'error');
  }
}

// ============= Break Reminder =============

// Break reminder state
let breakReminderTimer = null;
let lastBreakTime = Date.now();

/**
 * Initialize or reinitialize break reminder based on settings
 */
function initBreakReminder() {
  // Clear existing timer
  if (breakReminderTimer) {
    clearInterval(breakReminderTimer);
    breakReminderTimer = null;
  }

  // Only set up if enabled
  if (!AppState.settings?.breakReminderEnabled) {
    return;
  }

  const intervalMs = (AppState.settings.breakReminderInterval || 60) * 60 * 1000; // Convert to ms

  // Check every minute if reminder should fire
  breakReminderTimer = setInterval(() => {
    // Only remind if tracking is active
    if (!AppState.isTracking) {
      lastBreakTime = Date.now(); // Reset when not tracking
      return;
    }

    const timeSinceBreak = Date.now() - lastBreakTime;

    if (timeSinceBreak >= intervalMs) {
      showBreakReminder();
      lastBreakTime = Date.now(); // Reset after reminder
    }
  }, 60000); // Check every minute

  console.log(`Break reminder initialized: every ${AppState.settings.breakReminderInterval} minutes`);
}

/**
 * Show break reminder notification
 */
function showBreakReminder() {
  const interval = AppState.settings.breakReminderInterval || 60;

  // Show in-app notification
  showNotification(`Time for a break! You've been working for ${interval} minutes.`, 'warning', 10000);

  // Try to show system notification if available
  if (window.Notification && Notification.permission === 'granted') {
    new Notification('Time for a Break!', {
      body: `You've been working for ${interval} minutes. Take a short break to stay focused.`,
      icon: 'assets/icon.png',
      tag: 'break-reminder'
    });
  } else if (window.Notification && Notification.permission !== 'denied') {
    // Request permission for future notifications
    Notification.requestPermission();
  }
}

/**
 * Reset break reminder timer (called when break is taken)
 */
function resetBreakReminderTimer() {
  lastBreakTime = Date.now();
}

// ============= View Loaders =============

/**
 * Navigate timeline by days
 */
function navigateTimeline(days) {
  const current = parseLocalDateString(AppState.timelineDate);
  current.setDate(current.getDate() + days);
  AppState.timelineDate = getLocalDateString(current);
  loadTimelineView();
}

/**
 * Load Timeline view - shows all activities for selected date
 */
async function loadTimelineView() {
  // Use cached elements
  const { timelineDate: timelineDateEl, timelineSummary, timelineList,
          timelineTracked, timelineGaps, timelineBillable,
          timelineProjects, timelineBar, timelineBarLabel,
          timelineProjectFilter, timelineBillableFilter, timelineGroupToggle } = Elements;

  // Show loading state
  if (timelineList) timelineList.classList.add('view-loading');

  // Clear selection when loading/reloading timeline
  AppState.selectedActivities = [];
  if (Elements.timelineSelectAll) Elements.timelineSelectAll.checked = false;
  if (Elements.timelineMergeSelected) {
    Elements.timelineMergeSelected.disabled = true;
    Elements.timelineMergeSelected.textContent = 'Merge';
  }

  try {
    // Fetch activities for the timeline date and store in AppState for edit/delete
    let activities = [];
    if (window.lightTrackAPI) {
      activities = await window.lightTrackAPI.getActivities(AppState.timelineDate) || [];
      AppState.activities = activities; // Store for edit/delete modal access
    }

  // Populate project filter dropdown
  if (timelineProjectFilter) {
    const projectsInDay = [...new Set(activities.map(a => a.project || 'General'))].sort();
    let currentValue = AppState.timelineFilters.project;
    if (currentValue && !projectsInDay.includes(currentValue)) {
      currentValue = '';
      AppState.timelineFilters.project = '';
    }
    timelineProjectFilter.innerHTML = '<option value="">All Projects</option>' +
      projectsInDay.map(p => `<option value="${escapeHtml(p)}"${p === currentValue ? ' selected' : ''}>${escapeHtml(p)}</option>`).join('');
  }

  // Sync filter UI state
  if (timelineBillableFilter) {
    timelineBillableFilter.checked = AppState.timelineFilters.billableOnly;
  }
  if (timelineGroupToggle) {
    timelineGroupToggle.checked = AppState.timelineFilters.groupByProject;
  }

  // Apply filters
  let filteredActivities = activities;
  if (AppState.timelineFilters.project) {
    filteredActivities = filteredActivities.filter(a => (a.project || 'General') === AppState.timelineFilters.project);
  }
  if (AppState.timelineFilters.billableOnly) {
    filteredActivities = filteredActivities.filter(a => a.billable !== false);
  }

  // Check if viewing today
  const today = getLocalDateString(new Date());
  const isToday = AppState.timelineDate === today;

  // Update date display
  if (timelineDateEl) {
    const date = parseLocalDateString(AppState.timelineDate);
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = getLocalDateString(yesterdayDate);

    let dateText;
    if (isToday) {
      dateText = 'Today';
    } else if (AppState.timelineDate === yesterday) {
      dateText = 'Yesterday';
    } else {
      dateText = date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    }
    timelineDateEl.textContent = dateText;
  }

  // Calculate stats (use filtered activities for display)
  const totalTracked = filteredActivities.reduce((sum, a) => sum + (a.duration || 0), 0);
  const billableTime = filteredActivities.filter(a => a.billable !== false).reduce((sum, a) => sum + (a.duration || 0), 0);
  const uniqueProjects = new Set(filteredActivities.map(a => a.project || 'General')).size;

  // Calculate real gaps between activities during work hours (use all activities for gaps)
  const gapSeconds = calculateRealGaps(activities, AppState.timelineDate);

  // Update stats
  if (timelineTracked) timelineTracked.textContent = formatDuration(totalTracked);
  if (timelineGaps) timelineGaps.textContent = formatDuration(gapSeconds);
  if (timelineBillable) {
    const pct = totalTracked > 0 ? Math.round((billableTime / totalTracked) * 100) : 0;
    timelineBillable.textContent = `${pct}%`;
  }
  if (timelineProjects) timelineProjects.textContent = uniqueProjects;

  // Update summary (show filtered count vs total)
  if (timelineSummary) {
    const filterInfo = filteredActivities.length !== activities.length ? ` (${activities.length} total)` : '';
    timelineSummary.textContent = `${filteredActivities.length} entries, ${formatDuration(totalTracked)}${filterInfo}`;
  }

  // Update timeline bar label with work day hours
  if (timelineBarLabel) {
    const startHour = AppState.settings.workDayStart.replace(':00', '').replace(':30', ':30');
    const endHour = AppState.settings.workDayEnd.replace(':00', '').replace(':30', ':30');
    timelineBarLabel.textContent = `Day overview (${startHour} - ${endHour})`;
  }

  // Render timeline bar with time markers and now indicator
  if (timelineBar) {
    renderTimelineBar(timelineBar, activities, AppState.timelineDate, isToday);
  }

  // Render activity list
  if (timelineList) {
    if (filteredActivities.length === 0) {
      const emptyMessage = activities.length === 0 ? 'No activities for this date' : 'No activities match filters';
      timelineList.innerHTML = `
        <div class="empty-state">
          <div class="icon">📋</div>
          <div>${emptyMessage}</div>
        </div>
      `;
      return;
    }

    const sorted = [...filteredActivities].sort((a, b) =>
      new Date(a.startTime || 0) - new Date(b.startTime || 0)
    );

    // Check if grouping is enabled
    if (AppState.timelineFilters.groupByProject) {
      timelineList.innerHTML = renderGroupedActivities(sorted);
    } else {
      timelineList.innerHTML = sorted.map(activity => renderActivityItem(activity)).join('');
    }

    // Attach event listeners to timeline activity buttons
    attachTimelineListeners(timelineList);
  }
  } finally {
    // Remove loading state
    if (timelineList) timelineList.classList.remove('view-loading');
  }
}

/**
 * Render a single activity item
 */
function renderActivityItem(activity) {
    const appName = activity.app || 'Unknown';
    const windowTitle = activity.title || '';
    const project = activity.project || 'General';
    const duration = formatDuration(activity.duration || 0);
    const activityType = activity.activityType || activity.activity || '';
    const tickets = activity.tickets || [];

    // Safe date parsing with validation
    let startTime = '--';
    let endTime = '--';
    if (activity.startTime) {
      const startDate = new Date(activity.startTime);
      if (!isNaN(startDate.getTime())) {
        startTime = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    }
    if (activity.endTime) {
      const endDate = new Date(activity.endTime);
      if (!isNaN(endDate.getTime())) {
        endTime = endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    }

    const billableClass = activity.billable !== false ? 'billable' : '';
    const activityId = escapeHtml(String(activity.id));

    // Render activity tags
    const tagsHtml = renderActivityTags(activity);

    // Render JIRA tickets if present
    const ticketsHtml = tickets.length > 0
      ? `<div class="activity-tickets">${tickets.map(t => `<span class="ticket-badge">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';

    // Render activity type if present
    const activityTypeHtml = activityType
      ? `<span class="activity-type-badge">${escapeHtml(activityType)}</span>`
      : '';

    // Show window title if different from app name and meaningful
    const showTitle = windowTitle && windowTitle !== appName && windowTitle.length > 0 && windowTitle.length < 100;
    const titleHtml = showTitle
      ? `<div class="activity-window-title">${escapeHtml(windowTitle.substring(0, 80))}${windowTitle.length > 80 ? '...' : ''}</div>`
      : '';

    const isSelected = AppState.selectedActivities?.includes(activity.id) ? 'selected' : '';
    const isChecked = isSelected ? 'checked' : '';

    return `
      <div class="activity ${billableClass} ${isSelected}" data-id="${activityId}">
        <div class="activity-select">
          <input type="checkbox" class="activity-checkbox" data-id="${activityId}" ${isChecked}>
        </div>
        <div class="activity-info">
          <div class="title">${escapeHtml(appName)} ${activityTypeHtml}</div>
          ${titleHtml}
          <div class="meta-line">
            <span>${escapeHtml(project)}</span>
            <span>• ${startTime} - ${endTime}</span>
          </div>
          ${ticketsHtml}
          ${tagsHtml}
        </div>
        <div class="activity-actions">
          <button class="btn-edit" data-id="${activityId}">Edit</button>
          <button class="btn-tags btn-small" data-id="${activityId}">Tags</button>
          <button class="btn-delete delete" data-id="${activityId}">Delete</button>
        </div>
        <div class="duration">${duration}</div>
      </div>
    `;
}

/**
 * Render activities grouped by project
 */
function renderGroupedActivities(activities) {
  // Group by project
  const groups = {};
  activities.forEach(activity => {
    const project = activity.project || 'General';
    if (!groups[project]) {
      groups[project] = [];
    }
    groups[project].push(activity);
  });

  // Sort projects by total duration
  const sortedProjects = Object.keys(groups).sort((a, b) => {
    const durationA = groups[a].reduce((sum, act) => sum + (act.duration || 0), 0);
    const durationB = groups[b].reduce((sum, act) => sum + (act.duration || 0), 0);
    return durationB - durationA;
  });

  return sortedProjects.map(project => {
    const projectActivities = groups[project];
    const totalDuration = projectActivities.reduce((sum, a) => sum + (a.duration || 0), 0);
    const count = projectActivities.length;

    return `
      <div class="project-group" data-project="${escapeHtml(project)}">
        <div class="project-group-header" onclick="this.nextElementSibling.classList.toggle('collapsed')">
          <span class="project-group-name">${escapeHtml(project)}</span>
          <span class="project-group-stats">${count} ${count === 1 ? 'entry' : 'entries'} • ${formatDuration(totalDuration)}</span>
        </div>
        <div class="project-group-content">
          ${projectActivities.map(activity => renderActivityItem(activity)).join('')}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Set up event delegation for timeline list (call once on init)
 */
function setupTimelineEventDelegation() {
  const container = Elements.timelineList;
  if (!container || container.dataset.delegated) return;
  container.dataset.delegated = 'true';

  container.addEventListener('click', (e) => {
    const target = e.target;

    // Handle checkbox clicks
    if (target.classList.contains('activity-checkbox')) {
      const id = target.dataset.id;
      if (id) toggleActivitySelection(id);
      return;
    }

    const btn = target.closest('button[data-id]');
    if (!btn) return;

    e.stopPropagation();
    const id = btn.dataset.id;
    if (!id) return;

    if (btn.classList.contains('btn-edit')) {
      openEditModal(id);
    } else if (btn.classList.contains('btn-tags')) {
      openTagEditor(id);
    } else if (btn.classList.contains('btn-delete')) {
      openDeleteModal(id);
    }
  });
}

/**
 * Attach event listeners to timeline activity buttons (deprecated - use event delegation)
 * Kept for backwards compatibility but now a no-op
 */
function attachTimelineListeners(container) {
  // Event delegation is now used instead - see setupTimelineEventDelegation()
}

// ============= Activity Selection for Bulk Operations =============

/**
 * Toggle selection of a single activity
 */
function toggleActivitySelection(id) {
  const index = AppState.selectedActivities.indexOf(id);
  if (index === -1) {
    AppState.selectedActivities.push(id);
  } else {
    AppState.selectedActivities.splice(index, 1);
  }
  updateSelectionUI();
}

/**
 * Select or deselect all visible activities
 */
function toggleSelectAllActivities(selectAll) {
  if (selectAll) {
    // Select all visible activities
    const checkboxes = document.querySelectorAll('.activity-checkbox');
    AppState.selectedActivities = Array.from(checkboxes).map(cb => cb.dataset.id);
  } else {
    AppState.selectedActivities = [];
  }
  updateSelectionUI();
}

/**
 * Update the UI to reflect current selection state
 */
function updateSelectionUI() {
  const selectedCount = AppState.selectedActivities.length;

  // Update merge button state
  if (Elements.timelineMergeSelected) {
    Elements.timelineMergeSelected.disabled = selectedCount < 2;
    Elements.timelineMergeSelected.textContent = selectedCount > 0 ? `Merge (${selectedCount})` : 'Merge';
  }

  // Update select all checkbox
  const allCheckboxes = document.querySelectorAll('.activity-checkbox');
  if (Elements.timelineSelectAll && allCheckboxes.length > 0) {
    Elements.timelineSelectAll.checked = selectedCount === allCheckboxes.length;
    Elements.timelineSelectAll.indeterminate = selectedCount > 0 && selectedCount < allCheckboxes.length;
  }

  // Update activity visual state
  document.querySelectorAll('.activity[data-id]').forEach(el => {
    const id = el.dataset.id;
    const checkbox = el.querySelector('.activity-checkbox');
    if (AppState.selectedActivities.includes(id)) {
      el.classList.add('selected');
      if (checkbox) checkbox.checked = true;
    } else {
      el.classList.remove('selected');
      if (checkbox) checkbox.checked = false;
    }
  });
}

/**
 * Merge selected activities into one
 */
async function mergeSelectedActivities() {
  const selectedIds = AppState.selectedActivities;
  if (selectedIds.length < 2) {
    showNotification(ERRORS.MERGE_TOO_FEW, 'warning');
    return;
  }

  // Get the selected activities from AppState.activities
  const selectedActivities = AppState.activities.filter(a => selectedIds.includes(String(a.id)));

  if (selectedActivities.length < 2) {
    showNotification(ERRORS.MERGE_NOT_FOUND, 'error');
    return;
  }

  // Check if all activities have the same project
  const projects = [...new Set(selectedActivities.map(a => a.project || 'General'))];
  if (projects.length > 1) {
    showNotification('Can only merge activities with the same project', 'warning');
    return;
  }

  // Sort by start time
  selectedActivities.sort((a, b) => new Date(a.startTime || 0) - new Date(b.startTime || 0));

  // Create merged activity
  const earliest = selectedActivities[0];
  const latest = selectedActivities[selectedActivities.length - 1];
  const totalDuration = selectedActivities.reduce((sum, a) => sum + (a.duration || 0), 0);

  // Collect unique tags and tickets
  const allTags = [...new Set(selectedActivities.flatMap(a => a.tags || []))];
  const allTickets = [...new Set(selectedActivities.flatMap(a => a.tickets || []))];

  const mergedActivity = {
    app: earliest.app,
    title: earliest.title,
    project: earliest.project || 'General',
    startTime: earliest.startTime,
    endTime: latest.endTime,
    duration: totalDuration,
    billable: earliest.billable,
    activityType: earliest.activityType,
    tags: allTags,
    tickets: allTickets
  };

  let savedMerged = null;

  try {
    // Step 1: Save merged activity first
    savedMerged = await window.lightTrackAPI.saveActivity(mergedActivity);

    // Step 2: Delete all original activities atomically
    try {
      await Promise.all(
        selectedActivities.map(a => window.lightTrackAPI.deleteActivity(a.id))
      );
    } catch (deleteError) {
      // Rollback: delete the merged activity we just created
      console.error('Delete failed, rolling back merge:', deleteError);
      if (savedMerged?.id) {
        try {
          await window.lightTrackAPI.deleteActivity(savedMerged.id);
        } catch (rollbackError) {
          console.error('Rollback failed:', rollbackError);
        }
      }
      throw new Error(ERRORS.MERGE_ROLLBACK);
    }

    // Clear selection and reload
    AppState.selectedActivities = [];
    if (Elements.timelineSelectAll) Elements.timelineSelectAll.checked = false;
    showNotification(`Merged ${selectedActivities.length} activities`, 'success');
    loadTimelineView();
  } catch (error) {
    console.error('Failed to merge activities:', error);
    showNotification(ERRORS.MERGE_FAILED + ': ' + error.message, 'error');
  }
}

/**
 * Set up keyboard shortcuts for Timer view
 * Space: Toggle tracking, M: Mark break, A: Add manual, F: Floating timer
 */
function setupTimerKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Skip if user is typing in an input/textarea/select
    if (e.target.matches('input, textarea, select, [contenteditable]')) return;

    // Skip if any modal is open
    const hasOpenModal = document.querySelector('.modal.active, .modal-overlay.active');
    if (hasOpenModal) return;

    // Skip if not in timer view (except for global shortcuts)
    const isTimerView = AppState.currentView === 'timer';

    // Timer view specific shortcuts (no modifier keys)
    if (isTimerView && !e.ctrlKey && !e.metaKey && !e.altKey) {
      switch (e.key.toLowerCase()) {
        case ' ': // Space - toggle tracking
          e.preventDefault();
          toggleTracking();
          return;

        case 'm': // M - mark break
          e.preventDefault();
          if (AppState.isTracking) {
            markBreak();
          } else {
            showNotification('Start tracking first to mark a break', 'warning');
          }
          return;

        case 'a': // A - add manual entry
          e.preventDefault();
          openManualEntryModal();
          return;

        case 'f': // F - toggle floating timer
          e.preventDefault();
          if (Elements.floatingTimer) {
            Elements.floatingTimer.classList.toggle('active');
            const isActive = Elements.floatingTimer.classList.contains('active');
            showNotification(isActive ? 'Floating timer shown' : 'Floating timer hidden', 'info');
          }
          return;
      }
    }
  });

  console.log('Timer keyboard shortcuts initialized: Space=toggle, M=break, A=add, F=float');
}

/**
 * Get work day start time in minutes from midnight
 */
function getWorkDayStartMinutes() {
  const [hours, minutes] = AppState.settings.workDayStart.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

/**
 * Get work day end time in minutes from midnight
 */
function getWorkDayEndMinutes() {
  const [hours, minutes] = AppState.settings.workDayEnd.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

/**
 * Get work day duration in seconds
 */
function getWorkDayDurationSeconds() {
  const startMin = getWorkDayStartMinutes();
  const endMin = getWorkDayEndMinutes();
  return (endMin - startMin) * 60;
}

/**
 * Calculate real gaps between activities during work hours
 * Returns total gap time in seconds
 */
function calculateRealGaps(activities, dateStr) {
  const dayStartMin = getWorkDayStartMinutes();
  const dayEndMin = getWorkDayEndMinutes();

  if (dayEndMin <= dayStartMin) return 0;

  const baseDate = dateStr ? parseLocalDateString(dateStr) : new Date();
  const dayStartDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  const dayEndDate = new Date(dayStartDate);
  dayEndDate.setDate(dayEndDate.getDate() + 1);

  // Filter activities with valid times and sort by start time
  const validActivities = activities
    .filter(a => a.startTime && a.endTime)
    .map(a => {
      const start = new Date(a.startTime);
      const end = new Date(a.endTime);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
      const effectiveStart = new Date(Math.max(start.getTime(), dayStartDate.getTime()));
      const effectiveEnd = new Date(Math.min(end.getTime(), dayEndDate.getTime()));
      if (effectiveEnd <= effectiveStart) return null;
      return {
        startMin: Math.floor((effectiveStart.getTime() - dayStartDate.getTime()) / 60000),
        endMin: Math.floor((effectiveEnd.getTime() - dayStartDate.getTime()) / 60000)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.startMin - b.startMin);

  if (validActivities.length === 0) {
    // No activities = entire work day is a gap
    return (dayEndMin - dayStartMin) * 60;
  }

  // Merge overlapping activities and calculate covered time
  const merged = [];
  for (const activity of validActivities) {
    // Clamp to work hours
    const clampedStart = Math.max(dayStartMin, Math.min(dayEndMin, activity.startMin));
    const clampedEnd = Math.max(dayStartMin, Math.min(dayEndMin, activity.endMin));

    if (clampedStart >= clampedEnd) continue;

    if (merged.length === 0) {
      merged.push({ startMin: clampedStart, endMin: clampedEnd });
    } else {
      const last = merged[merged.length - 1];
      if (clampedStart <= last.endMin) {
        // Overlapping or adjacent - extend the last segment
        last.endMin = Math.max(last.endMin, clampedEnd);
      } else {
        merged.push({ startMin: clampedStart, endMin: clampedEnd });
      }
    }
  }

  // Calculate gaps between merged segments and at start/end of day
  let gapMinutes = 0;

  // Gap at start of day
  if (merged.length > 0 && merged[0].startMin > dayStartMin) {
    gapMinutes += merged[0].startMin - dayStartMin;
  }

  // Gaps between activities
  for (let i = 1; i < merged.length; i++) {
    const gap = merged[i].startMin - merged[i - 1].endMin;
    if (gap > 0) {
      gapMinutes += gap;
    }
  }

  // Gap at end of day
  if (merged.length > 0 && merged[merged.length - 1].endMin < dayEndMin) {
    gapMinutes += dayEndMin - merged[merged.length - 1].endMin;
  }

  return gapMinutes * 60; // Convert to seconds
}

/**
 * Render visual timeline bar with time markers and now indicator
 */
function renderTimelineBar(container, activities, dateStr, isToday = false) {
  // Work day from settings
  const dayStart = getWorkDayStartMinutes();
  const dayEnd = getWorkDayEndMinutes();
  const dayDuration = dayEnd - dayStart;

  if (dayDuration <= 0) {
    container.innerHTML = '<div class="timeline-bar-empty">Invalid work day settings</div>';
    return;
  }

  const baseDate = dateStr ? parseLocalDateString(dateStr) : new Date();
  const dayStartDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  const dayEndDate = new Date(dayStartDate);
  dayEndDate.setDate(dayEndDate.getDate() + 1);

  // Generate time markers (every hour on the hour)
  const markers = [];
  const startHour = Math.ceil(dayStart / 60);
  const endHour = Math.floor(dayEnd / 60);
  for (let hour = startHour; hour <= endHour; hour++) {
    const hourMin = hour * 60;
    if (hourMin >= dayStart && hourMin <= dayEnd) {
      const leftPct = ((hourMin - dayStart) / dayDuration) * 100;
      const label = hour <= 12 ? `${hour === 0 ? 12 : hour}${hour < 12 ? 'a' : 'p'}` : `${hour - 12}p`;
      markers.push({ left: leftPct, label, isStart: hourMin === dayStart, isEnd: hourMin === dayEnd });
    }
  }

  // Generate "now" indicator if viewing today
  let nowIndicator = '';
  if (isToday) {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin >= dayStart && nowMin <= dayEnd) {
      const nowLeft = ((nowMin - dayStart) / dayDuration) * 100;
      nowIndicator = `<div class="timeline-now-indicator" style="left: ${nowLeft}%;" title="Now"></div>`;
    }
  }

  // Generate marker HTML
  const markersHtml = markers.map(m =>
    `<div class="timeline-marker${m.isStart ? ' start' : ''}${m.isEnd ? ' end' : ''}" style="left: ${m.left}%;">
      <span class="timeline-marker-label">${m.label}</span>
    </div>`
  ).join('');

  if (activities.length === 0) {
    container.innerHTML = `<div class="timeline-bar-content"><div class="timeline-bar-empty">No activities</div>${markersHtml}${nowIndicator}</div>`;
    return;
  }

  const segments = activities
    .filter(a => a.startTime && a.endTime)
    .map(activity => {
      const start = new Date(activity.startTime);
      const end = new Date(activity.endTime);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

      const effectiveStart = new Date(Math.max(start.getTime(), dayStartDate.getTime()));
      const effectiveEnd = new Date(Math.min(end.getTime(), dayEndDate.getTime()));
      if (effectiveEnd <= effectiveStart) return null;

      const startMin = Math.floor((effectiveStart.getTime() - dayStartDate.getTime()) / 60000);
      const endMin = Math.floor((effectiveEnd.getTime() - dayStartDate.getTime()) / 60000);

      // Clamp to work day
      const clampedStart = Math.max(dayStart, Math.min(dayEnd, startMin));
      const clampedEnd = Math.max(dayStart, Math.min(dayEnd, endMin));

      if (clampedStart >= clampedEnd) return null;

      const left = ((clampedStart - dayStart) / dayDuration) * 100;
      const width = ((clampedEnd - clampedStart) / dayDuration) * 100;
      const type = (activity.project || '').toLowerCase() === 'break' ? 'break' :
                   activity.billable !== false ? 'billable' : 'non-billable';

      // Format times for tooltip
      const startTimeStr = effectiveStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const endTimeStr = effectiveEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const durationSec = activity.duration || Math.round((effectiveEnd - effectiveStart) / 1000);
      const durationStr = formatDuration(durationSec);

      // Build tooltip content
      const project = activity.project || 'General';
      const app = activity.app || 'Unknown';
      const tickets = activity.tickets || [];
      const ticketStr = tickets.length > 0 ? `\n${tickets.join(', ')}` : '';
      const tooltip = `${project}\n${app}\n${startTimeStr} - ${endTimeStr} (${durationStr})${ticketStr}`;

      return { left, width, type, tooltip, project, id: activity.id };
    })
    .filter(Boolean);

  if (segments.length === 0) {
    container.innerHTML = `<div class="timeline-bar-content"><div class="timeline-bar-empty">No activities in work hours</div>${markersHtml}${nowIndicator}</div>`;
    return;
  }

  // Sort segments by left position for overlap detection
  segments.sort((a, b) => a.left - b.left);

  // Detect overlaps and assign rows (stacking)
  const rows = [];
  segments.forEach(seg => {
    let assignedRow = -1;
    for (let r = 0; r < rows.length; r++) {
      const rowEnd = rows[r];
      if (seg.left >= rowEnd) {
        assignedRow = r;
        rows[r] = seg.left + seg.width;
        break;
      }
    }
    if (assignedRow === -1) {
      assignedRow = rows.length;
      rows.push(seg.left + seg.width);
    }
    seg.row = assignedRow;
  });

  const totalRows = rows.length;
  const heightPercent = totalRows > 1 ? (100 / totalRows) : 100;

  const segmentsHtml = segments.map(seg => {
    const escapedTooltip = seg.tooltip.replace(/"/g, '&quot;').replace(/\n/g, ' | ');
    const topPercent = totalRows > 1 ? (seg.row * heightPercent) : 0;
    const heightStyle = totalRows > 1 ? `height: ${heightPercent}%; top: ${topPercent}%;` : '';
    const dataId = seg.id ? `data-id="${escapeHtml(String(seg.id))}"` : '';
    return `<div class="timeline-bar-segment ${seg.type}" style="left: ${seg.left}%; width: ${seg.width}%; ${heightStyle}" data-tooltip="${escapedTooltip}" data-project="${(seg.project || '').replace(/"/g, '&quot;')}" ${dataId}></div>`;
  }).join('');

  container.innerHTML = `<div class="timeline-bar-content">${segmentsHtml}${markersHtml}${nowIndicator}</div>`;

  // Add click handlers for segments
  container.querySelectorAll('.timeline-bar-segment[data-id]').forEach(seg => {
    seg.addEventListener('click', () => {
      const id = seg.dataset.id;
      if (id) openEditModal(id);
    });
  });
}

// Constants for analytics
const FOCUS_SESSION_THRESHOLD = 1500; // 25 minutes in seconds
const ANALYTICS_CHART_MAX_DAYS = 14;  // Max days to show in bar chart
const ANALYTICS_MAX_PROJECTS = 10;    // Max projects in breakdown list
const ANALYTICS_MAX_PIE_SLICES = 8;   // Max slices in pie chart
const ANALYTICS_MAX_INSIGHTS = 4;     // Max insights to display
const TREND_THRESHOLD_PERCENT = 5;    // Min % change to show trend indicator

/**
 * Get activities with caching to avoid redundant API calls
 * @param {boolean} forceRefresh - Force a fresh fetch from storage
 * @returns {Promise<Array>} - Activities array
 */
async function getCachedActivities(forceRefresh = false) {
  const cache = AppState.analyticsCache;
  const now = Date.now();

  // Return cached data if valid and not forcing refresh
  if (!forceRefresh && cache.activities && cache.timestamp && (now - cache.timestamp) < cache.maxAge) {
    return cache.activities;
  }

  // Fetch fresh data
  const activities = await window.lightTrackAPI?.getActivities() || [];

  // Update cache
  cache.activities = activities;
  cache.timestamp = now;

  return activities;
}

/**
 * Invalidate the analytics cache (call after activity changes)
 */
function invalidateAnalyticsCache() {
  AppState.analyticsCache.activities = null;
  AppState.analyticsCache.timestamp = null;
}

/**
 * Calculate date range bounds for analytics
 */
function getAnalyticsDateRange(range, weekStartDay = 1, customRange = null) {
  const now = new Date();
  let rangeStart = new Date(now);
  let rangeEnd = null; // End of current period
  let prevRangeStart = new Date(now);
  let prevRangeEnd = new Date(now);

  switch (range) {
    case 'week': {
      // Use configurable week start (0=Sun, 1=Mon, etc.)
      const currentDay = now.getDay();
      const daysFromStart = (currentDay - weekStartDay + 7) % 7;
      rangeStart.setDate(now.getDate() - daysFromStart);
      // Previous week
      prevRangeEnd = new Date(rangeStart);
      prevRangeEnd.setDate(prevRangeEnd.getDate() - 1);
      prevRangeStart = new Date(prevRangeEnd);
      prevRangeStart.setDate(prevRangeStart.getDate() - 6);
      break;
    }
    case 'month':
      rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
      prevRangeEnd = new Date(rangeStart);
      prevRangeEnd.setDate(prevRangeEnd.getDate() - 1);
      prevRangeStart = new Date(prevRangeEnd.getFullYear(), prevRangeEnd.getMonth(), 1);
      break;
    case 'year':
      rangeStart = new Date(now.getFullYear(), 0, 1);
      prevRangeEnd = new Date(rangeStart);
      prevRangeEnd.setDate(prevRangeEnd.getDate() - 1);
      prevRangeStart = new Date(now.getFullYear() - 1, 0, 1);
      break;
    case 'all':
      rangeStart = new Date(0);
      prevRangeStart = new Date(0);
      prevRangeEnd = new Date(0);
      break;
    case 'custom':
      if (customRange?.from && customRange?.to) {
        rangeStart = parseLocalDateString(customRange.from);
        rangeEnd = parseLocalDateString(customRange.to);
        // Calculate previous period with same duration
        const durationMs = rangeEnd.getTime() - rangeStart.getTime();
        prevRangeEnd = new Date(rangeStart.getTime() - 1);
        prevRangeStart = new Date(prevRangeEnd.getTime() - durationMs);
      } else {
        // Default to this week if custom range not set
        const currentDay = now.getDay();
        const daysFromStart = (currentDay - weekStartDay + 7) % 7;
        rangeStart.setDate(now.getDate() - daysFromStart);
        prevRangeEnd = new Date(rangeStart);
        prevRangeEnd.setDate(prevRangeEnd.getDate() - 1);
        prevRangeStart = new Date(prevRangeEnd);
        prevRangeStart.setDate(prevRangeStart.getDate() - 6);
      }
      break;
  }

  rangeStart.setHours(0, 0, 0, 0);
  prevRangeStart.setHours(0, 0, 0, 0);
  prevRangeEnd.setHours(23, 59, 59, 999);
  if (range === 'custom' && rangeEnd) {
    rangeEnd.setHours(23, 59, 59, 999);
  } else if (range !== 'all') {
    rangeEnd = new Date(now);
    rangeEnd.setHours(23, 59, 59, 999);
  }

  return { rangeStart, rangeEnd, prevRangeStart, prevRangeEnd };
}

function getActivityDate(activity) {
  if (!activity) return null;
  const raw = activity.startTime || activity.timestamp || activity.date;
  if (!raw) return null;
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return parseLocalDateString(raw);
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Calculate analytics stats from activities
 */
function calculateAnalyticsStats(activities) {
  const totalSeconds = activities.reduce((sum, a) => sum + (a.duration || 0), 0);
  const billableSeconds = activities.filter(a => a.billable !== false).reduce((sum, a) => sum + (a.duration || 0), 0);
  const nonBillableSeconds = totalSeconds - billableSeconds;

  const daysWithData = new Set(activities.map(a => {
    const date = getActivityDate(a);
    return date ? date.toDateString() : null;
  }).filter(Boolean)).size;

  const focusActivities = activities.filter(a => (a.duration || 0) >= FOCUS_SESSION_THRESHOLD);
  const focusSeconds = focusActivities.reduce((sum, a) => sum + (a.duration || 0), 0);

  const projectTimes = {};
  activities.forEach(a => {
    const project = a.project || 'General';
    projectTimes[project] = (projectTimes[project] || 0) + (a.duration || 0);
  });
  const sortedProjects = Object.entries(projectTimes).sort((a, b) => b[1] - a[1]);

  return { totalSeconds, billableSeconds, nonBillableSeconds, daysWithData, focusSeconds, sortedProjects };
}

/**
 * Generate trend indicator HTML
 */
function getTrendIndicator(current, previous) {
  if (previous === 0) return '';
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < TREND_THRESHOLD_PERCENT) return ''; // No significant change

  const isUp = change > 0;
  const arrow = isUp ? '↑' : '↓';
  const colorClass = isUp ? 'trend-up' : 'trend-down';
  return `<span class="trend-indicator ${colorClass}">${arrow}${Math.abs(Math.round(change))}%</span>`;
}

/**
 * Render hourly activity heatmap
 * Shows activity distribution across hours for weekdays vs weekends
 */
function renderHourlyHeatmap(activities) {
  const weekdayCells = document.getElementById('heatmap-weekday-cells');
  const weekendCells = document.getElementById('heatmap-weekend-cells');
  if (!weekdayCells || !weekendCells) return;

  // Initialize hourly buckets (6am to 11pm = hours 6-23)
  const HEATMAP_START_HOUR = 6;
  const HEATMAP_END_HOUR = 23;
  const hourCount = HEATMAP_END_HOUR - HEATMAP_START_HOUR + 1;

  const weekdayHours = new Array(hourCount).fill(0);
  const weekendHours = new Array(hourCount).fill(0);

  // Aggregate activity time by hour
  activities.forEach(activity => {
    if (!activity.startTime || !activity.duration) return;

    const start = new Date(activity.startTime);
    const dayOfWeek = start.getDay(); // 0 = Sunday, 6 = Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const targetArray = isWeekend ? weekendHours : weekdayHours;

    // Distribute duration across hours the activity spans
    let remaining = activity.duration;
    let currentTime = new Date(start);

    while (remaining > 0) {
      const hour = currentTime.getHours();
      if (hour >= HEATMAP_START_HOUR && hour <= HEATMAP_END_HOUR) {
        const idx = hour - HEATMAP_START_HOUR;
        // Time until end of this hour
        const endOfHour = new Date(currentTime);
        endOfHour.setMinutes(59, 59, 999);
        const timeInHour = Math.min(remaining, Math.ceil((endOfHour - currentTime) / 1000));
        targetArray[idx] += timeInHour;
        remaining -= timeInHour;
      } else {
        // Outside heatmap range, skip this hour
        remaining -= Math.min(remaining, 3600);
      }
      currentTime.setHours(currentTime.getHours() + 1, 0, 0, 0);
    }
  });

  // Find max for normalization
  const maxWeekday = Math.max(...weekdayHours, 1);
  const maxWeekend = Math.max(...weekendHours, 1);
  const overallMax = Math.max(maxWeekday, maxWeekend);

  // Render cells
  const renderCells = (container, data) => {
    container.innerHTML = data.map((seconds, idx) => {
      const hour = HEATMAP_START_HOUR + idx;
      const intensity = overallMax > 0 ? Math.min(5, Math.ceil((seconds / overallMax) * 5)) : 0;
      const hours = (seconds / 3600).toFixed(1);
      const hourLabel = hour <= 12 ? `${hour}${hour < 12 ? 'am' : 'pm'}` : `${hour - 12}pm`;
      return `<div class="heatmap-cell" data-intensity="${intensity}" data-tooltip="${hourLabel}: ${hours}h"></div>`;
    }).join('');
  };

  renderCells(weekdayCells, weekdayHours);
  renderCells(weekendCells, weekendHours);
}

/**
 * Update daily goals progress display
 * Shows progress toward deep work target and focus sessions
 */
function updateGoalsProgress(allActivities) {
  const deepWorkValue = document.getElementById('goal-deepwork-value');
  const deepWorkFill = document.getElementById('goal-deepwork-fill');
  const focusValue = document.getElementById('goal-focus-value');
  const focusFill = document.getElementById('goal-focus-fill');

  if (!deepWorkValue || !deepWorkFill || !focusValue || !focusFill) return;

  // Get today's activities
  const today = getLocalDateString(new Date());
  const todayActivities = allActivities.filter(a => {
    if (!a.startTime) return false;
    return getLocalDateString(new Date(a.startTime)) === today;
  });

  // Calculate today's total time (deep work)
  const totalSeconds = todayActivities.reduce((sum, a) => sum + (a.duration || 0), 0);
  const totalHours = totalSeconds / 3600;
  const deepWorkTarget = AppState.settings.deepWorkTarget || 4;
  const deepWorkPercent = Math.min(100, Math.round((totalHours / deepWorkTarget) * 100));

  // Calculate focus sessions (activities 25+ minutes)
  const focusSessions = todayActivities.filter(a => (a.duration || 0) >= FOCUS_SESSION_THRESHOLD).length;
  const focusTarget = AppState.settings.breaksTarget || 4; // Using breaksTarget as focus sessions target
  const focusPercent = Math.min(100, Math.round((focusSessions / focusTarget) * 100));

  // Update UI
  deepWorkValue.textContent = `${totalHours.toFixed(1)}h / ${deepWorkTarget}h`;
  deepWorkFill.style.width = `${deepWorkPercent}%`;
  if (deepWorkPercent >= 100) {
    deepWorkFill.classList.add('complete');
  } else {
    deepWorkFill.classList.remove('complete');
  }

  focusValue.textContent = `${focusSessions} / ${focusTarget}`;
  focusFill.style.width = `${focusPercent}%`;
  if (focusPercent >= 100) {
    focusFill.classList.add('complete');
  } else {
    focusFill.classList.remove('complete');
  }
}

/**
 * Update period comparison display
 */
function updateComparisonSection(currentStats, prevStats, range) {
  const comparisonSection = document.getElementById('comparison-section');
  if (!comparisonSection || comparisonSection.style.display === 'none') return;

  // Labels based on range
  const labels = {
    week: ['This Week', 'Last Week'],
    month: ['This Month', 'Last Month'],
    year: ['This Year', 'Last Year'],
    all: ['All Time', 'N/A'],
    custom: ['Selected Period', 'Previous Period']
  };
  const [currentLabel, prevLabel] = labels[range] || labels.week;

  // Update labels
  const currentLabelEl = document.getElementById('comparison-current-label');
  const prevLabelEl = document.getElementById('comparison-prev-label');
  if (currentLabelEl) currentLabelEl.textContent = currentLabel;
  if (prevLabelEl) prevLabelEl.textContent = prevLabel;

  // Update current period values
  document.getElementById('comparison-current-total').textContent = formatDuration(currentStats.totalSeconds);
  document.getElementById('comparison-current-billable').textContent = formatDuration(currentStats.billableSeconds);
  document.getElementById('comparison-current-focus').textContent = formatDuration(currentStats.focusSeconds);
  document.getElementById('comparison-current-projects').textContent = currentStats.sortedProjects.length;

  // Update previous period values
  document.getElementById('comparison-prev-total').textContent = formatDuration(prevStats.totalSeconds);
  document.getElementById('comparison-prev-billable').textContent = formatDuration(prevStats.billableSeconds);
  document.getElementById('comparison-prev-focus').textContent = formatDuration(prevStats.focusSeconds);
  document.getElementById('comparison-prev-projects').textContent = prevStats.sortedProjects.length;

  // Calculate and update changes
  const formatChange = (current, previous) => {
    if (previous === 0) return current > 0 ? '+100%' : '--';
    const change = ((current - previous) / previous) * 100;
    const prefix = change >= 0 ? '+' : '';
    return `${prefix}${Math.round(change)}%`;
  };

  const setChangeClass = (element, current, previous) => {
    element.classList.remove('positive', 'negative');
    if (current > previous) element.classList.add('positive');
    else if (current < previous) element.classList.add('negative');
  };

  const totalChange = document.getElementById('comparison-change-total');
  const billableChange = document.getElementById('comparison-change-billable');
  const focusChange = document.getElementById('comparison-change-focus');
  const projectsChange = document.getElementById('comparison-change-projects');

  totalChange.textContent = formatChange(currentStats.totalSeconds, prevStats.totalSeconds);
  setChangeClass(totalChange, currentStats.totalSeconds, prevStats.totalSeconds);

  billableChange.textContent = formatChange(currentStats.billableSeconds, prevStats.billableSeconds);
  setChangeClass(billableChange, currentStats.billableSeconds, prevStats.billableSeconds);

  focusChange.textContent = formatChange(currentStats.focusSeconds, prevStats.focusSeconds);
  setChangeClass(focusChange, currentStats.focusSeconds, prevStats.focusSeconds);

  projectsChange.textContent = formatChange(currentStats.sortedProjects.length, prevStats.sortedProjects.length);
  // For projects, fewer might be better (more focus), so no color class
}

/**
 * Load Analytics view - with date range, charts, and insights
 */
async function loadAnalyticsView() {
  try {
    if (!window.lightTrackAPI) return;

    // Use cached elements
    const { analyticsWeekTotal, analyticsWeekDays, analyticsAvgDay,
            analyticsTopProject, analyticsTopTime, analyticsFocusTime,
            analyticsFocusPercent, analyticsBillableTime, analyticsBillableFill,
            analyticsBillablePercent, analyticsNonbillable, dailyChart,
            projectPieChart, analyticsProjectBreakdown, analyticsInsights } = Elements;

    // Show loading state
    if (analyticsWeekTotal) analyticsWeekTotal.innerHTML = '<span class="loading-text">...</span>';
    if (analyticsProjectBreakdown) analyticsProjectBreakdown.innerHTML = '<div class="loading-text">Loading...</div>';

    // Wire up date range buttons (only once)
    const rangeBtns = document.querySelectorAll('.date-range-selector .range-btn');
    const { customRangePicker, analyticsDateFrom: dateFromInput,
            analyticsDateTo: dateToInput, applyCustomRange: applyCustomBtn } = Elements;

    rangeBtns.forEach(btn => {
      if (!btn.dataset.wired) {
        btn.dataset.wired = 'true';
        btn.addEventListener('click', () => {
          rangeBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          AppState.analyticsRange = btn.dataset.range;

          // Show/hide custom range picker
          if (customRangePicker) {
            if (btn.dataset.range === 'custom') {
              customRangePicker.style.display = 'block';
              // Set default dates if not already set
              if (!dateFromInput.value) {
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                dateFromInput.value = getLocalDateString(weekAgo);
              }
              if (!dateToInput.value) {
                dateToInput.value = getLocalDateString(new Date());
              }
            } else {
              customRangePicker.style.display = 'none';
              loadAnalyticsView();
            }
          } else if (btn.dataset.range !== 'custom') {
            loadAnalyticsView();
          }
        });
      }
    });

    // Wire up custom range apply button
    if (applyCustomBtn && !applyCustomBtn.dataset.wired) {
      applyCustomBtn.dataset.wired = 'true';
      applyCustomBtn.addEventListener('click', () => {
        if (dateFromInput?.value && dateToInput?.value) {
          // Validate date range
          const fromDate = parseLocalDateString(dateFromInput.value);
          const toDate = parseLocalDateString(dateToInput.value);
          if (fromDate > toDate) {
            showNotification('Start date must be before end date', 'error');
            return;
          }
          AppState.customDateRange = {
            from: dateFromInput.value,
            to: dateToInput.value
          };
          loadAnalyticsView();
        }
      });
    }

    // Show/hide custom picker based on current range
    if (customRangePicker) {
      customRangePicker.style.display = AppState.analyticsRange === 'custom' ? 'block' : 'none';
    }

    // Wire up analytics filter pills
    const filterPills = document.querySelectorAll('.analytics-filter-row .pill');
    filterPills.forEach(pill => {
      if (!pill.dataset.wired) {
        pill.dataset.wired = 'true';
        pill.addEventListener('click', () => {
          filterPills.forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          AppState.analyticsFilter = pill.dataset.analyticsFilter || 'all';
          loadAnalyticsView();
        });
      }
    });
    filterPills.forEach(p => p.classList.toggle('active', (p.dataset.analyticsFilter || 'all') === AppState.analyticsFilter));

    // Wire up export button (only once)
    const exportCsvBtn = document.getElementById('export-analytics-csv');
    if (exportCsvBtn && !exportCsvBtn.dataset.wired) {
      exportCsvBtn.dataset.wired = 'true';
      exportCsvBtn.addEventListener('click', exportAnalyticsToCSV);
    }

    // Wire up comparison toggle (only once)
    const toggleComparisonBtn = document.getElementById('toggle-comparison');
    const comparisonSection = document.getElementById('comparison-section');
    if (toggleComparisonBtn && !toggleComparisonBtn.dataset.wired) {
      toggleComparisonBtn.dataset.wired = 'true';
      toggleComparisonBtn.addEventListener('click', () => {
        const isVisible = comparisonSection.style.display !== 'none';
        comparisonSection.style.display = isVisible ? 'none' : 'block';
        toggleComparisonBtn.classList.toggle('active', !isVisible);
        if (!isVisible) {
          // Comparison will be updated by loadAnalyticsView
          loadAnalyticsView();
        }
      });
    }

    // Wire up keyboard navigation (only once)
    if (!document.body.dataset.analyticsKeyboardWired) {
      document.body.dataset.analyticsKeyboardWired = 'true';
      const rangeOrder = ['week', 'month', 'year', 'all', 'custom'];
      document.addEventListener('keydown', (e) => {
        // Only handle when analytics view is active and no input focused
        const analyticsView = document.querySelector('.view[data-view="analytics"]');
        if (!analyticsView || !analyticsView.classList.contains('active')) return;
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          const currentIdx = rangeOrder.indexOf(AppState.analyticsRange);
          let newIdx;
          if (e.key === 'ArrowLeft') {
            newIdx = currentIdx > 0 ? currentIdx - 1 : rangeOrder.length - 1;
          } else {
            newIdx = currentIdx < rangeOrder.length - 1 ? currentIdx + 1 : 0;
          }
          const newRange = rangeOrder[newIdx];
          AppState.analyticsRange = newRange;

          // Update UI
          const rangeBtns = document.querySelectorAll('.date-range-selector .range-btn');
          rangeBtns.forEach(b => b.classList.toggle('active', b.dataset.range === newRange));

          // Show/hide custom picker
          const customPicker = Elements.customRangePicker;
          if (customPicker) {
            customPicker.style.display = newRange === 'custom' ? 'block' : 'none';
          }

          if (newRange !== 'custom') {
            loadAnalyticsView();
          }
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          // Navigate filter pills
          e.preventDefault();
          const filterOrder = ['all', 'billable', 'non-billable', 'meetings'];
          const currentIdx = filterOrder.indexOf(AppState.analyticsFilter);
          let newIdx;
          if (e.key === 'ArrowUp') {
            newIdx = currentIdx > 0 ? currentIdx - 1 : filterOrder.length - 1;
          } else {
            newIdx = currentIdx < filterOrder.length - 1 ? currentIdx + 1 : 0;
          }
          AppState.analyticsFilter = filterOrder[newIdx];

          // Update UI
          const filterPills = document.querySelectorAll('.analytics-filter-row .pill');
          filterPills.forEach(p => p.classList.toggle('active', (p.dataset.analyticsFilter || 'all') === AppState.analyticsFilter));
          loadAnalyticsView();
        } else if (e.key === 'e' && !e.ctrlKey && !e.metaKey) {
          // 'E' to export
          exportAnalyticsToCSV();
        }
      });
    }

    // Get all activities (using cache for filter/range changes)
    const allActivities = await getCachedActivities();

    // Calculate date ranges (current and previous for comparison)
    const weekStartDay = AppState.settings.weekStartDay ?? 1; // Default Monday
    const customRange = AppState.analyticsRange === 'custom' ? AppState.customDateRange : null;
    const { rangeStart, rangeEnd, prevRangeStart, prevRangeEnd } = getAnalyticsDateRange(
      AppState.analyticsRange, weekStartDay, customRange
    );

    // Filter activities to current and previous ranges
    const rangeActivities = allActivities.filter(a => {
      const date = getActivityDate(a);
      if (!date) return false;
      if (rangeEnd) {
        return date >= rangeStart && date <= rangeEnd;
      }
      return date >= rangeStart;
    });

    const prevRangeActivities = AppState.analyticsRange !== 'all' ? allActivities.filter(a => {
      const date = getActivityDate(a);
      if (!date) return false;
      return date >= prevRangeStart && date <= prevRangeEnd;
    }) : [];

    // Apply analytics filters
    const filter = AppState.analyticsFilter;
    const applyFilter = (activities) => activities.filter(a => {
      if (filter === 'billable') return a.billable !== false;
      if (filter === 'non-billable') return a.billable === false;
      if (filter === 'meetings') {
        const tags = a.tags || [];
        const app = (a.app || '').toLowerCase();
        return tags.includes('meeting') || /teams|zoom|meet|skype|webex/.test(app);
      }
      return true;
    });

    const filteredActivities = applyFilter(rangeActivities);
    const prevFilteredActivities = applyFilter(prevRangeActivities);

    // Calculate stats for current and previous periods
    const stats = calculateAnalyticsStats(filteredActivities);
    const prevStats = calculateAnalyticsStats(prevFilteredActivities);

    // Update comparison section (if visible)
    updateComparisonSection(stats, prevStats, AppState.analyticsRange);

    // Daily breakdown for chart
    const dailyTimes = {};
    filteredActivities.forEach(a => {
      const date = getActivityDate(a);
      if (!date) return;
      const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const dateKey = getLocalDateString(date);
      dailyTimes[dateKey] = {
        label: dateStr,
        seconds: (dailyTimes[dateKey]?.seconds || 0) + (a.duration || 0)
      };
    });

    // Sort days and prepare chart data
    const sortedDays = Object.entries(dailyTimes)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-ANALYTICS_CHART_MAX_DAYS);

    const chartLabels = sortedDays.map(([_, d]) => d.label.split(',')[0]);
    const chartValues = sortedDays.map(([_, d]) => d.seconds / 3600);

    // Update KPI cards with trend indicators
    const totalTrend = getTrendIndicator(stats.totalSeconds, prevStats.totalSeconds);
    const focusTrend = getTrendIndicator(stats.focusSeconds, prevStats.focusSeconds);

    if (analyticsWeekTotal) {
      analyticsWeekTotal.innerHTML = `${formatDuration(stats.totalSeconds)} ${totalTrend}`;
    }
    if (analyticsWeekDays) {
      analyticsWeekDays.textContent = `${stats.daysWithData} days tracked`;
    }
    if (analyticsAvgDay) {
      analyticsAvgDay.textContent = stats.daysWithData > 0
        ? formatDuration(Math.round(stats.totalSeconds / stats.daysWithData))
        : '0h 0m';
    }
    if (analyticsTopProject) {
      analyticsTopProject.textContent = stats.sortedProjects[0] ? stats.sortedProjects[0][0] : '--';
    }
    if (analyticsTopTime) {
      analyticsTopTime.textContent = stats.sortedProjects[0] ? formatDuration(stats.sortedProjects[0][1]) : '0h';
    }
    if (analyticsFocusTime) {
      analyticsFocusTime.innerHTML = `${formatDuration(stats.focusSeconds)} ${focusTrend}`;
    }
    if (analyticsFocusPercent) {
      const focusPercent = stats.totalSeconds > 0 ? Math.round((stats.focusSeconds / stats.totalSeconds) * 100) : 0;
      analyticsFocusPercent.textContent = `${focusPercent}% of total time`;
    }

    // Update billable breakdown
    const billableTrend = getTrendIndicator(stats.billableSeconds, prevStats.billableSeconds);
    const billablePercent = stats.totalSeconds > 0 ? Math.round((stats.billableSeconds / stats.totalSeconds) * 100) : 0;

    if (analyticsBillableTime) {
      analyticsBillableTime.innerHTML = `${formatDuration(stats.billableSeconds)} ${billableTrend}`;
    }
    if (analyticsBillableFill) {
      analyticsBillableFill.style.width = `${billablePercent}%`;
    }
    if (analyticsBillablePercent) {
      analyticsBillablePercent.textContent = `${billablePercent}% billable`;
    }
    if (analyticsNonbillable) {
      analyticsNonbillable.textContent = `${formatDuration(stats.nonBillableSeconds)} non-billable`;
    }

    // Render daily activity chart with click handler
    if (dailyChart) {
      const dateKeys = sortedDays.map(([key]) => key);
      ChartRenderer.renderBarChart(dailyChart, chartLabels, chartValues, {
        dateKeys,
        onBarClick: (label, index, dateKey) => {
          if (dateKey) {
            // Navigate to timeline for that date
            AppState.timelineDate = dateKey;
            switchView('timeline');
          }
        }
      });
    }

    // Render pie chart with click handler
    if (projectPieChart) {
      const pieLabels = stats.sortedProjects.slice(0, ANALYTICS_MAX_PIE_SLICES).map(([name]) => name);
      const pieValues = stats.sortedProjects.slice(0, ANALYTICS_MAX_PIE_SLICES).map(([_, secs]) => secs);
      ChartRenderer.renderPieChart(projectPieChart, pieLabels, pieValues, {
        onSliceClick: (projectName, index) => {
          // Set project filter in timeline
          AppState.filters.project = projectName;
          if (Elements.timelineProjectFilter) {
            Elements.timelineProjectFilter.value = projectName;
          }
          switchView('timeline');
        }
      });
    }

    // Update project breakdown bars using cached element
    if (analyticsProjectBreakdown) {
      if (stats.sortedProjects.length === 0) {
        analyticsProjectBreakdown.innerHTML = `
          <div class="empty-state-enhanced">
            <div class="empty-icon">📊</div>
            <div class="empty-title">No project data yet</div>
            <div class="empty-description">Start tracking to see your project breakdown.</div>
            <button class="btn btn-sm primary empty-cta" onclick="switchView('timer')">Go to Timer</button>
          </div>
        `;
      } else {
        const maxTime = stats.sortedProjects[0][1] || 1;
        analyticsProjectBreakdown.innerHTML = stats.sortedProjects.slice(0, ANALYTICS_MAX_PROJECTS).map(([project, seconds], idx) => {
          const percent = Math.round((seconds / maxTime) * 100);
          const colorIdx = idx % 8;
          // Round to nearest 5% for CSS class
          const widthClass = `bar-fill-${Math.round(percent / 5) * 5}`;
          return `
            <div class="bar-row" data-project="${escapeHtml(project)}">
              <span class="badge chart-color-${colorIdx}">${escapeHtml(project)}</span>
              <div class="bar"><span class="${widthClass} chart-color-${colorIdx}"></span></div>
              <div class="duration">${formatDuration(seconds)}</div>
            </div>
          `;
        }).join('');
      }
    }

    // Render hourly heatmap
    renderHourlyHeatmap(filteredActivities);

    // Update goals progress (based on today's data)
    updateGoalsProgress(allActivities);

    // Generate insights using cached element (use filteredActivities to match displayed data)
    if (analyticsInsights) {
      const insights = generateAnalyticsInsights(
        filteredActivities,
        stats.totalSeconds,
        stats.focusSeconds,
        stats.daysWithData,
        stats.sortedProjects,
        stats.billableSeconds
      );
      if (insights.length === 0) {
        analyticsInsights.innerHTML = `
          <div class="empty-state-enhanced">
            <div class="empty-icon">💡</div>
            <div class="empty-title">Insights will appear here</div>
            <div class="empty-description">Track at least 1 hour of work to generate personalized insights about your productivity patterns.</div>
            <div class="empty-tips">
              <span class="tip-item">Try longer focus sessions for better insights</span>
            </div>
          </div>
        `;
      } else {
        analyticsInsights.innerHTML = insights.map(insight => `
          <div class="insight-item ${insight.type}">
            <span class="insight-icon">${insight.icon}</span>
            <div class="insight-content">
              <div class="insight-title">${escapeHtml(insight.title)}</div>
              <div class="insight-description">${escapeHtml(insight.description)}</div>
            </div>
          </div>
        `).join('');
      }
    }

  } catch (error) {
    console.error('Failed to load analytics:', error);
    showNotification('Failed to load analytics', 'error');
  }
}

/**
 * Generate insights based on activity data
 */
function generateAnalyticsInsights(activities, totalSeconds, focusSeconds, daysWithData, sortedProjects, billableSeconds = 0) {
  const insights = [];

  if (activities.length === 0) return insights;

  // Billable time insight
  if (totalSeconds > 3600 && billableSeconds !== undefined) {
    const billablePercent = totalSeconds > 0 ? (billableSeconds / totalSeconds) * 100 : 0;
    if (billablePercent >= 80) {
      insights.push({
        type: 'positive',
        icon: '💰',
        title: 'High Billable Ratio',
        description: `${Math.round(billablePercent)}% of your time is billable. Great productivity!`
      });
    } else if (billablePercent < 50 && billablePercent > 0) {
      insights.push({
        type: 'tip',
        icon: '📊',
        title: 'Billable Time Review',
        description: `Only ${Math.round(billablePercent)}% billable. Check if activities are categorized correctly.`
      });
    }
  }

  // Meeting time insight
  const meetingActivities = activities.filter(a => {
    const tags = a.tags || [];
    const app = (a.app || '').toLowerCase();
    return tags.includes('meeting') || /teams|zoom|meet|skype|webex|outlook.*meeting/i.test(app);
  });
  const meetingSeconds = meetingActivities.reduce((sum, a) => sum + (a.duration || 0), 0);
  const meetingPercent = totalSeconds > 0 ? (meetingSeconds / totalSeconds) * 100 : 0;
  const meetingHours = meetingSeconds / 3600;

  if (meetingPercent >= 40 && totalSeconds > 7200) {
    insights.push({
      type: 'warning',
      icon: '📅',
      title: 'Meeting Heavy',
      description: `${Math.round(meetingPercent)}% of time in meetings (${meetingHours.toFixed(1)}h). Consider blocking focus time.`
    });
  } else if (meetingPercent >= 20 && meetingPercent < 40 && totalSeconds > 7200) {
    insights.push({
      type: 'tip',
      icon: '🗓️',
      title: 'Meeting Balance',
      description: `${Math.round(meetingPercent)}% of time in meetings. Good balance with focus work.`
    });
  } else if (meetingPercent < 10 && meetingSeconds > 0 && daysWithData >= 3) {
    insights.push({
      type: 'positive',
      icon: '🎉',
      title: 'Low Meeting Load',
      description: `Only ${Math.round(meetingPercent)}% in meetings. More time for deep work!`
    });
  }

  // Focus time insight
  const focusPercent = totalSeconds > 0 ? (focusSeconds / totalSeconds) * 100 : 0;
  if (focusPercent >= 60) {
    insights.push({
      type: 'positive',
      icon: '🎯',
      title: 'Excellent Focus',
      description: `${Math.round(focusPercent)}% of your time is in focused sessions (25+ min). Great deep work!`
    });
  } else if (focusPercent < 30 && totalSeconds > 3600) {
    insights.push({
      type: 'tip',
      icon: '💡',
      title: 'Increase Focus Sessions',
      description: 'Try working in longer uninterrupted blocks. Consider the Pomodoro technique.'
    });
  }

  // Daily average insight
  const avgHoursPerDay = daysWithData > 0 ? (totalSeconds / daysWithData) / 3600 : 0;
  if (avgHoursPerDay >= 6) {
    insights.push({
      type: 'warning',
      icon: '⚠️',
      title: 'High Workload',
      description: `You're averaging ${avgHoursPerDay.toFixed(1)} hours per day. Remember to take breaks!`
    });
  } else if (avgHoursPerDay >= 4 && avgHoursPerDay < 6) {
    insights.push({
      type: 'positive',
      icon: '✅',
      title: 'Healthy Work Pattern',
      description: `Averaging ${avgHoursPerDay.toFixed(1)} hours per day is a sustainable pace.`
    });
  }

  // Project diversity insight
  if (sortedProjects.length === 1 && totalSeconds > 7200) {
    insights.push({
      type: 'tip',
      icon: '📁',
      title: 'Single Project Focus',
      description: `All time spent on "${sortedProjects[0][0]}". Consider categorizing by task type.`
    });
  } else if (sortedProjects.length > 5) {
    insights.push({
      type: 'tip',
      icon: '🔄',
      title: 'Many Projects',
      description: `Tracking ${sortedProjects.length} projects. Context switching may impact productivity.`
    });
  }

  // Top project insight
  if (sortedProjects.length > 0 && totalSeconds > 0) {
    const topPercent = (sortedProjects[0][1] / totalSeconds) * 100;
    if (topPercent >= 50) {
      insights.push({
        type: 'positive',
        icon: '🏆',
        title: 'Main Focus',
        description: `"${sortedProjects[0][0]}" takes ${Math.round(topPercent)}% of your time.`
      });
    }
  }

  return insights.slice(0, ANALYTICS_MAX_INSIGHTS);
}

/**
 * Export analytics data to CSV
 */
async function exportAnalyticsToCSV() {
  try {
    if (!window.lightTrackAPI) return;

    const allActivities = await window.lightTrackAPI.getActivities() || [];
    const weekStartDay = AppState.settings.weekStartDay ?? 1;
    const customRange = AppState.analyticsRange === 'custom' ? AppState.customDateRange : null;
    const { rangeStart, rangeEnd } = getAnalyticsDateRange(AppState.analyticsRange, weekStartDay, customRange);

    // Filter activities to selected range
    const rangeActivities = allActivities.filter(a => {
      const date = getActivityDate(a);
      if (!date) return false;
      if (rangeEnd) {
        return date >= rangeStart && date <= rangeEnd;
      }
      return date >= rangeStart;
    });

    // Apply current filter
    const filter = AppState.analyticsFilter;
    const filteredActivities = rangeActivities.filter(a => {
      if (filter === 'billable') return a.billable !== false;
      if (filter === 'non-billable') return a.billable === false;
      if (filter === 'meetings') {
        const tags = a.tags || [];
        const app = (a.app || '').toLowerCase();
        return tags.includes('meeting') || /teams|zoom|meet|skype|webex/.test(app);
      }
      return true;
    });

    // Calculate stats for summary
    const stats = calculateAnalyticsStats(filteredActivities);

    // Build CSV content
    const lines = [];

    // Summary section
    lines.push('ANALYTICS SUMMARY');
    lines.push(`Date Range,${AppState.analyticsRange === 'custom' ? `${customRange?.from} to ${customRange?.to}` : AppState.analyticsRange}`);
    lines.push(`Filter,${AppState.analyticsFilter}`);
    lines.push(`Total Time,${formatDuration(stats.totalSeconds)}`);
    lines.push(`Days Tracked,${stats.daysWithData}`);
    lines.push(`Avg per Day,${stats.daysWithData > 0 ? formatDuration(Math.round(stats.totalSeconds / stats.daysWithData)) : '0h 0m'}`);
    lines.push(`Focus Time,${formatDuration(stats.focusSeconds)}`);
    lines.push(`Billable Time,${formatDuration(stats.billableSeconds)}`);
    lines.push(`Non-Billable Time,${formatDuration(stats.nonBillableSeconds)}`);
    lines.push('');

    // Project breakdown
    lines.push('PROJECT BREAKDOWN');
    lines.push('Project,Hours,Percentage');
    stats.sortedProjects.forEach(([project, seconds]) => {
      const hours = (seconds / 3600).toFixed(2);
      const percent = stats.totalSeconds > 0 ? Math.round((seconds / stats.totalSeconds) * 100) : 0;
      lines.push(`"${project}",${hours},${percent}%`);
    });
    lines.push('');

    // Daily breakdown
    lines.push('DAILY BREAKDOWN');
    lines.push('Date,Hours,Activities');
    const dailyData = {};
    filteredActivities.forEach(a => {
      const date = getActivityDate(a);
      if (!date) return;
      const dateKey = getLocalDateString(date);
      if (!dailyData[dateKey]) {
        dailyData[dateKey] = { seconds: 0, count: 0 };
      }
      dailyData[dateKey].seconds += (a.duration || 0);
      dailyData[dateKey].count += 1;
    });
    Object.entries(dailyData).sort((a, b) => a[0].localeCompare(b[0])).forEach(([date, data]) => {
      lines.push(`${date},${(data.seconds / 3600).toFixed(2)},${data.count}`);
    });
    lines.push('');

    // Detailed activities
    lines.push('DETAILED ACTIVITIES');
    lines.push('Date,Start Time,End Time,Project,App,Title,Duration (h),Billable');
    filteredActivities.sort((a, b) => new Date(a.startTime) - new Date(b.startTime)).forEach(a => {
      const startDate = a.startTime ? new Date(a.startTime) : null;
      const endDate = a.endTime ? new Date(a.endTime) : null;
      const date = startDate ? getLocalDateString(startDate) : '';
      const startTime = startDate ? startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
      const endTime = endDate ? endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
      const hours = ((a.duration || 0) / 3600).toFixed(2);
      const title = (a.title || '').replace(/"/g, '""');
      lines.push(`${date},${startTime},${endTime},"${a.project || 'General'}","${a.app || ''}","${title}",${hours},${a.billable !== false ? 'Yes' : 'No'}`);
    });

    const csvContent = lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const rangeLabel = AppState.analyticsRange === 'custom'
      ? `${customRange?.from}_to_${customRange?.to}`
      : AppState.analyticsRange;
    const filename = `lighttrack-analytics-${rangeLabel}-${getLocalDateString(new Date())}.csv`;

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showNotification('Analytics exported to CSV', 'success');
  } catch (error) {
    console.error('Failed to export analytics:', error);
    showNotification('Failed to export analytics', 'error');
  }
}

/**
 * Load Projects view - all projects with totals and mapping rules
 */
async function loadProjectsView() {
  const projectsList = document.getElementById('projects-list');
  if (projectsList) projectsList.classList.add('view-loading');

  try {
    if (!window.lightTrackAPI) return;

    // Load and display all mapping types (in parallel for better performance)
    await Promise.all([
      loadProjectMappings(),
      loadUrlMappings(),
      loadJiraMappings(),
      loadMeetingMappings()
    ]);

    // Wire up all mapping buttons (only once each)
    const buttonBindings = [
      { id: 'add-mapping-btn', handler: addProjectMapping },
      { id: 'add-url-mapping-btn', handler: addUrlMapping },
      { id: 'add-jira-mapping-btn', handler: addJiraMapping },
      { id: 'add-meeting-mapping-btn', handler: addMeetingMapping },
      { id: 'create-project-btn', handler: createNewProject },
      { id: 'update-mapping-btn', handler: updateProjectMapping },
      { id: 'update-url-mapping-btn', handler: updateUrlMapping },
      { id: 'update-jira-mapping-btn', handler: updateJiraMapping },
      { id: 'update-meeting-mapping-btn', handler: updateMeetingMapping },
      { id: 'cancel-mapping-btn', handler: cancelMappingEdit },
      { id: 'cancel-url-mapping-btn', handler: cancelUrlMappingEdit },
      { id: 'cancel-jira-mapping-btn', handler: cancelJiraMappingEdit },
      { id: 'cancel-meeting-mapping-btn', handler: cancelMeetingMappingEdit }
    ];

    buttonBindings.forEach(({ id, handler }) => {
      const btn = document.getElementById(id);
      if (btn && !btn.dataset.wired) {
        btn.dataset.wired = 'true';
        btn.addEventListener('click', handler);
      }
    });

    // Wire up test pattern buttons using event delegation
    const projectsView = document.querySelector('[data-view="projects"]');
    if (projectsView && !projectsView.dataset.testWired) {
      projectsView.dataset.testWired = 'true';
      projectsView.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-test-pattern')) {
          const inputId = e.target.dataset.patternInput;
          if (inputId) testMappingPattern(inputId);
        }
      });
    }

    // Load activities and aggregate by project
    const allActivities = await window.lightTrackAPI.getActivities() || [];

    const projectStats = {};
    allActivities.forEach(a => {
      const project = a.project || 'General';
      if (!projectStats[project]) {
        projectStats[project] = { duration: 0, count: 0, lastUsed: null };
      }
      projectStats[project].duration += (a.duration || 0);
      projectStats[project].count += 1;
      const activityDate = getActivityDate(a);
      if (activityDate && (!projectStats[project].lastUsed || activityDate > projectStats[project].lastUsed)) {
        projectStats[project].lastUsed = activityDate;
      }
    });

    const sorted = Object.entries(projectStats).sort((a, b) => b[1].duration - a[1].duration);

    const projectsList = document.getElementById('projects-list');
    if (projectsList) {
      if (sorted.length === 0) {
        projectsList.innerHTML = `
          <div class="empty-state">
            <div class="icon">📁</div>
            <div>No projects yet</div>
            <div class="meta-line">Projects appear as you track time</div>
          </div>
        `;
      } else {
        projectsList.innerHTML = sorted.map(([project, stats]) => {
          const lastUsed = stats.lastUsed ? stats.lastUsed.toLocaleDateString() : '--';
          return `
            <div class="activity">
              <div>
                <div class="title">${escapeHtml(project)}</div>
                <div class="meta-line">
                  <span>${stats.count} entries</span>
                  <span>• Last: ${lastUsed}</span>
                </div>
              </div>
              <div class="duration">${formatDuration(stats.duration)}</div>
            </div>
          `;
        }).join('');
      }
    }
  } catch (error) {
    console.error('Failed to load projects:', error);
    showNotification('Failed to load projects', 'error');
  } finally {
    if (projectsList) projectsList.classList.remove('view-loading');
  }
}

/**
 * Load and display project mappings
 */
async function loadProjectMappings() {
  const mappingsList = document.getElementById('mappings-list');
  if (!mappingsList || !window.lightTrackAPI?.getProjectMappings) return;

  try {
    const mappings = await window.lightTrackAPI.getProjectMappings() || {};
    const entries = Object.entries(mappings);

    if (entries.length === 0) {
      mappingsList.innerHTML = '<div class="meta-line">No rules yet. Add a rule to auto-assign apps to projects.</div>';
    } else {
      // cache mappings for edit
      AppState.mappingsCache = mappings;

      mappingsList.innerHTML = entries.map(([pattern, value]) => {
        // Support both old format (string) and new format (object with project/activity/sapCode)
        const project = typeof value === 'string' ? value : value.project;
        const activity = typeof value === 'object' ? value.activity : null;
        const sapCode = typeof value === 'object' ? value.sapCode : null;
        const costCenter = typeof value === 'object' ? value.costCenter : null;
        const wbsElement = typeof value === 'object' ? value.wbsElement : null;
        const activityHtml = activity ? `<span class="activity">[${escapeHtml(activity)}]</span>` : '';
        const sapBits = [
          sapCode ? `SAP: ${escapeHtml(sapCode)}` : null,
          costCenter ? `CC: ${escapeHtml(costCenter)}` : null,
          wbsElement ? `WBS: ${escapeHtml(wbsElement)}` : null
        ].filter(Boolean);
        const sapCodeHtml = sapBits.length > 0
          ? `<span class="sap-code" style="color: var(--neon); font-size: 11px;">(${sapBits.join(' · ')})</span>`
          : '';
        return `
        <div class="mapping-item" data-pattern="${escapeAttr(pattern)}">
          <div>
            <span class="pattern">${escapeHtml(pattern)}</span>
            <span class="arrow">→</span>
            <span class="project">${escapeHtml(project)}</span>
            ${activityHtml}
            ${sapCodeHtml}
          </div>
          <div class="mapping-actions">
            <button data-action="edit-mapping" data-pattern="${escapeAttr(pattern)}" title="Edit rule">✎</button>
            <button data-action="remove-mapping" data-pattern="${escapeAttr(pattern)}" title="Remove rule">✕</button>
          </div>
        </div>
      `}).join('');
    }
  } catch (error) {
    console.error('Failed to load project mappings:', error);
    mappingsList.innerHTML = '<div class="meta-line">Failed to load rules</div>';
  }
}

/**
 * Test a mapping pattern against sample text
 */
function testMappingPattern(inputId) {
  const input = document.getElementById(inputId);
  const pattern = input?.value?.trim();

  if (!pattern) {
    showNotification('Enter a pattern first', 'warning');
    return;
  }

  const sampleText = prompt('Enter sample text to test against:\n\n(e.g., app name, URL, or meeting subject)');
  if (sampleText === null) return; // User cancelled

  try {
    // Check if pattern is a regex (starts and ends with /)
    let matches = false;
    let matchDetails = '';

    if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
      // Regex pattern
      const lastSlash = pattern.lastIndexOf('/');
      const regexStr = pattern.substring(1, lastSlash);
      const flags = pattern.substring(lastSlash + 1);
      const regex = new RegExp(regexStr, flags);
      const match = sampleText.match(regex);
      matches = !!match;
      if (match && match.length > 1) {
        matchDetails = `\nCaptured: ${match.slice(1).join(', ')}`;
      }
    } else {
      // Simple string match (case-insensitive substring)
      matches = sampleText.toLowerCase().includes(pattern.toLowerCase());
    }

    if (matches) {
      showNotification(`✓ Pattern matches!${matchDetails}`, 'success');
    } else {
      showNotification('✗ Pattern does not match', 'error');
    }
  } catch (error) {
    showNotification(`Invalid pattern: ${error.message}`, 'error');
  }
}

/**
 * Find and display which mapping rule matched an activity
 * @param {Object} activity - The activity to check
 */
async function findAndDisplayMatchedRule(activity) {
  if (!Elements.matchedRuleInfo || !Elements.matchedRuleText) return;

  // Hide by default
  Elements.matchedRuleInfo.style.display = 'none';
  Elements.matchedRuleText.textContent = '';

  if (!window.lightTrackAPI) return;

  try {
    // Fetch all mapping types (with caching)
    const mappings = await getCachedMappings();
    const appMappings = mappings.app;
    const urlMappings = mappings.url;
    const jiraMappings = mappings.jira;
    const meetingMappings = mappings.meeting;

    const appName = activity.app || '';
    const title = activity.title || '';
    const url = activity.url || '';
    const activityProject = activity.project || '';

    // Helper to test if a pattern matches text (with ReDoS protection)
    const testPattern = (pattern, text) => {
      if (!pattern || !text) return false;
      try {
        if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
          const lastSlash = pattern.lastIndexOf('/');
          const regexStr = pattern.substring(1, lastSlash);
          const flags = pattern.substring(lastSlash + 1);

          // ReDoS protection: validate flags
          if (!CONSTANTS.VALID_REGEX_FLAGS.test(flags)) return false;

          // ReDoS protection: limit pattern length
          if (regexStr.length > CONSTANTS.MAX_REGEX_LENGTH) return false;

          const regex = new RegExp(regexStr, flags);
          // ReDoS protection: limit input length
          return regex.test(text.slice(0, CONSTANTS.MAX_TEST_INPUT_LENGTH));
        } else {
          // Plain text matching - also limit input length
          const limitedText = text.slice(0, CONSTANTS.MAX_TEST_INPUT_LENGTH);
          return limitedText.toLowerCase().includes(pattern.toLowerCase());
        }
      } catch {
        return false;
      }
    };

    // Helper to get project from mapping value
    const getProject = (value) => typeof value === 'string' ? value : value?.project;

    // Check app name mappings
    for (const [pattern, value] of Object.entries(appMappings)) {
      if (testPattern(pattern, appName) && getProject(value) === activityProject) {
        Elements.matchedRuleText.textContent = `App rule "${pattern}"`;
        Elements.matchedRuleInfo.style.display = 'block';
        return;
      }
    }

    // Check URL mappings
    for (const [pattern, value] of Object.entries(urlMappings)) {
      if (testPattern(pattern, url) && getProject(value) === activityProject) {
        Elements.matchedRuleText.textContent = `URL rule "${pattern}"`;
        Elements.matchedRuleInfo.style.display = 'block';
        return;
      }
    }

    // Check JIRA mappings (match project key in title)
    for (const [jiraKey, value] of Object.entries(jiraMappings)) {
      const jiraPattern = new RegExp(`\\b${jiraKey}-\\d+\\b`, 'i');
      if (jiraPattern.test(title) && getProject(value) === activityProject) {
        Elements.matchedRuleText.textContent = `JIRA rule "${jiraKey}"`;
        Elements.matchedRuleInfo.style.display = 'block';
        return;
      }
    }

    // Check meeting mappings
    for (const [pattern, value] of Object.entries(meetingMappings)) {
      if (testPattern(pattern, title) && getProject(value) === activityProject) {
        Elements.matchedRuleText.textContent = `Meeting rule "${pattern}"`;
        Elements.matchedRuleInfo.style.display = 'block';
        return;
      }
    }

    // No rule matched - activity may have been manually assigned
  } catch (error) {
    console.error('Error finding matched rule:', error);
  }
}

/**
 * Add a new project mapping rule
 */
async function addProjectMapping() {
  const patternInput = document.getElementById('mapping-pattern');
  const projectInput = document.getElementById('mapping-project');
  const activityInput = document.getElementById('mapping-activity');
  const sapCodeInput = document.getElementById('mapping-sap-code');
  const costCenterInput = document.getElementById('mapping-cost-center');
  const wbsInput = document.getElementById('mapping-wbs');

  const pattern = patternInput?.value?.trim();
  const project = projectInput?.value?.trim();
  const activity = activityInput?.value?.trim();
  const sapCode = sapCodeInput?.value?.trim();
  const costCenter = costCenterInput?.value?.trim();
  const wbsElement = wbsInput?.value?.trim();

  if (!pattern || !project) {
    showNotification('Please enter both pattern and project name', 'error');
    return;
  }

  try {
    // Build mapping value with optional fields
    let mappingValue = project;
    if (activity || sapCode || costCenter || wbsElement) {
      mappingValue = {
        project,
        ...(activity && { activity }),
        ...(sapCode && { sapCode }),
        ...(costCenter && { costCenter }),
        ...(wbsElement && { wbsElement })
      };
    }
    await window.lightTrackAPI.addProjectMapping(pattern, mappingValue);

    const extras = [];
    if (activity) extras.push(`[${activity}]`);
    if (sapCode) extras.push(`SAP: ${sapCode}`);
    if (costCenter) extras.push(`CC: ${costCenter}`);
    if (wbsElement) extras.push(`WBS: ${wbsElement}`);
    const extraText = extras.length > 0 ? ` ${extras.join(' ')}` : '';
    showNotification(`Rule added: "${pattern}" → "${project}"${extraText}`, 'success');

    // Clear inputs
    if (patternInput) patternInput.value = '';
    if (projectInput) projectInput.value = '';
    if (activityInput) activityInput.value = '';
    if (sapCodeInput) sapCodeInput.value = '';
    if (costCenterInput) costCenterInput.value = '';
    if (wbsInput) wbsInput.value = '';
    if (Elements.updateMappingBtn) {
      Elements.updateMappingBtn.disabled = true;
      delete Elements.updateMappingBtn.dataset.pattern;
    }

    // Reload mappings
    await loadProjectMappings();
  } catch (error) {
    showNotification('Failed to add rule', 'error');
  }
}

/**
 * Edit an existing project mapping (populate form for update)
 */
function editProjectMapping(pattern) {
  const mappings = AppState.mappingsCache || {};
  const value = mappings[pattern];
  if (!value) return;

  const project = typeof value === 'string' ? value : value.project;
  const activity = typeof value === 'object' ? value.activity : '';
  const sapCode = typeof value === 'object' ? value.sapCode : '';
  const costCenter = typeof value === 'object' ? value.costCenter : '';
  const wbsElement = typeof value === 'object' ? value.wbsElement : '';

  if (Elements.mappingPattern) {
    Elements.mappingPattern.value = pattern;
    Elements.mappingPattern.readOnly = true;
  }
  if (Elements.mappingProject) Elements.mappingProject.value = project || '';
  if (Elements.mappingActivity) Elements.mappingActivity.value = activity || '';
  if (Elements.mappingSapCode) Elements.mappingSapCode.value = sapCode || '';
  if (Elements.mappingCostCenter) Elements.mappingCostCenter.value = costCenter || '';
  if (Elements.mappingWbs) Elements.mappingWbs.value = wbsElement || '';

  if (Elements.updateMappingBtn) {
    Elements.updateMappingBtn.disabled = false;
    Elements.updateMappingBtn.dataset.pattern = pattern;
  }

  // Show cancel button and highlight editing item
  const cancelBtn = document.getElementById('cancel-mapping-btn');
  if (cancelBtn) cancelBtn.style.display = '';

  // Highlight the item being edited
  document.querySelectorAll('#mappings-list .mapping-item').forEach(el => el.classList.remove('editing'));
  const editingItem = document.querySelector(`#mappings-list .mapping-item[data-pattern="${CSS.escape(pattern)}"]`);
  if (editingItem) editingItem.classList.add('editing');
}

/**
 * Cancel editing a project mapping
 */
function cancelMappingEdit() {
  // Clear form
  if (Elements.mappingPattern) {
    Elements.mappingPattern.value = '';
    Elements.mappingPattern.readOnly = false;
  }
  if (Elements.mappingProject) Elements.mappingProject.value = '';
  if (Elements.mappingActivity) Elements.mappingActivity.value = '';
  if (Elements.mappingSapCode) Elements.mappingSapCode.value = '';
  if (Elements.mappingCostCenter) Elements.mappingCostCenter.value = '';
  if (Elements.mappingWbs) Elements.mappingWbs.value = '';

  // Reset buttons
  if (Elements.updateMappingBtn) {
    Elements.updateMappingBtn.disabled = true;
    delete Elements.updateMappingBtn.dataset.pattern;
  }
  const cancelBtn = document.getElementById('cancel-mapping-btn');
  if (cancelBtn) cancelBtn.style.display = 'none';

  // Remove highlight
  document.querySelectorAll('#mappings-list .mapping-item').forEach(el => el.classList.remove('editing'));
}

/**
 * Update an existing project mapping
 */
async function updateProjectMapping() {
  if (!Elements.updateMappingBtn?.dataset.pattern) return;
  const pattern = Elements.updateMappingBtn.dataset.pattern;
  const project = Elements.mappingProject?.value?.trim();
  const activity = Elements.mappingActivity?.value?.trim();
  const sapCode = Elements.mappingSapCode?.value?.trim();
  const costCenter = Elements.mappingCostCenter?.value?.trim();
  const wbsElement = Elements.mappingWbs?.value?.trim();

  if (!project) {
    showNotification('Project is required', 'error');
    return;
  }

  const mappingValue = {
    project,
    ...(activity && { activity }),
    ...(sapCode && { sapCode }),
    ...(costCenter && { costCenter }),
    ...(wbsElement && { wbsElement })
  };

  try {
    await window.lightTrackAPI.addProjectMapping(pattern, mappingValue);
    showNotification(`Updated rule "${pattern}"`, 'success');
    cancelMappingEdit(); // Reset form and UI state
    await loadProjectMappings();
  } catch (error) {
    showNotification('Failed to update rule', 'error');
  }
}

/**
 * Remove a project mapping rule
 */
async function removeProjectMapping(pattern) {
  if (!confirm(`Remove rule for "${pattern}"?`)) return;

  try {
    await window.lightTrackAPI.removeProjectMapping(pattern);
    showNotification('Rule removed', 'success');
    await loadProjectMappings();
  } catch (error) {
    showNotification('Failed to remove rule', 'error');
  }
}

/**
 * Create a new project - opens the new project modal
 */
function createNewProject() {
  openNewProjectModal();
}

/**
 * Open the new project modal
 */
function openNewProjectModal() {
  const overlay = document.getElementById('new-project-modal-overlay');
  if (overlay) {
    overlay.classList.add('active');
    addModalEscHandler('new-project-modal-overlay', closeNewProjectModal);
    // Focus on name input
    const nameInput = document.getElementById('new-project-name');
    if (nameInput) {
      nameInput.value = '';
      nameInput.focus();
    }
    // Clear other fields
    const sapCodeInput = document.getElementById('new-project-sap-code');
    const costCenterInput = document.getElementById('new-project-cost-center');
    const wbsInput = document.getElementById('new-project-wbs');
    if (sapCodeInput) sapCodeInput.value = '';
    if (costCenterInput) costCenterInput.value = '';
    if (wbsInput) wbsInput.value = '';
  }
}

/**
 * Close the new project modal
 */
function closeNewProjectModal() {
  removeModalEscHandler('new-project-modal-overlay');
  const overlay = document.getElementById('new-project-modal-overlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
}

/**
 * Save new project from modal
 */
async function saveNewProject() {
  const nameInput = document.getElementById('new-project-name');
  const sapCodeInput = document.getElementById('new-project-sap-code');
  const costCenterInput = document.getElementById('new-project-cost-center');
  const wbsInput = document.getElementById('new-project-wbs');

  const name = nameInput?.value?.trim();
  const sapCode = sapCodeInput?.value?.trim();
  const costCenter = costCenterInput?.value?.trim();
  const wbsElement = wbsInput?.value?.trim();

  if (!name) {
    showNotification('Project name is required', 'error');
    return;
  }

  try {
    // Add project via API
    if (window.lightTrackAPI?.addProject) {
      await window.lightTrackAPI.addProject({
        name,
        sapCode: sapCode || '',
        costCenter: costCenter || '',
        wbsElement: wbsElement || ''
      });
      showNotification(`Project "${name}" created`, 'success');
      closeNewProjectModal();
      // Reload projects view
      await loadProjectsView();
    } else {
      // Fallback: open manual entry modal with project pre-filled
      closeNewProjectModal();
      openManualEntryModal();
      const projectInput = document.getElementById('entry-project');
      if (projectInput) {
        projectInput.value = name;
      }
      showNotification(`Enter a time entry for "${name}" to create the project`, 'info');
    }
  } catch (error) {
    console.error('Failed to create project:', error);
    showNotification('Failed to create project', 'error');
  }
}

// ============= URL Mappings =============

/**
 * Load and display URL mappings
 */
async function loadUrlMappings() {
  const mappingsList = document.getElementById('url-mappings-list');
  if (!mappingsList || !window.lightTrackAPI?.getUrlMappings) return;

  try {
    const mappings = await window.lightTrackAPI.getUrlMappings() || {};
    const entries = Object.entries(mappings);

    if (entries.length === 0) {
      mappingsList.innerHTML = '<div class="meta-line">No URL rules yet. Add a rule to auto-assign URLs to projects.</div>';
    } else {
      // Cache mappings for edit
      AppState.urlMappingsCache = mappings;

      mappingsList.innerHTML = entries.map(([pattern, value]) => {
        const project = typeof value === 'string' ? value : value.project;
        const activity = typeof value === 'object' ? value.activity : null;
        const sapCode = typeof value === 'object' ? value.sapCode : null;
        const activityHtml = activity ? `<span class="activity">[${escapeHtml(activity)}]</span>` : '';
        const sapCodeHtml = sapCode ? `<span class="sap-code" style="color: var(--neon); font-size: 11px;">(SAP: ${escapeHtml(sapCode)})</span>` : '';
        return `
        <div class="mapping-item" data-pattern="${escapeAttr(pattern)}">
          <div>
            <span class="pattern">${escapeHtml(pattern)}</span>
            <span class="arrow">→</span>
            <span class="project">${escapeHtml(project)}</span>
            ${activityHtml}
            ${sapCodeHtml}
          </div>
          <div class="mapping-actions">
            <button data-action="edit-url-mapping" data-pattern="${escapeAttr(pattern)}" title="Edit rule">✎</button>
            <button data-action="remove-url-mapping" data-pattern="${escapeAttr(pattern)}" title="Remove rule">✕</button>
          </div>
        </div>
      `}).join('');
    }
  } catch (error) {
    console.error('Failed to load URL mappings:', error);
    mappingsList.innerHTML = '<div class="meta-line">Failed to load rules</div>';
  }
}

/**
 * Add a new URL mapping rule
 */
async function addUrlMapping() {
  const patternInput = document.getElementById('url-mapping-pattern');
  const projectInput = document.getElementById('url-mapping-project');
  const activityInput = document.getElementById('url-mapping-activity');
  const sapCodeInput = document.getElementById('url-mapping-sap-code');
  const costCenterInput = document.getElementById('url-mapping-cost-center');
  const wbsInput = document.getElementById('url-mapping-wbs');

  const pattern = patternInput?.value?.trim();
  const project = projectInput?.value?.trim();
  const activity = activityInput?.value?.trim();
  const sapCode = sapCodeInput?.value?.trim();
  const costCenter = costCenterInput?.value?.trim();
  const wbsElement = wbsInput?.value?.trim();

  if (!pattern || !project) {
    showNotification('Please enter both URL pattern and project name', 'error');
    return;
  }

  try {
    let mappingValue = project;
    if (activity || sapCode || costCenter || wbsElement) {
      mappingValue = {
        project,
        ...(activity && { activity }),
        ...(sapCode && { sapCode }),
        ...(costCenter && { costCenter }),
        ...(wbsElement && { wbsElement })
      };
    }
    await window.lightTrackAPI.addUrlMapping(pattern, mappingValue);

    const extras = [];
    if (activity) extras.push(`[${activity}]`);
    if (sapCode) extras.push(`SAP: ${sapCode}`);
    if (costCenter) extras.push(`CC: ${costCenter}`);
    if (wbsElement) extras.push(`WBS: ${wbsElement}`);
    const extraText = extras.length > 0 ? ` ${extras.join(' ')}` : '';
    showNotification(`URL rule added: "${pattern}" → "${project}"${extraText}`, 'success');

    if (patternInput) patternInput.value = '';
    if (projectInput) projectInput.value = '';
    if (activityInput) activityInput.value = '';
    if (sapCodeInput) sapCodeInput.value = '';
    if (costCenterInput) costCenterInput.value = '';
    if (wbsInput) wbsInput.value = '';

    await loadUrlMappings();
  } catch (error) {
    showNotification('Failed to add URL rule', 'error');
  }
}

/**
 * Remove a URL mapping rule
 */
async function removeUrlMapping(pattern) {
  if (!confirm(`Remove URL rule for "${pattern}"?`)) return;

  try {
    await window.lightTrackAPI.removeUrlMapping(pattern);
    showNotification('URL rule removed', 'success');
    await loadUrlMappings();
  } catch (error) {
    showNotification('Failed to remove URL rule', 'error');
  }
}

/**
 * Edit an existing URL mapping (populate form for update)
 */
function editUrlMapping(pattern) {
  const mappings = AppState.urlMappingsCache || {};
  const value = mappings[pattern];
  if (!value) return;

  const project = typeof value === 'string' ? value : value.project;
  const activity = typeof value === 'object' ? value.activity : '';
  const sapCode = typeof value === 'object' ? value.sapCode : '';
  const costCenter = typeof value === 'object' ? value.costCenter : '';
  const wbsElement = typeof value === 'object' ? value.wbsElement : '';

  const patternInput = document.getElementById('url-mapping-pattern');
  const projectInput = document.getElementById('url-mapping-project');
  const activityInput = document.getElementById('url-mapping-activity');
  const sapCodeInput = document.getElementById('url-mapping-sap-code');
  const costCenterInput = document.getElementById('url-mapping-cost-center');
  const wbsInput = document.getElementById('url-mapping-wbs');
  const updateBtn = document.getElementById('update-url-mapping-btn');
  const cancelBtn = document.getElementById('cancel-url-mapping-btn');

  if (patternInput) {
    patternInput.value = pattern;
    patternInput.readOnly = true;
  }
  if (projectInput) projectInput.value = project || '';
  if (activityInput) activityInput.value = activity || '';
  if (sapCodeInput) sapCodeInput.value = sapCode || '';
  if (costCenterInput) costCenterInput.value = costCenter || '';
  if (wbsInput) wbsInput.value = wbsElement || '';

  if (updateBtn) {
    updateBtn.disabled = false;
    updateBtn.dataset.pattern = pattern;
  }
  if (cancelBtn) cancelBtn.style.display = '';

  // Highlight the item being edited
  document.querySelectorAll('#url-mappings-list .mapping-item').forEach(el => el.classList.remove('editing'));
  const editingItem = document.querySelector(`#url-mappings-list .mapping-item[data-pattern="${CSS.escape(pattern)}"]`);
  if (editingItem) editingItem.classList.add('editing');
}

/**
 * Cancel editing a URL mapping
 */
function cancelUrlMappingEdit() {
  const patternInput = document.getElementById('url-mapping-pattern');
  const projectInput = document.getElementById('url-mapping-project');
  const activityInput = document.getElementById('url-mapping-activity');
  const sapCodeInput = document.getElementById('url-mapping-sap-code');
  const costCenterInput = document.getElementById('url-mapping-cost-center');
  const wbsInput = document.getElementById('url-mapping-wbs');
  const updateBtn = document.getElementById('update-url-mapping-btn');
  const cancelBtn = document.getElementById('cancel-url-mapping-btn');

  if (patternInput) {
    patternInput.value = '';
    patternInput.readOnly = false;
  }
  if (projectInput) projectInput.value = '';
  if (activityInput) activityInput.value = '';
  if (sapCodeInput) sapCodeInput.value = '';
  if (costCenterInput) costCenterInput.value = '';
  if (wbsInput) wbsInput.value = '';

  if (updateBtn) {
    updateBtn.disabled = true;
    delete updateBtn.dataset.pattern;
  }
  if (cancelBtn) cancelBtn.style.display = 'none';

  document.querySelectorAll('#url-mappings-list .mapping-item').forEach(el => el.classList.remove('editing'));
}

/**
 * Update an existing URL mapping
 */
async function updateUrlMapping() {
  const updateBtn = document.getElementById('update-url-mapping-btn');
  if (!updateBtn?.dataset.pattern) return;

  const pattern = updateBtn.dataset.pattern;
  const projectInput = document.getElementById('url-mapping-project');
  const activityInput = document.getElementById('url-mapping-activity');
  const sapCodeInput = document.getElementById('url-mapping-sap-code');
  const costCenterInput = document.getElementById('url-mapping-cost-center');
  const wbsInput = document.getElementById('url-mapping-wbs');

  const project = projectInput?.value?.trim();
  const activity = activityInput?.value?.trim();
  const sapCode = sapCodeInput?.value?.trim();
  const costCenter = costCenterInput?.value?.trim();
  const wbsElement = wbsInput?.value?.trim();

  if (!project) {
    showNotification('Project is required', 'error');
    return;
  }

  const mappingValue = {
    project,
    ...(activity && { activity }),
    ...(sapCode && { sapCode }),
    ...(costCenter && { costCenter }),
    ...(wbsElement && { wbsElement })
  };

  try {
    await window.lightTrackAPI.addUrlMapping(pattern, mappingValue);
    showNotification(`Updated URL rule "${pattern}"`, 'success');
    cancelUrlMappingEdit();
    await loadUrlMappings();
  } catch (error) {
    showNotification('Failed to update URL rule', 'error');
  }
}

// ============= JIRA Mappings =============

/**
 * Load and display JIRA project key mappings
 */
async function loadJiraMappings() {
  const mappingsList = document.getElementById('jira-mappings-list');
  if (!mappingsList || !window.lightTrackAPI?.getJiraMappings) return;

  try {
    const mappings = await window.lightTrackAPI.getJiraMappings() || {};
    const entries = Object.entries(mappings);

    if (entries.length === 0) {
      mappingsList.innerHTML = '<div class="meta-line">No JIRA rules yet. Add a rule to auto-assign JIRA tickets to projects.</div>';
    } else {
      // Cache mappings for edit
      AppState.jiraMappingsCache = mappings;

      mappingsList.innerHTML = entries.map(([key, value]) => {
        const project = typeof value === 'string' ? value : value.project;
        const activity = typeof value === 'object' ? value.activity : null;
        const sapCode = typeof value === 'object' ? value.sapCode : null;
        const activityHtml = activity ? `<span class="activity">[${escapeHtml(activity)}]</span>` : '';
        const sapCodeHtml = sapCode ? `<span class="sap-code" style="color: var(--neon); font-size: 11px;">(SAP: ${escapeHtml(sapCode)})</span>` : '';
        return `
        <div class="mapping-item" data-key="${escapeAttr(key)}">
          <div>
            <span class="pattern">${escapeHtml(key)}-*</span>
            <span class="arrow">→</span>
            <span class="project">${escapeHtml(project)}</span>
            ${activityHtml}
            ${sapCodeHtml}
          </div>
          <div class="mapping-actions">
            <button data-action="edit-jira-mapping" data-key="${escapeAttr(key)}" title="Edit rule">✎</button>
            <button data-action="remove-jira-mapping" data-key="${escapeAttr(key)}" title="Remove rule">✕</button>
          </div>
        </div>
      `}).join('');
    }
  } catch (error) {
    console.error('Failed to load JIRA mappings:', error);
    mappingsList.innerHTML = '<div class="meta-line">Failed to load rules</div>';
  }
}

/**
 * Add a new JIRA project key mapping
 */
async function addJiraMapping() {
  const keyInput = document.getElementById('jira-mapping-key');
  const projectInput = document.getElementById('jira-mapping-project');
  const activityInput = document.getElementById('jira-mapping-activity');
  const sapCodeInput = document.getElementById('jira-mapping-sap-code');
  const costCenterInput = document.getElementById('jira-mapping-cost-center');
  const wbsInput = document.getElementById('jira-mapping-wbs');

  const key = keyInput?.value?.trim().toUpperCase();
  const project = projectInput?.value?.trim();
  const activity = activityInput?.value?.trim();
  const sapCode = sapCodeInput?.value?.trim();
  const costCenter = costCenterInput?.value?.trim();
  const wbsElement = wbsInput?.value?.trim();

  if (!key || !project) {
    showNotification('Please enter both JIRA project key and project name', 'error');
    return;
  }

  try {
    let mappingValue = project;
    if (activity || sapCode || costCenter || wbsElement) {
      mappingValue = {
        project,
        ...(activity && { activity }),
        ...(sapCode && { sapCode }),
        ...(costCenter && { costCenter }),
        ...(wbsElement && { wbsElement })
      };
    }
    await window.lightTrackAPI.addJiraMapping(key, mappingValue);

    const extras = [];
    if (activity) extras.push(`[${activity}]`);
    if (sapCode) extras.push(`SAP: ${sapCode}`);
    if (costCenter) extras.push(`CC: ${costCenter}`);
    if (wbsElement) extras.push(`WBS: ${wbsElement}`);
    const extraText = extras.length > 0 ? ` ${extras.join(' ')}` : '';
    showNotification(`JIRA rule added: "${key}-*" → "${project}"${extraText}`, 'success');

    if (keyInput) keyInput.value = '';
    if (projectInput) projectInput.value = '';
    if (activityInput) activityInput.value = '';
    if (sapCodeInput) sapCodeInput.value = '';
    if (costCenterInput) costCenterInput.value = '';
    if (wbsInput) wbsInput.value = '';

    await loadJiraMappings();
  } catch (error) {
    showNotification('Failed to add JIRA rule', 'error');
  }
}

/**
 * Remove a JIRA project key mapping
 */
async function removeJiraMapping(key) {
  if (!confirm(`Remove JIRA rule for "${key}"?`)) return;

  try {
    await window.lightTrackAPI.removeJiraMapping(key);
    showNotification('JIRA rule removed', 'success');
    await loadJiraMappings();
  } catch (error) {
    showNotification('Failed to remove JIRA rule', 'error');
  }
}

/**
 * Edit an existing JIRA mapping (populate form for update)
 */
function editJiraMapping(key) {
  const mappings = AppState.jiraMappingsCache || {};
  const value = mappings[key];
  if (!value) return;

  const project = typeof value === 'string' ? value : value.project;
  const activity = typeof value === 'object' ? value.activity : '';
  const sapCode = typeof value === 'object' ? value.sapCode : '';
  const costCenter = typeof value === 'object' ? value.costCenter : '';
  const wbsElement = typeof value === 'object' ? value.wbsElement : '';

  const keyInput = document.getElementById('jira-mapping-key');
  const projectInput = document.getElementById('jira-mapping-project');
  const activityInput = document.getElementById('jira-mapping-activity');
  const sapCodeInput = document.getElementById('jira-mapping-sap-code');
  const costCenterInput = document.getElementById('jira-mapping-cost-center');
  const wbsInput = document.getElementById('jira-mapping-wbs');
  const updateBtn = document.getElementById('update-jira-mapping-btn');
  const cancelBtn = document.getElementById('cancel-jira-mapping-btn');

  if (keyInput) {
    keyInput.value = key;
    keyInput.readOnly = true;
  }
  if (projectInput) projectInput.value = project || '';
  if (activityInput) activityInput.value = activity || '';
  if (sapCodeInput) sapCodeInput.value = sapCode || '';
  if (costCenterInput) costCenterInput.value = costCenter || '';
  if (wbsInput) wbsInput.value = wbsElement || '';

  if (updateBtn) {
    updateBtn.disabled = false;
    updateBtn.dataset.key = key;
  }
  if (cancelBtn) cancelBtn.style.display = '';

  // Highlight the item being edited
  document.querySelectorAll('#jira-mappings-list .mapping-item').forEach(el => el.classList.remove('editing'));
  const editingItem = document.querySelector(`#jira-mappings-list .mapping-item[data-key="${CSS.escape(key)}"]`);
  if (editingItem) editingItem.classList.add('editing');
}

/**
 * Cancel editing a JIRA mapping
 */
function cancelJiraMappingEdit() {
  const keyInput = document.getElementById('jira-mapping-key');
  const projectInput = document.getElementById('jira-mapping-project');
  const activityInput = document.getElementById('jira-mapping-activity');
  const sapCodeInput = document.getElementById('jira-mapping-sap-code');
  const costCenterInput = document.getElementById('jira-mapping-cost-center');
  const wbsInput = document.getElementById('jira-mapping-wbs');
  const updateBtn = document.getElementById('update-jira-mapping-btn');
  const cancelBtn = document.getElementById('cancel-jira-mapping-btn');

  if (keyInput) {
    keyInput.value = '';
    keyInput.readOnly = false;
  }
  if (projectInput) projectInput.value = '';
  if (activityInput) activityInput.value = '';
  if (sapCodeInput) sapCodeInput.value = '';
  if (costCenterInput) costCenterInput.value = '';
  if (wbsInput) wbsInput.value = '';

  if (updateBtn) {
    updateBtn.disabled = true;
    delete updateBtn.dataset.key;
  }
  if (cancelBtn) cancelBtn.style.display = 'none';

  document.querySelectorAll('#jira-mappings-list .mapping-item').forEach(el => el.classList.remove('editing'));
}

/**
 * Update an existing JIRA mapping
 */
async function updateJiraMapping() {
  const updateBtn = document.getElementById('update-jira-mapping-btn');
  if (!updateBtn?.dataset.key) return;

  const key = updateBtn.dataset.key;
  const projectInput = document.getElementById('jira-mapping-project');
  const activityInput = document.getElementById('jira-mapping-activity');
  const sapCodeInput = document.getElementById('jira-mapping-sap-code');
  const costCenterInput = document.getElementById('jira-mapping-cost-center');
  const wbsInput = document.getElementById('jira-mapping-wbs');

  const project = projectInput?.value?.trim();
  const activity = activityInput?.value?.trim();
  const sapCode = sapCodeInput?.value?.trim();
  const costCenter = costCenterInput?.value?.trim();
  const wbsElement = wbsInput?.value?.trim();

  if (!project) {
    showNotification('Project is required', 'error');
    return;
  }

  const mappingValue = {
    project,
    ...(activity && { activity }),
    ...(sapCode && { sapCode }),
    ...(costCenter && { costCenter }),
    ...(wbsElement && { wbsElement })
  };

  try {
    await window.lightTrackAPI.addJiraMapping(key, mappingValue);
    showNotification(`Updated JIRA rule "${key}"`, 'success');
    cancelJiraMappingEdit();
    await loadJiraMappings();
  } catch (error) {
    showNotification('Failed to update JIRA rule', 'error');
  }
}

// ============= Meeting Mappings =============

/**
 * Load and display meeting subject mappings
 */
async function loadMeetingMappings() {
  const mappingsList = document.getElementById('meeting-mappings-list');
  if (!mappingsList || !window.lightTrackAPI?.getMeetingMappings) return;

  try {
    const mappings = await window.lightTrackAPI.getMeetingMappings() || {};
    const entries = Object.entries(mappings);

    if (entries.length === 0) {
      mappingsList.innerHTML = '<div class="meta-line">No meeting rules yet. Add a rule to auto-assign meetings to projects.</div>';
    } else {
      // Cache mappings for edit
      AppState.meetingMappingsCache = mappings;

      mappingsList.innerHTML = entries.map(([pattern, value]) => {
        const project = typeof value === 'string' ? value : value.project;
        const activity = typeof value === 'object' ? value.activity : null;
        const sapCode = typeof value === 'object' ? value.sapCode : null;
        const activityHtml = activity ? `<span class="activity">[${escapeHtml(activity)}]</span>` : '';
        const sapCodeHtml = sapCode ? `<span class="sap-code" style="color: var(--neon); font-size: 11px;">(SAP: ${escapeHtml(sapCode)})</span>` : '';
        return `
        <div class="mapping-item" data-pattern="${escapeAttr(pattern)}">
          <div>
            <span class="pattern">${escapeHtml(pattern)}</span>
            <span class="arrow">→</span>
            <span class="project">${escapeHtml(project)}</span>
            ${activityHtml}
            ${sapCodeHtml}
          </div>
          <div class="mapping-actions">
            <button data-action="edit-meeting-mapping" data-pattern="${escapeAttr(pattern)}" title="Edit rule">✎</button>
            <button data-action="remove-meeting-mapping" data-pattern="${escapeAttr(pattern)}" title="Remove rule">✕</button>
          </div>
        </div>
      `}).join('');
    }
  } catch (error) {
    console.error('Failed to load meeting mappings:', error);
    mappingsList.innerHTML = '<div class="meta-line">Failed to load rules</div>';
  }
}

/**
 * Validate that a string is a valid regex pattern
 * @param {string} pattern - The pattern to validate
 * @returns {boolean} True if valid, false otherwise
 */
function isValidRegex(pattern) {
  try {
    new RegExp(pattern, 'i');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Add a new meeting subject mapping
 */
async function addMeetingMapping() {
  const patternInput = document.getElementById('meeting-mapping-pattern');
  const projectInput = document.getElementById('meeting-mapping-project');
  const activityInput = document.getElementById('meeting-mapping-activity');
  const sapCodeInput = document.getElementById('meeting-mapping-sap-code');
  const costCenterInput = document.getElementById('meeting-mapping-cost-center');
  const wbsInput = document.getElementById('meeting-mapping-wbs');

  const pattern = patternInput?.value?.trim();
  const project = projectInput?.value?.trim();
  const activity = activityInput?.value?.trim();
  const sapCode = sapCodeInput?.value?.trim();
  const costCenter = costCenterInput?.value?.trim();
  const wbsElement = wbsInput?.value?.trim();

  if (!pattern || !project) {
    showNotification('Please enter both a subject pattern and project name', 'error');
    return;
  }

  // Validate regex pattern
  if (!isValidRegex(pattern)) {
    showNotification('Invalid regex pattern. Use plain text or valid regex syntax.', 'error');
    return;
  }

  try {
    let mappingValue = project;
    if (activity || sapCode || costCenter || wbsElement) {
      mappingValue = {
        project,
        ...(activity && { activity }),
        ...(sapCode && { sapCode }),
        ...(costCenter && { costCenter }),
        ...(wbsElement && { wbsElement })
      };
    }
    await window.lightTrackAPI.addMeetingMapping(pattern, mappingValue);

    const extras = [];
    if (activity) extras.push(`[${activity}]`);
    if (sapCode) extras.push(`SAP: ${sapCode}`);
    if (costCenter) extras.push(`CC: ${costCenter}`);
    if (wbsElement) extras.push(`WBS: ${wbsElement}`);
    const extraText = extras.length > 0 ? ` ${extras.join(' ')}` : '';
    showNotification(`Meeting rule added: "${pattern}" → "${project}"${extraText}`, 'success');

    if (patternInput) patternInput.value = '';
    if (projectInput) projectInput.value = '';
    if (activityInput) activityInput.value = '';
    if (sapCodeInput) sapCodeInput.value = '';
    if (costCenterInput) costCenterInput.value = '';
    if (wbsInput) wbsInput.value = '';

    await loadMeetingMappings();
  } catch (error) {
    showNotification('Failed to add meeting rule', 'error');
  }
}

/**
 * Remove a meeting subject mapping
 */
async function removeMeetingMapping(pattern) {
  if (!confirm(`Remove meeting rule for "${pattern}"?`)) return;

  try {
    await window.lightTrackAPI.removeMeetingMapping(pattern);
    showNotification('Meeting rule removed', 'success');
    await loadMeetingMappings();
  } catch (error) {
    showNotification('Failed to remove meeting rule', 'error');
  }
}

/**
 * Edit an existing meeting mapping (populate form for update)
 */
function editMeetingMapping(pattern) {
  const mappings = AppState.meetingMappingsCache || {};
  const value = mappings[pattern];
  if (!value) return;

  const project = typeof value === 'string' ? value : value.project;
  const activity = typeof value === 'object' ? value.activity : '';
  const sapCode = typeof value === 'object' ? value.sapCode : '';
  const costCenter = typeof value === 'object' ? value.costCenter : '';
  const wbsElement = typeof value === 'object' ? value.wbsElement : '';

  const patternInput = document.getElementById('meeting-mapping-pattern');
  const projectInput = document.getElementById('meeting-mapping-project');
  const activityInput = document.getElementById('meeting-mapping-activity');
  const sapCodeInput = document.getElementById('meeting-mapping-sap-code');
  const costCenterInput = document.getElementById('meeting-mapping-cost-center');
  const wbsInput = document.getElementById('meeting-mapping-wbs');
  const updateBtn = document.getElementById('update-meeting-mapping-btn');
  const cancelBtn = document.getElementById('cancel-meeting-mapping-btn');

  if (patternInput) {
    patternInput.value = pattern;
    patternInput.readOnly = true;
  }
  if (projectInput) projectInput.value = project || '';
  if (activityInput) activityInput.value = activity || '';
  if (sapCodeInput) sapCodeInput.value = sapCode || '';
  if (costCenterInput) costCenterInput.value = costCenter || '';
  if (wbsInput) wbsInput.value = wbsElement || '';

  if (updateBtn) {
    updateBtn.disabled = false;
    updateBtn.dataset.pattern = pattern;
  }
  if (cancelBtn) cancelBtn.style.display = '';

  // Highlight the item being edited
  document.querySelectorAll('#meeting-mappings-list .mapping-item').forEach(el => el.classList.remove('editing'));
  const editingItem = document.querySelector(`#meeting-mappings-list .mapping-item[data-pattern="${CSS.escape(pattern)}"]`);
  if (editingItem) editingItem.classList.add('editing');
}

/**
 * Cancel editing a meeting mapping
 */
function cancelMeetingMappingEdit() {
  const patternInput = document.getElementById('meeting-mapping-pattern');
  const projectInput = document.getElementById('meeting-mapping-project');
  const activityInput = document.getElementById('meeting-mapping-activity');
  const sapCodeInput = document.getElementById('meeting-mapping-sap-code');
  const costCenterInput = document.getElementById('meeting-mapping-cost-center');
  const wbsInput = document.getElementById('meeting-mapping-wbs');
  const updateBtn = document.getElementById('update-meeting-mapping-btn');
  const cancelBtn = document.getElementById('cancel-meeting-mapping-btn');

  if (patternInput) {
    patternInput.value = '';
    patternInput.readOnly = false;
  }
  if (projectInput) projectInput.value = '';
  if (activityInput) activityInput.value = '';
  if (sapCodeInput) sapCodeInput.value = '';
  if (costCenterInput) costCenterInput.value = '';
  if (wbsInput) wbsInput.value = '';

  if (updateBtn) {
    updateBtn.disabled = true;
    delete updateBtn.dataset.pattern;
  }
  if (cancelBtn) cancelBtn.style.display = 'none';

  document.querySelectorAll('#meeting-mappings-list .mapping-item').forEach(el => el.classList.remove('editing'));
}

/**
 * Update an existing meeting mapping
 */
async function updateMeetingMapping() {
  const updateBtn = document.getElementById('update-meeting-mapping-btn');
  if (!updateBtn?.dataset.pattern) return;

  const pattern = updateBtn.dataset.pattern;
  const projectInput = document.getElementById('meeting-mapping-project');
  const activityInput = document.getElementById('meeting-mapping-activity');
  const sapCodeInput = document.getElementById('meeting-mapping-sap-code');
  const costCenterInput = document.getElementById('meeting-mapping-cost-center');
  const wbsInput = document.getElementById('meeting-mapping-wbs');

  const project = projectInput?.value?.trim();
  const activity = activityInput?.value?.trim();
  const sapCode = sapCodeInput?.value?.trim();
  const costCenter = costCenterInput?.value?.trim();
  const wbsElement = wbsInput?.value?.trim();

  if (!project) {
    showNotification('Project is required', 'error');
    return;
  }

  // Validate regex pattern
  if (!isValidRegex(pattern)) {
    showNotification('Invalid regex pattern', 'error');
    return;
  }

  const mappingValue = {
    project,
    ...(activity && { activity }),
    ...(sapCode && { sapCode }),
    ...(costCenter && { costCenter }),
    ...(wbsElement && { wbsElement })
  };

  try {
    await window.lightTrackAPI.addMeetingMapping(pattern, mappingValue);
    showNotification(`Updated meeting rule "${pattern}"`, 'success');
    cancelMeetingMappingEdit();
    await loadMeetingMappings();
  } catch (error) {
    showNotification('Failed to update meeting rule', 'error');
  }
}

// Expose mapping functions globally for onclick
window.removeProjectMapping = removeProjectMapping;
window.removeUrlMapping = removeUrlMapping;
window.removeJiraMapping = removeJiraMapping;
window.editProjectMapping = editProjectMapping;
window.editUrlMapping = editUrlMapping;
window.editJiraMapping = editJiraMapping;
window.editMeetingMapping = editMeetingMapping;
window.removeMeetingMapping = removeMeetingMapping;

/**
 * Load user settings from storage
 */
async function loadSettings() {
  try {
    if (!window.lightTrackAPI?.getSettings) return;

    const stored = await window.lightTrackAPI.getSettings() || {};

    // Merge with defaults
    AppState.settings = {
      deepWorkTarget: stored.deepWorkTarget ?? 4,
      breaksTarget: stored.breaksTarget ?? 4,
      workDayStart: stored.workDayStart ?? '09:00',
      workDayEnd: stored.workDayEnd ?? '18:00',
      weekStartDay: stored.weekStartDay ?? 1,
      defaultProject: stored.defaultProject ?? 'General',
      launchAtStartup: stored.launchAtStartup ?? false,
      autoStartTracking: stored.autoStartTracking ?? false,
      closeBehavior: stored.closeBehavior ?? 'minimize',
      minimizeToTray: stored.minimizeToTray ?? true,
      breakReminderEnabled: stored.breakReminderEnabled ?? false,
      breakReminderInterval: stored.breakReminderInterval ?? 60
    };

    console.log('Settings loaded:', AppState.settings);

    // Initialize break reminder if enabled
    initBreakReminder();
  } catch (error) {
    console.error('Failed to load settings:', error);
    showNotification('Failed to load settings', 'error');
  }
}

/**
 * Save user settings to storage
 */
async function saveSettings() {
  try {
    if (!window.lightTrackAPI?.updateSettings) return;

    const result = await window.lightTrackAPI.updateSettings({
      deepWorkTarget: AppState.settings.deepWorkTarget,
      breaksTarget: AppState.settings.breaksTarget,
      workDayStart: AppState.settings.workDayStart,
      workDayEnd: AppState.settings.workDayEnd,
      defaultProject: AppState.settings.defaultProject,
      launchAtStartup: AppState.settings.launchAtStartup,
      autoStartTracking: AppState.settings.autoStartTracking,
      closeBehavior: AppState.settings.closeBehavior,
      minimizeToTray: AppState.settings.minimizeToTray,
      breakReminderEnabled: AppState.settings.breakReminderEnabled,
      breakReminderInterval: AppState.settings.breakReminderInterval
    });

    // Reinitialize break reminder with new settings
    initBreakReminder();

    if (result !== true) {
      throw new Error('Settings save did not confirm success');
    }

    showNotification('Settings saved', 'success');
  } catch (error) {
    console.error('Failed to save settings:', error);
    showNotification('Failed to save settings', 'error');
  }
}

// Debounced version of saveSettings (500ms delay to batch rapid changes)
const debouncedSaveSettings = debounce(saveSettings, 500);

// ============= SAP Export View =============

// SAP Export functionality is handled by LightTrack.SAPExport module (js/modules/sap-export.js)

/**
 * Load SAP Export view
 * Uses the LightTrack.SAPExport module (loaded from modules/sap-export.js)
 */
async function loadSAPExportView() {
  // Use the dedicated SAP Export module
  if (LT.SAPExport?.init) {
    return LT.SAPExport.init();
  }

  // Module not loaded - show error
  console.error('SAP Export module not loaded');
  showNotification('SAP Export module failed to load', 'error');
}

/**
 * Save export to history
 */
function saveExportHistory(exportRecord) {
  try {
    let history = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.EXPORT_HISTORY) || '[]');
    history.unshift(exportRecord);
    history = history.slice(0, CONSTANTS.MAX_EXPORT_HISTORY);
    safeLocalStorageSet(CONSTANTS.STORAGE_KEYS.EXPORT_HISTORY, JSON.stringify(history));
  } catch (error) {
    console.error('Failed to save export history:', error);
  }
}

/**
 * Load and display export history
 */
function loadExportHistory() {
  const historyList = document.getElementById('export-history-list');
  if (!historyList) return;

  try {
    const history = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.EXPORT_HISTORY) || '[]');

    if (history.length === 0) {
      historyList.innerHTML = '<div class="meta-line">No exports yet</div>';
      return;
    }

    historyList.innerHTML = history.map(item => {
      const exportDate = new Date(item.date);
      const dateStr = exportDate.toLocaleDateString();
      const timeStr = exportDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      return `
        <div class="export-history-item">
          <div class="export-info">
            <span class="export-date">${dateStr} ${timeStr}</span>
            <span class="export-period">${escapeHtml(item.period)}</span>
          </div>
          <span class="export-records">${item.records} records</span>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Failed to load export history:', error);
    historyList.innerHTML = '<div class="meta-line">Failed to load history</div>';
  }
}

/**
 * Load Settings view
 */
async function loadSettingsView() {
  try {
    if (!window.lightTrackAPI) return;

    // Populate settings inputs with current values
    const deepWorkInput = document.getElementById('settings-deep-work');
    const breaksInput = document.getElementById('settings-breaks');
    const dayStartInput = document.getElementById('settings-day-start');
    const dayEndInput = document.getElementById('settings-day-end');
    const weekStartInput = document.getElementById('settings-week-start');
    const defaultProjectInput = document.getElementById('settings-default-project');
    const launchStartupInput = document.getElementById('settings-launch-startup');
    const autoTrackInput = document.getElementById('settings-auto-track');

    if (deepWorkInput) deepWorkInput.value = AppState.settings.deepWorkTarget;
    if (breaksInput) breaksInput.value = AppState.settings.breaksTarget;
    if (dayStartInput) dayStartInput.value = AppState.settings.workDayStart;
    if (dayEndInput) dayEndInput.value = AppState.settings.workDayEnd;
    if (weekStartInput) weekStartInput.value = AppState.settings.weekStartDay ?? 1;
    if (defaultProjectInput) defaultProjectInput.value = AppState.settings.defaultProject;
    if (autoTrackInput) autoTrackInput.checked = AppState.settings.autoStartTracking;

    // Sync launch at startup with actual system setting
    if (launchStartupInput && window.lightTrackAPI?.getLaunchAtStartup) {
      const launchStatus = await window.lightTrackAPI.getLaunchAtStartup();
      launchStartupInput.checked = launchStatus.enabled;
      AppState.settings.launchAtStartup = launchStatus.enabled;
    } else if (launchStartupInput) {
      launchStartupInput.checked = AppState.settings.launchAtStartup;
    }

    // Wire up change handlers (only once) - using debounced save
    if (deepWorkInput && !deepWorkInput.dataset.wired) {
      deepWorkInput.dataset.wired = 'true';
      deepWorkInput.addEventListener('change', (e) => {
        AppState.settings.deepWorkTarget = parseInt(e.target.value, 10) || 4;
        debouncedSaveSettings();
      });
    }
    if (breaksInput && !breaksInput.dataset.wired) {
      breaksInput.dataset.wired = 'true';
      breaksInput.addEventListener('change', (e) => {
        AppState.settings.breaksTarget = parseInt(e.target.value, 10) || 4;
        debouncedSaveSettings();
      });
    }
    if (dayStartInput && !dayStartInput.dataset.wired) {
      dayStartInput.dataset.wired = 'true';
      dayStartInput.addEventListener('change', (e) => {
        AppState.settings.workDayStart = e.target.value || '09:00';
        debouncedSaveSettings();
      });
    }
    if (dayEndInput && !dayEndInput.dataset.wired) {
      dayEndInput.dataset.wired = 'true';
      dayEndInput.addEventListener('change', (e) => {
        AppState.settings.workDayEnd = e.target.value || '18:00';
        debouncedSaveSettings();
      });
    }
    if (weekStartInput && !weekStartInput.dataset.wired) {
      weekStartInput.dataset.wired = 'true';
      weekStartInput.addEventListener('change', (e) => {
        AppState.settings.weekStartDay = parseInt(e.target.value, 10);
        debouncedSaveSettings();
        // Refresh analytics if visible
        if (AppState.currentView === 'analytics') {
          loadAnalyticsView();
        }
      });
    }
    if (defaultProjectInput && !defaultProjectInput.dataset.wired) {
      defaultProjectInput.dataset.wired = 'true';
      defaultProjectInput.addEventListener('change', (e) => {
        AppState.settings.defaultProject = e.target.value || 'General';
        debouncedSaveSettings();
      });
    }
    if (launchStartupInput && !launchStartupInput.dataset.wired) {
      launchStartupInput.dataset.wired = 'true';
      launchStartupInput.addEventListener('change', async (e) => {
        AppState.settings.launchAtStartup = e.target.checked;
        // Call dedicated API to set login item settings
        if (window.lightTrackAPI?.setLaunchAtStartup) {
          await window.lightTrackAPI.setLaunchAtStartup(e.target.checked);
        }
        debouncedSaveSettings();
      });
    }
    if (autoTrackInput && !autoTrackInput.dataset.wired) {
      autoTrackInput.dataset.wired = 'true';
      autoTrackInput.addEventListener('change', (e) => {
        AppState.settings.autoStartTracking = e.target.checked;
        debouncedSaveSettings();
      });
    }

    // Close behavior and minimize to tray settings
    const closeBehaviorInput = document.getElementById('settings-close-behavior');
    const minimizeToTrayInput = document.getElementById('settings-minimize-to-tray');

    if (closeBehaviorInput) {
      closeBehaviorInput.value = AppState.settings.closeBehavior || 'minimize';
    }
    if (minimizeToTrayInput) {
      minimizeToTrayInput.checked = AppState.settings.minimizeToTray !== false;
    }

    if (closeBehaviorInput && !closeBehaviorInput.dataset.wired) {
      closeBehaviorInput.dataset.wired = 'true';
      closeBehaviorInput.addEventListener('change', (e) => {
        AppState.settings.closeBehavior = e.target.value;
        debouncedSaveSettings();
        // Notify main process about the setting change
        if (window.lightTrackAPI?.updateWindowBehavior) {
          window.lightTrackAPI.updateWindowBehavior({
            closeBehavior: e.target.value,
            minimizeToTray: AppState.settings.minimizeToTray
          });
        }
      });
    }
    if (minimizeToTrayInput && !minimizeToTrayInput.dataset.wired) {
      minimizeToTrayInput.dataset.wired = 'true';
      minimizeToTrayInput.addEventListener('change', (e) => {
        AppState.settings.minimizeToTray = e.target.checked;
        debouncedSaveSettings();
        // Notify main process about the setting change
        if (window.lightTrackAPI?.updateWindowBehavior) {
          window.lightTrackAPI.updateWindowBehavior({
            closeBehavior: AppState.settings.closeBehavior,
            minimizeToTray: e.target.checked
          });
        }
      });
    }

    // Break reminder settings
    const breakReminderEnabledInput = document.getElementById('settings-break-reminder-enabled');
    const breakReminderIntervalInput = document.getElementById('settings-break-reminder-interval');

    if (breakReminderEnabledInput) {
      breakReminderEnabledInput.checked = AppState.settings.breakReminderEnabled === true;
    }
    if (breakReminderIntervalInput) {
      breakReminderIntervalInput.value = AppState.settings.breakReminderInterval || 60;
      breakReminderIntervalInput.disabled = !AppState.settings.breakReminderEnabled;
    }

    if (breakReminderEnabledInput && !breakReminderEnabledInput.dataset.wired) {
      breakReminderEnabledInput.dataset.wired = 'true';
      breakReminderEnabledInput.addEventListener('change', (e) => {
        AppState.settings.breakReminderEnabled = e.target.checked;
        if (breakReminderIntervalInput) {
          breakReminderIntervalInput.disabled = !e.target.checked;
        }
        debouncedSaveSettings();
      });
    }

    if (breakReminderIntervalInput && !breakReminderIntervalInput.dataset.wired) {
      breakReminderIntervalInput.dataset.wired = 'true';
      breakReminderIntervalInput.addEventListener('change', (e) => {
        AppState.settings.breakReminderInterval = parseInt(e.target.value, 10) || 60;
        debouncedSaveSettings();
      });
    }

    // Consolidation settings
    const consolidateInput = document.getElementById('settings-consolidate-activities');
    const consolidationModeInput = document.getElementById('settings-consolidation-mode');

    if (consolidateInput) {
      consolidateInput.checked = AppState.settings.consolidateActivities !== false;
    }
    if (consolidationModeInput) {
      consolidationModeInput.value = AppState.settings.consolidationMode || 'smart';
      // Disable mode selector if consolidation is disabled
      consolidationModeInput.disabled = !consolidateInput?.checked;
    }

    if (consolidateInput && !consolidateInput.dataset.wired) {
      consolidateInput.dataset.wired = 'true';
      consolidateInput.addEventListener('change', (e) => {
        AppState.settings.consolidateActivities = e.target.checked;
        // Enable/disable mode selector
        if (consolidationModeInput) {
          consolidationModeInput.disabled = !e.target.checked;
        }
        debouncedSaveSettings();
      });
    }

    if (consolidationModeInput && !consolidationModeInput.dataset.wired) {
      consolidationModeInput.dataset.wired = 'true';
      consolidationModeInput.addEventListener('change', (e) => {
        AppState.settings.consolidationMode = e.target.value || 'smart';
        debouncedSaveSettings();
      });
    }

    // Load statistics
    const allActivities = await window.lightTrackAPI.getActivities() || [];
    const totalDuration = allActivities.reduce((sum, a) => sum + (a.duration || 0), 0);

    let oldest = null;
    let newest = null;
    allActivities.forEach(a => {
      if (a.startTime) {
        const d = new Date(a.startTime);
        if (!oldest || d < oldest) oldest = d;
        if (!newest || d > newest) newest = d;
      }
    });

    const statsEl = document.getElementById('settings-stats');
    if (statsEl) {
      statsEl.innerHTML = `
        Total entries: ${allActivities.length}<br>
        Total time tracked: ${formatDuration(totalDuration)}<br>
        Date range: ${oldest ? oldest.toLocaleDateString() : '--'} to ${newest ? newest.toLocaleDateString() : '--'}
      `;
    }

    // Wire up data management buttons
    const exportBtn = document.getElementById('settings-export');
    const clearBtn = document.getElementById('settings-clear-old');

    if (exportBtn && !exportBtn.dataset.wired) {
      exportBtn.dataset.wired = 'true';
      exportBtn.addEventListener('click', async () => {
        try {
          await window.lightTrackAPI.exportData();
          showNotification('Data exported', 'success');
        } catch (error) {
          showNotification('Export failed', 'error');
        }
      });
    }

    if (clearBtn && !clearBtn.dataset.wired) {
      clearBtn.dataset.wired = 'true';
      clearBtn.addEventListener('click', () => {
        openClearDataModal();
      });
    }

    // Wire up backup/restore buttons
    const backupBtn = document.getElementById('backup-data-btn');
    const restoreBtn = document.getElementById('restore-data-btn');
    const restoreInput = document.getElementById('restore-file-input');
    const backupStatus = document.getElementById('backup-status');

    if (backupBtn && !backupBtn.dataset.wired) {
      backupBtn.dataset.wired = 'true';
      backupBtn.addEventListener('click', async () => {
        await createBackup(backupStatus);
      });
    }

    if (restoreBtn && !restoreBtn.dataset.wired) {
      restoreBtn.dataset.wired = 'true';
      restoreBtn.addEventListener('click', () => {
        restoreInput?.click();
      });
    }

    if (restoreInput && !restoreInput.dataset.wired) {
      restoreInput.dataset.wired = 'true';
      restoreInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (file) {
          await restoreFromBackup(file, backupStatus);
          e.target.value = ''; // Reset input
        }
      });
    }

    // Load tag manager section
    await loadTagManager();

    // Load project manager section
    await loadProjectManager();

    // Load activity type manager section
    await loadActivityTypeManager();

    // Load calendar sync settings
    await loadCalendarSettings();

    // Initialize collapsible settings groups
    initSettingsGroups();

  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

/**
 * Initialize settings group expand/collapse state
 */
function initSettingsGroups() {
  const groups = document.querySelectorAll('.settings-group');

  // Load saved state from localStorage
  let savedState = {};
  try {
    savedState = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.SETTINGS_GROUPS) || '{}');
  } catch {
    savedState = {};
  }

  groups.forEach(group => {
    const groupName = group.dataset.group;
    if (!groupName) return;

    // Restore saved state (default to closed except 'tracking' which is open by default)
    if (savedState[groupName] !== undefined) {
      group.open = savedState[groupName];
    }

    // Save state on toggle (only wire once, store handler for potential cleanup)
    if (!group.dataset.listenerAttached) {
      group.dataset.listenerAttached = 'true';
      const toggleHandler = () => {
        try {
          const currentState = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.SETTINGS_GROUPS) || '{}');
          currentState[groupName] = group.open;
          safeLocalStorageSet(CONSTANTS.STORAGE_KEYS.SETTINGS_GROUPS, JSON.stringify(currentState));
        } catch {
          // Ignore localStorage errors
        }
      };
      group.addEventListener('toggle', toggleHandler);
      group._toggleHandler = toggleHandler; // Store for potential cleanup
    }
  });
}

// ============= Backup & Restore Functions =============

/**
 * Create a full backup of all data
 */
async function createBackup(statusEl) {
  try {
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.textContent = 'Creating backup...';
    }

    // Gather all data (fetch mappings in parallel using shared helper)
    const [activities, settings, mappings, tags, projects, activityTypes] = await Promise.all([
      window.lightTrackAPI.getActivities() || [],
      window.lightTrackAPI.getSettings() || {},
      fetchAllMappings(),
      window.lightTrackAPI.getTags?.() || [],
      window.lightTrackAPI.getProjects?.() || [],
      window.lightTrackAPI.getActivityTypes?.() || []
    ]);

    const backupData = {
      version: '3.0.0',
      backupDate: new Date().toISOString(),
      data: {
        activities,
        settings,
        mappings: {
          app: mappings.app,
          url: mappings.url,
          jira: mappings.jira,
          meeting: mappings.meeting
        },
        tags,
        projects,
        activityTypes
      },
      stats: {
        activitiesCount: activities.length,
        projectsCount: projects.length,
        tagsCount: tags.length
      }
    };

    // Create blob and trigger download
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `lighttrack-backup-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (statusEl) {
      statusEl.textContent = `Backup created: ${activities.length} activities, ${projects.length} projects`;
    }
    showNotification('Backup created successfully', 'success');
  } catch (error) {
    console.error('Backup failed:', error);
    if (statusEl) {
      statusEl.textContent = 'Backup failed: ' + error.message;
    }
    showNotification('Backup failed', 'error');
  }
}

/**
 * Restore from a backup file
 */
async function restoreFromBackup(file, statusEl) {
  try {
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.textContent = 'Validating backup file...';
    }

    // Security: Check file size before processing
    const maxSize = CONSTANTS.MAX_BACKUP_SIZE_MB * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error(ERRORS.RESTORE_SIZE + ` (max ${CONSTANTS.MAX_BACKUP_SIZE_MB}MB)`);
    }

    const text = await file.text();
    let backupData;

    try {
      backupData = JSON.parse(text);
    } catch {
      throw new Error(ERRORS.RESTORE_FORMAT);
    }

    // Validate backup structure
    if (!backupData.version || !backupData.data) {
      throw new Error(ERRORS.RESTORE_FORMAT);
    }

    // Version compatibility check
    if (!backupData.version.startsWith('3.')) {
      throw new Error(ERRORS.RESTORE_VERSION + ` (found v${backupData.version})`);
    }

    // Structure validation for activities
    if (backupData.data.activities && !Array.isArray(backupData.data.activities)) {
      throw new Error(ERRORS.RESTORE_FORMAT + ': activities must be an array');
    }

    // Prototype pollution prevention
    const sanitizeObject = (obj) => {
      if (obj && typeof obj === 'object') {
        delete obj.__proto__;
        delete obj.constructor;
        delete obj.prototype;
      }
      return obj;
    };
    backupData.data = sanitizeObject(backupData.data);
    if (backupData.data.settings) {
      backupData.data.settings = sanitizeObject(backupData.data.settings);
    }

    if (statusEl) statusEl.textContent = 'Reading backup file...';

    // Show confirmation
    const stats = backupData.stats || {};
    const confirmMsg = `This will restore:\n` +
      `• ${stats.activitiesCount || 0} activities\n` +
      `• ${stats.projectsCount || 0} projects\n` +
      `• ${stats.tagsCount || 0} tags\n\n` +
      `Existing data will be merged. Continue?`;

    if (!confirm(confirmMsg)) {
      if (statusEl) statusEl.textContent = 'Restore cancelled';
      return;
    }

    if (statusEl) statusEl.textContent = 'Restoring data...';

    const data = backupData.data;

    // Restore settings
    if (data.settings && window.lightTrackAPI.saveSettings) {
      await window.lightTrackAPI.saveSettings(data.settings);
    }

    // Restore project mappings
    if (data.mappings?.app && window.lightTrackAPI.setProjectMappings) {
      await window.lightTrackAPI.setProjectMappings(data.mappings.app);
    }
    if (data.mappings?.url && window.lightTrackAPI.setUrlMappings) {
      await window.lightTrackAPI.setUrlMappings(data.mappings.url);
    }
    if (data.mappings?.jira && window.lightTrackAPI.setJiraMappings) {
      await window.lightTrackAPI.setJiraMappings(data.mappings.jira);
    }
    if (data.mappings?.meeting && window.lightTrackAPI.setMeetingMappings) {
      await window.lightTrackAPI.setMeetingMappings(data.mappings.meeting);
    }

    // Restore tags
    if (data.tags && window.lightTrackAPI.restoreTags) {
      await window.lightTrackAPI.restoreTags(data.tags);
    }

    // Restore projects
    if (data.projects && window.lightTrackAPI.restoreProjects) {
      await window.lightTrackAPI.restoreProjects(data.projects);
    }

    // Restore activity types
    if (data.activityTypes && window.lightTrackAPI.restoreActivityTypes) {
      await window.lightTrackAPI.restoreActivityTypes(data.activityTypes);
    }

    // Restore activities (merge with existing)
    if (data.activities && window.lightTrackAPI.importActivities) {
      await window.lightTrackAPI.importActivities(data.activities);
    }

    if (statusEl) {
      statusEl.textContent = `Restored from backup (${backupData.backupDate?.split('T')[0] || 'unknown date'})`;
    }
    showNotification('Data restored successfully', 'success');

    // Reload settings view
    await loadSettingsView();

    // Reload activities
    await loadActivities();

  } catch (error) {
    console.error('Restore failed:', error);
    if (statusEl) {
      statusEl.textContent = 'Restore failed: ' + error.message;
    }
    showNotification('Restore failed: ' + error.message, 'error');
  }
}

// ============= Calendar Sync Functions =============

/**
 * Load calendar sync settings UI
 */
async function loadCalendarSettings() {
  const calendarUrlInput = document.getElementById('settings-calendar-url');
  const syncBtn = document.getElementById('calendar-sync-btn');
  const statusEl = document.getElementById('calendar-sync-status');
  const helpLink = document.getElementById('calendar-help-link');

  if (!calendarUrlInput || !window.lightTrackAPI?.calendar) return;

  // Load current URL
  try {
    const currentUrl = await window.lightTrackAPI.calendar.getUrl();
    if (currentUrl) {
      calendarUrlInput.value = currentUrl;
    }

    // Show last sync time
    const lastSync = await window.lightTrackAPI.calendar.getLastSyncTime();
    if (lastSync && statusEl) {
      statusEl.style.display = 'block';
      statusEl.textContent = `Last synced: ${new Date(lastSync).toLocaleString()}`;
    }
  } catch (error) {
    console.error('Failed to load calendar settings:', error);
  }

  // Wire up URL change handler
  if (!calendarUrlInput.dataset.wired) {
    calendarUrlInput.dataset.wired = 'true';

    // Save URL on blur (when user leaves the input)
    calendarUrlInput.addEventListener('blur', async () => {
      const url = calendarUrlInput.value.trim();
      if (!url) return;

      statusEl.style.display = 'block';
      statusEl.textContent = 'Saving...';

      try {
        const result = await window.lightTrackAPI.calendar.setUrl(url);
        if (result.success) {
          statusEl.textContent = result.meetingCount !== undefined
            ? `Synced ${result.meetingCount} meetings`
            : 'Calendar URL saved';
          showNotification('Calendar configured', 'success');
          // Refresh upcoming meetings on dashboard
          loadUpcomingMeetings();
        } else {
          statusEl.textContent = `Error: ${result.error}`;
          showNotification(result.error || 'Failed to sync', 'error');
        }
      } catch (error) {
        statusEl.textContent = `Error: ${error.message}`;
        showNotification('Failed to save calendar URL', 'error');
      }
    });
  }

  // Wire up sync button
  if (syncBtn && !syncBtn.dataset.wired) {
    syncBtn.dataset.wired = 'true';
    syncBtn.addEventListener('click', async () => {
      const url = calendarUrlInput.value.trim();

      if (!url) {
        showNotification('Please enter a calendar URL first', 'error');
        return;
      }

      syncBtn.disabled = true;
      syncBtn.textContent = 'Syncing...';
      statusEl.style.display = 'block';
      statusEl.textContent = 'Syncing calendar...';

      try {
        // First save the URL if it changed
        await window.lightTrackAPI.calendar.setUrl(url);
        // Then sync
        const result = await window.lightTrackAPI.calendar.sync();

        if (result.success) {
          statusEl.textContent = `Synced ${result.meetingCount} meetings at ${new Date().toLocaleTimeString()}`;
          showNotification(`Synced ${result.meetingCount} meetings`, 'success');
          // Refresh upcoming meetings on dashboard
          loadUpcomingMeetings();
        } else {
          statusEl.textContent = `Error: ${result.error}`;
          showNotification(result.error || 'Sync failed', 'error');
        }
      } catch (error) {
        statusEl.textContent = `Error: ${error.message}`;
        showNotification('Calendar sync failed', 'error');
      } finally {
        syncBtn.disabled = false;
        syncBtn.textContent = 'Sync Now';
      }
    });
  }

  // Wire up help link
  if (helpLink && !helpLink.dataset.wired) {
    helpLink.dataset.wired = 'true';
    helpLink.addEventListener('click', (e) => {
      e.preventDefault();
      showCalendarHelpModal();
    });
  }
}

/**
 * Load upcoming meetings for dashboard display
 */
async function loadUpcomingMeetings() {
  const card = document.getElementById('upcoming-meetings-card');
  const listEl = document.getElementById('upcoming-meetings-list');
  const infoEl = document.getElementById('calendar-sync-info');

  if (!listEl || !window.lightTrackAPI?.calendar) return;

  try {
    // Get today's meetings
    const meetings = await window.lightTrackAPI.calendar.getTodaysMeetings();

    if (!meetings || meetings.length === 0) {
      // Hide the card if no meetings
      if (card) card.style.display = 'none';
      return;
    }

    // Show the card
    if (card) card.style.display = 'block';

    // Filter to upcoming meetings (not yet ended)
    const now = new Date();
    const upcoming = meetings.filter(m => new Date(m.endTime) > now);

    if (upcoming.length === 0) {
      listEl.innerHTML = '<div class="meta-line">No more meetings today</div>';
    } else {
      listEl.innerHTML = upcoming.slice(0, 4).map(m => {
        const start = new Date(m.startTime);
        const isNow = start <= now && new Date(m.endTime) > now;
        const timeStr = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const durationStr = `${m.duration}m`;

        return `
          <div class="meeting-item">
            <div class="meeting-item-content">
              <div class="meeting-item-title${isNow ? ' is-now' : ''}">${escapeHtml(m.subject)}</div>
              <div class="meeting-item-meta">${timeStr} · ${durationStr}${m.location ? ' · ' + escapeHtml(m.location) : ''}</div>
            </div>
            ${isNow ? '<span class="meeting-item-badge">NOW</span>' : ''}
          </div>
        `;
      }).join('');
    }

    // Show sync info
    if (infoEl) {
      const lastSync = await window.lightTrackAPI.calendar.getLastSyncTime();
      if (lastSync) {
        const syncTime = new Date(lastSync);
        infoEl.textContent = `Synced ${syncTime.toLocaleTimeString()}`;
      }
    }

  } catch (error) {
    console.error('Failed to load upcoming meetings:', error);
    if (card) card.style.display = 'none';
  }
}

/**
 * Show help modal for getting calendar URL
 */
function showCalendarHelpModal() {
  // Remove existing modal if present
  const existingModal = document.getElementById('calendar-help-modal-overlay');
  if (existingModal) {
    existingModal.remove();
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'calendar-help-modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal-small" style="max-width: 500px;">
      <div class="modal-header">
        <h3>How to Get Your Calendar ICS URL</h3>
        <button class="modal-close" id="calendar-help-modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <h4>Outlook Web (Office 365)</h4>
        <ol style="margin-left: 20px; line-height: 1.6;">
          <li>Go to <strong>outlook.office.com</strong></li>
          <li>Click the <strong>Settings</strong> gear icon</li>
          <li>Click <strong>View all Outlook settings</strong></li>
          <li>Go to <strong>Calendar</strong> &gt; <strong>Shared calendars</strong></li>
          <li>Under <strong>Publish a calendar</strong>, select your calendar</li>
          <li>Choose <strong>Can view all details</strong></li>
          <li>Click <strong>Publish</strong></li>
          <li>Copy the <strong>ICS</strong> link</li>
        </ol>

        <h4 style="margin-top: 16px;">Google Calendar</h4>
        <ol style="margin-left: 20px; line-height: 1.6;">
          <li>Go to <strong>calendar.google.com</strong></li>
          <li>Click the three dots next to your calendar</li>
          <li>Select <strong>Settings and sharing</strong></li>
          <li>Scroll to <strong>Integrate calendar</strong></li>
          <li>Copy the <strong>Secret address in iCal format</strong></li>
        </ol>

        <div style="margin-top: 16px; padding: 12px; background: var(--surface-raised); border-radius: 8px;">
          <strong>Privacy Note:</strong> The ICS URL is typically accessible to anyone with the link. Keep it private and do not share it.
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Add active class after a brief delay for animation
  requestAnimationFrame(() => {
    overlay.classList.add('active');
    const modal = overlay.querySelector('.modal');
    if (modal) modal.classList.add('active');
  });

  // Close button handler
  const closeBtn = document.getElementById('calendar-help-modal-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeCalendarHelpModal);
  }

  // Close on overlay click (outside modal)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeCalendarHelpModal();
    }
  });

  // Close on Escape key
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeCalendarHelpModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

/**
 * Close the calendar help modal
 */
function closeCalendarHelpModal() {
  const overlay = document.getElementById('calendar-help-modal-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    const modal = overlay.querySelector('.modal');
    if (modal) modal.classList.remove('active');
    // Remove after animation completes
    setTimeout(() => overlay.remove(), 300);
  }
}

// ============= Snake Game =============

const SnakeGame = {
  canvas: null,
  ctx: null,
  snake: [],
  food: null,
  direction: 'right',
  nextDirection: 'right',
  gridSize: 20,
  tileCount: 20,
  gameLoop: null,
  score: 0,
  highScore: 0,
  isRunning: false,
  isPaused: false,
  speed: 100,

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.loadHighScore();
    this.reset();
  },

  loadHighScore() {
    try {
      const saved = localStorage.getItem('lighttrack-snake-highscore');
      this.highScore = saved ? parseInt(saved, 10) : 0;
    } catch (e) {
      this.highScore = 0;
    }
  },

  saveHighScore() {
    try {
      localStorage.setItem('lighttrack-snake-highscore', this.highScore.toString());
    } catch (e) {
      // Ignore storage errors
    }
  },

  reset() {
    const mid = Math.floor(this.tileCount / 2);
    this.snake = [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid }
    ];
    this.direction = 'right';
    this.nextDirection = 'right';
    this.score = 0;
    this.isPaused = false;
    this.spawnFood();
    this.updateScoreDisplay();
  },

  spawnFood() {
    let newFood;
    do {
      newFood = {
        x: Math.floor(Math.random() * this.tileCount),
        y: Math.floor(Math.random() * this.tileCount)
      };
    } while (this.snake.some(seg => seg.x === newFood.x && seg.y === newFood.y));
    this.food = newFood;
  },

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;
    this.gameLoop = setInterval(() => this.update(), this.speed);
  },

  pause() {
    this.isPaused = !this.isPaused;
    const pauseBtn = document.getElementById('snake-pause-btn');
    if (pauseBtn) {
      pauseBtn.textContent = this.isPaused ? 'Resume' : 'Pause';
    }
  },

  stop() {
    this.isRunning = false;
    if (this.gameLoop) {
      clearInterval(this.gameLoop);
      this.gameLoop = null;
    }
  },

  update() {
    if (this.isPaused) return;

    this.direction = this.nextDirection;

    // Calculate new head position
    const head = { ...this.snake[0] };
    switch (this.direction) {
      case 'up': head.y--; break;
      case 'down': head.y++; break;
      case 'left': head.x--; break;
      case 'right': head.x++; break;
    }

    // Check wall collision
    if (head.x < 0 || head.x >= this.tileCount || head.y < 0 || head.y >= this.tileCount) {
      this.gameOver();
      return;
    }

    // Check self collision
    if (this.snake.some(seg => seg.x === head.x && seg.y === head.y)) {
      this.gameOver();
      return;
    }

    // Add new head
    this.snake.unshift(head);

    // Check food collision
    if (head.x === this.food.x && head.y === this.food.y) {
      this.score += 10;
      if (this.score > this.highScore) {
        this.highScore = this.score;
        this.saveHighScore();
      }
      this.updateScoreDisplay();
      this.spawnFood();
    } else {
      // Remove tail if no food eaten
      this.snake.pop();
    }

    this.draw();
  },

  draw() {
    const tileSize = this.canvas.width / this.tileCount;

    // Clear canvas
    this.ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surface-base').trim() || '#1a1a1a';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw grid (subtle)
    this.ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border-subtle').trim() || '#333';
    this.ctx.lineWidth = 0.5;
    for (let i = 0; i <= this.tileCount; i++) {
      this.ctx.beginPath();
      this.ctx.moveTo(i * tileSize, 0);
      this.ctx.lineTo(i * tileSize, this.canvas.height);
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.moveTo(0, i * tileSize);
      this.ctx.lineTo(this.canvas.width, i * tileSize);
      this.ctx.stroke();
    }

    // Draw food
    this.ctx.fillStyle = '#e74c3c';
    this.ctx.beginPath();
    this.ctx.arc(
      this.food.x * tileSize + tileSize / 2,
      this.food.y * tileSize + tileSize / 2,
      tileSize / 2 - 2,
      0,
      Math.PI * 2
    );
    this.ctx.fill();

    // Draw snake
    this.snake.forEach((seg, i) => {
      const isHead = i === 0;
      this.ctx.fillStyle = isHead ? '#27ae60' : '#2ecc71';
      this.ctx.fillRect(
        seg.x * tileSize + 1,
        seg.y * tileSize + 1,
        tileSize - 2,
        tileSize - 2
      );
      // Add slight rounding
      this.ctx.strokeStyle = '#27ae60';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(
        seg.x * tileSize + 1,
        seg.y * tileSize + 1,
        tileSize - 2,
        tileSize - 2
      );
    });
  },

  updateScoreDisplay() {
    const scoreEl = document.getElementById('snake-score');
    const highScoreEl = document.getElementById('snake-highscore');
    if (scoreEl) scoreEl.textContent = this.score;
    if (highScoreEl) highScoreEl.textContent = this.highScore;
  },

  gameOver() {
    this.stop();
    const gameOverEl = document.getElementById('snake-game-over');
    const finalScoreEl = document.getElementById('snake-final-score');
    if (gameOverEl) gameOverEl.style.display = 'flex';
    if (finalScoreEl) finalScoreEl.textContent = this.score;
  },

  handleKeydown(e) {
    if (!this.isRunning || this.isPaused) return;

    const keyMap = {
      'ArrowUp': 'up',
      'ArrowDown': 'down',
      'ArrowLeft': 'left',
      'ArrowRight': 'right',
      'w': 'up',
      's': 'down',
      'a': 'left',
      'd': 'right'
    };

    const newDir = keyMap[e.key];
    if (!newDir) return;

    // Prevent reverse direction
    const opposites = { up: 'down', down: 'up', left: 'right', right: 'left' };
    if (opposites[newDir] !== this.direction) {
      this.nextDirection = newDir;
      e.preventDefault();
    }
  }
};

/**
 * Open the Snake game modal
 */
function openSnakeGame() {
  // Remove existing modal if present
  const existingModal = document.getElementById('snake-modal-overlay');
  if (existingModal) {
    existingModal.remove();
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'snake-modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width: 480px; width: 100%;">
      <div class="modal-header">
        <h3>🐍 Snake - Take a Break!</h3>
        <button class="modal-close" id="snake-modal-close">&times;</button>
      </div>
      <div class="modal-body" style="padding: 16px; text-align: center;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px;">
          <span>Score: <strong id="snake-score">0</strong></span>
          <span>High Score: <strong id="snake-highscore">0</strong></span>
        </div>
        <div style="position: relative; display: inline-block;">
          <canvas id="snake-canvas" width="400" height="400" style="border: 2px solid var(--border-default); border-radius: 8px; display: block;"></canvas>
          <div id="snake-game-over" style="display: none; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); border-radius: 8px; flex-direction: column; align-items: center; justify-content: center; color: white;">
            <div style="font-size: 24px; font-weight: bold; margin-bottom: 8px;">Game Over!</div>
            <div style="margin-bottom: 16px;">Final Score: <strong id="snake-final-score">0</strong></div>
            <button class="solid primary" id="snake-restart-btn">Play Again</button>
          </div>
        </div>
        <div style="margin-top: 12px; display: flex; gap: 8px; justify-content: center;">
          <button class="solid primary" id="snake-start-btn">Start</button>
          <button class="ghost" id="snake-pause-btn" disabled>Pause</button>
        </div>
        <div style="margin-top: 12px; font-size: 12px; color: var(--ink-muted);">
          Use arrow keys or WASD to move
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Add active class after a brief delay for animation
  requestAnimationFrame(() => {
    overlay.classList.add('active');
    const modal = overlay.querySelector('.modal');
    if (modal) modal.classList.add('active');
  });

  // Initialize game
  const canvas = document.getElementById('snake-canvas');
  SnakeGame.init(canvas);
  SnakeGame.draw();

  // Button handlers
  const closeBtn = document.getElementById('snake-modal-close');
  const startBtn = document.getElementById('snake-start-btn');
  const pauseBtn = document.getElementById('snake-pause-btn');
  const restartBtn = document.getElementById('snake-restart-btn');

  if (closeBtn) {
    closeBtn.addEventListener('click', closeSnakeGame);
  }

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      SnakeGame.start();
      startBtn.disabled = true;
      pauseBtn.disabled = false;
    });
  }

  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      SnakeGame.pause();
    });
  }

  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      const gameOverEl = document.getElementById('snake-game-over');
      if (gameOverEl) gameOverEl.style.display = 'none';
      SnakeGame.reset();
      SnakeGame.draw();
      SnakeGame.start();
      startBtn.disabled = true;
      pauseBtn.disabled = false;
      pauseBtn.textContent = 'Pause';
    });
  }

  // Keyboard handler
  const keyHandler = (e) => {
    if (e.key === 'Escape') {
      closeSnakeGame();
    } else if (e.key === ' ') {
      e.preventDefault();
      if (SnakeGame.isRunning) {
        SnakeGame.pause();
      }
    } else {
      SnakeGame.handleKeydown(e);
    }
  };
  document.addEventListener('keydown', keyHandler);

  // Store handler for cleanup
  overlay.keyHandler = keyHandler;

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeSnakeGame();
    }
  });
}

/**
 * Close the Snake game modal
 */
function closeSnakeGame() {
  const overlay = document.getElementById('snake-modal-overlay');
  if (overlay) {
    SnakeGame.stop();
    if (overlay.keyHandler) {
      document.removeEventListener('keydown', overlay.keyHandler);
    }
    overlay.classList.remove('active');
    const modal = overlay.querySelector('.modal');
    if (modal) modal.classList.remove('active');
    setTimeout(() => overlay.remove(), 300);
  }
}

// ============= Modal Functions =============

/**
 * Add ESC key handler to close a modal
 * @param {string} overlayId - ID of the modal overlay element
 * @param {Function} closeFunction - Function to call when ESC is pressed
 * @returns {Function} The ESC handler function (for cleanup)
 */
function addModalEscHandler(overlayId, closeFunction) {
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeFunction();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  // Store handler on overlay for cleanup
  const overlay = document.getElementById(overlayId);
  if (overlay) overlay._escHandler = escHandler;
  return escHandler;
}

/**
 * Remove ESC key handler from a modal
 * @param {string} overlayId - ID of the modal overlay element
 */
function removeModalEscHandler(overlayId) {
  const overlay = document.getElementById(overlayId);
  if (overlay?._escHandler) {
    document.removeEventListener('keydown', overlay._escHandler);
    delete overlay._escHandler;
  }
}

/**
 * Open manual entry modal (new entry)
 * @param {string} [dateOverride] - Optional date to pre-fill (YYYY-MM-DD format)
 */
function openManualEntryModal(dateOverride) {
  AppState.editingActivityId = null;
  if (Elements.modalTitle) Elements.modalTitle.textContent = 'Add Manual Entry';
  if (Elements.editActivityId) Elements.editActivityId.value = '';

  // Set defaults
  const now = new Date();
  const timeStr = now.toTimeString().slice(0, 5);
  if (Elements.entryProject) Elements.entryProject.value = AppState.settings.defaultProject;
  if (Elements.entryApp) Elements.entryApp.value = '';
  if (Elements.entryStart) Elements.entryStart.value = timeStr;
  if (Elements.entryEnd) Elements.entryEnd.value = timeStr;
  if (Elements.entryDate) Elements.entryDate.value = dateOverride || AppState.filterDate;
  if (Elements.entryBillable) Elements.entryBillable.checked = true;

  if (Elements.modalOverlay) Elements.modalOverlay.classList.add('active');
  addModalEscHandler('modal-overlay', closeModal);
}

/**
 * Open edit modal for existing activity
 */
function openEditModal(activityId) {
  // Convert to string to handle both string and number IDs
  const id = String(activityId);
  const activity = AppState.activities.find(a => String(a.id) === id);
  if (!activity) {
    console.error('Activity not found:', activityId, 'Available IDs:', AppState.activities.map(a => a.id));
    showNotification('Activity not found', 'error');
    return;
  }

  AppState.editingActivityId = activityId;
  if (Elements.modalTitle) Elements.modalTitle.textContent = 'Edit Entry';
  if (Elements.editActivityId) Elements.editActivityId.value = activityId;

  // Find and display matched rule
  findAndDisplayMatchedRule(activity);

  // Populate form with activity data
  if (Elements.entryProject) Elements.entryProject.value = activity.project || 'General';
  if (Elements.entryApp) Elements.entryApp.value = activity.app || activity.title || '';

  // Parse times
  if (activity.startTime) {
    const start = new Date(activity.startTime);
    if (Elements.entryStart) Elements.entryStart.value = start.toTimeString().slice(0, 5);
    if (Elements.entryDate) Elements.entryDate.value = start.toISOString().split('T')[0];
  }
  if (activity.endTime) {
    const end = new Date(activity.endTime);
    if (Elements.entryEnd) Elements.entryEnd.value = end.toTimeString().slice(0, 5);
  }

  if (Elements.entryBillable) Elements.entryBillable.checked = activity.billable !== false;

  if (Elements.modalOverlay) Elements.modalOverlay.classList.add('active');
  addModalEscHandler('modal-overlay', closeModal);
}

/**
 * Close the entry modal
 */
function closeModal() {
  removeModalEscHandler('modal-overlay');
  if (Elements.modalOverlay) Elements.modalOverlay.classList.remove('active');
  AppState.editingActivityId = null;
}

/**
 * Save activity (new or edited)
 */
async function saveActivity() {
  if (!window.lightTrackAPI) {
    showNotification('API not available', 'error');
    return;
  }

  const project = Elements.entryProject?.value || AppState.settings.defaultProject;
  const app = Elements.entryApp?.value || 'Manual entry';
  const startTime = Elements.entryStart?.value;
  const endTime = Elements.entryEnd?.value;
  const date = Elements.entryDate?.value || AppState.filterDate;
  const billable = Elements.entryBillable?.checked ?? true;

  if (!startTime || !endTime) {
    showNotification('Please enter start and end times', 'error');
    return;
  }

  // Build full timestamps
  const startDateTime = new Date(`${date}T${startTime}:00`);
  const endDateTime = new Date(`${date}T${endTime}:00`);

  if (endDateTime <= startDateTime) {
    showNotification('End time must be after start time', 'error');
    return;
  }

  const duration = Math.floor((endDateTime - startDateTime) / 1000);

  try {
    if (AppState.editingActivityId) {
      // Update existing
      await window.lightTrackAPI.updateActivity(AppState.editingActivityId, {
        project,
        app,
        title: app,
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        duration,
        billable
      });
      showNotification('Entry updated', 'success');
    } else {
      // Create new
      await window.lightTrackAPI.addManualEntry({
        project,
        app,
        title: app,
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        duration,
        billable,
        isManual: true
      });
      showNotification('Entry added', 'success');
    }

    invalidateAnalyticsCache(); // Clear cache so analytics refreshes
    closeModal();
    loadActivities();
  } catch (error) {
    console.error('Failed to save activity:', error);
    showNotification('Failed to save: ' + error.message, 'error');
  }
}

/**
 * Open delete confirmation modal
 */
function openDeleteModal(activityId) {
  if (Elements.deleteActivityId) Elements.deleteActivityId.value = activityId;
  if (Elements.deleteModalOverlay) Elements.deleteModalOverlay.classList.add('active');
  addModalEscHandler('delete-modal-overlay', closeDeleteModal);
}

/**
 * Close delete modal
 */
function closeDeleteModal() {
  removeModalEscHandler('delete-modal-overlay');
  if (Elements.deleteModalOverlay) Elements.deleteModalOverlay.classList.remove('active');
}

/**
 * Confirm and execute delete
 */
async function confirmDelete() {
  const activityId = Elements.deleteActivityId?.value;
  if (!activityId) {
    closeDeleteModal();
    return;
  }

  try {
    if (!window.lightTrackAPI) throw new Error('API not available');

    await window.lightTrackAPI.deleteActivity(activityId);
    showNotification('Entry deleted', 'success');
    invalidateAnalyticsCache(); // Clear cache so analytics refreshes
    closeDeleteModal();
    loadActivities();
  } catch (error) {
    console.error('Failed to delete activity:', error);
    showNotification('Failed to delete: ' + error.message, 'error');
  }
}

// ============= Clear Data Modal =============

/**
 * Open clear data confirmation modal
 */
async function openClearDataModal() {
  // Get count of activities to be deleted
  try {
    const activities = await window.lightTrackAPI.getActivities() || [];
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const oldActivities = activities.filter(a => {
      const date = new Date(a.timestamp || a.startTime);
      return date < cutoffDate;
    });
    if (Elements.clearDataCount) {
      Elements.clearDataCount.textContent = `${oldActivities.length} activities will be deleted.`;
    }
  } catch (error) {
    if (Elements.clearDataCount) {
      Elements.clearDataCount.textContent = '';
    }
  }
  if (Elements.clearDataModalOverlay) {
    Elements.clearDataModalOverlay.classList.add('active');
    addModalEscHandler('clear-data-modal-overlay', closeClearDataModal);
  }
}

/**
 * Close clear data modal
 */
function closeClearDataModal() {
  removeModalEscHandler('clear-data-modal-overlay');
  if (Elements.clearDataModalOverlay) Elements.clearDataModalOverlay.classList.remove('active');
}

/**
 * Confirm and execute clear data
 */
async function confirmClearData() {
  try {
    await window.lightTrackAPI.clearOldActivities(30);
    showNotification('Old data cleared', 'success');
    closeClearDataModal();
    loadSettingsView();
    loadActivities();
  } catch (error) {
    console.error('Failed to clear data:', error);
    showNotification('Failed to clear data', 'error');
  }
}

// ============= Tag System =============

/**
 * Load tags from backend and render in sidebar
 */
async function loadTags() {
  try {
    if (!window.lightTrackAPI?.getTags) {
      console.warn('Tags API not available');
      return;
    }

    // Fetch all tags and used tags
    const [tagsResult, usedTags] = await Promise.all([
      window.lightTrackAPI.getTags(),
      window.lightTrackAPI.getUsedTags()
    ]);

    AppState.tags = {
      system: tagsResult.system || [],
      custom: tagsResult.custom || [],
      all: tagsResult.all || [],
      used: usedTags || []
    };

    renderTagPills();
  } catch (error) {
    console.error('Failed to load tags:', error);
  }
}

/**
 * Render tag pills in the sidebar filter section
 */
function renderTagPills() {
  const container = document.getElementById('tag-filter-pills');
  if (!container) return;
  if (!container) return;

  // Combine all available tags, prioritize used tags
  const allTags = [...new Set([...AppState.tags.used, ...AppState.tags.all])];

  if (allTags.length === 0) {
    container.innerHTML = '<span class="meta-line">No tags yet</span>';
    return;
  }

  container.innerHTML = allTags.map(tag => {
    const isActive = AppState.filters.tags.includes(tag);
    const isSystem = AppState.tags.system.includes(tag);
    const tagClass = isSystem ? 'system' : 'custom';
    const activeClass = isActive ? 'active' : '';
    const count = getTagCount(tag);

    return `
      <button class="pill tag-pill ${tagClass} ${activeClass}" data-tag="${escapeAttr(tag)}">
        ${escapeHtml(tag)}
        ${count > 0 ? `<span class="tag-count">${count}</span>` : ''}
      </button>
    `;
  }).join('');

  // Attach click handlers
  container.querySelectorAll('.tag-pill').forEach(pill => {
    pill.addEventListener('click', () => toggleTagFilter(pill.dataset.tag));
  });
}

/**
 * Get count of activities with a specific tag
 */
function getTagCount(tagName) {
  return AppState.activities.filter(a =>
    a.tags && a.tags.includes(tagName)
  ).length;
}

/**
 * Toggle a tag in the filter selection (multi-select)
 */
function toggleTagFilter(tagName) {
  const idx = AppState.filters.tags.indexOf(tagName);
  if (idx >= 0) {
    AppState.filters.tags.splice(idx, 1);
  } else {
    AppState.filters.tags.push(tagName);
  }

  renderTagPills();
  applyFilters();
}

/**
 * Clear all tag filters
 */
function clearTagFilters() {
  AppState.filters.tags = [];
  renderTagPills();
  applyFilters();
}

/**
 * Apply all filters (date, project, billable, tags) to activities
 */
function applyFilters() {
  let filtered = [...AppState.activities];

  // Apply tag filter (if any tags selected)
  if (AppState.filters.tags.length > 0) {
    filtered = filtered.filter(activity => {
      if (!activity.tags || activity.tags.length === 0) return false;
      // Match any selected tag (OR logic)
      return AppState.filters.tags.some(tag => activity.tags.includes(tag));
    });
  }

  // Apply billable filter (check both field names for compatibility)
  if (AppState.filters.billable !== null) {
    filtered = filtered.filter(a =>
      (a.billable !== false) === AppState.filters.billable
    );
  }

  // Apply project filter
  if (AppState.filters.project !== 'all') {
    filtered = filtered.filter(a =>
      (a.project || 'General') === AppState.filters.project
    );
  }

  AppState.filteredActivities = filtered;
  renderFilteredActivityList();
  updateFilteredStats();
}

/**
 * Render activity list with current filters applied
 */
function renderFilteredActivityList() {
  if (!Elements.activityList) return;

  const activities = AppState.filters.tags.length > 0 ||
                     AppState.filters.billable !== null ||
                     AppState.filters.project !== 'all'
    ? AppState.filteredActivities
    : AppState.activities;

  if (activities.length === 0) {
    const hasFilters = AppState.filters.tags.length > 0 ||
                       AppState.filters.billable !== null ||
                       AppState.filters.project !== 'all';

    Elements.activityList.innerHTML = `
      <div class="empty-state">
        <div class="icon">${hasFilters ? '🔍' : '📋'}</div>
        <div>${hasFilters ? 'No activities match filters' : 'No activities yet today'}</div>
        <div class="meta-line">${hasFilters ? 'Try adjusting your filters' : 'Start tracking to see your activity feed'}</div>
      </div>
    `;
    return;
  }

  // Sort by start time, most recent first
  const sorted = [...activities].sort((a, b) => {
    return new Date(b.startTime || 0) - new Date(a.startTime || 0);
  });

  // Take latest 10
  const recent = sorted.slice(0, 10);

  Elements.activityList.innerHTML = recent.map(activity => {
    const title = activity.title || activity.app || 'Unknown';
    const app = activity.app || '--';
    const project = activity.project || 'General';
    const duration = formatDuration(activity.duration || 0);
    const startTime = activity.startTime ? new Date(activity.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';
    const endTime = activity.endTime ? new Date(activity.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';
    const activityId = escapeHtml(String(activity.id));

    // Render activity tags
    const tagsHtml = renderActivityTags(activity);

    return `
      <div class="activity" data-id="${activityId}">
        <div>
          <div class="title">${escapeHtml(title)}</div>
          <div class="meta-line">
            <span>${escapeHtml(app)}</span>
            <span>• ${escapeHtml(project)}</span>
            <span>• ${startTime}–${endTime}</span>
          </div>
          ${tagsHtml}
        </div>
        <div class="activity-actions">
          <button class="btn-edit" data-id="${activityId}">Edit</button>
          <button class="btn-tags btn-small" data-id="${activityId}" title="Edit tags">Tags</button>
          <button class="btn-delete delete" data-id="${activityId}">Delete</button>
        </div>
        <div class="duration">${duration}</div>
      </div>
    `;
  }).join('');

  // Attach event listeners
  attachActivityListeners();
}

/**
 * Render tags for an activity item
 */
function renderActivityTags(activity) {
  if (!activity.tags || activity.tags.length === 0) return '';

  const tagsHtml = activity.tags.map(tag => {
    const isSystem = AppState.tags.system.includes(tag);
    const tagClass = isSystem ? 'system' : 'custom';
    return `<span class="activity-tag ${tagClass}">${escapeHtml(tag)}</span>`;
  }).join('');

  return `<div class="activity-tags">${tagsHtml}</div>`;
}

/**
 * Update stats when filters are applied
 */
function updateFilteredStats() {
  const activities = AppState.filters.tags.length > 0 ||
                     AppState.filters.billable !== null ||
                     AppState.filters.project !== 'all'
    ? AppState.filteredActivities
    : AppState.activities;

  // Update filtered count indicator if present
  const filterIndicator = document.getElementById('filter-indicator');
  if (filterIndicator) {
    const totalCount = AppState.activities.length;
    const filteredCount = activities.length;
    if (filteredCount < totalCount) {
      filterIndicator.textContent = `Showing ${filteredCount} of ${totalCount}`;
      filterIndicator.style.display = 'block';
    } else {
      filterIndicator.style.display = 'none';
    }
  }
}

// ============= Tag Editor =============

/**
 * Open tag editor dropdown for an activity
 */
function openTagEditor(activityId) {
  // Close any existing editor
  closeTagEditor();

  // Convert to string to handle both string and number IDs
  const id = String(activityId);
  const activity = AppState.activities.find(a => String(a.id) === id);
  if (!activity) {
    console.error('Activity not found for tags:', activityId);
    showNotification('Activity not found', 'error');
    return;
  }

  const activityEl = document.querySelector(`.activity[data-id="${activityId}"]`);
  if (!activityEl) return;

  // Create tag editor dropdown
  const editor = document.createElement('div');
  editor.className = 'tag-editor-dropdown';
  editor.id = 'tag-editor';
  editor.dataset.activityId = activityId;

  const currentTags = activity.tags || [];
  const allTags = [...new Set([...AppState.tags.all, ...AppState.tags.used])];

  editor.innerHTML = `
    <div class="tag-editor-header">
      <span>Edit Tags</span>
      <button onclick="closeTagEditor()" class="tag-editor-close">×</button>
    </div>
    <div class="tag-editor-list">
      ${allTags.map(tag => {
        const isChecked = currentTags.includes(tag);
        const isSystem = AppState.tags.system.includes(tag);
        return `
          <label class="tag-editor-item ${isSystem ? 'system' : 'custom'}">
            <input type="checkbox" value="${escapeHtml(tag)}" ${isChecked ? 'checked' : ''}>
            <span>${escapeHtml(tag)}</span>
          </label>
        `;
      }).join('')}
    </div>
    <div class="tag-editor-actions">
      <input type="text" id="new-tag-input" placeholder="Add new tag..." class="tag-editor-input">
      <button onclick="addNewTag('${activityId}')" class="btn-small">Add</button>
    </div>
    <div class="tag-editor-footer">
      <button onclick="saveActivityTags('${activityId}')" class="btn-small primary">Save</button>
    </div>
  `;

  activityEl.appendChild(editor);

  // Handle enter key in new tag input
  const newTagInput = editor.querySelector('#new-tag-input');
  if (newTagInput) {
    newTagInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addNewTag(activityId);
      }
    });
    newTagInput.focus();
  }
}

/**
 * Close tag editor dropdown
 */
function closeTagEditor() {
  const existing = document.getElementById('tag-editor');
  if (existing) {
    existing.remove();
  }
}

/**
 * Add a new custom tag
 */
async function addNewTag(activityId) {
  const input = document.getElementById('new-tag-input');
  const tagName = input?.value?.trim().toLowerCase();

  if (!tagName) return;

  // Validate tag name
  if (tagName.length < 2 || tagName.length > 30) {
    showNotification('Tag must be 2-30 characters', 'error');
    return;
  }

  if (!/^[a-z0-9-]+$/.test(tagName)) {
    showNotification('Tags can only contain letters, numbers, and hyphens', 'error');
    return;
  }

  try {
    // Add to custom tags if not already present
    if (!AppState.tags.all.includes(tagName)) {
      await window.lightTrackAPI.addTag(tagName);
      AppState.tags.custom.push(tagName);
      AppState.tags.all.push(tagName);
    }

    // Add checkbox for the new tag in the editor
    const editor = document.getElementById('tag-editor');
    const list = editor?.querySelector('.tag-editor-list');
    if (list && !list.querySelector(`input[value="${tagName}"]`)) {
      const label = document.createElement('label');
      label.className = 'tag-editor-item custom';
      label.innerHTML = `
        <input type="checkbox" value="${escapeHtml(tagName)}" checked>
        <span>${escapeHtml(tagName)}</span>
      `;
      list.appendChild(label);
    }

    // Clear input
    if (input) input.value = '';

  } catch (error) {
    console.error('Failed to add tag:', error);
    showNotification('Failed to add tag', 'error');
  }
}

/**
 * Save tags for an activity
 */
async function saveActivityTags(activityId) {
  const editor = document.getElementById('tag-editor');
  if (!editor) return;

  const checkboxes = editor.querySelectorAll('.tag-editor-list input[type="checkbox"]');
  const selectedTags = Array.from(checkboxes)
    .filter(cb => cb.checked)
    .map(cb => cb.value);

  try {
    await window.lightTrackAPI.updateActivityTags(activityId, selectedTags);

    // Update local state
    const id = String(activityId);
    const activity = AppState.activities.find(a => String(a.id) === id);
    if (activity) {
      activity.tags = selectedTags;
    }

    invalidateAnalyticsCache(); // Clear cache so analytics refreshes
    closeTagEditor();
    renderTagPills(); // Refresh tag counts
    applyFilters(); // Re-render activity list
    showNotification('Tags updated', 'success');

  } catch (error) {
    console.error('Failed to save activity tags:', error);
    showNotification('Failed to save tags', 'error');
  }
}

// ============= Tag Manager (Settings) =============

/**
 * Load tag manager in settings view
 */
async function loadTagManager() {
  const container = document.getElementById('tag-manager');
  if (!container) return;

  await loadTags();

  const customTags = AppState.tags.custom || [];
  const systemTags = AppState.tags.system || [];

  container.innerHTML = `
    <div class="tag-manager-section">
      <h4>System Tags</h4>
      <div class="tag-manager-list system">
        ${systemTags.map(tag => `
          <span class="tag-manager-item system">${escapeHtml(tag)}</span>
        `).join('')}
      </div>
      <p class="meta-line">System tags are auto-detected from activity titles</p>
    </div>
    <div class="tag-manager-section">
      <h4>Custom Tags</h4>
      <div class="tag-manager-list custom" id="custom-tags-list">
        ${customTags.length === 0 ? '<span class="meta-line">No custom tags yet</span>' :
          customTags.map(tag => `
            <span class="tag-manager-item custom">
              ${escapeHtml(tag)}
              <button data-action="remove-tag" data-tag="${escapeAttr(tag)}" title="Remove tag">×</button>
            </span>
          `).join('')}
      </div>
      <div class="tag-manager-add">
        <input type="text" id="new-custom-tag" placeholder="New tag name...">
        <button data-action="add-tag" class="btn-small">Add Tag</button>
      </div>
    </div>
  `;

  // Event delegation for tag actions
  container.addEventListener('click', (e) => {
    const action = e.target.dataset.action;
    if (action === 'remove-tag') {
      const tag = e.target.dataset.tag;
      if (tag) removeCustomTag(tag);
    } else if (action === 'add-tag') {
      addCustomTag();
    }
  });

  // Handle enter key
  const input = container.querySelector('#new-custom-tag');
  if (input) {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addCustomTag();
      }
    });
  }
}

/**
 * Add a custom tag via the tag manager
 */
async function addCustomTag() {
  const input = document.getElementById('new-custom-tag');
  const tagName = input?.value?.trim().toLowerCase();

  if (!tagName) return;

  if (tagName.length < 2 || tagName.length > 30) {
    showNotification('Tag must be 2-30 characters', 'error');
    return;
  }

  if (!/^[a-z0-9-]+$/.test(tagName)) {
    showNotification('Tags can only contain letters, numbers, and hyphens', 'error');
    return;
  }

  if (AppState.tags.all.includes(tagName)) {
    showNotification('Tag already exists', 'error');
    return;
  }

  try {
    await window.lightTrackAPI.addTag(tagName);
    showNotification(`Tag "${tagName}" added`, 'success');
    await loadTagManager();
    renderTagPills();
  } catch (error) {
    console.error('Failed to add tag:', error);
    showNotification('Failed to add tag', 'error');
  }
}

/**
 * Remove a custom tag
 */
async function removeCustomTag(tagName) {
  if (!confirm(`Remove tag "${tagName}"? This won't remove it from existing activities.`)) {
    return;
  }

  try {
    await window.lightTrackAPI.removeTag(tagName);
    showNotification(`Tag "${tagName}" removed`, 'success');
    await loadTagManager();
    renderTagPills();
  } catch (error) {
    console.error('Failed to remove tag:', error);
    showNotification('Failed to remove tag', 'error');
  }
}

// ============= Project Management Functions =============

/**
 * Load projects from storage
 */
async function loadProjects() {
  try {
    if (!window.lightTrackAPI?.getProjects) return;

    const projectsResult = await window.lightTrackAPI.getProjects();

    AppState.projects = {
      system: projectsResult.system || [],
      custom: projectsResult.custom || [],
      all: projectsResult.all || []
    };
  } catch (error) {
    console.error('Failed to load projects:', error);
  }
}

/**
 * Load project manager in settings view
 */
async function loadProjectManager() {
  const container = document.getElementById('project-manager');
  if (!container) return;

  await loadProjects();

  const systemProjects = AppState.projects.system || [];
  const customProjects = AppState.projects.custom || [];

  container.innerHTML = `
    <div class="tag-manager-section">
      <h4>System Projects</h4>
      <div class="tag-manager-list system">
        ${systemProjects.map(project => `
          <span class="tag-manager-item system" title="SAP: ${escapeHtml(project.sapCode || 'Not set')}">${escapeHtml(project.name)}</span>
        `).join('')}
      </div>
      <p class="meta-line">System projects cannot be removed</p>
    </div>
    <div class="tag-manager-section">
      <h4>Custom Projects</h4>
      <div class="project-list" id="custom-projects-list">
        ${customProjects.length === 0 ? '<span class="meta-line">No custom projects yet</span>' :
          customProjects.map(project => `
            <div class="project-list-item">
              <div class="project-info">
                <span class="project-name">${escapeHtml(project.name)}</span>
                <span class="project-sap-info">
                  ${project.sapCode ? `SAP: ${escapeHtml(project.sapCode)}` : ''}
                  ${project.costCenter ? ` | CC: ${escapeHtml(project.costCenter)}` : ''}
                  ${project.wbsElement ? ` | WBS: ${escapeHtml(project.wbsElement)}` : ''}
                </span>
              </div>
              <div class="project-actions">
                <button data-action="edit-project" data-project-id="${escapeHtml(project.id)}" class="btn-small ghost" title="Edit project">Edit</button>
                <button data-action="remove-project" data-project-id="${escapeHtml(project.id)}" class="btn-small ghost" title="Remove project">&times;</button>
              </div>
            </div>
          `).join('')}
      </div>
    </div>
    <div class="tag-manager-section">
      <h4>Add New Project</h4>
      <div class="project-form">
        <div class="project-form-row">
          <input type="text" id="new-project-name" placeholder="Project name *" style="flex: 2;">
          <input type="text" id="new-project-sap" placeholder="SAP Code">
        </div>
        <div class="project-form-row">
          <input type="text" id="new-project-cc" placeholder="Cost Center">
          <input type="text" id="new-project-wbs" placeholder="WBS Element">
        </div>
        <button data-action="add-project" class="solid primary">Add Project</button>
      </div>
    </div>
  `;

  if (!container.dataset.wired) {
    container.dataset.wired = 'true';
    // Event delegation for project actions
    container.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      const projectId = e.target.dataset.projectId;
      if (action === 'edit-project' && projectId) {
        editProject(projectId);
      } else if (action === 'remove-project' && projectId) {
        removeCustomProject(projectId);
      } else if (action === 'add-project') {
        addCustomProject();
      }
    });

    // Handle enter key on name field
    container.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && e.target && e.target.id === 'new-project-name') {
        e.preventDefault();
        addCustomProject();
      }
    });
  }
}

/**
 * Add a custom project via the project manager
 */
async function addCustomProject() {
  const nameInput = document.getElementById('new-project-name');
  const sapInput = document.getElementById('new-project-sap');
  const ccInput = document.getElementById('new-project-cc');
  const wbsInput = document.getElementById('new-project-wbs');

  const projectName = nameInput?.value?.trim();

  if (!projectName) {
    showNotification('Project name is required', 'error');
    return;
  }

  if (projectName.length < 2 || projectName.length > 50) {
    showNotification('Project name must be 2-50 characters', 'error');
    return;
  }

  // Check for duplicates
  if (AppState.projects.all.some(p => p.name.toLowerCase() === projectName.toLowerCase())) {
    showNotification('A project with this name already exists', 'error');
    return;
  }

  try {
    await window.lightTrackAPI.addProject({
      name: projectName,
      sapCode: sapInput?.value?.trim() || '',
      costCenter: ccInput?.value?.trim() || '',
      wbsElement: wbsInput?.value?.trim() || ''
    });
    showNotification(`Project "${projectName}" added`, 'success');

    // Clear inputs
    if (nameInput) nameInput.value = '';
    if (sapInput) sapInput.value = '';
    if (ccInput) ccInput.value = '';
    if (wbsInput) wbsInput.value = '';

    await loadProjectManager();
  } catch (error) {
    console.error('Failed to add project:', error);
    showNotification('Failed to add project', 'error');
  }
}

/**
 * Edit a project (opens inline editing)
 */
async function editProject(projectId) {
  const project = AppState.projects.all.find(p => p.id === projectId);
  if (!project) {
    showNotification('Project not found', 'error');
    return;
  }

  // For simplicity, use prompts for editing
  const newName = project.isSystem ? project.name : prompt('Project name:', project.name);
  if (newName === null) return; // Cancelled

  const newSap = prompt('SAP Code:', project.sapCode || '');
  if (newSap === null) return;

  const newCc = prompt('Cost Center:', project.costCenter || '');
  if (newCc === null) return;

  const newWbs = prompt('WBS Element:', project.wbsElement || '');
  if (newWbs === null) return;

  try {
    await window.lightTrackAPI.updateProject(projectId, {
      name: newName,
      sapCode: newSap,
      costCenter: newCc,
      wbsElement: newWbs
    });
    showNotification('Project updated', 'success');
    await loadProjectManager();
  } catch (error) {
    console.error('Failed to update project:', error);
    showNotification('Failed to update project', 'error');
  }
}

/**
 * Remove a custom project
 */
async function removeCustomProject(projectId) {
  const project = AppState.projects.custom.find(p => p.id === projectId);
  if (!project) {
    showNotification('Project not found or is a system project', 'error');
    return;
  }

  if (!confirm(`Remove project "${project.name}"? This won't affect existing activities.`)) {
    return;
  }

  try {
    await window.lightTrackAPI.removeProject(projectId);
    showNotification(`Project "${project.name}" removed`, 'success');
    await loadProjectManager();
  } catch (error) {
    console.error('Failed to remove project:', error);
    showNotification('Failed to remove project', 'error');
  }
}

// ============= Activity Type Management Functions =============

/**
 * Load activity types from storage
 */
async function loadActivityTypes() {
  try {
    if (!window.lightTrackAPI?.getActivityTypes) return;

    const typesResult = await window.lightTrackAPI.getActivityTypes();

    AppState.activityTypes = {
      system: typesResult.system || [],
      custom: typesResult.custom || [],
      all: typesResult.all || []
    };
  } catch (error) {
    console.error('Failed to load activity types:', error);
  }
}

/**
 * Load activity type manager in settings view
 */
async function loadActivityTypeManager() {
  const container = document.getElementById('activity-type-manager');
  if (!container) return;

  await loadActivityTypes();

  const systemTypes = AppState.activityTypes.system || [];
  const customTypes = AppState.activityTypes.custom || [];

  container.innerHTML = `
    <div class="tag-manager-section">
      <h4>System Types</h4>
      <div class="tag-manager-list system">
        ${systemTypes.map(type => `
          <span class="tag-manager-item system">${escapeHtml(type.name)}</span>
        `).join('')}
      </div>
      <p class="meta-line">System activity types cannot be removed</p>
    </div>
    <div class="tag-manager-section">
      <h4>Custom Types</h4>
      <div class="tag-manager-list custom" id="custom-activity-types-list">
        ${customTypes.length === 0 ? '<span class="meta-line">No custom activity types yet</span>' :
          customTypes.map(type => `
            <span class="tag-manager-item custom">
              ${escapeHtml(type.name)}
              <button data-action="remove-activity-type" data-type-id="${escapeHtml(type.id)}" title="Remove activity type">&times;</button>
            </span>
          `).join('')}
      </div>
      <div class="tag-manager-add">
        <input type="text" id="new-activity-type" placeholder="New activity type...">
        <button data-action="add-activity-type" class="btn-small">Add Type</button>
      </div>
    </div>
  `;

  // Event delegation for activity type actions
  container.addEventListener('click', (e) => {
    const action = e.target.dataset.action;
    if (action === 'remove-activity-type') {
      const typeId = e.target.dataset.typeId;
      if (typeId) removeCustomActivityType(typeId);
    } else if (action === 'add-activity-type') {
      addCustomActivityType();
    }
  });

  // Handle enter key
  const input = container.querySelector('#new-activity-type');
  if (input) {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addCustomActivityType();
      }
    });
  }
}

/**
 * Add a custom activity type
 */
async function addCustomActivityType() {
  const input = document.getElementById('new-activity-type');
  const typeName = input?.value?.trim();

  if (!typeName) return;

  if (typeName.length < 2 || typeName.length > 30) {
    showNotification('Activity type must be 2-30 characters', 'error');
    return;
  }

  // Check for duplicates
  if (AppState.activityTypes.all.some(t => t.name.toLowerCase() === typeName.toLowerCase())) {
    showNotification('An activity type with this name already exists', 'error');
    return;
  }

  try {
    await window.lightTrackAPI.addActivityType(typeName);
    showNotification(`Activity type "${typeName}" added`, 'success');
    if (input) input.value = '';
    await loadActivityTypeManager();
  } catch (error) {
    console.error('Failed to add activity type:', error);
    showNotification('Failed to add activity type', 'error');
  }
}

/**
 * Remove a custom activity type
 */
async function removeCustomActivityType(typeId) {
  const type = AppState.activityTypes.custom.find(t => t.id === typeId);
  if (!type) {
    showNotification('Activity type not found or is a system type', 'error');
    return;
  }

  if (!confirm(`Remove activity type "${type.name}"? This won't affect existing activities.`)) {
    return;
  }

  try {
    await window.lightTrackAPI.removeActivityType(typeId);
    showNotification(`Activity type "${type.name}" removed`, 'success');
    await loadActivityTypeManager();
  } catch (error) {
    console.error('Failed to remove activity type:', error);
    showNotification('Failed to remove activity type', 'error');
  }
}

// Start initialization
init();

// Export for debugging and onclick handlers
window.AppState = AppState;
window.toggleTracking = toggleTracking;
window.loadActivities = loadActivities;
window.openEditModal = openEditModal;
window.openDeleteModal = openDeleteModal;
window.openManualEntryModal = openManualEntryModal;

// Tag system exports
window.openTagEditor = openTagEditor;
window.closeTagEditor = closeTagEditor;
window.addNewTag = addNewTag;
window.saveActivityTags = saveActivityTags;
window.addCustomTag = addCustomTag;
window.removeCustomTag = removeCustomTag;
window.clearTagFilters = clearTagFilters;

// Project management exports
window.addCustomProject = addCustomProject;
window.editProject = editProject;
window.removeCustomProject = removeCustomProject;

// Activity type management exports
window.addCustomActivityType = addCustomActivityType;
window.removeCustomActivityType = removeCustomActivityType;
