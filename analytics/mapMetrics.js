/**
 * MAP METRICS MODULE
 * Zarządza metrykami mapy w sekcji Overview prawego panelu
 */

import createDebugLogger from '../src/utils/debugLogger.js';

const mapMetricsLog = createDebugLogger('analytics:metrics');

export class MapMetrics {
  constructor(analytics) {
    this.analytics = analytics;
  }

  /**
   * Aktualizuje sekcję Overview w prawym panelu
   * Zawiera tylko unikalne metryki nie duplikujące górnej belki
   */
  updateOverview() {
    const container = document.getElementById('map-stats');
    if (!container) return;

    // Oblicz metryki
    const totalTiles = this.analytics.placedTiles.size;
    const mapDimensions = this.analytics.calculateMapDimensions();
    const heightLevels = this.calculateHeightLevels();
    const uniqueBiomeSets = this.calculateUniqueBiomes();
    const totalSetsRequired = this.calculateTotalSetsRequired();
    const totalPacksRequired = this.calculateSetsRequired();

    // Renderuj sekcję Overview
    container.innerHTML = `
      <div class="stat-box">
        <div class="stat-number">${totalTiles}</div>
        <div class="stat-label">Total Tiles</div>
      </div>
      <div class="stat-box">
        <div class="stat-number">${mapDimensions}</div>
        <div class="stat-label">Map Size</div>
      </div>
      <div class="stat-box">
        <div class="stat-number">${heightLevels}</div>
        <div class="stat-label">Height Levels</div>
      </div>
      <div class="stat-box">
        <div class="stat-number">${uniqueBiomeSets}</div>
        <div class="stat-label">Unique Biome Sets</div>
      </div>
      <div class="stat-box">
        <div class="stat-number">${totalSetsRequired}</div>
        <div class="stat-label">Total Sets Required</div>
      </div>
      <div class="stat-box">
        <div class="stat-number">${totalPacksRequired}</div>
        <div class="stat-label">Total Packs Required</div>
      </div>
    `;
  }

  /**
   * Oblicza liczbę poziomów wysokości
   */
  calculateHeightLevels() {
    if (this.analytics.placedTiles.size === 0) return 0;

    const heights = new Set();
    this.analytics.placedTiles.forEach((_, key) => {
      const yLevel = parseInt(key.split(',y:')[1]);
      heights.add(yLevel);
    });

    return heights.size;
  }

  /**
   * Oblicza liczbę unikalnych biome setów użytych na mapie
   */
  calculateUniqueBiomes() {
    const uniqueBiomeSets = new Set();
    this.analytics.placedTiles.forEach(tile => {
      const biomeId = tile.biomeId || tile.name;
      if (biomeId) {
        uniqueBiomeSets.add(biomeId);
      }
    });
    return uniqueBiomeSets.size;
  }

  /**
   * Oblicza łączną liczbę zestawów biome potrzebnych do zbudowania mapy
   */
  calculateTotalSetsRequired() {
    if (this.analytics.placedTiles.size === 0) return 0;

    // Pogrupuj kafelki według biome
    const biomeCounts = this.analytics.groupTilesByBiome();
    let totalSetsNeeded = 0;

    // Dla każdego typu biome, użyj tej samej logiki co w Composition Breakdown
    Object.keys(biomeCounts).forEach(biomeKey => {
      // Znajdź biome data
      const biome = this.analytics.biomeSets.find(set => 
        set.name === biomeKey || set.id === biomeKey
      );
      
      // Użyj tej samej metody co w Composition Breakdown
      const setsRequired = this.analytics.calculateMinRequiredSets(biome?.id || biomeKey);
      totalSetsNeeded += setsRequired;
    });

    return totalSetsNeeded;
  }

