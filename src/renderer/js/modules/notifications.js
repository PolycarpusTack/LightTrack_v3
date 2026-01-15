/**
 * LightTrack Notifications Module
 * Toast notifications and user feedback
 */

window.LightTrack = window.LightTrack || {};

window.LightTrack.UI = (function() {
  let notificationTimeout = null;

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Show a toast notification
   */
  function showNotification(message, type = 'info') {
    // Remove existing notification
    const existing = document.querySelector('.notification-toast');
    if (existing) {
      existing.remove();
    }

    // Clear any pending timeout
    if (notificationTimeout) {
      clearTimeout(notificationTimeout);
    }

    // Create notification element using DOM methods to prevent XSS
    const notification = document.createElement('div');
    notification.className = `notification-toast notification-${escapeHtml(type)}`;

    const iconSpan = document.createElement('span');
    iconSpan.className = 'notification-icon';
    iconSpan.textContent = getIcon(type);

    const messageSpan = document.createElement('span');
    messageSpan.className = 'notification-message';
    messageSpan.textContent = message; // Safe: textContent auto-escapes

    notification.appendChild(iconSpan);
    notification.appendChild(messageSpan);

    // Styles are in app.css (CSP-compliant)

    // Add to document
    document.body.appendChild(notification);

    // Trigger animation
    requestAnimationFrame(() => {
      notification.classList.add('show');
    });

    // Auto-remove after 3 seconds
    notificationTimeout = setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  /**
   * Get icon for notification type
   */
  function getIcon(type) {
    switch (type) {
      case 'success': return '✓';
      case 'error': return '✕';
      case 'warning': return '⚠';
      default: return 'ℹ';
    }
  }

  // Note: Notification styles are now in app.css for CSP compliance
  // No dynamic style injection needed

  /**
   * Show a confirmation dialog
   */
  function showConfirm(message, onConfirm, onCancel) {
    // Build dialog using DOM methods to prevent XSS
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog';

    const messageDiv = document.createElement('div');
    messageDiv.className = 'confirm-message';
    messageDiv.textContent = message; // Safe: textContent auto-escapes

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'confirm-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'ghost confirm-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      overlay.remove();
      if (onCancel) onCancel();
    });

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'solid primary confirm-ok';
    confirmBtn.textContent = 'Confirm';
    confirmBtn.addEventListener('click', () => {
      overlay.remove();
      if (onConfirm) onConfirm();
    });

    actionsDiv.appendChild(cancelBtn);
    actionsDiv.appendChild(confirmBtn);
    dialog.appendChild(messageDiv);
    dialog.appendChild(actionsDiv);
    overlay.appendChild(dialog);

    document.body.appendChild(overlay);
  }

  // Public API
  return {
    showNotification,
    showConfirm
  };
})();

// Export for module compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.LightTrack.UI;
}
