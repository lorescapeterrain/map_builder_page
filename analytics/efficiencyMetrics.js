/**
 * EFFICIENCY METRICS MODULE
 * Zarządza metrykami efektywności wykorzystania zestawów
 */

export class EfficiencyMetrics {
  constructor(analytics) {
    this.analytics = analytics;
  }

  /**
   * Aktualizuje sekcję Efficiency Metrics
   */
  update() {
    const container = document.getElementById('efficiency-metrics');
    if (!container) return;

    const placementMode = this.analytics.getPlacementMode();
    if (placementMode === 'unlimited') {
      this.renderUnlimitedMode(container);
    } else {
      this.renderLimitedMode(container);
    }
  }

  /**
   * Renderuje metryki dla trybu unlimited
   */
  renderUnlimitedMode(container) {
    const totalSetsRequired = this.analytics.calculateTotalSetsUsed();
    
    container.innerHTML = `
      <div class="empty-state">
        <div class="mode-info">
          <h4><i class="fas fa-infinity"></i> Unlimited Mode</h4>
          <p>Sets Required: <strong>${totalSetsRequired.toFixed(1)}</strong></p>
          <small>Efficiency metrics available only in Limited mode</small>
        </div>
      </div>
    `;
  }

  /**
   * Renderuje metryki dla trybu limited
   */
  renderLimitedMode(container) {
    if (this.analytics.placedTiles.size === 0) {
      container.innerHTML = `<div class="empty-state">No tiles placed yet</div>`;
      return;
    }

  const metrics = this.calculateAllMetrics();
  const ownedSets = this.analytics.calculateTotalSetsOwned();
  const totalTilesPlaced = this.analytics.placedTiles.size;
  const totalCapacity = ownedSets * 50;
    
    container.innerHTML = `
      <div class="efficiency-content">
        <div class="metric-item">
          <div class="metric-label">
            <i class="fas fa-percentage"></i>
            <span>Set Efficiency</span>
      <div class="metric-help" title="Percentage of owned sets currently required (min sets needed per biome based on duplicate tile usage)">ⓘ</div>
          </div>
          <div class="metric-value">${metrics.setEfficiency}%</div>
        </div>
  <div class="stat-subtle" style="padding: 0 var(--spacing-sm) var(--spacing-xs);">Tiles ${totalTilesPlaced} / Capacity ${totalCapacity}</div>
        <div style="padding: 0 var(--spacing-sm) var(--spacing-sm) var(--spacing-sm);">
          <div class="progress ${this.classByPercent(metrics.setEfficiency)}">
            <div class="bar ${parseFloat(metrics.setEfficiency) > 0 ? 'has-value' : ''}" style="width:${metrics.setEfficiency}%"></div>
          </div>
        </div>
        
        <div class="metric-item">
          <div class="metric-label">
            <i class="fas fa-chart-bar"></i>
            <span>Tile Utilization</span>
            <div class="metric-help" title="Percentage of tiles used from sets that contain used tiles">ⓘ</div>
          </div>
          <div class="metric-value">${metrics.tileUtilization}%</div>
        </div>
        <div style="padding: 0 var(--spacing-sm) var(--spacing-sm) var(--spacing-sm);">
          <div class="progress ${this.classByPercent(metrics.tileUtilization)}">
            <div class="bar ${parseFloat(metrics.tileUtilization) > 0 ? 'has-value' : ''}" style="width:${metrics.tileUtilization}%"></div>
          </div>
        </div>
        
        <div class="metric-item">
          <div class="metric-label">
            <i class="fas fa-exclamation-triangle"></i>
            <span>Unused Tiles</span>
            <div class="metric-help" title="Number of tiles in used sets that remain unused">ⓘ</div>
          </div>
          <div class="metric-value">${metrics.unusedTiles} tiles</div>
        </div>
      </div>
    `;
  }

  /**
   * Oblicza wszystkie metryki efektywności
   */
  calculateAllMetrics() {
    const setEfficiency = this.calculateSetEfficiency();
    const tileUtilization = this.calculateTileUtilization();
    const unusedTiles = this.calculateUnusedTiles();
    const costEfficiency = this.calculateCostEfficiency(setEfficiency, tileUtilization);

    return {
      setEfficiency: setEfficiency.toFixed(1),
      tileUtilization: tileUtilization.toFixed(1),
      unusedTiles,
      costEfficiencyText: costEfficiency.text,
      costEfficiencyClass: costEfficiency.class
    };
  }