  /**
   * Oblicza liczbę environment packów potrzebnych do stworzenia aktualnej mapy
   */
  calculateSetsRequired() {
    // Pobierz użyte biome sety i ich ilości
    const biomeCounts = this.analytics.groupTilesByBiome();
    mapMetricsLog.log('🔍 DEBUG biomeCounts:', biomeCounts);
    
    const neededBiomeSets = new Set();
    
    // Znajdź wszystkie biome sety, które są używane
    // Konwertuj nazwy wyświetlane na ID biome setów
    Object.entries(biomeCounts).forEach(([biomeKey, count]) => {
      if (count > 0) {
        // Znajdź odpowiedni biome set ID na podstawie nazwy
        const biomeSet = this.analytics.biomeSets.find(set => 
          set.name === biomeKey || set.id === biomeKey
        );
        
        if (biomeSet) {
          neededBiomeSets.add(biomeSet.id);
          mapMetricsLog.log(`🔄 Mapped "${biomeKey}" to biome set ID: ${biomeSet.id}`);
        } else {
          mapMetricsLog.log(`⚠️ Could not find biome set for key: ${biomeKey}`);
        }
      }
    });
    
    mapMetricsLog.log('🔍 DEBUG neededBiomeSets (actual IDs):', Array.from(neededBiomeSets));

    if (neededBiomeSets.size === 0) {
      return 0;
    }

    // Znajdź minimalną liczbę environment packów potrzebną do pokrycia wszystkich biome setów
    // To jest problem pokrycia zbioru - użyjemy zachłannego algorytmu
    const uncoveredSets = new Set(neededBiomeSets);
    const selectedPacks = [];
    
    while (uncoveredSets.size > 0) {
      // Znajdź pack który pokrywa najwięcej niepokrytych setów
      let bestPack = null;
      let maxCoverage = 0;
      
      for (const pack of this.analytics.environmentPacks) {
        const packBiomeSets = pack.components.map(comp => comp.setId);
        const coverage = packBiomeSets.filter(setId => uncoveredSets.has(setId)).length;
        
        if (coverage > maxCoverage) {
          maxCoverage = coverage;
          bestPack = pack;
        }
      }
      
      if (bestPack && maxCoverage > 0) {
    selectedPacks.push(bestPack);
    mapMetricsLog.log(`✅ Selected pack ${bestPack.name} covering ${maxCoverage} sets`);
        
        // Usuń pokryte sety
        bestPack.components.forEach(comp => {
          if (uncoveredSets.has(comp.setId)) {
            uncoveredSets.delete(comp.setId);
            mapMetricsLog.log(`🔹 Covered biome set: ${comp.setId}`);
          }
        });
      } else {
    // Żaden pack nie może pokryć pozostałych setów (nie powinno się zdarzyć z prawidłowymi danymi)
    mapMetricsLog.log('⚠️ No pack found to cover remaining sets:', Array.from(uncoveredSets));
        break;
      }
    }
    
    mapMetricsLog.log(`🔍 DEBUG minimum packs required: ${selectedPacks.length}`);
    return selectedPacks.length;
  }

  /**
   * Oblicza dokładne wymiary mapy (szczegółowa wersja)
   */
  calculateDetailedMapDimensions() {
    const coordinates = Array.from(this.analytics.placedTiles.keys()).map(key => {
      const match = key.match(/q:(-?\d+),r:(-?\d+),y:(-?\d+)/);
      return match ? {
        q: parseInt(match[1]),
        r: parseInt(match[2]),
        y: parseInt(match[3])
      } : null;
    }).filter(Boolean);
    
    if (coordinates.length === 0) {
      return {
        width: 0,
        height: 0,
        minQ: 0,
        maxQ: 0,
        minR: 0,
        maxR: 0,
        minY: 0,
        maxY: 0,
        area: 0
      };
    }
    
    const minQ = Math.min(...coordinates.map(c => c.q));
    const maxQ = Math.max(...coordinates.map(c => c.q));
    const minR = Math.min(...coordinates.map(c => c.r));
    const maxR = Math.max(...coordinates.map(c => c.r));
    const minY = Math.min(...coordinates.map(c => c.y));
    const maxY = Math.max(...coordinates.map(c => c.y));
    
    const width = maxQ - minQ + 1;
    const height = maxR - minR + 1;
    
    return {
      width,
      height,
      minQ,
      maxQ,
      minR,
      maxR,
      minY,
      maxY,
      area: width * height
    };
  }

  /**
   * Oblicza gęstość wypełnienia mapy - DEPRECATED
   * Ta metryka była myląca dla hex grid, zastąpiona przez Unique Biomes
   */
  calculateTileDensity() {
    if (this.analytics.placedTiles.size === 0) return 0;
    
    const bounds = this.calculateDetailedMapDimensions();
    const totalPossibleTiles = bounds.area;
    const placedTiles = this.analytics.placedTiles.size;
    
    const density = (placedTiles / totalPossibleTiles) * 100;
    return Math.round(density);
  }
}
