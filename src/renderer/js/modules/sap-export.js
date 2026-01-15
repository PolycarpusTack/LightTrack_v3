/**
 * LightTrack SAP Export Module
 * Handles SAP ByDesign timesheet export functionality
 */

window.LightTrack = window.LightTrack || {};

window.LightTrack.SAPExport = (function() {
  const Utils = window.LightTrack.Utils;

  // Module state
  const state = {
    selectedPeriod: null,
    startDate: null,
    endDate: null,
    aggregatedData: [],
    employeeId: ''
  };

  /**
   * Get this week's date range
   */
  function getThisWeekRange() {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday, label: 'This Week' };
  }

  /**
   * Get last week's date range
   */
  function getLastWeekRange() {
    const range = getThisWeekRange();
    range.start.setDate(range.start.getDate() - 7);
    range.end.setDate(range.end.getDate() - 7);
    range.label = 'Last Week';
    return range;
  }

  /**
   * Get this month's date range
   */
  function getThisMonthRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end, label: 'This Month' };
  }

  /**
   * Get last month's date range
   */
  function getLastMonthRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { start, end, label: 'Last Month' };
  }

  /**
   * Aggregate activities for SAP export
   * Groups by date + project, sums duration, concatenates descriptions
   */
  function aggregateActivities(activities, startDate, endDate) {
    const filtered = activities.filter(a => {
      const activityDate = new Date(a.startTime || a.timestamp);
      return activityDate >= startDate && activityDate <= endDate;
    });

    const groups = {};

    filtered.forEach(activity => {
      const date = Utils.formatDateISO(new Date(activity.startTime || activity.timestamp));
      const project = activity.project || 'General';
      const key = `${date}|${project}`;

      if (!groups[key]) {
        groups[key] = {
          date,
          project,
          duration: 0,
          titles: new Set(),
          sapCode: activity.sapCode || '',
          costCenter: activity.costCenter || '',
          wbsElement: activity.wbsElement || '',
          activityType: activity.activity || activity.activityType || '',
          billable: activity.billable !== false
        };
      }

      groups[key].duration += activity.duration || 0;

      const title = (activity.title || '').trim();
      if (title && title.length > 3) {
        const cleanTitle = title.substring(0, 100);
        groups[key].titles.add(cleanTitle);
      }

      if (activity.sapCode) groups[key].sapCode = activity.sapCode;
      if (activity.costCenter) groups[key].costCenter = activity.costCenter;
      if (activity.wbsElement) groups[key].wbsElement = activity.wbsElement;
      if (activity.activity || activity.activityType) {
        groups[key].activityType = activity.activity || activity.activityType;
      }
    });

    return Object.values(groups)
      .map(g => ({
        date: g.date,
        project: g.project,
        activityType: g.activityType || 'Development',
        hours: Math.round((g.duration / 3600) * 100) / 100,
        sapCode: g.sapCode,
        costCenter: g.costCenter,
        wbsElement: g.wbsElement,
        workDescription: Array.from(g.titles).slice(0, 10).join('; '),
        billable: g.billable ? 'Yes' : 'No'
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.project.localeCompare(b.project));
  }

  /**
   * Update SAP preview table
   */
  async function updatePreview() {
    const previewBody = document.getElementById('sap-preview-body');
    const previewSummary = document.getElementById('sap-preview-summary');
    const exportBtn = document.getElementById('sap-export-btn');

    if (!previewBody || !state.startDate || !state.endDate) {
      return;
    }

    try {
      const activities = await window.lightTrackAPI.getActivities() || [];
      state.aggregatedData = aggregateActivities(activities, state.startDate, state.endDate);

      if (state.aggregatedData.length === 0) {
        previewBody.innerHTML = `
          <tr>
            <td colspan="8" style="padding: 20px; text-align: center; color: var(--ink-muted);">
              No activities found for selected period
            </td>
          </tr>
        `;
        previewSummary.textContent = 'No data to export';
        if (exportBtn) exportBtn.disabled = true;
        return;
      }

      const totalHours = state.aggregatedData.reduce((sum, r) => sum + r.hours, 0);
      const recordCount = state.aggregatedData.length;

      previewSummary.textContent = `${recordCount} record${recordCount !== 1 ? 's' : ''}, ${totalHours.toFixed(2)} hours total`;

      const displayData = state.aggregatedData.slice(0, 20);
      previewBody.innerHTML = displayData.map(row => `
        <tr style="border-bottom: 1px solid var(--border);">
          <td style="padding: 8px; color: var(--ink);">${row.date}</td>
          <td style="padding: 8px; color: var(--ink);">${Utils.escapeHtml(row.project)}</td>
          <td style="padding: 8px; color: var(--ink-muted);">${Utils.escapeHtml(row.activityType) || '-'}</td>
          <td style="padding: 8px; text-align: right; color: var(--neon);">${row.hours.toFixed(2)}</td>
          <td style="padding: 8px; color: var(--ink-muted);">${Utils.escapeHtml(row.sapCode) || '-'}</td>
          <td style="padding: 8px; color: var(--ink-muted);">${Utils.escapeHtml(row.costCenter) || '-'}</td>
          <td style="padding: 8px; color: var(--ink-muted);">${Utils.escapeHtml(row.wbsElement) || '-'}</td>
          <td style="padding: 8px; color: var(--ink-muted); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${Utils.escapeHtml(row.workDescription)}">
            ${Utils.escapeHtml(row.workDescription.substring(0, 40))}${row.workDescription.length > 40 ? '...' : ''}
          </td>
        </tr>
      `).join('');

      if (state.aggregatedData.length > 20) {
        previewBody.innerHTML += `
          <tr>
            <td colspan="8" style="padding: 8px; text-align: center; color: var(--ink-muted); font-style: italic;">
              ... and ${state.aggregatedData.length - 20} more records
            </td>
          </tr>
        `;
      }

      if (exportBtn) exportBtn.disabled = false;

    } catch (error) {
      console.error('Error updating SAP preview:', error);
      previewBody.innerHTML = `
        <tr>
          <td colspan="8" style="padding: 20px; text-align: center; color: #ff6b6b;">
            Error loading preview: ${error.message}
          </td>
        </tr>
      `;
    }
  }

  /**
   * Initialize SAP Export view
   */
  async function init() {
    try {
      if (!window.lightTrackAPI) return;

      const settings = await window.lightTrackAPI.getSettings() || {};
      state.employeeId = settings.employeeId || '';

      const employeeIdInput = document.getElementById('sap-employee-id');
      if (employeeIdInput) {
        employeeIdInput.value = state.employeeId;
      }

      // Wire up save employee ID button
      const saveEmployeeBtn = document.getElementById('sap-save-employee-id');
      if (saveEmployeeBtn && !saveEmployeeBtn.dataset.wired) {
        saveEmployeeBtn.dataset.wired = 'true';
        saveEmployeeBtn.addEventListener('click', async () => {
          const input = document.getElementById('sap-employee-id');
          if (input) {
            state.employeeId = input.value.trim();
            try {
              await window.lightTrackAPI.updateSettings({ employeeId: state.employeeId });
              window.LightTrack.UI?.showNotification?.('Employee ID saved', 'success');
            } catch (error) {
              window.LightTrack.UI?.showNotification?.('Failed to save Employee ID', 'error');
            }
          }
        });
      }

      // Wire up period buttons
      const periodButtons = [
        { id: 'sap-this-week', fn: getThisWeekRange },
        { id: 'sap-last-week', fn: getLastWeekRange },
        { id: 'sap-this-month', fn: getThisMonthRange },
        { id: 'sap-last-month', fn: getLastMonthRange }
      ];

      periodButtons.forEach(({ id, fn }) => {
        const btn = document.getElementById(id);
        if (btn && !btn.dataset.wired) {
          btn.dataset.wired = 'true';
          btn.addEventListener('click', () => {
            document.querySelectorAll('.sap-period-buttons button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const range = fn();
            state.startDate = range.start;
            state.endDate = range.end;
            state.selectedPeriod = range.label;

            const periodDisplay = document.getElementById('sap-selected-period');
            if (periodDisplay) {
              periodDisplay.textContent = `Selected: ${Utils.formatDateDisplay(range.start)} - ${Utils.formatDateDisplay(range.end)}`;
            }

            updatePreview();
          });
        }
      });

      // Wire up export button
      const exportBtn = document.getElementById('sap-export-btn');
      if (exportBtn && !exportBtn.dataset.wired) {
        exportBtn.dataset.wired = 'true';
        exportBtn.addEventListener('click', async () => {
          const statusEl = document.getElementById('sap-export-status');

          if (!state.employeeId) {
            window.LightTrack.UI?.showNotification?.('Please enter your Employee ID before exporting', 'warning');
            return;
          }

          if (state.aggregatedData.length === 0) {
            window.LightTrack.UI?.showNotification?.('No data to export', 'warning');
            return;
          }

          try {
            if (statusEl) statusEl.textContent = 'Exporting...';
            exportBtn.disabled = true;

            const result = await window.lightTrackAPI.exportToSAP({
              startDate: state.startDate.toISOString(),
              endDate: state.endDate.toISOString(),
              employeeId: state.employeeId,
              data: state.aggregatedData
            });

            if (result && result.filePath) {
              if (statusEl) statusEl.textContent = `Exported to: ${result.filePath}`;
              window.LightTrack.UI?.showNotification?.(`Exported ${result.recordCount} records to CSV`, 'success');
            } else {
              if (statusEl) statusEl.textContent = 'Export cancelled';
            }
          } catch (error) {
            console.error('SAP export error:', error);
            if (statusEl) statusEl.textContent = 'Export failed';
            window.LightTrack.UI?.showNotification?.('Export failed: ' + error.message, 'error');
          } finally {
            exportBtn.disabled = false;
          }
        });
      }

      // Refresh preview if period was previously selected
      if (state.startDate && state.endDate) {
        updatePreview();
      }

    } catch (error) {
      console.error('Error loading SAP Export view:', error);
    }
  }

  // Public API
  return {
    init,
    updatePreview,
    getState: () => ({ ...state }),
    getThisWeekRange,
    getLastWeekRange,
    getThisMonthRange,
    getLastMonthRange
  };
})();

// Export for module compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.LightTrack.SAPExport;
}
