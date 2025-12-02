/**
 * LORESCAPE MAP BUILDER - ANALYTICS MODULE
 * Centralny moduł zarządzający wszystkimi statystykami i metrykami mapy
 */

import { HeaderStats } from './headerStats.js';
import { MapMetrics } from './mapMetrics.js';
import { BiomeAnalysis } from './biomeAnalysis.js';
import { EfficiencyMetrics } from './efficiencyMetrics.js';
import createDebugLogger from '../src/utils/debugLogger.js';

const analyticsLog = createDebugLogger('analytics');

export class MapAnalytics {
  constructor(placedTiles, packCounts, standaloneBiomeSetCounts, biomeSets, environmentPacks, getPlacementMode, tileInstanceLimits) {
    // Główne dane
    this.placedTiles = placedTiles;
  this.packCounts = packCounts;
  this.standaloneBiomeSetCounts = standaloneBiomeSetCounts;
    this.biomeSets = biomeSets;
    this.environmentPacks = environmentPacks;
    this.getPlacementMode = getPlacementMode; // Function to get current placement mode
    this.tileInstanceLimits = tileInstanceLimits;

    // Inicjalizacja modułów
    this.headerStats = new HeaderStats(this);
    this.mapMetrics = new MapMetrics(this);
    this.biomeAnalysis = new BiomeAnalysis(this);
  this.efficiencyMetrics = new EfficiencyMetrics(this);

  analyticsLog.log('📊 MapAnalytics initialized');
  }

  /**
   * Aktualizuje wszystkie statystyki
   */
  updateAll() {
  analyticsLog.log('📊 Updating all analytics...');
    this.updateHeaderStats();
    this.updateRightPanelStats();
  }

  /**
   * Aktualizuje statystyki w górnej belce
   */
  updateHeaderStats() {
    this.headerStats.update();
  }

  /**
   * Aktualizuje statystyki w prawym panelu
   */
  updateRightPanelStats() {
    this.updateMapOverview();
    this.updateBiomeBreakdown();
    this.updateEfficiencyMetrics();
  }

  /**
   * Aktualizuje sekcję Overview w prawym panelu
   */
  updateMapOverview() {
    this.mapMetrics.updateOverview();
  }

  /**
   * Aktualizuje podział na biomy
   */
  updateBiomeBreakdown() {
    this.biomeAnalysis.updateBreakdown();
  }

  /**
   * Aktualizuje metryki efektywności
   */
  updateEfficiencyMetrics() {
    this.efficiencyMetrics.update();
  }

  // ============================================================================
  // HELPER METHODS - współdzielone funkcje dla wszystkich modułów
  // ============================================================================

  /**
   * Oblicza całkowitą liczbę użytych zestawów
   */
  calculateTotalSetsUsed() {
    const placementMode = this.getPlacementMode();
    if (placementMode === 'unlimited') {
      // In unlimited mode, Required should be driven by the maximum duplicates
      // of any single tile number within each biome set (since each set has 1 of each tile).
      let required = 0;
      this.biomeSets.forEach(biome => {
        required += this.calculateMinRequiredSets(biome.id);
      });
      return required;
    } else {
      // Limited mode: use the true minimum required sets per biome,
      // based on duplicate usage of the same tile numbers (1..50) within that biome.
      // This aligns with how availability is enforced in Limited mode.
      let requiredSets = 0;
      this.biomeSets.forEach(biome => {
        requiredSets += this.calculateMinRequiredSets(biome.id);
      });
      return requiredSets;
    }
  }

  /**
   * Oblicza całkowitą liczbę posiadanych zestawów
   */
  calculateTotalSetsOwned() {
  // Count unique biome-set supply from packs and standalone selections
    const ownedByBiome = new Map();
    // From packs
    this.packCounts.forEach((count, packId) => {
      const pack = this.environmentPacks.find(p => p.id === packId);
      if (pack && pack.components) {
        pack.components.forEach(comp => {
          ownedByBiome.set(comp.setId, (ownedByBiome.get(comp.setId) || 0) + count * comp.quantity);
        });
      }
    });
  // From direct standalone biome sets
  this.standaloneBiomeSetCounts.forEach((count, biomeId) => {
      ownedByBiome.set(biomeId, (ownedByBiome.get(biomeId) || 0) + count);
    });
    // Sum across all biome sets
    let total = 0;
    ownedByBiome.forEach(v => { total += v; });
    return total;
  }

