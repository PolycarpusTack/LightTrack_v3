/**
 * LightTrack Timeline Module
 * Handles timeline view rendering, activity selection, merge operations,
 * keyboard shortcuts, work day calculations, and timeline bar visualization.
 */
(function() {
  'use strict';

  window.LightTrack = window.LightTrack || {};

  // ============= Navigation =============

  /**
   * Navigate the timeline by a number of days
   */
  function navigateTimeline(days) {
    const current = parseLocalDateString(AppState.timelineDate);
    current.setDate(current.getDate() + days);
    AppState.timelineDate = getLocalDateString(current);
    loadTimelineView();
  }

  // ============= Timeline View Loader =============

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

  // ============= Activity Rendering =============

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

  // ============= Event Handling =============

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

  // ============= Keyboard Shortcuts =============

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

  // ============= Work Day Calculations =============

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

  // ============= Timeline Bar =============

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

  // ============= Activity Tags =============

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

  // ============= Module Export =============

  window.LightTrack.Timeline = {
    navigateTimeline,
    loadTimelineView,
    renderActivityItem,
    renderGroupedActivities,
    setupTimelineEventDelegation,
    attachTimelineListeners,
    toggleActivitySelection,
    toggleSelectAllActivities,
    updateSelectionUI,
    mergeSelectedActivities,
    setupTimerKeyboardShortcuts,
    getWorkDayStartMinutes,
    getWorkDayEndMinutes,
    getWorkDayDurationSeconds,
    renderTimelineBar,
    calculateRealGaps,
    renderActivityTags
  };

  // Global window exports for backward compatibility
  window.navigateTimeline = navigateTimeline;
  window.loadTimelineView = loadTimelineView;
  window.renderActivityItem = renderActivityItem;
  window.renderGroupedActivities = renderGroupedActivities;
  window.setupTimelineEventDelegation = setupTimelineEventDelegation;
  window.attachTimelineListeners = attachTimelineListeners;
  window.toggleActivitySelection = toggleActivitySelection;
  window.toggleSelectAllActivities = toggleSelectAllActivities;
  window.updateSelectionUI = updateSelectionUI;
  window.mergeSelectedActivities = mergeSelectedActivities;
  window.setupTimerKeyboardShortcuts = setupTimerKeyboardShortcuts;
  window.getWorkDayStartMinutes = getWorkDayStartMinutes;
  window.getWorkDayEndMinutes = getWorkDayEndMinutes;
  window.getWorkDayDurationSeconds = getWorkDayDurationSeconds;
  window.renderTimelineBar = renderTimelineBar;
  window.calculateRealGaps = calculateRealGaps;
  window.renderActivityTags = renderActivityTags;

  window.LightTrack._loaded.timeline = true;
})();
