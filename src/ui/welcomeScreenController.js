/**
 * Welcome Screen Controller for Lorescape Map Builder
 * Manages the welcome modal with loading progress and exclusive access information
 */

import { onLoadingProgress } from '../utils/assetLoadingManager.js';

const ACCESS_PASSWORD = 'lorescape-beta';

class WelcomeScreenController {
  constructor() {
    this.modal = null;
    this.progressFill = null;
    this.progressPercentage = null;
    this.progressDetails = null;
    this.currentAsset = null;
    this.startButton = null;
    this.passwordForm = null;
    this.passwordInput = null;
    this.passwordMessage = null;
    this.isVisible = true;
    this.isLoadingComplete = false;
    this.hasValidPassword = false;
    this.onCloseCallbacks = [];
    
    this.init();
  }

  init() {
    // Get DOM elements
    this.modal = document.getElementById('welcome-modal');
    this.progressFill = document.getElementById('progress-fill');
    this.progressPercentage = document.getElementById('progress-percentage');
    this.progressDetails = document.getElementById('progress-details');
    this.currentAsset = document.getElementById('current-asset');
    this.startButton = document.getElementById('start-building');
    this.passwordForm = document.getElementById('password-form');
    this.passwordInput = document.getElementById('access-password');
    this.passwordMessage = document.getElementById('password-message');

    if (!this.modal) {
      console.error('Welcome modal not found in DOM');
      return;
    }

    // Set up event listeners
    this.setupEventListeners();
    this.setupPasswordGate();
    
    // Listen for loading progress updates
    this.setupLoadingProgress();
    
    // Show modal initially
    this.show();
    this.updateStartButtonState();
  }

