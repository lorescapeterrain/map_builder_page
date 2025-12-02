import { biomeSets, environmentPacks } from '../../data/data.js';
import createDebugLogger from '../utils/debugLogger.js';
import { showNotification } from '../ui/notifications.js';

const stateLog = createDebugLogger('state');

/**
 * Encapsulates shared state for pack counts, biome set limits and placed tiles.
 * Consumers provide lightweight callbacks so this module stays UI-agnostic.
 */
export function createStateManager({ getPlacementMode }) {
  if (typeof getPlacementMode !== 'function') {
    throw new Error('createStateManager requires a getPlacementMode function');
  }

  const state = {
    packCounts: new Map(),
    standaloneBiomeSetCounts: new Map(),
    perBiomeDenominator: new Map(),
    tileInstanceLimits: new Map(),
    placedTiles: new Map()
  };

  let headerStatsUpdater = () => {};
  let rightPanelStatsUpdater = () => {};

  function setUpdateCallbacks({ updateHeaderStats, updateRightPanelStats } = {}) {
    headerStatsUpdater = typeof updateHeaderStats === 'function' ? updateHeaderStats : () => {};
    rightPanelStatsUpdater = typeof updateRightPanelStats === 'function' ? updateRightPanelStats : () => {};
  }

  function notifyStats() {
    headerStatsUpdater();
    rightPanelStatsUpdater();
  }

  function getTotalFromPacks(biomeId) {
    let total = 0;
    environmentPacks.forEach(pack => {
      const count = state.packCounts.get(pack.id) || 0;
      if (count > 0) {
        pack.components
          .filter(component => component.setId === biomeId)
          .forEach(component => {
            total += count * (component.quantity ?? 1);
          });
      }
    });
    return total;
  }

  function calculateMinRequiredSets(biomeId) {
    if (getPlacementMode() !== 'limited') return 0;
    
    // If no tiles are placed, no sets are required
    if (state.placedTiles.size === 0) return 0;

    const tileUsageCounts = new Map();

    state.placedTiles.forEach(tile => {
      if (tile.instanceId && tile.instanceId.startsWith(biomeId + '_')) {
        const tileNumber = parseInt(tile.instanceId.split('_')[2]);
        if (!isNaN(tileNumber)) {
          const currentCount = tileUsageCounts.get(tileNumber) || 0;
          tileUsageCounts.set(tileNumber, currentCount + 1);
        }
      }
    });

    // If no tiles of this biome are used, return 0
    if (tileUsageCounts.size === 0) return 0;

    let maxRequiredSets = 0;
    tileUsageCounts.forEach((usageCount) => {
      if (usageCount > maxRequiredSets) {
        maxRequiredSets = usageCount;
      }
    });

    const usedTileNumbers = Array.from(tileUsageCounts.keys()).sort((a, b) => a - b);
    const usageDetails = usedTileNumbers.map(num => `${num}(×${tileUsageCounts.get(num)})`);
  stateLog.log(`🔍 Biome ${biomeId}: used tiles [${usageDetails.join(', ')}], max required sets ${maxRequiredSets}`);
    return maxRequiredSets;
  }

  function setPackCount(packId, newCount) {
  stateLog.log(`🔄 Setting pack ${packId} count to: ${newCount}`);

    const count = Math.max(0, parseInt(newCount) || 0);
    const currentCount = state.packCounts.get(packId) || 0;

    if (count < currentCount && getPlacementMode() === 'limited') {
      const pack = environmentPacks.find(p => p.id === packId);
      if (pack) {
        for (const component of pack.components) {
          const biomeId = component.setId;
          const currentFromPacks = getTotalFromPacks(biomeId);
          const standaloneCount = state.standaloneBiomeSetCounts.get(biomeId) || 0;
          const packContribution = currentCount * component.quantity;
          const newPackContribution = count * component.quantity;
          const newTotalSets = Math.max(0, currentFromPacks - packContribution + newPackContribution + standaloneCount);
          const minRequiredSets = calculateMinRequiredSets(biomeId);

          if (newTotalSets < minRequiredSets) {
            const biomeName = biomeSets.find(b => b.id === biomeId)?.name || biomeId;
            showNotification({
              type: 'error',
              title: `Cannot decrease "${pack.name}" quantity`,
              message: `You have "${biomeName}" tiles from ${minRequiredSets} different sets placed on the map.\n\nCurrent total: ${currentFromPacks + standaloneCount} sets\nWould become: ${newTotalSets} sets\nMinimum required: ${minRequiredSets} sets\n\nPlease remove some "${biomeName}" tiles from the map first.`,
              duration: 8000
            });
            stateLog.warn(`❌ Blocked pack count decrease: ${pack.name} would reduce ${biomeName} below required ${minRequiredSets} sets`);
            return currentCount;
          }
        }
      }
    }

    if (count === 0) {
      state.packCounts.delete(packId);
    } else {
      state.packCounts.set(packId, count);
    }

    if (getPlacementMode() === 'limited') {
      const pack = environmentPacks.find(p => p.id === packId);
      if (pack && pack.components) {
        pack.components.forEach(component => {
          ensureBiomeInitialized(component.setId);
        });
      }
    }

    notifyStats();
  stateLog.log(`✅ Pack ${packId} count updated to: ${count}`);
    return count;
  }

  function setStandaloneBiomeSetCount(biomeId, newCount) {
  stateLog.log(`🔄 Setting standalone biome set ${biomeId} count to: ${newCount}`);

    const count = Math.max(0, parseInt(newCount) || 0);
    const currentCount = state.standaloneBiomeSetCounts.get(biomeId) || 0;

    if (count < currentCount && getPlacementMode() === 'limited') {
      const currentFromPacks = getTotalFromPacks(biomeId);
  const newTotalSets = Math.max(0, currentFromPacks + count);
      const minRequiredSets = calculateMinRequiredSets(biomeId);

      if (newTotalSets < minRequiredSets) {
        const biomeName = biomeSets.find(b => b.id === biomeId)?.name || biomeId;
        showNotification({
          type: 'error',
          title: `Cannot reduce "${biomeName}" standalone sets`,
          message: `You have tiles from ${minRequiredSets} different sets placed on the map.\n\nCurrent total: ${currentFromPacks + currentCount} sets\nWould become: ${newTotalSets} sets\nMinimum required: ${minRequiredSets} sets\n\nPlease remove some "${biomeName}" tiles from the map first.`,
          duration: 8000
        });
        return currentCount;
      }
    }

    if (count === 0) {
      state.standaloneBiomeSetCounts.delete(biomeId);
    } else {
      state.standaloneBiomeSetCounts.set(biomeId, count);
    }

    if (getPlacementMode() === 'limited') {
      ensureBiomeInitialized(biomeId);
    }

    notifyStats();
  stateLog.log(`✅ Standalone biome set ${biomeId} count updated to: ${count}`);
    return count;
  }

  function placeTile(hexCoords, biomeId, tileNumber, yLevel = 0) {
  stateLog.log(`🔄 Placing tile: ${biomeId}_${tileNumber} at ${hexCoords.q},${hexCoords.r} level ${yLevel}`);

    const key = `q:${hexCoords.q},r:${hexCoords.r},y:${yLevel}`;
    const tileData = {
      biomeId,
      tileNumber,
      hexCoords,
      yLevel,
      name: biomeId
    };

    state.placedTiles.set(key, tileData);
    notifyStats();
  stateLog.log(`✅ Tile placed at ${key}`);
    return tileData;
  }

  function removeTile(hexCoords, yLevel = 0) {
  stateLog.log(`🔄 Removing tile at ${hexCoords.q},${hexCoords.r} level ${yLevel}`);

    const key = `q:${hexCoords.q},r:${hexCoords.r},y:${yLevel}`;
    const removed = state.placedTiles.delete(key);
    notifyStats();
  stateLog.log(`✅ Tile removed from ${key}: ${removed}`);
    return removed;
  }

  function getBiomeTotalSets(biomeId) {
    let total = 0;
    environmentPacks.forEach(pack => {
      const count = state.packCounts.get(pack.id) || 0;
      if (count > 0 && pack.components.some(c => c.setId === biomeId)) total += count;
    });
    total += (state.standaloneBiomeSetCounts.get(biomeId) || 0);
    return total;
  }

  function ensureBiomeInitialized(biomeId) {
    if (getPlacementMode() !== 'limited') return;
    const total = getBiomeTotalSets(biomeId);
    const oldTotal = state.perBiomeDenominator.get(biomeId) || 0;

    for (let i = 1; i <= 50; i++) {
      const key = `${biomeId}_${i}`;
      const currentRemaining = state.tileInstanceLimits.get(key) || 0;

      if (!state.tileInstanceLimits.has(key)) {
        state.tileInstanceLimits.set(key, total);
      } else if (total !== oldTotal) {
        const used = oldTotal - currentRemaining;
        const newRemaining = Math.max(0, total - used);
        state.tileInstanceLimits.set(key, newRemaining);
      }
    }
    state.perBiomeDenominator.set(biomeId, total);
  }

  function calculateTotalSetsUsed() {
    if (getPlacementMode() === 'unlimited') {
      let total = 0;
      const counts = {};
      state.placedTiles.forEach(t => {
        counts[t.name] = (counts[t.name] || 0) + 1;
      });
      for (const name in counts) {
        total += Math.ceil(counts[name] / 50);
      }
      return total;
    }

    let used = 0;
    biomeSets.forEach(biome => {
      const total = getBiomeTotalSets(biome.id);
      if (total > 0) {
        let biomeUsed = 0;
        for (let i = 1; i <= 50; i++) {
          const key = `${biome.id}_${i}`;
          const remaining = state.tileInstanceLimits.get(key) || total;
          biomeUsed += (total - remaining);
        }
        used += biomeUsed / 50;
      }
    });
    return used;
  }

  function calculateTotalSetsOwned() {
    let total = 0;
    state.packCounts.forEach(count => total += count);
    state.standaloneBiomeSetCounts.forEach(count => total += count);
    return total;
  }

  function calculateHeightRange() {
    if (state.placedTiles.size === 0) return '0-0';

    let minHeight = Infinity;
    let maxHeight = -Infinity;

    state.placedTiles.forEach((_, key) => {
      const yLevel = parseInt(key.split(',y:')[1]);
      minHeight = Math.min(minHeight, yLevel);
      maxHeight = Math.max(maxHeight, yLevel);
    });

    return `${minHeight}-${maxHeight}`;
  }

  return {
    packCounts: state.packCounts,
    standaloneBiomeSetCounts: state.standaloneBiomeSetCounts,
    perBiomeDenominator: state.perBiomeDenominator,
    tileInstanceLimits: state.tileInstanceLimits,
    placedTiles: state.placedTiles,
    setUpdateCallbacks,
    setPackCount,
    setStandaloneBiomeSetCount,
    placeTile,
    removeTile,
    calculateMinRequiredSets,
    getBiomeTotalSets,
    ensureBiomeInitialized,
    getTotalFromPacks,
    calculateTotalSetsUsed,
    calculateTotalSetsOwned,
    calculateHeightRange
  };
}
