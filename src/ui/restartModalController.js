/**
 * Restart Modal Controller for Lorescape Map Builder
 * Handles logo click and restart confirmation modal
 */

class RestartModalController {
  constructor() {
    this.modal = null;
    this.logo = null;
    this.cancelBtn = null;
    this.confirmBtn = null;
    this.isVisible = false;
    
    this.init();
  }

  init() {
    // Get DOM elements
    this.modal = document.getElementById('restart-modal');
    this.logo = document.getElementById('brand-logo');
    this.cancelBtn = document.getElementById('cancel-restart');
    this.confirmBtn = document.getElementById('confirm-restart');

    if (!this.modal || !this.logo) {
      console.error('Restart modal or logo not found in DOM');
      return;
    }

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Logo click to show modal
    this.logo.addEventListener('click', () => {
      this.show();
    });

    // Cancel button
    if (this.cancelBtn) {
      this.cancelBtn.addEventListener('click', () => {
        this.hide();
      });
    }

    // Confirm button - restart the application
    if (this.confirmBtn) {
      this.confirmBtn.addEventListener('click', () => {
        this.restart();
      });
    }

    // Close on backdrop click
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal || e.target.classList.contains('restart-backdrop')) {
        this.hide();
      }
    });

    // Prevent modal content clicks from closing
    const restartContent = this.modal.querySelector('.restart-content');
    if (restartContent) {
      restartContent.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    // Handle escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });
  }

  show() {
    if (this.modal) {
      this.modal.classList.remove('hidden');
      this.isVisible = true;
      
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
      
      // Focus on cancel button by default
      setTimeout(() => {
        if (this.cancelBtn) {
          this.cancelBtn.focus();
        }
      }, 100);
    }
  }

  hide() {
    if (this.modal && this.isVisible) {
      // Add closing animation
      this.modal.style.animation = 'restartFadeOut 0.3s ease-in-out';
      
      setTimeout(() => {
        this.modal.classList.add('hidden');
        this.modal.style.animation = '';
        this.isVisible = false;
        
        // Restore body scroll
        document.body.style.overflow = '';
      }, 300);
    }
  }

  restart() {
    // Show loading state on confirm button
    if (this.confirmBtn) {
      this.confirmBtn.textContent = 'Restarting...';
      this.confirmBtn.disabled = true;
    }

    // Small delay for UX, then reload
    setTimeout(() => {
      window.location.reload();
    }, 500);
  }

  isOpen() {
    return this.isVisible;
  }
}

// Add fadeOut animation to CSS if not exists
if (!document.querySelector('style[data-restart-animations]')) {
  const style = document.createElement('style');
  style.setAttribute('data-restart-animations', 'true');
  style.textContent = `
    @keyframes restartFadeOut {
      from {
        opacity: 1;
        transform: scale(1);
      }
      to {
        opacity: 0;
        transform: scale(0.9);
      }
    }
  `;
  document.head.appendChild(style);
}

// Create and export singleton instance
export const restartModalController = new RestartModalController();

export default restartModalController;