/**
 * LightTrack Modals Module
 * Handles modal dialogs, tag system, project management, activity type management,
 * and the snake game easter egg.
 */
(function() {
  'use strict';

  window.LightTrack = window.LightTrack || {};

  // ============= Snake Game Easter Egg =============

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
          <h3>\u{1F40D} Snake - Take a Break!</h3>
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
        <button onclick="closeTagEditor()" class="tag-editor-close">\u00d7</button>
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
                <button data-action="remove-tag" data-tag="${escapeAttr(tag)}" title="Remove tag">\u00d7</button>
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

  // ============= Module Export =============

  window.LightTrack.Modals = {
    // Snake game
    openSnakeGame,
    closeSnakeGame,
    // Modal helpers
    addModalEscHandler,
    removeModalEscHandler,
    // Entry modal
    openManualEntryModal,
    openEditModal,
    closeModal,
    saveActivity,
    // Delete modal
    openDeleteModal,
    closeDeleteModal,
    confirmDelete,
    // Clear data modal
    openClearDataModal,
    closeClearDataModal,
    confirmClearData,
    // Tag system
    loadTags,
    renderTagPills,
    getTagCount,
    toggleTagFilter,
    clearTagFilters,
    // Tag editor
    openTagEditor,
    closeTagEditor,
    addNewTag,
    saveActivityTags,
    // Tag manager
    loadTagManager,
    addCustomTag,
    removeCustomTag,
    // Project management
    loadProjects,
    loadProjectManager,
    addCustomProject,
    editProject,
    removeCustomProject,
    // Activity type management
    loadActivityTypes,
    loadActivityTypeManager,
    addCustomActivityType,
    removeCustomActivityType
  };

  window.LightTrack._loaded.modals = true;
})();
