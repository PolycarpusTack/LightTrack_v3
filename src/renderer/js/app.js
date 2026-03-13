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
 * @delegated to LightTrack.Dashboard module
 */
function getBarFillClass(percent) {
  return window.LightTrack.Dashboard?.getBarFillClass?.(percent);
}

/**
 * Calculate daily summary statistics from activities
 * @delegated to LightTrack.Dashboard module
 */
function calculateDailySummaryStats(activities) {
  return window.LightTrack.Dashboard?.calculateDailySummaryStats?.(activities);
}

/**
 * Render daily summary statistics to UI elements
 * @delegated to LightTrack.Dashboard module
 */
function renderDailySummaryStats(stats) {
  return window.LightTrack.Dashboard?.renderDailySummaryStats?.(stats);
}

/**
 * Update the daily summary UI
 * @delegated to LightTrack.Dashboard module
 */
function updateDailySummary() {
  return window.LightTrack.Dashboard?.updateDailySummary?.();
}

/**
 * Initialize daily summary toggle
 * @delegated to LightTrack.Dashboard module
 */
function initDailySummary() {
  return window.LightTrack.Dashboard?.initDailySummary?.();
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
 * @delegated to LightTrack.Dashboard module
 */
async function updateWeeklyFocusScore() {
  return window.LightTrack.Dashboard?.updateWeeklyFocusScore?.();
}

/**
 * Calculate and display tracking streak (consecutive days)
 * @delegated to LightTrack.Dashboard module
 */
async function updateStreak() {
  return window.LightTrack.Dashboard?.updateStreak?.();
}

/**
 * Update mini timeline preview in hero section
 * @delegated to LightTrack.Dashboard module
 */
function updateMiniTimeline() {
  return window.LightTrack.Dashboard?.updateMiniTimeline?.();
}

// ============= Goals Tracking =============

/**
 * Update goals display based on today's activities
 * @delegated to LightTrack.Dashboard module
 */
function updateGoals() {
  return window.LightTrack.Dashboard?.updateGoals?.();
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
  return window.LightTrack.Timeline?.navigateTimeline?.(days);
}

/**
 * Load Timeline view - shows all activities for selected date
 */
async function loadTimelineView() {
  return window.LightTrack.Timeline?.loadTimelineView?.();
}

/**
 * Render a single activity item
 */
function renderActivityItem(activity) {
  return window.LightTrack.Timeline?.renderActivityItem?.(activity);
}

/**
 * Render activities grouped by project
 */
function renderGroupedActivities(activities) {
  return window.LightTrack.Timeline?.renderGroupedActivities?.(activities);
}

/**
 * Set up event delegation for timeline list (call once on init)
 */
function setupTimelineEventDelegation() {
  return window.LightTrack.Timeline?.setupTimelineEventDelegation?.();
}

/**
 * Attach event listeners to timeline activity buttons (deprecated - use event delegation)
 * Kept for backwards compatibility but now a no-op
 */
function attachTimelineListeners(container) {
  return window.LightTrack.Timeline?.attachTimelineListeners?.(container);
}

// ============= Activity Selection for Bulk Operations =============

/**
 * Toggle selection of a single activity
 */
function toggleActivitySelection(id) {
  return window.LightTrack.Timeline?.toggleActivitySelection?.(id);
}

/**
 * Select or deselect all visible activities
 */
function toggleSelectAllActivities(selectAll) {
  return window.LightTrack.Timeline?.toggleSelectAllActivities?.(selectAll);
}

/**
 * Update the UI to reflect current selection state
 */
function updateSelectionUI() {
  return window.LightTrack.Timeline?.updateSelectionUI?.();
}

/**
 * Merge selected activities into one
 */
async function mergeSelectedActivities() {
  return window.LightTrack.Timeline?.mergeSelectedActivities?.();
}

/**
 * Set up keyboard shortcuts for Timer view
 * Space: Toggle tracking, M: Mark break, A: Add manual, F: Floating timer
 */
function setupTimerKeyboardShortcuts() {
  return window.LightTrack.Timeline?.setupTimerKeyboardShortcuts?.();
}

/**
 * Get work day start time in minutes from midnight
 */
function getWorkDayStartMinutes() {
  return window.LightTrack.Timeline?.getWorkDayStartMinutes?.();
}

/**
 * Get work day end time in minutes from midnight
 */
function getWorkDayEndMinutes() {
  return window.LightTrack.Timeline?.getWorkDayEndMinutes?.();
}

/**
 * Get work day duration in seconds
 */
function getWorkDayDurationSeconds() {
  return window.LightTrack.Timeline?.getWorkDayDurationSeconds?.();
}

/**
 * Calculate real gaps between activities during work hours
 * Returns total gap time in seconds
 */
function calculateRealGaps(activities, dateStr) {
  return window.LightTrack.Timeline?.calculateRealGaps?.(activities, dateStr);
}

/**
 * Render visual timeline bar with time markers and now indicator
 */
function renderTimelineBar(container, activities, dateStr, isToday) {
  return window.LightTrack.Timeline?.renderTimelineBar?.(container, activities, dateStr, isToday);
}

// ============= Analytics (delegated to modules/analytics.js) =============

function getCachedActivities(forceRefresh = false) {
  return window.LightTrack.Analytics?.getCachedActivities?.(forceRefresh);
}

function invalidateAnalyticsCache() {
  return window.LightTrack.Analytics?.invalidateAnalyticsCache?.();
}

function getAnalyticsDateRange(range, weekStartDay = 1, customRange = null) {
  return window.LightTrack.Analytics?.getAnalyticsDateRange?.(range, weekStartDay, customRange);
}

function getActivityDate(activity) {
  return window.LightTrack.Analytics?.getActivityDate?.(activity);
}

function calculateAnalyticsStats(activities) {
  return window.LightTrack.Analytics?.calculateAnalyticsStats?.(activities);
}

function getTrendIndicator(current, previous) {
  return window.LightTrack.Analytics?.getTrendIndicator?.(current, previous);
}

function renderHourlyHeatmap(activities) {
  return window.LightTrack.Analytics?.renderHourlyHeatmap?.(activities);
}

function updateGoalsProgress(allActivities) {
  return window.LightTrack.Analytics?.updateGoalsProgress?.(allActivities);
}

function updateComparisonSection(currentStats, prevStats, range) {
  return window.LightTrack.Analytics?.updateComparisonSection?.(currentStats, prevStats, range);
}

async function loadAnalyticsView() {
  return window.LightTrack.Analytics?.loadAnalyticsView?.();
}

function generateAnalyticsInsights(activities, totalSeconds, focusSeconds, daysWithData, sortedProjects, billableSeconds = 0) {
  return window.LightTrack.Analytics?.generateAnalyticsInsights?.(activities, totalSeconds, focusSeconds, daysWithData, sortedProjects, billableSeconds);
}

async function exportAnalyticsToCSV() {
  return window.LightTrack.Analytics?.exportAnalyticsToCSV?.();
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

// ============= URL Mappings (delegated to SettingsView module) =============

function loadUrlMappings() {
  return window.LightTrack.SettingsView?.loadUrlMappings?.();
}

function addUrlMapping() {
  return window.LightTrack.SettingsView?.addUrlMapping?.();
}

function removeUrlMapping(pattern) {
  return window.LightTrack.SettingsView?.removeUrlMapping?.(pattern);
}

function editUrlMapping(pattern) {
  return window.LightTrack.SettingsView?.editUrlMapping?.(pattern);
}

function cancelUrlMappingEdit() {
  return window.LightTrack.SettingsView?.cancelUrlMappingEdit?.();
}

function updateUrlMapping() {
  return window.LightTrack.SettingsView?.updateUrlMapping?.();
}

// ============= JIRA Mappings (delegated to SettingsView module) =============

function loadJiraMappings() {
  return window.LightTrack.SettingsView?.loadJiraMappings?.();
}

function addJiraMapping() {
  return window.LightTrack.SettingsView?.addJiraMapping?.();
}

function removeJiraMapping(key) {
  return window.LightTrack.SettingsView?.removeJiraMapping?.(key);
}

function editJiraMapping(key) {
  return window.LightTrack.SettingsView?.editJiraMapping?.(key);
}

function cancelJiraMappingEdit() {
  return window.LightTrack.SettingsView?.cancelJiraMappingEdit?.();
}

function updateJiraMapping() {
  return window.LightTrack.SettingsView?.updateJiraMapping?.();
}

// ============= Meeting Mappings (delegated to SettingsView module) =============

function loadMeetingMappings() {
  return window.LightTrack.SettingsView?.loadMeetingMappings?.();
}

function isValidRegex(pattern) {
  return window.LightTrack.SettingsView?.isValidRegex?.(pattern);
}

function addMeetingMapping() {
  return window.LightTrack.SettingsView?.addMeetingMapping?.();
}

function removeMeetingMapping(pattern) {
  return window.LightTrack.SettingsView?.removeMeetingMapping?.(pattern);
}

function editMeetingMapping(pattern) {
  return window.LightTrack.SettingsView?.editMeetingMapping?.(pattern);
}

function cancelMeetingMappingEdit() {
  return window.LightTrack.SettingsView?.cancelMeetingMappingEdit?.();
}

function updateMeetingMapping() {
  return window.LightTrack.SettingsView?.updateMeetingMapping?.();
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

// ============= Settings Load/Save (delegated to SettingsView module) =============

function loadSettings() {
  return window.LightTrack.SettingsView?.loadSettings?.();
}

function saveSettings() {
  return window.LightTrack.SettingsView?.saveSettings?.();
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

// ============= Settings View (delegated to SettingsView module) =============

function loadSettingsView() {
  return window.LightTrack.SettingsView?.loadSettingsView?.();
}

function initSettingsGroups() {
  return window.LightTrack.SettingsView?.initSettingsGroups?.();
}

// ============= Backup & Restore (delegated to SettingsView module) =============

function createBackup(statusEl) {
  return window.LightTrack.SettingsView?.createBackup?.(statusEl);
}

function restoreFromBackup(file, statusEl) {
  return window.LightTrack.SettingsView?.restoreFromBackup?.(file, statusEl);
}

// ============= Calendar Sync (delegated to SettingsView module) =============

function loadCalendarSettings() {
  return window.LightTrack.SettingsView?.loadCalendarSettings?.();
}

function loadUpcomingMeetings() {
  return window.LightTrack.SettingsView?.loadUpcomingMeetings?.();
}

function showCalendarHelpModal() {
  return window.LightTrack.SettingsView?.showCalendarHelpModal?.();
}

function closeCalendarHelpModal() {
  return window.LightTrack.SettingsView?.closeCalendarHelpModal?.();
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

// ============= Snake Game (delegated to Modals module) =============

function openSnakeGame() {
  return window.LightTrack.Modals?.openSnakeGame?.();
}

function closeSnakeGame() {
  return window.LightTrack.Modals?.closeSnakeGame?.();
}

// ============= Modal Functions (delegated to Modals module) =============

function addModalEscHandler(overlayId, closeFunction) {
  return window.LightTrack.Modals?.addModalEscHandler?.(overlayId, closeFunction);
}

function removeModalEscHandler(overlayId) {
  return window.LightTrack.Modals?.removeModalEscHandler?.(overlayId);
}

function openManualEntryModal(dateOverride) {
  return window.LightTrack.Modals?.openManualEntryModal?.(dateOverride);
}

function openEditModal(activityId) {
  return window.LightTrack.Modals?.openEditModal?.(activityId);
}

function closeModal() {
  return window.LightTrack.Modals?.closeModal?.();
}

function saveActivity() {
  return window.LightTrack.Modals?.saveActivity?.();
}

function openDeleteModal(activityId) {
  return window.LightTrack.Modals?.openDeleteModal?.(activityId);
}

function closeDeleteModal() {
  return window.LightTrack.Modals?.closeDeleteModal?.();
}

function confirmDelete() {
  return window.LightTrack.Modals?.confirmDelete?.();
}

// ============= Clear Data Modal (delegated to Modals module) =============

function openClearDataModal() {
  return window.LightTrack.Modals?.openClearDataModal?.();
}

function closeClearDataModal() {
  return window.LightTrack.Modals?.closeClearDataModal?.();
}

function confirmClearData() {
  return window.LightTrack.Modals?.confirmClearData?.();
}

// ============= Tag System (delegated to Modals module) =============

function loadTags() {
  return window.LightTrack.Modals?.loadTags?.();
}

function renderTagPills() {
  return window.LightTrack.Modals?.renderTagPills?.();
}

function getTagCount(tagName) {
  return window.LightTrack.Modals?.getTagCount?.(tagName);
}

function toggleTagFilter(tagName) {
  return window.LightTrack.Modals?.toggleTagFilter?.(tagName);
}

function clearTagFilters() {
  return window.LightTrack.Modals?.clearTagFilters?.();
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
  return window.LightTrack.Timeline?.renderActivityTags?.(activity);
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

// ============= Tag Editor (delegated to Modals module) =============

function openTagEditor(activityId) {
  return window.LightTrack.Modals?.openTagEditor?.(activityId);
}

function closeTagEditor() {
  return window.LightTrack.Modals?.closeTagEditor?.();
}

function addNewTag(activityId) {
  return window.LightTrack.Modals?.addNewTag?.(activityId);
}

function saveActivityTags(activityId) {
  return window.LightTrack.Modals?.saveActivityTags?.(activityId);
}

// ============= Tag Manager (delegated to Modals module) =============

function loadTagManager() {
  return window.LightTrack.Modals?.loadTagManager?.();
}

function addCustomTag() {
  return window.LightTrack.Modals?.addCustomTag?.();
}

function removeCustomTag(tagName) {
  return window.LightTrack.Modals?.removeCustomTag?.(tagName);
}

// ============= Project Management (delegated to Modals module) =============

function loadProjects() {
  return window.LightTrack.Modals?.loadProjects?.();
}

function loadProjectManager() {
  return window.LightTrack.Modals?.loadProjectManager?.();
}

function addCustomProject() {
  return window.LightTrack.Modals?.addCustomProject?.();
}

function editProject(projectId) {
  return window.LightTrack.Modals?.editProject?.(projectId);
}

function removeCustomProject(projectId) {
  return window.LightTrack.Modals?.removeCustomProject?.(projectId);
}

// ============= Activity Type Management (delegated to Modals module) =============

function loadActivityTypes() {
  return window.LightTrack.Modals?.loadActivityTypes?.();
}

function loadActivityTypeManager() {
  return window.LightTrack.Modals?.loadActivityTypeManager?.();
}

function addCustomActivityType() {
  return window.LightTrack.Modals?.addCustomActivityType?.();
}

function removeCustomActivityType(typeId) {
  return window.LightTrack.Modals?.removeCustomActivityType?.(typeId);
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
