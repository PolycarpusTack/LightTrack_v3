/**
 * LightTrack Analytics Module
 * Handles analytics view: date range filtering, stats calculation, charts,
 * insights, heatmap, goals progress, comparison, and CSV export.
 */
(function() {
  'use strict';

  window.LightTrack = window.LightTrack || {};

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
      const ChartRenderer = window.LightTrack.ChartRenderer;
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

  // Expose via namespace
  window.LightTrack.Analytics = {
    getCachedActivities,
    invalidateAnalyticsCache,
    getAnalyticsDateRange,
    getActivityDate,
    calculateAnalyticsStats,
    getTrendIndicator,
    renderHourlyHeatmap,
    updateGoalsProgress,
    updateComparisonSection,
    loadAnalyticsView,
    generateAnalyticsInsights,
    exportAnalyticsToCSV
  };

  // Also expose globally for backward compat
  window.getCachedActivities = getCachedActivities;
  window.invalidateAnalyticsCache = invalidateAnalyticsCache;
  window.getAnalyticsDateRange = getAnalyticsDateRange;
  window.getActivityDate = getActivityDate;
  window.calculateAnalyticsStats = calculateAnalyticsStats;
  window.getTrendIndicator = getTrendIndicator;
  window.renderHourlyHeatmap = renderHourlyHeatmap;
  window.updateGoalsProgress = updateGoalsProgress;
  window.updateComparisonSection = updateComparisonSection;
  window.loadAnalyticsView = loadAnalyticsView;
  window.generateAnalyticsInsights = generateAnalyticsInsights;
  window.exportAnalyticsToCSV = exportAnalyticsToCSV;

  window.LightTrack._loaded.analytics = true;
})();
