/**
 * Custom notification system for Lorescape Map Builder
 * Provides toast notifications and modal dialogs
 */

let notificationId = 0;

/**
 * Show a toast notification
 * @param {Object} options
 * @param {'success'|'error'|'warning'|'info'} options.type
 * @param {string} options.title
 * @param {string} [options.message]
 * @param {number} [options.duration] - Duration in ms, 0 for persistent
 */
export function showNotification({ type = 'info', title, message, duration = 5000 }) {
  const container = document.getElementById('notification-container');
  if (!container) return;

  const id = `notification-${notificationId++}`;
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.id = id;
  notification.setAttribute('role', 'alert');

  const iconMap = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    warning: 'fa-exclamation-triangle',
    info: 'fa-info-circle'
  };

  notification.innerHTML = `
    <i class="fas ${iconMap[type]} notification-icon"></i>
    <div class="notification-content">
      <div class="notification-title">${escapeHtml(title)}</div>
      ${message ? `<div class="notification-message">${escapeHtml(message)}</div>` : ''}
    </div>
    <button class="notification-close" type="button" aria-label="Close notification">
      <i class="fas fa-times"></i>
    </button>
  `;

  const closeBtn = notification.querySelector('.notification-close');
  closeBtn.addEventListener('click', () => {
    removeNotification(notification);
  });

  container.appendChild(notification);

  if (duration > 0) {
    setTimeout(() => {
      removeNotification(notification);
    }, duration);
  }

  return id;
}

/**
 * Remove a notification with animation
 */
function removeNotification(notification) {
  if (!notification || !notification.parentElement) return;
  
  notification.classList.add('removing');
  setTimeout(() => {
    notification.remove();
  }, 300);
}

/**
 * Show the share success modal with link
 * @param {Object} options
 * @param {string} options.shareUrl - The share URL to display
 * @param {string} [options.shareId] - The share identifier to highlight
 */
export function showShareModal({ shareUrl, shareId } = {}) {
  const modal = document.getElementById('share-modal');
  const input = document.getElementById('share-link-input');
  const copyBtn = document.getElementById('copy-link-btn');
  const closeBtn = document.getElementById('share-modal-close');
  const shareIdRow = document.getElementById('share-id-row');
  const shareIdInput = document.getElementById('share-id-input');

  if (!modal || !input) return;

  input.value = shareUrl;

  if (shareIdRow) {
    const hasId = Boolean(shareId);
    shareIdRow.hidden = !hasId;
    if (shareIdInput) {
      shareIdInput.value = hasId ? shareId : '';
    }
  } else if (shareIdInput) {
    shareIdInput.value = shareId || '';
  }

  modal.style.display = 'flex';
  
  // Select the URL text
  setTimeout(() => {
    input.select();
    input.focus();
  }, 100);

  // Copy button handler
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      const originalHtml = copyBtn.innerHTML;
      copyBtn.innerHTML = '<i class="fas fa-check"></i><span>Copied!</span>';
      copyBtn.classList.add('copied');
      
      setTimeout(() => {
        copyBtn.innerHTML = originalHtml;
        copyBtn.classList.remove('copied');
      }, 2000);

      showNotification({
        type: 'success',
        title: 'Link copied!',
        message: 'Share URL copied to clipboard',
        duration: 3000
      });
    } catch (error) {
      console.error('Failed to copy:', error);
      showNotification({
        type: 'error',
        title: 'Copy failed',
        message: 'Please copy the link manually',
        duration: 4000
      });
    }
  };

  // Close modal handlers
  const closeModal = () => {
    modal.classList.add('closing');
    setTimeout(() => {
      modal.style.display = 'none';
      modal.classList.remove('closing');
    }, 200);
    
    // Clean up event listeners
    copyBtn.removeEventListener('click', handleCopy);
    closeBtn.removeEventListener('click', closeModal);
    modal.removeEventListener('click', handleOverlayClick);
    document.removeEventListener('keydown', handleEscape);
  };

  const handleOverlayClick = (e) => {
    if (e.target === modal) {
      closeModal();
    }
  };

  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      closeModal();
    }
  };

  // Add event listeners
  copyBtn.addEventListener('click', handleCopy);
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', handleOverlayClick);
  document.addEventListener('keydown', handleEscape);
}

/**
 * Show a confirmation dialog (replaces window.confirm)
 * @param {string} message
 * @param {Object} options
 * @returns {Promise<boolean>}
 */
export function showConfirm(message, { title = 'Confirm', confirmText = 'Confirm', cancelText = 'Cancel' } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <i class="fas fa-question-circle modal-icon warning"></i>
          <h3 class="modal-title">${escapeHtml(title)}</h3>
        </div>
        <div class="modal-body">
          <p class="modal-message">${escapeHtml(message)}</p>
          <div class="modal-action-row">
            <button class="btn btn-secondary btn-compact" id="confirm-cancel" type="button">${escapeHtml(cancelText)}</button>
            <button class="btn btn-primary btn-compact" id="confirm-ok" type="button">${escapeHtml(confirmText)}</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const handleClose = (result) => {
      overlay.classList.add('closing');
      setTimeout(() => {
        overlay.remove();
      }, 200);
      resolve(result);
    };

    overlay.querySelector('#confirm-ok').addEventListener('click', () => handleClose(true));
    overlay.querySelector('#confirm-cancel').addEventListener('click', () => handleClose(false));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) handleClose(false);
    });

    document.addEventListener('keydown', function handleEscape(e) {
      if (e.key === 'Escape') {
        handleClose(false);
        document.removeEventListener('keydown', handleEscape);
      }
    });
  });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
