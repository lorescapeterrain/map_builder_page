import { MapAnalytics } from '../../analytics/analytics.js';

/**
 * Coordinates analytics updates and tile inventory bookkeeping.
 */
export function createAnalyticsController(options) {
  const {
    stateManager,
    biomeSets,
    environmentPacks,
    getPlacementMode,
    onHeaderStatsUpdated,
    onRightPanelStatsUpdated
  } = options;

  if (!stateManager) {
    throw new Error('createAnalyticsController requires a stateManager instance');
  }

  const {
    packCounts,
    standaloneBiomeSetCounts,
    perBiomeDenominator,
    tileInstanceLimits,
    placedTiles,
    setUpdateCallbacks,
    ensureBiomeInitialized,
    getBiomeTotalSets
  } = stateManager;

  let analytics = null;
  let isUpdatingHeaderStats = false;
  let isUpdatingRightPanelStats = false;

  const triggerHeaderStats = () => {
    if (!analytics) return;
    if (isUpdatingHeaderStats) return;

    isUpdatingHeaderStats = true;
    try {
      analytics.updateHeaderStats();
      onHeaderStatsUpdated?.();
    } finally {
      isUpdatingHeaderStats = false;
    }
  };

  const triggerRightPanelStats = () => {
    if (!analytics) return;
    if (isUpdatingRightPanelStats) return;

    isUpdatingRightPanelStats = true;
    try {
      analytics.updateRightPanelStats();
      onRightPanelStatsUpdated?.();
    } finally {
      isUpdatingRightPanelStats = false;
    }
  };

  const triggerAllStats = () => {
    triggerHeaderStats();
    triggerRightPanelStats();
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function initialize() {
    analytics = new MapAnalytics(
      placedTiles,
      packCounts,
      standaloneBiomeSetCounts,
      biomeSets,
      environmentPacks,
      getPlacementMode,
      tileInstanceLimits
    );

    setUpdateCallbacks({
      updateHeaderStats: triggerHeaderStats,
      updateRightPanelStats: triggerRightPanelStats
    });

    return analytics;
  }

  function withLimiter({ biomeId, instanceId, delta = 0, silent = false }) {
    const placementMode = getPlacementMode?.() ?? 'limited';
    if (placementMode !== 'limited' || !instanceId || !biomeId) {
      if (!silent) triggerAllStats();
      return {
        remaining: null,
        originalTotal: null,
        usedUp: false
      };
    }

    ensureBiomeInitialized?.(biomeId);

    const originalTotal = perBiomeDenominator.get(biomeId) || getBiomeTotalSets?.(biomeId) || 0;
    const current = tileInstanceLimits.get(instanceId);

    const startingValue = typeof current === 'number' ? current : originalTotal;
    const nextValue = clamp(startingValue + delta, 0, originalTotal);

    tileInstanceLimits.set(instanceId, nextValue);

    if (!silent) {
      triggerAllStats();
    }

    return {
      remaining: nextValue,
      originalTotal,
      usedUp: nextValue === 0
    };
  }

  function decrementTileAvailability({ biomeId, instanceId, silent = false } = {}) {
    return withLimiter({ biomeId, instanceId, delta: -1, silent });
  }

  function incrementTileAvailability({ biomeId, instanceId, silent = false } = {}) {
    return withLimiter({ biomeId, instanceId, delta: +1, silent });
  }

  function setTileAvailability({ biomeId, instanceId, value, silent = false } = {}) {
    const placementMode = getPlacementMode?.() ?? 'limited';
    if (placementMode !== 'limited' || !instanceId || !biomeId) {
      if (!silent) triggerAllStats();
      return {
        remaining: null,
        originalTotal: null,
        usedUp: false
      };
    }

    ensureBiomeInitialized?.(biomeId);
    const originalTotal = perBiomeDenominator.get(biomeId) || getBiomeTotalSets?.(biomeId) || 0;
    const nextValue = clamp(value ?? originalTotal, 0, originalTotal);
    tileInstanceLimits.set(instanceId, nextValue);

    if (!silent) {
      triggerAllStats();
    }

    return {
      remaining: nextValue,
      originalTotal,
      usedUp: nextValue === 0
    };
  }

  function applyTileLimitsSnapshot(limitSnapshot, { silent = false } = {}) {
    if (!limitSnapshot) return;
    limitSnapshot.forEach((value, key) => {
      const [biomeId] = key.split('_');
      if (!biomeId) return;
      setTileAvailability({ biomeId, instanceId: key, value, silent: true });
    });

    if (!silent) {
      triggerAllStats();
    }
  }

  function resetTileAvailability({ reinitialize = true, silent = false } = {}) {
    tileInstanceLimits.clear();

    if (reinitialize && getPlacementMode?.() === 'limited') {
      biomeSets.forEach((biome) => ensureBiomeInitialized?.(biome.id));
    }

    if (!silent) {
      triggerAllStats();
    }
  }

  function recomputeTileAvailabilityFromPlacedTiles({ silent = false } = {}) {
    resetTileAvailability({ reinitialize: true, silent: true });

    placedTiles.forEach((tile) => {
      if (!tile) return;
      const instanceId = tile.instanceId;
      if (!instanceId) return;

      const biomeId = tile.biomeId
        || tile.name
        || instanceId.split('_').slice(0, -1).join('_');

      if (!biomeId) return;

      decrementTileAvailability({ biomeId, instanceId, silent: true });
    });

    if (!silent) {
      triggerAllStats();
    }
  }

  function notifyStateChange() {
    triggerAllStats();
  }

  function getAnalytics() {
    return analytics;
  }

  return {
    initialize,
    getAnalytics,
    updateHeaderStats: triggerHeaderStats,
    updateRightPanelStats: triggerRightPanelStats,
    notifyStateChange,
    decrementTileAvailability,
    incrementTileAvailability,
    setTileAvailability,
    applyTileLimitsSnapshot,
    resetTileAvailability,
    recomputeTileAvailabilityFromPlacedTiles
  };
}
