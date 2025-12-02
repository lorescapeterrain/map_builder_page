/**
 * HEADER STATS MODULE
 * Zarządza statystykami w górnej belce aplikacji
 */

import createDebugLogger from '../src/utils/debugLogger.js';

const headerStatsLog = createDebugLogger('analytics:header');

export class HeaderStats {
  constructor(analytics) {
    this.analytics = analytics;
  }

  /**
   * Aktualizuje wszystkie statystyki w górnej belce
   */
  update() {
    this.updateTotalTiles();
    this.updateSetsUsed();
    this.updateMapSize();
  }

  /**
   * Aktualizuje liczbę całkowitą kafelków
   */
  updateTotalTiles() {
    const element = document.getElementById('total-tiles');
    if (element) {
      element.textContent = this.analytics.placedTiles.size;
      
      // Ustaw stałą etykietę
      const labelElement = element.parentElement?.querySelector('.stat-label');
      if (labelElement) {
        labelElement.textContent = 'TOTAL TILES';
      }
    }
  }

  /**
   * Aktualizuje informacje o używanych zestawach
   * Format: "używane zestawy/posiadane zestawy"
   */
  updateSetsUsed() {
    const element = document.getElementById('sets-used');
    if (element) {
      const placementMode = this.analytics.getPlacementMode();
      
      if (placementMode === 'unlimited') {
        // W trybie unlimited pokazuj wymagane vs posiadane
        const requiredSets = this.calculateRequiredSetsForUnlimited();
        const totalSetsOwned = this.analytics.calculateTotalSetsOwned();
        element.textContent = `${requiredSets}/${totalSetsOwned}`;
      } else {
        // W trybie limited pokazuj wykorzystane/posiadane
        const usedSets = this.calculateActualUsedSets();
        const totalSetsOwned = this.analytics.calculateTotalSetsOwned();
        element.textContent = `${usedSets}/${totalSetsOwned}`;
      }
      
      // Ustaw stałą etykietę i tooltip
      const labelElement = element.parentElement?.querySelector('.stat-label');
      if (labelElement) {
        labelElement.textContent = 'SETS USED';
      }
      element.title = 'Required Sets / Owned Packs';
    }
  }

  /**
   * Oblicza rzeczywistą liczbę używanych zestawów (pełne zestawy)
   */
  calculateActualUsedSets() {
    // Use accurate per-biome minimum sets calculation
    let total = 0;
    this.analytics.biomeSets.forEach(biome => {
      total += this.analytics.calculateMinRequiredSets(biome.id);
    });
    return total;
  }

  /**
   * Oblicza wymagane zestawy dla trybu unlimited
   */
  calculateRequiredSetsForUnlimited() {
  return this.analytics.calculateTotalSetsUsed();
  }

  /**
   * Aktualizuje zakres wysokości
   */
  /**
   * Aktualizuje rozmiar mapy (nowa metryka)
   * Sprawdza czy element istnieje, jeśli nie - dodaje go
   */
  updateMapSize() {
    let element = document.getElementById('map-size');
    
    // Jeśli element nie istnieje, dodaj go do header-stats
    if (!element) {
      this.addMapSizeElement();
      element = document.getElementById('map-size');
    }
    
    if (element) {
      element.textContent = this.analytics.calculateMapDimensions();
    }
  }

  /**
   * Dodaje element map-size do górnej belki
   */
  addMapSizeElement() {
    const headerStats = document.querySelector('.header-stats');
    if (headerStats) {
      // Sprawdź czy już nie istnieje
      if (document.getElementById('map-size')) return;
      
      const mapSizeItem = document.createElement('div');
      mapSizeItem.className = 'stat-item';
      mapSizeItem.innerHTML = `
        <span class="stat-label">MAP SIZE</span>
        <span class="stat-value" id="map-size">0x0</span>
      `;
      
      // Dodaj jako ostatni element
      headerStats.appendChild(mapSizeItem);
      
      headerStatsLog.log('📊 Added Map Size element to header');
    }
  }
}
