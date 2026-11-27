/**
 * LightTrack Notifications Module
 * Toast notifications and user feedback
 */

window.LightTrack = window.LightTrack || {};

window.LightTrack.UI = (function() {
  // Toasts stack, newest at the bottom, so two messages at once are both read (B-11)
  const MAX_TOASTS = 4;
  const DEFAULT_DURATION_MS = 3000;

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
  function toastStack() {
    let stack = document.querySelector('.notification-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'notification-stack';
      stack.setAttribute('role', 'status');
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }
    return stack;
  }

  function dismiss(notification) {
    clearTimeout(notification._hideTimer);
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }

  /**
   * Show a toast notification
   * @param {string} message
   * @param {string} [type] - info, success, warning or error
   * @param {number} [duration] - milliseconds on screen (default 3 s)
   */
  function showNotification(message, type = 'info', duration = DEFAULT_DURATION_MS) {
    const stack = toastStack();
    const hideAfter = Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_DURATION_MS;

    // The same message again restarts its timer instead of stacking a copy
    const same = [...stack.children].find(el => el.dataset.message === String(message) && el.dataset.type === type);
    if (same) {
      clearTimeout(same._hideTimer);
      same._hideTimer = setTimeout(() => dismiss(same), hideAfter);
      return;
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

    notification.dataset.message = String(message);
    notification.dataset.type = type;
    stack.appendChild(notification);
    while (stack.children.length > MAX_TOASTS) stack.firstElementChild.remove();

    // Trigger animation
    requestAnimationFrame(() => {
      notification.classList.add('show');
    });

    notification._hideTimer = setTimeout(() => dismiss(notification), hideAfter);
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
    confirmBtn.className = 'solid confirm-ok';
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
