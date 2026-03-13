/**
 * LightTrack Settings View Module
 * Handles settings load/save/render, URL/JIRA/Meeting mappings CRUD,
 * backup & restore, and calendar sync functions.
 */
(function() {
  'use strict';

  window.LightTrack = window.LightTrack || {};

  // Debounced version of saveSettings (500ms delay to batch rapid changes)
  const debouncedSaveSettings = debounce(saveSettings, 500);

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
              <span class="arrow">&rarr;</span>
              <span class="project">${escapeHtml(project)}</span>
              ${activityHtml}
              ${sapCodeHtml}
            </div>
            <div class="mapping-actions">
              <button data-action="edit-url-mapping" data-pattern="${escapeAttr(pattern)}" title="Edit rule">&#9998;</button>
              <button data-action="remove-url-mapping" data-pattern="${escapeAttr(pattern)}" title="Remove rule">&#10005;</button>
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
      showNotification(`URL rule added: "${pattern}" \u2192 "${project}"${extraText}`, 'success');

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
              <span class="arrow">&rarr;</span>
              <span class="project">${escapeHtml(project)}</span>
              ${activityHtml}
              ${sapCodeHtml}
            </div>
            <div class="mapping-actions">
              <button data-action="edit-jira-mapping" data-key="${escapeAttr(key)}" title="Edit rule">&#9998;</button>
              <button data-action="remove-jira-mapping" data-key="${escapeAttr(key)}" title="Remove rule">&#10005;</button>
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
      showNotification(`JIRA rule added: "${key}-*" \u2192 "${project}"${extraText}`, 'success');

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
              <span class="arrow">&rarr;</span>
              <span class="project">${escapeHtml(project)}</span>
              ${activityHtml}
              ${sapCodeHtml}
            </div>
            <div class="mapping-actions">
              <button data-action="edit-meeting-mapping" data-pattern="${escapeAttr(pattern)}" title="Edit rule">&#9998;</button>
              <button data-action="remove-meeting-mapping" data-pattern="${escapeAttr(pattern)}" title="Remove rule">&#10005;</button>
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
      showNotification(`Meeting rule added: "${pattern}" \u2192 "${project}"${extraText}`, 'success');

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

  // ============= Settings Load/Save =============

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
        `\u2022 ${stats.activitiesCount || 0} activities\n` +
        `\u2022 ${stats.projectsCount || 0} projects\n` +
        `\u2022 ${stats.tagsCount || 0} tags\n\n` +
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
                <div class="meeting-item-meta">${timeStr} \u00b7 ${durationStr}${m.location ? ' \u00b7 ' + escapeHtml(m.location) : ''}</div>
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

  // Expose via namespace
  window.LightTrack.SettingsView = {
    loadUrlMappings,
    addUrlMapping,
    removeUrlMapping,
    editUrlMapping,
    cancelUrlMappingEdit,
    updateUrlMapping,
    loadJiraMappings,
    addJiraMapping,
    removeJiraMapping,
    editJiraMapping,
    cancelJiraMappingEdit,
    updateJiraMapping,
    loadMeetingMappings,
    addMeetingMapping,
    removeMeetingMapping,
    editMeetingMapping,
    cancelMeetingMappingEdit,
    updateMeetingMapping,
    isValidRegex,
    loadSettings,
    saveSettings,
    debouncedSaveSettings,
    loadSettingsView,
    initSettingsGroups,
    createBackup,
    restoreFromBackup,
    loadCalendarSettings,
    loadUpcomingMeetings,
    showCalendarHelpModal,
    closeCalendarHelpModal
  };

  // Also expose globally for backward compat
  window.loadUrlMappings = loadUrlMappings;
  window.addUrlMapping = addUrlMapping;
  window.removeUrlMapping = removeUrlMapping;
  window.editUrlMapping = editUrlMapping;
  window.cancelUrlMappingEdit = cancelUrlMappingEdit;
  window.updateUrlMapping = updateUrlMapping;
  window.loadJiraMappings = loadJiraMappings;
  window.addJiraMapping = addJiraMapping;
  window.removeJiraMapping = removeJiraMapping;
  window.editJiraMapping = editJiraMapping;
  window.cancelJiraMappingEdit = cancelJiraMappingEdit;
  window.updateJiraMapping = updateJiraMapping;
  window.loadMeetingMappings = loadMeetingMappings;
  window.addMeetingMapping = addMeetingMapping;
  window.removeMeetingMapping = removeMeetingMapping;
  window.editMeetingMapping = editMeetingMapping;
  window.cancelMeetingMappingEdit = cancelMeetingMappingEdit;
  window.updateMeetingMapping = updateMeetingMapping;
  window.loadSettings = loadSettings;
  window.saveSettings = saveSettings;
  window.loadSettingsView = loadSettingsView;
  window.initSettingsGroups = initSettingsGroups;
  window.createBackup = createBackup;
  window.restoreFromBackup = restoreFromBackup;
  window.loadCalendarSettings = loadCalendarSettings;
  window.loadUpcomingMeetings = loadUpcomingMeetings;
  window.showCalendarHelpModal = showCalendarHelpModal;
  window.closeCalendarHelpModal = closeCalendarHelpModal;

  window.LightTrack._loaded.settingsView = true;
})();