  /**
   * Oblicza efektywność zestawów
   * Procent posiadanych zestawów które są faktycznie używane
   */
  calculateSetEfficiency() {
  // Desired behavior: like Tile Utilization but across ALL owned sets.
  // Numerator = total tiles placed. Denominator = owned sets × 50 tiles per set.
  const ownedSets = this.analytics.calculateTotalSetsOwned();
  const totalTilesPlaced = this.analytics.placedTiles.size;
  const totalCapacity = ownedSets * 50;

  return totalCapacity > 0 ? (totalTilesPlaced / totalCapacity) * 100 : 0;
  }

  /**
   * Oblicza wykorzystanie kafelków
   * Procent kafelków używanych z zestawów które zawierają użyte kafelki
   */
  calculateTileUtilization() {
    if (this.analytics.placedTiles.size === 0) return 0;

    const biomeCounts = this.analytics.groupTilesByBiome();
    let totalTilesInUsedSets = 0;
    let totalTilesUsed = 0;

    Object.entries(biomeCounts).forEach(([biomeKey, usedCount]) => {
      const biome = this.analytics.biomeSets.find(b => b.id === biomeKey || b.name === biomeKey);
      if (biome) {
        const setsUsed = Math.ceil(usedCount / 50);
        totalTilesInUsedSets += setsUsed * 50;
        totalTilesUsed += usedCount;
      }
    });

    return totalTilesInUsedSets > 0 ? (totalTilesUsed / totalTilesInUsedSets) * 100 : 0;
  }

  /**
   * Oblicza liczbę nieużywanych kafelków
   * Kafelki w zestawach które są używane, ale same nie są wykorzystane
   */
  calculateUnusedTiles() {
    const biomeCounts = this.analytics.groupTilesByBiome();
    let totalUnused = 0;

    Object.entries(biomeCounts).forEach(([biomeKey, usedCount]) => {
      const biome = this.analytics.biomeSets.find(b => b.id === biomeKey || b.name === biomeKey);
      if (biome) {
        const setsUsed = Math.ceil(usedCount / 50);
        const tilesInUsedSets = setsUsed * 50;
        totalUnused += (tilesInUsedSets - usedCount);
      }
    });

    return totalUnused;
  }

  /**
   * Oblicza ogólną efektywność kosztową
   */
  calculateCostEfficiency(setEfficiency, tileUtilization) {
    const averageEfficiency = (setEfficiency + tileUtilization) / 2;
    
    if (averageEfficiency >= 80) {
      return { text: 'Excellent', class: 'excellent' };
    } else if (averageEfficiency >= 60) {
      return { text: 'Good', class: 'good' };
    } else if (averageEfficiency >= 40) {
      return { text: 'Fair', class: 'fair' };
    } else if (averageEfficiency >= 20) {
      return { text: 'Poor', class: 'poor' };
    } else {
      return { text: 'Very Poor', class: 'very-poor' };
    }
  }

  classByPercent(p) {
    const val = parseFloat(p);
  // Grayscale scale (no semantic color):
  // 0-24 -> gray-1, 25-49 -> gray-2, 50-74 -> gray-3, 75-100 -> gray-4
  if (val >= 75) return 'gray-4';
  if (val >= 50) return 'gray-3';
  if (val >= 25) return 'gray-2';
  return 'gray-1';
  }

  /**
   * Generuje szczegółowy raport efektywności
   */
  generateDetailedReport() {
    const report = {
      summary: this.calculateAllMetrics(),
      biomesAnalysis: {},
      recommendations: []
    };

    const biomeCounts = this.analytics.groupTilesByBiome();

    // Analiza dla każdego biomu
    Object.entries(biomeCounts).forEach(([biomeKey, usedCount]) => {
      const biome = this.analytics.biomeSets.find(b => b.id === biomeKey || b.name === biomeKey);
      if (biome) {
        const setsUsed = Math.ceil(usedCount / 50);
        const tilesInUsedSets = setsUsed * 50;
        const unusedInBiome = tilesInUsedSets - usedCount;
        const utilizationInBiome = (usedCount / tilesInUsedSets) * 100;

        report.biomesAnalysis[biome.id] = {
          name: biome.name,
          tilesUsed: usedCount,
          setsUsed: setsUsed,
          utilization: utilizationInBiome.toFixed(1),
          unused: unusedInBiome
        };

        // Generuj rekomendacje
        if (utilizationInBiome < 50 && unusedInBiome > 25) {
          report.recommendations.push({
            type: 'efficiency',
            biome: biome.name,
            message: `Consider using more ${biome.name} tiles to improve efficiency (${unusedInBiome} unused tiles)`
          });
        }
      }
    });

    return report;
  }
}
