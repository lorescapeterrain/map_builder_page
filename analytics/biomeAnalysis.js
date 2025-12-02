/**
 * BIOME ANALYSIS MODULE
 * Zarządza analizą biomów i generuje shopping list
 */

export class BiomeAnalysis {
  constructor(analytics) {
    this.analytics = analytics;
  }

  /**
   * Aktualizuje sekcję Biome Breakdown
   */
  updateBreakdown() {
    const container = document.getElementById('biome-breakdown');
    if (!container) return;

    const biomeCounts = this.analytics.groupTilesByBiome();

    if (Object.keys(biomeCounts).length === 0) {
      container.innerHTML = `
        <div class="empty-state">No tiles placed yet</div>
      `;
      return;
    }

    // Generuj kompletną listę użytych biomów (bez limitu)
    const biomeList = this.renderAllBiomes(biomeCounts);
    
    container.innerHTML = `
      <div class="biome-breakdown-content">
        <div class="biome-scrollable">
          ${biomeList}
        </div>
      </div>
    `;

    // Dodaj event listenery dla rozwijania/zwijania
    this.setupToggleListeners(container);
  }

  /**
   * Konfiguruje listenery do rozwijania/zwijania environment packs
   */
  setupToggleListeners(container) {
    const biomeItems = container.querySelectorAll('.biome-main-info');
    biomeItems.forEach(item => {
      item.addEventListener('click', (_event) => {
        const detailedItem = item.closest('.biome-item-detailed');
        const packsSection = detailedItem.querySelector('.environment-packs');
        
        if (packsSection) {
          const isVisible = packsSection.style.display !== 'none';
          packsSection.style.display = isVisible ? 'none' : 'block';
          
          // Dodaj wskaźnik stanu
          const indicator = item.querySelector('.expand-indicator');
          if (indicator) {
            indicator.textContent = isVisible ? '▶' : '▼';
          }
        }
      });
    });
  }

  /**
   * Renderuje wszystkie użyte biomy z detalami
   */
  renderAllBiomes(biomeCounts) {
    const sortedBiomes = Object.entries(biomeCounts)
      .sort(([,a], [,b]) => b - a); // Sortuj według liczby użytych kafelków

    const biomeItems = sortedBiomes.map(([biomeKey, count]) => {
      const biomeName = this.getBiomeName(biomeKey);
      const biome = this.findBiomeData(biomeKey);
  const percentage = ((count / this.analytics.placedTiles.size) * 100).toFixed(1);
  // Required: maximum duplicates of any single tile number within this biome
  const setsRequired = this.analytics.calculateMinRequiredSets(biome?.id || biomeKey);
      
      // Environment packs containing this biome
      const containingPacks = this.analytics.environmentPacks.filter(pack => 
        pack.components && pack.components.some(comp => comp.setId === biome?.id)
      );
      
      return `
        <div class="biome-item-detailed">
          <div class="biome-main-info">
            <div class="biome-name-section">
              <span class="biome-name">${biomeName}</span>
              <span class="biome-parent">${biome ? biome.biomeParent : ''}</span>
            </div>
            <div class="biome-stats-section">
              <div class="biome-count-small">${count} tiles (${percentage}%)</div>
              <div class="biome-sets-info">
                <span class="sets-required-large">Required: ${setsRequired}</span>
              </div>
            </div>
            ${containingPacks.length > 0 ? '<span class="expand-indicator">▶</span>' : ''}
          </div>
          ${this.renderEnvironmentPacks(biome)}
        </div>
      `;
    }).join('');

    return biomeItems;
  }

  /**
   * Renderuje environment packs zawierające dany biom
   */
  renderEnvironmentPacks(biome) {
    if (!biome) return '';

    const containingPacks = this.analytics.environmentPacks.filter(pack => 
      pack.components && pack.components.some(comp => comp.setId === biome.id)
    );

    if (containingPacks.length === 0) return '';

    const packsList = containingPacks.map(pack => {
      const component = pack.components.find(comp => comp.setId === biome.id);
      const quantity = component ? component.quantity : 1;
      
      return `
        <div class="pack-item">
          <span class="pack-name">${pack.name}</span>
          <span class="pack-quantity">${quantity}×</span>
        </div>
      `;
    }).join('');

    return `
      <div class="environment-packs" style="display: none;">
        <div class="packs-header">Available in Environment Packs:</div>
        <div class="packs-list">
          ${packsList}
        </div>
      </div>
    `;
  }

  /**
   * Pobiera nazwę biomu
   */
  getBiomeName(biomeKey) {
    const biome = this.findBiomeData(biomeKey);
    return biome ? biome.name : biomeKey;
  }

  /**
   * Znajdź dane biomu po ID lub nazwie
   */
  findBiomeData(biomeKey) {
    // Najpierw szukaj po ID
    let biome = this.analytics.biomeSets.find(b => b.id === biomeKey);
    
    // Jeśli nie znaleziono, szukaj po nazwie
    if (!biome) {
      biome = this.analytics.biomeSets.find(b => b.name === biomeKey);
    }
    
    return biome;
  }

  /**
   * Generuje pełną analizę użycia zestawów
   */
  generateSetUsageAnalysis() {
    const analysis = {
      biomesUsed: {},
      packsUsed: {},
  standaloneUsed: {},
      efficiency: {}
    };

    const biomeCounts = this.analytics.groupTilesByBiome();

    // Analiza dla każdego biomu
    Object.entries(biomeCounts).forEach(([biomeKey, count]) => {
      const biome = this.findBiomeData(biomeKey);
      if (biome) {
        const requiredSets = Math.ceil(count / 50);
        const ownedSets = this.analytics.getBiomeTotalSets(biome.id);
        const efficiency = ownedSets > 0 ? (requiredSets / ownedSets * 100) : 0;

        analysis.biomesUsed[biome.id] = {
          name: biome.name,
          tilesUsed: count,
          setsRequired: requiredSets,
          setsOwned: ownedSets,
          efficiency: efficiency.toFixed(1)
        };
      }
    });

    return analysis;
  }
}