  setupEventListeners() {
    if (this.startButton) {
      this.startButton.addEventListener('click', () => {
        if (!this.canStart()) {
          this.validatePassword({ announceEmpty: true });
          if (this.passwordInput) {
            this.passwordInput.focus();
          }
          return;
        }
        this.close();
      });
    }

    // Prevent modal from closing when clicking on content
    const welcomeContent = this.modal?.querySelector('.welcome-content');
    if (welcomeContent) {
      welcomeContent.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    // Close modal when clicking backdrop (only after loading is complete)
    this.modal?.addEventListener('click', () => {
      if (this.startButton && !this.startButton.disabled) {
        this.close();
      }
    });

    // Handle escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible && this.startButton && !this.startButton.disabled) {
        this.close();
      }
    });
  }

  setupLoadingProgress() {
    onLoadingProgress((progress) => {
      this.updateProgress(progress);
    });
  }

  updateProgress(progress) {
    const { loaded, total, percentage, currentAsset, isComplete } = progress;

    // Update progress bar
    if (this.progressFill) {
      this.progressFill.style.width = `${percentage}%`;
    }

    // Update percentage text
    if (this.progressPercentage) {
      this.progressPercentage.textContent = `${percentage}%`;
    }

    // Update details text
    if (this.progressDetails) {
      this.progressDetails.textContent = `${loaded}/${total} assets`;
    }

    // Update current asset text
    if (this.currentAsset) {
      if (currentAsset) {
        this.currentAsset.textContent = `Loading: ${currentAsset}...`;
      } else if (isComplete) {
        this.currentAsset.textContent = 'All assets loaded successfully!';
      } else {
        this.currentAsset.textContent = 'Preparing environment...';
      }
    }

    this.isLoadingComplete = Boolean(isComplete);
    this.updateStartButtonState();
  }

  show() {
    if (this.modal) {
      this.modal.classList.remove('hidden');
      this.isVisible = true;
      
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
      
      // Focus trap (simple implementation)
      setTimeout(() => {
        if (!this.hasValidPassword && this.passwordInput) {
          this.passwordInput.focus();
        } else if (this.startButton && !this.startButton.disabled) {
          this.startButton.focus();
        }
      }, 100);
    }
  }

  close() {
    if (this.modal && this.isVisible) {
      // Add closing animation class
      this.modal.style.animation = 'welcomeFadeOut 0.4s ease-in-out';
      
      setTimeout(() => {
        this.modal.classList.add('hidden');
        this.modal.style.animation = '';
        this.isVisible = false;
        
        // Restore body scroll
        document.body.style.overflow = '';
        
        // Call close callbacks
        this.onCloseCallbacks.forEach(callback => {
          try {
            callback();
          } catch (error) {
            console.error('Error in welcome screen close callback:', error);
          }
        });
      }, 400);
    }
  }

  onClose(callback) {
    if (typeof callback === 'function') {
      this.onCloseCallbacks.push(callback);
    }
  }

  offClose(callback) {
    const index = this.onCloseCallbacks.indexOf(callback);
    if (index > -1) {
      this.onCloseCallbacks.splice(index, 1);
    }
  }

  isOpen() {
    return this.isVisible;
  }

  // Force close (for programmatic use)
  forceClose() {
    this.close();
  }

  setupPasswordGate() {
    if (!this.passwordForm || !this.passwordInput) {
      this.hasValidPassword = true;
      this.updateStartButtonState();
      return;
    }

    this.passwordForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const success = this.validatePassword({ focusOnError: true });
      if (success && this.canStart()) {
        this.close();
      }
    });

    this.passwordInput.addEventListener('input', () => {
      const trimmed = (this.passwordInput.value || '').trim();
      this.clearPasswordFeedback();

      if (!trimmed) {
        this.hasValidPassword = false;
        this.passwordInput.classList.remove('is-invalid', 'is-valid');
        this.passwordInput.removeAttribute('aria-invalid');
        this.updateStartButtonState();
        return;
      }

      if (trimmed === ACCESS_PASSWORD) {
        this.hasValidPassword = true;
        this.passwordInput.classList.remove('is-invalid');
        this.passwordInput.classList.add('is-valid');
        this.passwordInput.setAttribute('aria-invalid', 'false');
        this.showPasswordFeedback('Access granted. You can now start building maps.', 'success');
      } else {
        this.hasValidPassword = false;
        this.passwordInput.classList.remove('is-invalid', 'is-valid');
        this.passwordInput.removeAttribute('aria-invalid');
      }

      this.updateStartButtonState();
    });
  }

  validatePassword({ focusOnError = false, announceEmpty = false } = {}) {
    if (!this.passwordInput) {
      this.hasValidPassword = true;
      this.updateStartButtonState();
      return true;
    }

    const entered = (this.passwordInput.value || '').trim();

    if (!entered) {
      this.hasValidPassword = false;
      if (announceEmpty) {
        this.showPasswordFeedback('Password is required to continue.', 'error');
        this.passwordInput.classList.add('is-invalid');
        this.passwordInput.setAttribute('aria-invalid', 'true');
      }
      if (focusOnError) {
        this.passwordInput.focus();
      }
      this.updateStartButtonState();
      return false;
    }

    if (entered === ACCESS_PASSWORD) {
      this.hasValidPassword = true;
      this.passwordInput.classList.remove('is-invalid');
      this.passwordInput.classList.add('is-valid');
      this.passwordInput.setAttribute('aria-invalid', 'false');
      this.showPasswordFeedback('Access granted. You can now start building maps.', 'success');
      this.updateStartButtonState();
      return true;
    }

    this.hasValidPassword = false;
    this.passwordInput.classList.add('is-invalid');
    this.passwordInput.classList.remove('is-valid');
    this.passwordInput.setAttribute('aria-invalid', 'true');
    this.showPasswordFeedback('Incorrect password. Please try again.', 'error');
    if (focusOnError) {
      this.passwordInput.focus();
      this.passwordInput.select();
    }
    this.updateStartButtonState();
    return false;
  }

  canStart() {
    return this.isLoadingComplete && this.hasValidPassword;
  }

  updateStartButtonState() {
    if (!this.startButton) {
      return;
    }

    if (!this.isLoadingComplete) {
      this.startButton.disabled = true;
      this.startButton.textContent = 'Loading...';
      return;
    }

    if (!this.hasValidPassword) {
      this.startButton.disabled = true;
      this.startButton.textContent = 'Enter Password to Continue';
      return;
    }

    this.startButton.disabled = false;
    this.startButton.textContent = 'Start Building Maps';
  }

  showPasswordFeedback(message, tone = 'info') {
    if (!this.passwordMessage) {
      return;
    }

    this.passwordMessage.textContent = message;
    this.passwordMessage.classList.remove('is-error', 'is-success');

    if (tone === 'error') {
      this.passwordMessage.classList.add('is-error');
      return;
    }

    if (tone === 'success') {
      this.passwordMessage.classList.add('is-success');
    }
  }

  clearPasswordFeedback() {
    if (!this.passwordMessage) {
      return;
    }
    this.passwordMessage.textContent = '';
    this.passwordMessage.classList.remove('is-error', 'is-success');
  }
}

// Add fadeOut animation to CSS if not exists
if (!document.querySelector('style[data-welcome-animations]')) {
  const style = document.createElement('style');
  style.setAttribute('data-welcome-animations', 'true');
  style.textContent = `
    @keyframes welcomeFadeOut {
      from {
        opacity: 1;
        transform: scale(1);
      }
      to {
        opacity: 0;
        transform: scale(0.95);
      }
    }
  `;
  document.head.appendChild(style);
}

// Create and export singleton instance
export const welcomeScreenController = new WelcomeScreenController();

export default welcomeScreenController;