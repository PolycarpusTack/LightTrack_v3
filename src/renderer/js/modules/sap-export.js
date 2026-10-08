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
    rows: [],
    // Per-row Work Description edits, keyed by row key (date|project)
    descriptions: {},
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
    return { start: monday, end: sunday, label: 'This week' };
  }

  /**
   * Get last week's date range
   */
  function getLastWeekRange() {
    const range = getThisWeekRange();
    range.start.setDate(range.start.getDate() - 7);
    range.end.setDate(range.end.getDate() - 7);
    range.label = 'Last week';
    return range;
  }

  /**
   * Get this month's date range
   */
  function getThisMonthRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end, label: 'This month' };
  }

  /**
   * Get last month's date range
   */
  function getLastMonthRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { start, end, label: 'Last month' };
  }

  /**
   * Update SAP preview table.
   * Rows come from the main process (the same code that writes the file), so the
   * preview always matches the export. Only the description column is editable.
   */
  async function updatePreview() {
    const previewBody = document.getElementById('sap-preview-body');
    const previewSummary = document.getElementById('sap-preview-summary');
    const exportBtn = document.getElementById('sap-export-btn');

    if (!previewBody || !state.startDate || !state.endDate) {
      return;
    }

    try {
      const result = await window.lightTrackAPI.previewSAPExport({
        startDate: state.startDate.toISOString(),
        endDate: state.endDate.toISOString(),
        descriptions: state.descriptions
      });
      state.rows = result?.rows || [];

      if (state.rows.length === 0) {
        previewBody.innerHTML = `
          <tr>
            <td colspan="8" class="table-empty">
              No activities found for selected period
            </td>
          </tr>
        `;
        previewSummary.textContent = 'No data to export';
        if (exportBtn) exportBtn.disabled = true;
        return;
      }

      const totalHours = state.rows.reduce((sum, r) => sum + r.hours, 0);
      const recordCount = state.rows.length;
      previewSummary.textContent = `${recordCount} record${recordCount !== 1 ? 's' : ''}, ${totalHours.toFixed(2)} hours total`;

      previewBody.innerHTML = state.rows.map((row, index) => `
        <tr>
          <td>${row.date}</td>
          <td>${Utils.escapeHtml(row.project)}</td>
          <td class="muted">${Utils.escapeHtml(row.activityType) || '-'}</td>
          <td class="num">${row.hours.toFixed(2)}</td>
          <td class="muted">${Utils.escapeHtml(row.sapCode) || '-'}</td>
          <td class="muted">${Utils.escapeHtml(row.costCenter) || '-'}</td>
          <td class="muted">${Utils.escapeHtml(row.wbsElement) || '-'}</td>
          <td class="description-cell">
            <input type="text" class="sap-description-input" data-row="${index}" maxlength="500">
          </td>
        </tr>
      `).join('');

      // Value and label are set through the DOM so quotes in user text cannot break the markup.
      previewBody.querySelectorAll('.sap-description-input').forEach(input => {
        const current = state.rows[Number(input.dataset.row)];
        input.value = current?.workDescription || '';
        input.setAttribute('aria-label', `Work description for ${current?.date}, ${current?.project}`);
        input.addEventListener('change', () => {
          const row = state.rows[Number(input.dataset.row)];
          if (!row) return;
          state.descriptions[row.key] = input.value;
          row.workDescription = input.value;
        });
      });

      if (exportBtn) exportBtn.disabled = false;

    } catch (error) {
      console.error('Error updating SAP preview:', error);
      window.LightTrack.UI.showNotification(error.message, 'error');
      previewBody.innerHTML = `
        <tr>
          <td colspan="8" class="table-empty error">
            Error loading preview: ${Utils.escapeHtml(error.message)}
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
      const settings = await window.lightTrackAPI.getSettings();
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
            state.descriptions = {};

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

          if (state.rows.length === 0) {
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
              descriptions: state.descriptions
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
      window.LightTrack.UI.showNotification(error.message, 'error');
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
