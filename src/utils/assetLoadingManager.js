/**
 * Asset Loading Progress Manager
 * Monitors loading progress of various assets in Lorescape Map Builder
 */

class AssetLoadingManager {
  constructor() {
    this.assets = new Map();
    this.totalAssets = 0;
    this.loadedAssets = 0;
    this.callbacks = [];
    this.isLoading = true;
    this.loadStartTime = Date.now();
  }

  /**
   * Register an asset to be tracked
   * @param {string} id - Unique identifier for the asset
   * @param {string} name - Display name for the asset
   * @param {string} type - Asset type (texture, model, font, etc.)
   */
  registerAsset(id, name, type = 'unknown') {
    if (this.assets.has(id)) {
      console.warn(`Asset ${id} is already registered`);
      return;
    }

    this.assets.set(id, {
      id,
      name,
      type,
      loaded: false,
      loadTime: null,
      error: null
    });
    
    this.totalAssets++;
    this.notifyProgress();
  }

  /**
   * Mark an asset as loaded
   * @param {string} id - Asset identifier
   */
  markAssetLoaded(id) {
    const asset = this.assets.get(id);
    if (!asset) {
      console.warn(`Asset ${id} not found for marking as loaded`);
      return;
    }

    if (!asset.loaded) {
      asset.loaded = true;
      asset.loadTime = Date.now();
      this.loadedAssets++;
      this.notifyProgress();
      
      // Check if all assets are loaded
      if (this.loadedAssets >= this.totalAssets && this.isLoading) {
        this.completeLoading();
      }
    }
  }

  /**
   * Mark an asset as failed to load
   * @param {string} id - Asset identifier
   * @param {Error} error - Error that occurred
   */
  markAssetError(id, error) {
    const asset = this.assets.get(id);
    if (!asset) {
      console.warn(`Asset ${id} not found for marking as error`);
      return;
    }

    asset.error = error;
    asset.loaded = true; // Count as "processed" even if failed
    this.loadedAssets++;
    this.notifyProgress();
    
    console.error(`Failed to load asset ${id}:`, error);
    
    // Check if all assets are processed
    if (this.loadedAssets >= this.totalAssets && this.isLoading) {
      this.completeLoading();
    }
  }

  /**
   * Get current loading progress
   * @returns {Object} Progress information
   */
  getProgress() {
    const percentage = this.totalAssets > 0 ? (this.loadedAssets / this.totalAssets) * 100 : 0;
    const elapsedTime = Date.now() - this.loadStartTime;
    
    return {
      loaded: this.loadedAssets,
      total: this.totalAssets,
      percentage: Math.round(percentage),
      isComplete: this.loadedAssets >= this.totalAssets,
      elapsedTime,
      isLoading: this.isLoading,
      currentAsset: this.getCurrentLoadingAsset()
    };
  }

  /**
   * Get the name of currently loading asset (first unloaded asset)
   */
  getCurrentLoadingAsset() {
    for (const asset of this.assets.values()) {
      if (!asset.loaded && !asset.error) {
        return asset.name;
      }
    }
    return null;
  }

  /**
   * Subscribe to progress updates
   * @param {Function} callback - Function to call on progress updates
   */
  onProgress(callback) {
    this.callbacks.push(callback);
    // Immediately call with current progress
    callback(this.getProgress());
  }

  /**
   * Remove progress callback
   * @param {Function} callback - Callback to remove
   */
  offProgress(callback) {
    const index = this.callbacks.indexOf(callback);
    if (index > -1) {
      this.callbacks.splice(index, 1);
    }
  }

  /**
   * Notify all callbacks of progress update
   */
  notifyProgress() {
    const progress = this.getProgress();
    this.callbacks.forEach(callback => {
      try {
        callback(progress);
      } catch (error) {
        console.error('Error in progress callback:', error);
      }
    });
  }

  /**
   * Complete the loading process
   */
  completeLoading() {
    this.isLoading = false;
    const totalTime = Date.now() - this.loadStartTime;
    
    console.log(`✅ Asset loading completed in ${totalTime}ms`);
    console.log(`📊 Assets loaded: ${this.loadedAssets}/${this.totalAssets}`);
    
    // Log any failed assets
    const failedAssets = Array.from(this.assets.values()).filter(asset => asset.error);
    if (failedAssets.length > 0) {
      console.warn(`⚠️ ${failedAssets.length} assets failed to load:`, failedAssets);
    }
    
    this.notifyProgress();
  }

  /**
   * Reset the loading manager
   */
  reset() {
    this.assets.clear();
    this.totalAssets = 0;
    this.loadedAssets = 0;
    this.isLoading = true;
    this.loadStartTime = Date.now();
    this.notifyProgress();
  }

  /**
   * Get detailed asset information for debugging
   */
  getAssetDetails() {
    return Array.from(this.assets.values());
  }
}

// Create global instance
export const assetLoadingManager = new AssetLoadingManager();

// Helper functions for easier integration
export const registerAsset = (id, name, type) => assetLoadingManager.registerAsset(id, name, type);
export const markAssetLoaded = (id) => assetLoadingManager.markAssetLoaded(id);
export const markAssetError = (id, error) => assetLoadingManager.markAssetError(id, error);
export const onLoadingProgress = (callback) => assetLoadingManager.onProgress(callback);
export const getLoadingProgress = () => assetLoadingManager.getProgress();

export default assetLoadingManager;