  /**
   * Oblicza zakres wysokości (pokazuje najwyższy poziom)
   */
  calculateHeightRange() {
    if (this.placedTiles.size === 0) return '0';
    
    let maxHeight = -Infinity;
    
    this.placedTiles.forEach((_, key) => {
      const yLevel = parseInt(key.split(',y:')[1]);
      maxHeight = Math.max(maxHeight, yLevel);
    });
    
  // Return human-friendly level count (1-based). Max index + 1 equals number of levels.
  return `${maxHeight + 1}`;
  }

  /**
   * Oblicza wymiary mapy w heksach (poprawione dla hex grid)
   */
  calculateMapDimensions() {
    const coordinates = Array.from(this.placedTiles.keys()).map(key => {
      const match = key.match(/q:(-?\d+),r:(-?\d+),y:(-?\d+)/);
      return match ? {
        q: parseInt(match[1]),
        r: parseInt(match[2]),
        y: parseInt(match[3])
      } : null;
    }).filter(Boolean);
    
  if (coordinates.length === 0) return '0x0';
    
  const minR = Math.min(...coordinates.map(c => c.r));
  const maxR = Math.max(...coordinates.map(c => c.r));

  // Dla hex grid, rzeczywista szerokość to maksymalna różnica w kierunku poziomym
  // Uwzględniamy offset spowodowany układem hex
  const height = maxR - minR + 1;
    
    // Sprawdź rzeczywistą szerokość poprzez analizę unikalnych pozycji X
    const uniqueX = new Set();
    coordinates.forEach(coord => {
      // Konwersja hex do kartezjańskich dla sprawdzenia szerokości
      const x = coord.q + coord.r * 0.5;
      uniqueX.add(Math.round(x * 2)); // Round to handle floating point
    });
    
    const actualWidth = uniqueX.size;
    
    return `${actualWidth}x${height}`;
  }

  /**
   * Pobiera całkowitą liczbę zestawów dla danego biomu
   */
  getBiomeTotalSets(biomeId) {
    let total = 0;
    
    // From packs
    this.packCounts.forEach((count, packId) => {
      const pack = this.environmentPacks.find(p => p.id === packId);
      if (pack && pack.components) {
        const component = pack.components.find(c => c.setId === biomeId);
        if (component) {
          total += count * component.quantity;
        }
      }
    });
    
  // From direct standalone selections
  total += this.standaloneBiomeSetCounts.get(biomeId) || 0;
    
    return total;
  }

  /**
   * Oblicza minimalną wymaganą liczbę zestawów dla biomu
   */
  calculateMinRequiredSets(biomeId) {
    // Count how many times each tile number is used within the biome
    const tileUsage = {};
    this.placedTiles.forEach(tile => {
      if (tile.biomeId === biomeId && tile.tileNumber != null) {
        tileUsage[tile.tileNumber] = (tileUsage[tile.tileNumber] || 0) + 1;
      }
    });
    // Required sets for that biome equals max duplicates of any one tile
    let maxUsage = 0;
    Object.values(tileUsage).forEach(usage => {
      maxUsage = Math.max(maxUsage, usage);
    });
    return maxUsage;
  }

  /**
   * Grupuje kafelki według biomów
   */
  groupTilesByBiome() {
    const biomeCounts = {};
    this.placedTiles.forEach(tile => {
      const biomeKey = tile.biomeId || tile.name; // Obsługa różnych formatów
      biomeCounts[biomeKey] = (biomeCounts[biomeKey] || 0) + 1;
    });
    return biomeCounts;
  }
}
