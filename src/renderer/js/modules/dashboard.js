/**
 * LightTrack Dashboard Module
 * Handles dashboard widgets: daily summary, weekly focus, streak, mini timeline, goals
 */
(function() {
  'use strict';

  window.LightTrack = window.LightTrack || {};

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

  // Expose via namespace
  window.LightTrack.Dashboard = {
    getBarFillClass,
    calculateDailySummaryStats,
    renderDailySummaryStats,
    updateDailySummary,
    initDailySummary,
    updateWeeklyFocusScore,
    updateStreak,
    updateMiniTimeline,
    updateGoals
  };

  // Also expose globally for backward compat
  window.updateWeeklyFocusScore = updateWeeklyFocusScore;
  window.updateStreak = updateStreak;
  window.updateMiniTimeline = updateMiniTimeline;
  window.updateGoals = updateGoals;
  window.updateDailySummary = updateDailySummary;
  window.initDailySummary = initDailySummary;
  window.getBarFillClass = getBarFillClass;

  window.LightTrack._loaded.dashboard = true;
})();
