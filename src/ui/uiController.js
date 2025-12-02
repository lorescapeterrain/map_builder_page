import createDebugLogger from '../utils/debugLogger.js';
import { enhanceSelect } from './components/customSelect.js';
import { showNotification } from './notifications.js';

const uiLog = createDebugLogger('ui');

export function createUIController(options) {
  const {
    environmentPacks,
    biomeSets,
    packCounts,
    standaloneBiomeSetCounts,
    tileInstanceLimits,
    ensureBiomeInitialized,
    setPackCount,
    setStandaloneBiomeSetCount,
    getBiomeTotalSets,
    getTotalFromPacks,
    getPlacementMode,
    setPlacementMode,
    resetPlacementRotation,
    createOrUpdateGhostTile,
    getSelectedTileInfo,
    setSelectedTileInfo,
    setSelectedTile,
    updateHeaderStats,
    updateRightPanelStats,
    updateUndoRedoButtons,
    getGhostOpacities,
    setupGhostOpacityControls,
    placeholderSprite,
    getGridTexturePath,
    getPlacementCountForInstance,
    getPlacementCountForBiome,
    markShareDirty
  } = options;

  let activeTab = 'packs';
  let activeBiomeForGrid = null;
  let gridRefreshGuard = false;
  let searchQuery = '';
  let assetViewMode = 'grid';
  let ghostOpacityToggleBound = false;
  let packsRendered = false;
  let packsRenderScheduled = false;
  let tileSourceFilter = 'all';
  let tileSearchTerm = '';
  let tileSearchDebounceId = null;

  const PLACEHOLDER_SPRITE = placeholderSprite;

  const domCache = new Map();
  const nodeListCache = new Map();

  function getElementByIdCached(id) {
    const cached = domCache.get(id);
    if (cached && cached.isConnected) {
      return cached;
    }
    const element = document.getElementById(id);
    if (element) {
      domCache.set(id, element);
    } else {
      domCache.delete(id);
    }
    return element;
  }

  function getElementsCached(selector) {
    const cached = nodeListCache.get(selector);
    if (cached && cached.every((node) => node.isConnected)) {
      return cached;
    }
    const nodes = Array.from(document.querySelectorAll(selector));
    nodeListCache.set(selector, nodes);
    return nodes;
  }

  function setTileSelectionSummaryText(text) {
    const summaryEl = getElementByIdCached('tile-selection-summary');
    if (!summaryEl) return;
    summaryEl.textContent = text || '';
    summaryEl.dataset.state = text ? 'populated' : 'empty';
  }

  function refreshTileSelectionSummary(biome, summary = {}) {
    const summaryEl = getElementByIdCached('tile-selection-summary');
    if (!summaryEl) return;

    if (!biome) {
      const fallback = typeof summary.message === 'string' ? summary.message : 'Select a biome to view tiles';
      setTileSelectionSummaryText(fallback);
      return;
    }

    const placementMode = summary.placementMode || getPlacementMode?.() || 'limited';
    const totalSetsRaw = summary.totalSets ?? (getBiomeTotalSets?.(biome.id) ?? 0);
    const usedSlots = summary.usedSlots ?? getUsedSlotsCount(biome.id);
    const computedAvailable = summary.availableSlots ?? (placementMode === 'unlimited'
      ? '∞'
      : Math.max(0, totalSetsRaw * 50 - usedSlots));
    const availableDisplay = computedAvailable === Infinity ? '∞' : computedAvailable;
    const totalDisplay = placementMode === 'unlimited' || totalSetsRaw === Infinity ? '∞' : totalSetsRaw;

    const summaryText = `Sets ${totalDisplay} • Used ${usedSlots} • Available ${availableDisplay}`;
    setTileSelectionSummaryText(summaryText);
  }

  function packEmoji(idOrName) {
    const value = (idOrName || '').toString().toLowerCase();
  if (/mountain|plateau|rocky/.test(value)) return '🪨';
    if (/alpine|valley/.test(value)) return '🏔️';
    if (/grass|grassland/.test(value)) return '🌿';
    if (/desert|sand|dune/.test(value)) return '🏜️';
    if (/arctic|snow|ice|frozen/.test(value)) return '❄️';
    if (/ocean|shore|archipelago|island/.test(value)) return '🌊';
    if (/marsh|mire|swamp|bog|fen|wetland/.test(value)) return '🦎';
    if (/wasteland|barren/.test(value)) return '🟫';
    if (/volcano|lava/.test(value)) return '🌋';
    if (/urban|city|streets|modern/.test(value)) return '🏙️';
    if (/castle|tavern|ruins/.test(value)) return '🏰';
    if (/cavern|cave|dungeon/.test(value)) return '🕳️';
    if (/shadow|gloom/.test(value)) return '🌑';
    if (/battlefield|battle/.test(value)) return '⚔️';
    return '📦';
  }

  function biomeEmoji(biome) {
    if (!biome) return '📦';
    const byId = packEmoji(biome.id);
    if (byId !== '📦') return byId;
    const byParent = packEmoji(biome.biomeParent);
    if (byParent !== '📦') return byParent;
    return packEmoji(biome.name);
  }

  function getInstancePlacementCount(instanceId) {
    if (typeof getPlacementCountForInstance !== 'function') return 0;
    const value = getPlacementCountForInstance(instanceId);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function getBiomePlacementCount(biomeId) {
    if (typeof getPlacementCountForBiome !== 'function') return 0;
    const value = getPlacementCountForBiome(biomeId);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function initialize() {
    setupBuildModeControls();
    setupTabNavigation();
    setupPanelToggles();
    setupSearch();
    setupViewModeToggle();
  setupTileFilters();
    setupGhostOpacityControls?.();
    updateHeaderStats?.();
    updateRightPanelStats?.();
    updateUndoRedoButtons?.();

  setTileSelectionSummaryText('Select a biome to view tiles');

    loadTabContent(activeTab);
    updateTileSelection();

    if (!ghostOpacityToggleBound) {
      window.addEventListener('keydown', handleGhostOpacityToggle);
      ghostOpacityToggleBound = true;
    }

  uiLog.log('🎉 Modern interface fully initialized!');
  }

  function handleGhostOpacityToggle(e) {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    const isEditable = e.target && (e.target.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select');
    if (isEditable) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.code === 'NumpadMultiply' || (e.key === '*' && e.location === KeyboardEvent.DOM_KEY_LOCATION_NUMPAD)) {
      const panel = getElementByIdCached('ghost-opacity-controls');
      if (!panel) return;
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden')) {
        const topInp = getElementByIdCached('ghost-top-opacity');
        const sideInp = getElementByIdCached('ghost-side-opacity');
        const topVal = getElementByIdCached('ghost-top-opacity-value');
        const sideVal = getElementByIdCached('ghost-side-opacity-value');
        if (topInp && sideInp && topVal && sideVal) {
          const { top, side } = getGhostOpacities();
          topInp.value = String(top);
          sideInp.value = String(side);
          topVal.textContent = top.toFixed(2);
          sideVal.textContent = side.toFixed(2);
        }
      }
    }
  }

  function setupBuildModeControls() {
    const radioButtons = getElementsCached('input[name="buildMode"]');
    if (!radioButtons.length) {
  uiLog.warn('UIController: No build mode radio buttons found.');
      return;
    }

    radioButtons.forEach((radio) => {
      radio.addEventListener('change', (e) => {
        const mode = e.target.value;
        setPlacementMode?.(mode);
  uiLog.log(`Build mode changed to: ${mode}`);

        resetPlacementRotation?.();

        updateBuildModeUI();
        updateHeaderStats?.();
        updateRightPanelStats?.();
        refreshCurrentTab();
      });
    });

    updateBuildModeUI();
  }

  function updateBuildModeUI() {
    const mode = getPlacementMode?.() || 'limited';
    const badges = document.querySelectorAll('.badge');
    badges.forEach((badge) => {
      badge.style.display = mode === 'unlimited' ? 'none' : 'block';
    });
  }

  function setupTabNavigation() {
    const tabButtons = getElementsCached('.tab-btn');
    const tabContents = getElementsCached('.tab-content');

    if (!tabButtons.length || !tabContents.length) {
  uiLog.warn('UIController: Expected tab navigation elements were not found.');
      return;
    }

    tabButtons.forEach((button) => {
      button.addEventListener('click', (e) => {
        const targetTab = e.currentTarget.dataset.tab;
        switchToTab(targetTab);
      });
    });
    switchToTab('packs');
  }

  function switchToTab(tabName) {
    if (!tabName || activeTab === tabName) return;

    activeTab = tabName;

    const tabButtons = getElementsCached('.tab-btn');
    const tabContents = getElementsCached('.tab-content');

    tabButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    tabContents.forEach((content) => {
      content.classList.toggle('active', content.id === `tab-${tabName}`);
    });

    loadTabContent(tabName);
    updateTileSelection();
  }

  function setupSearch() {
    const searchInput = getElementByIdCached('search-input');
    const searchClear = getElementByIdCached('search-clear');

    if (!searchInput) {
  uiLog.warn('UIController: Search input field was not found.');
      return;
    }

    if (!searchInput.dataset.controllerBound) {
      let searchTimeout;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = window.setTimeout(() => {
          searchQuery = e.target.value.toLowerCase().trim();
          performSearch();
          updateSearchClearButton();
        }, 300);
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          searchQuery = e.target.value.toLowerCase().trim();
          performSearch();
        }
      });

      searchInput.dataset.controllerBound = 'true';
    }

    if (searchClear && !searchClear.dataset.controllerBound) {
      searchClear.addEventListener('click', () => {
        searchQuery = '';
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
        performSearch();
        updateSearchClearButton();
      });
      searchClear.dataset.controllerBound = 'true';
    }

    updateSearchClearButton();
  }

  function performSearch() {
    switch (activeTab) {
      case 'packs':
        searchEnvironmentPacks();
        break;
      case 'biomes':
        searchBiomeSets();
        break;
      default:
        searchTiles();
        break;
    }
  }

  function updateSearchClearButton() {
    const searchClear = getElementByIdCached('search-clear');
    if (searchClear) {
      searchClear.style.display = searchQuery ? 'block' : 'none';
    }
  }

  function loadTabContent(tabName) {
    switch (tabName) {
      case 'packs':
        scheduleEnvironmentPacksRender();
        break;
      case 'biomes':
        renderBiomeSets();
        break;
      default:
  uiLog.warn(`UIController: Unknown tab requested: ${tabName}`);
    }
  }

  function refreshCurrentTab() {
    if (activeTab === 'packs' && !packsRendered) {
      scheduleEnvironmentPacksRender({ force: true });
      return;
    }
    loadTabContent(activeTab);
  }

  function searchEnvironmentPacks() {
    if (!packsRendered) {
      scheduleEnvironmentPacksRender({ force: true });
      return;
    }

    const cards = document.querySelectorAll('.pack-card');
    let visibleCount = 0;

    cards.forEach((card) => {
      const packId = card.dataset.packId;
      const pack = environmentPacks.find((p) => p.id === packId);
      if (!pack) {
        card.style.display = 'none';
        return;
      }

      const componentNames = pack.components
        ?.map((comp) => {
          const biome = biomeSets.find((b) => b.id === comp.setId);
          return biome ? biome.name : comp.setId;
        })
        .join(' ') || '';

      const searchText = `${pack.name} ${componentNames}`.toLowerCase();
      if (!searchQuery || searchText.includes(searchQuery)) {
        card.style.display = '';
        visibleCount += 1;
      } else {
        card.style.display = 'none';
      }
    });

    updateSearchResults('packs', visibleCount, environmentPacks.length);
  }

  function showPackSkeleton(container) {
    const skeletonCount = Math.min(4, Math.max(2, Math.round(window.innerHeight / 220)));
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < skeletonCount; i += 1) {
      const skeleton = document.createElement('div');
      skeleton.className = 'card pack-card skeleton';
      skeleton.innerHTML = `
        <div class="card-left">
          <div class="pack-image skeleton-thumb"></div>
        </div>
        <div class="card-right">
          <div class="skeleton-line short"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line"></div>
        </div>
      `;
      fragment.appendChild(skeleton);
    }
    container.innerHTML = '';
    container.appendChild(fragment);
  }

  function scheduleEnvironmentPacksRender({ force = false } = {}) {
    if (packsRendered) {
      renderEnvironmentPacks();
      return;
    }

    if (!packsRenderScheduled) {
      const container = document.getElementById('packs-grid');
      if (container) {
        showPackSkeleton(container);
      }
      packsRenderScheduled = true;
      const scheduler = typeof window.requestIdleCallback === 'function'
        ? (cb) => window.requestIdleCallback(cb, { timeout: force ? 120 : 2000 })
        : (cb) => window.setTimeout(cb, force ? 120 : 400);
      scheduler(() => {
        packsRenderScheduled = false;
        renderEnvironmentPacks();
      });
    } else if (force) {
      packsRenderScheduled = false;
      renderEnvironmentPacks();
    }
  }

  function searchBiomeSets() {
    const cards = document.querySelectorAll('.biome-card');
    let visibleCount = 0;

    cards.forEach((card) => {
      const biomeId = card.dataset.biomeId;
      const biome = biomeSets.find((b) => b.id === biomeId);
      if (!biome) {
        card.style.display = 'none';
        return;
      }

      const searchText = biome.name.toLowerCase();
      if (!searchQuery || searchText.includes(searchQuery)) {
        card.style.display = '';
        visibleCount += 1;
      } else {
        card.style.display = 'none';
      }
    });

    updateSearchResults('biomes', visibleCount, biomeSets.length);
  }

  function searchTiles() {
    const biomeSelect = getElementByIdCached('biome-select');
    if (!biomeSelect) {
  uiLog.warn('UIController: Biome select element missing while searching tiles.');
      return;
    }

    const options = biomeSelect.querySelectorAll('option');
    let visibleOptions = 0;

    options.forEach((option) => {
      if (!option.value) return;
      const biome = biomeSets.find((b) => b.id === option.value);
      if (!biome) return;

      const searchText = biome.name.toLowerCase();
      const show = !searchQuery || searchText.includes(searchQuery);
      option.style.display = show ? 'block' : 'none';
      if (show) visibleOptions += 1;
    });

    updateSearchResults('tiles', visibleOptions, getAvailableBiomes().length);
  }

  function updateSearchResults(tabName, visible, total) {
    const sectionHeader = document.querySelector(`#tab-${tabName} .section-header .count`);
    if (sectionHeader) {
      sectionHeader.textContent = searchQuery
        ? `${visible} of ${total} (filtered)`
        : `${total} available`;
    }

    if (tabName === 'packs' || tabName === 'biomes') {
      const rootId = tabName === 'packs' ? 'packs-grid' : 'biomes-grid';
      const root = document.getElementById(rootId);
      if (root) {
        const emptyState = root.querySelector('.asset-empty-state');
        const grid = root.querySelector('.cards-grid');
        if (emptyState) {
          emptyState.style.display = visible === 0 ? 'flex' : 'none';
        }
        if (grid) {
          grid.style.display = visible === 0 ? 'none' : '';
        }
      }
    }
  }

  function setupPanelToggles() {
    const leftPanel = document.getElementById('left-panel');
    const rightPanel = document.getElementById('right-panel');
    const edgeLeft = document.getElementById('edge-toggle-left');
    const edgeRight = document.getElementById('edge-toggle-right');
    const mqMobile = window.matchMedia('(max-width: 740px)');
    const isMobile = () => mqMobile.matches;

    let rafId = null;
    const positionEdgeToggles = () => {
      const leftRect = leftPanel ? leftPanel.getBoundingClientRect() : { right: 0, bottom: 0 };
      const rightRect = rightPanel ? rightPanel.getBoundingClientRect() : { left: window.innerWidth, bottom: 0 };
      const btnW = 24;
      const offset = 10;

      if (edgeLeft) {
        edgeLeft.style.top = '';
        edgeLeft.style.right = '';
        const bottom = Math.max(0, window.innerHeight - leftRect.bottom) + offset;
        edgeLeft.style.bottom = `${Math.round(bottom)}px`;
        const leftPos = Math.max(0, Math.round(leftRect.right - 1));
        edgeLeft.style.left = `${leftPos}px`;
        edgeLeft.classList.add('edge-bottom');
      }

      if (edgeRight) {
        edgeRight.style.top = '';
        edgeRight.style.right = '';
        const bottom = Math.max(0, window.innerHeight - rightRect.bottom) + offset;
        edgeRight.style.bottom = `${Math.round(bottom)}px`;
        const rightPos = Math.min(window.innerWidth - btnW, Math.round(rightRect.left - btnW));
        edgeRight.style.left = `${rightPos}px`;
        edgeRight.classList.add('edge-bottom');
      }
    };

    const isExpanded = (panel) => {
      if (!panel) return false;
      return isMobile() ? panel.classList.contains('open') : !panel.classList.contains('collapsed');
    };

    const syncEdgeIcons = () => {
      if (edgeLeft) {
        const icon = edgeLeft.querySelector('i');
        if (!isExpanded(leftPanel)) {
          icon.className = 'fas fa-chevron-right';
          edgeLeft.classList.remove('edge-offset');
        } else {
          icon.className = 'fas fa-chevron-left';
          edgeLeft.classList.add('edge-offset');
        }
      }
      if (edgeRight) {
        const icon = edgeRight.querySelector('i');
        if (!isExpanded(rightPanel)) {
          icon.className = 'fas fa-chevron-left';
          edgeRight.classList.remove('edge-offset');
        } else {
          icon.className = 'fas fa-chevron-right';
          edgeRight.classList.add('edge-offset');
        }
      }
      positionEdgeToggles();
    };

    const animateWithRAF = (fn) => {
      if (rafId) cancelAnimationFrame(rafId);
      const step = () => {
        fn();
        rafId = requestAnimationFrame(step);
      };
      step();
      setTimeout(() => {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        fn();
      }, 240);
    };

    const toggleLeft = () => {
      if (!leftPanel) return;
      if (isMobile()) {
        leftPanel.classList.toggle('open');
        leftPanel.classList.remove('collapsed');
      } else {
        leftPanel.classList.toggle('collapsed');
        leftPanel.classList.remove('open');
      }
      syncEdgeIcons();
      animateWithRAF(positionEdgeToggles);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 260);
    };

    const toggleRight = () => {
      if (!rightPanel) return;
      if (isMobile()) {

        rightPanel.classList.toggle('open');
        rightPanel.classList.remove('collapsed');
      } else {
        rightPanel.classList.toggle('collapsed');
        rightPanel.classList.remove('open');
      }
      syncEdgeIcons();
      animateWithRAF(positionEdgeToggles);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 260);
    };

    edgeLeft?.addEventListener('click', toggleLeft);
    edgeRight?.addEventListener('click', toggleRight);

    syncEdgeIcons();
    positionEdgeToggles();

    window.addEventListener('resize', () => {
      positionEdgeToggles();
    });

    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => {
        positionEdgeToggles();
      });
      if (leftPanel) ro.observe(leftPanel);
      if (rightPanel) ro.observe(rightPanel);
    }

    setupMobileResponsive();

    const setupResizeHandle = (handle, panel, {
      minWidth,
      maxWidth,
      computeWidth
    } = {}) => {
      if (!handle || !panel || typeof computeWidth !== 'function') return;

      let dragging = false;
      let startX = 0;
      let startWidth = 0;

      const resolveMin = typeof minWidth === 'function' ? minWidth : () => minWidth;
      const resolveMax = typeof maxWidth === 'function' ? maxWidth : () => maxWidth;

      const onMouseMove = (e) => {
        if (!dragging) return;
        const desiredWidth = computeWidth({ event: e, startX, startWidth });
        const nextWidth = Math.min(resolveMax(), Math.max(resolveMin(), desiredWidth));
        panel.style.width = `${nextWidth}px`;
        positionEdgeToggles();
      };

      const stopDragging = () => {
        if (!dragging) return;
        dragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', stopDragging);
        setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
      };

      handle.addEventListener('mousedown', (e) => {
        if (panel.classList.contains('collapsed')) return;
        dragging = true;
        startX = e.clientX;
        startWidth = panel.getBoundingClientRect().width;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', stopDragging);
        e.preventDefault();
      });
    };

    const rightHandle = document.getElementById('right-resize-handle');
    setupResizeHandle(rightHandle, rightPanel, {
      minWidth: 240,
      maxWidth: () => Math.round(window.innerWidth * 0.5),
      computeWidth: ({ event, startX, startWidth }) => startWidth + (startX - event.clientX)
    });

    const leftHandle = document.getElementById('left-resize-handle');
    setupResizeHandle(leftHandle, leftPanel, {
      minWidth: 280,
      maxWidth: () => Math.round(window.innerWidth * 0.6),
      computeWidth: ({ event, startX, startWidth }) => startWidth + (event.clientX - startX)
    });
  }

  function setupMobileResponsive() {
    const mediaQuery = window.matchMedia('(max-width: 740px)');

    function handleMobileChange(e) {
      const leftPanel = document.getElementById('left-panel');
      const rightPanel = document.getElementById('right-panel');

      if (e.matches) {
        leftPanel?.classList.add('mobile');
        rightPanel?.classList.add('mobile');
        leftPanel?.classList.remove('collapsed');
        rightPanel?.classList.remove('collapsed');
        leftPanel?.classList.remove('open');
        rightPanel?.classList.remove('open');
      } else {
        leftPanel?.classList.remove('mobile');
        rightPanel?.classList.remove('mobile');
        leftPanel?.classList.remove('open');
        rightPanel?.classList.remove('open');
      }
    }

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleMobileChange);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(handleMobileChange);
    }
    handleMobileChange(mediaQuery);
  }

  function createAssetViewToggle() {
    const wrapper = document.createElement('div');
    wrapper.className = 'view-toggle asset-view-toggle';
    wrapper.setAttribute('role', 'group');
    wrapper.setAttribute('aria-label', 'Toggle asset view');

    const gridBtn = document.createElement('button');
    gridBtn.className = 'view-toggle-btn';
    gridBtn.type = 'button';
    gridBtn.dataset.view = 'grid';
    gridBtn.title = 'Grid view';
    gridBtn.innerHTML = `
      <i class="fas fa-table-cells-large" aria-hidden="true"></i>
      <span class="view-label">Grid</span>
    `;
    wrapper.appendChild(gridBtn);

    const listBtn = document.createElement('button');
    listBtn.className = 'view-toggle-btn';
    listBtn.type = 'button';
    listBtn.dataset.view = 'list';
    listBtn.title = 'List view';
    listBtn.innerHTML = `
      <i class="fas fa-list" aria-hidden="true"></i>
      <span class="view-label">List</span>
    `;
    wrapper.appendChild(listBtn);

    return wrapper;
  }

  function setupViewModeToggle() {
    const buttons = document.querySelectorAll('.view-toggle-btn');
    if (!buttons.length) return;

    buttons.forEach((button) => {
      if (button.dataset.toggleBound === 'true') return;
      button.addEventListener('click', (e) => {
        const mode = e.currentTarget?.dataset?.view;
        if (!mode) return;
        setAssetViewMode(mode);
      });
      button.dataset.toggleBound = 'true';
    });

    applyAssetViewMode();
  }

  function setAssetViewMode(mode) {
    if (mode !== 'grid' && mode !== 'list') return;
    if (assetViewMode === mode) {
      applyAssetViewMode();
      return;
    }

    assetViewMode = mode;
    applyAssetViewMode();
    performSearch();
  }

  function applyAssetViewMode() {
    const containers = [document.getElementById('packs-grid'), document.getElementById('biomes-grid')];

    containers.forEach((container) => {
      if (!container) return;
      container.classList.remove('asset-view-grid', 'asset-view-list');
      container.classList.add(assetViewMode === 'list' ? 'asset-view-list' : 'asset-view-grid');
    });

    const buttons = document.querySelectorAll('.view-toggle-btn');
    buttons.forEach((button) => {
      const isActive = button.dataset.view === assetViewMode;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function setupTileFilters() {
    const sourceFilter = getElementByIdCached('tile-source-filter');
    if (sourceFilter && sourceFilter.dataset.controllerBound !== 'true') {
      sourceFilter.addEventListener('change', (event) => {
        tileSourceFilter = event.target.value || 'all';
        updateTileSelection();
      });
      sourceFilter.dataset.controllerBound = 'true';
    }

    if (sourceFilter) {
      enhanceSelect(sourceFilter, {
        placeholder: 'All sources',
        emptyMessage: 'No sources available'
      });
    }

    const searchInput = getElementByIdCached('tile-search-input');
    if (searchInput && searchInput.dataset.controllerBound !== 'true') {
      searchInput.addEventListener('input', (event) => {
        const value = event.target.value || '';
        if (tileSearchDebounceId) {
          window.clearTimeout(tileSearchDebounceId);
        }
        tileSearchDebounceId = window.setTimeout(() => {
          tileSearchTerm = value;
          updateTileSelection();
        }, 200);
      });

      const biomeSelect = getElementByIdCached('biome-select');
      if (biomeSelect) {
        enhanceSelect(biomeSelect, {
          placeholder: 'Select a biome',
          emptyMessage: 'No biomes available yet'
        });
      }
      searchInput.dataset.controllerBound = 'true';
    }
  }

  function refreshTileSourceFilterOptions(selectedPacks) {
    const sourceFilter = document.getElementById('tile-source-filter');
    if (!sourceFilter) return;

    const staticOptions = [
      { value: 'all', label: 'All sources' },
      { value: 'packs', label: 'Environment packs only' },
      { value: 'standalone', label: 'Standalone only' }
    ];

    sourceFilter.innerHTML = '';
    staticOptions.forEach(({ value, label }) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      sourceFilter.appendChild(option);
    });

    if (selectedPacks.length) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = 'Filter by pack';
      selectedPacks.forEach((pack) => {
        const option = document.createElement('option');
        option.value = `pack:${pack.id}`;
        const emoji = packEmoji(pack.id || pack.name);
        option.textContent = `${emoji} ${pack.name}`;
        optgroup.appendChild(option);
      });
      sourceFilter.appendChild(optgroup);
    }

    const allowedValues = new Set(staticOptions.map((opt) => opt.value));
    selectedPacks.forEach((pack) => allowedValues.add(`pack:${pack.id}`));

    if (!allowedValues.has(tileSourceFilter)) {
      tileSourceFilter = 'all';
    }

    sourceFilter.value = tileSourceFilter;

    const sourceApi = enhanceSelect(sourceFilter);
    sourceApi?.refresh?.();
  }

  function syncTileFilterUIState() {
    const sourceFilter = document.getElementById('tile-source-filter');
    if (sourceFilter) {
      const values = Array.from(sourceFilter.querySelectorAll('option')).map((option) => option.value);
      if (!values.includes(tileSourceFilter)) {
        tileSourceFilter = 'all';
      }
      if (sourceFilter.value !== tileSourceFilter) {
        sourceFilter.value = tileSourceFilter;
      }
      const sourceApi = enhanceSelect(sourceFilter);
      sourceApi?.refresh?.();
    }

    const searchInput = document.getElementById('tile-search-input');
    if (searchInput && searchInput.value !== tileSearchTerm) {
      searchInput.value = tileSearchTerm;
    }
  }

  function renderEnvironmentPacks() {
    const container = document.getElementById('packs-grid');
    if (!container) {
  uiLog.error('❌ packs-grid container not found!');
      return;
    }

  packsRenderScheduled = false;
  packsRendered = true;

  container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'section-header section-header--with-controls';

    const heading = document.createElement('div');
    heading.className = 'section-heading';
    heading.innerHTML = `
      <h3>Environment Packs</h3>
      <span class="count">${environmentPacks.length} available</span>
    `;
    header.appendChild(heading);

    const controls = document.createElement('div');
    controls.className = 'section-controls';
    controls.appendChild(createAssetViewToggle());
    header.appendChild(controls);

    container.appendChild(header);
    setupViewModeToggle();

    const gridContainer = document.createElement('div');
    gridContainer.className = 'cards-grid';
    container.appendChild(gridContainer);

    const emptyState = document.createElement('div');
    emptyState.className = 'asset-empty-state';
    emptyState.innerHTML = '<i class="fas fa-search"></i><span>No environment packs match your search.</span>';
    container.appendChild(emptyState);

    environmentPacks.forEach((pack) => {
      const card = createEnvironmentPackCard(pack);
      gridContainer.appendChild(card);
    });

    applyAssetViewMode();
    if (searchQuery) {
      searchEnvironmentPacks();
    } else {
      updateSearchResults('packs', environmentPacks.length, environmentPacks.length);
    }
  }

  function createEnvironmentPackCard(pack) {
    const card = document.createElement('div');
    card.className = 'card pack-card';
    card.dataset.packId = pack.id;

    const currentCount = packCounts.get(pack.id) || 0;
    const isSelected = currentCount > 0;
    if (isSelected) {
      card.classList.add('selected');
    }

    const leftSide = document.createElement('div');
    leftSide.className = 'card-left';

    const imageContainer = document.createElement('div');
    imageContainer.className = 'card-image';
    imageContainer.setAttribute('role', 'button');
    imageContainer.tabIndex = 0;

    const imagePath = getImagePath('pack', pack.id);
    imageContainer.style.backgroundImage = `url('${imagePath}')`;

    const titleOverlay = document.createElement('div');
    titleOverlay.className = 'card-title-overlay';
    titleOverlay.textContent = pack.name;
    imageContainer.appendChild(titleOverlay);

    const clickIndicator = document.createElement('div');
    clickIndicator.className = 'click-indicator';
    clickIndicator.innerHTML = '<i class="fas fa-check"></i>';
    imageContainer.appendChild(clickIndicator);

    const selectionIndicator = document.createElement('div');
    selectionIndicator.className = 'selection-indicator';
    selectionIndicator.innerHTML = '<i class="fas fa-check"></i>';
    imageContainer.appendChild(selectionIndicator);

    leftSide.appendChild(imageContainer);
    card.appendChild(leftSide);

    const rightSide = document.createElement('div');
    rightSide.className = 'card-right';

    const componentNames = pack.components.map((comp) => {
      const biome = biomeSets.find((b) => b.id === comp.setId);
      return biome ? biome.name : comp.setId;
    });
    const componentSummary = componentNames.join(', ');
    const uniqueBiomeCount = componentNames.length;

    const metaParts = [];
    if (Number.isFinite(pack.totalTiles)) {
      const tileLabel = pack.totalTiles === 1 ? 'tile' : 'tiles';
      metaParts.push(`${pack.totalTiles} ${tileLabel}`);
    }
    metaParts.push(`${uniqueBiomeCount} ${uniqueBiomeCount === 1 ? 'biome' : 'biomes'}`);
    if (pack.type) metaParts.push(pack.type);
    if (pack.scale) metaParts.push(pack.scale);

    const entryMetaText = metaParts.slice(0, 2).join(' • ');
    const tooltipLines = [pack.name];
    if (componentSummary) tooltipLines.push(`Contains: ${componentSummary}`);
    if (entryMetaText) tooltipLines.push(entryMetaText);
    const tooltipText = tooltipLines.join('\n');

    if (tooltipText) {
      imageContainer.title = `${tooltipText}\n\nClick to toggle selection.`;
      imageContainer.setAttribute('aria-label', `${tooltipLines.join('. ')}. Click to toggle selection.`);
    } else {
      imageContainer.title = 'Click to select/deselect this pack';
      imageContainer.setAttribute('aria-label', 'Select pack: click to toggle');
    }

    const listEntry = document.createElement('button');
    listEntry.type = 'button';
    listEntry.className = 'card-list-entry';
    listEntry.setAttribute('aria-pressed', isSelected ? 'true' : 'false');

    const entryThumbnail = document.createElement('img');
    entryThumbnail.className = 'entry-thumb';
    entryThumbnail.src = imagePath;
    entryThumbnail.loading = 'lazy';
    entryThumbnail.decoding = 'async';
    entryThumbnail.alt = componentSummary ? `${pack.name} preview showing ${componentSummary}` : `${pack.name} preview image`;
    entryThumbnail.onerror = () => {
      entryThumbnail.onerror = null;
      entryThumbnail.src = 'images/grids/placeholder-grid-biome-set.png';
    };
    listEntry.appendChild(entryThumbnail);

    const entryTitle = document.createElement('span');
    entryTitle.className = 'entry-title';
    entryTitle.textContent = pack.name;
    listEntry.appendChild(entryTitle);

    if (entryMetaText) {
      const entryMeta = document.createElement('span');
      entryMeta.className = 'entry-meta';
      entryMeta.textContent = entryMetaText;
      listEntry.appendChild(entryMeta);
    }

    if (tooltipText) {
      listEntry.title = tooltipText;
      listEntry.setAttribute('aria-label', `${tooltipLines.join('. ')}. Click to toggle selection.`);
    } else {
      listEntry.title = pack.name;
      listEntry.setAttribute('aria-label', `Select ${pack.name}`);
    }
    rightSide.appendChild(listEntry);

    const componentsInfo = document.createElement('div');
    componentsInfo.className = 'pack-components';
    componentsInfo.innerHTML = `
      <span class="components-label">Contains:</span>
      <span class="components-list">${componentSummary}</span>
    `;
    componentsInfo.title = `Contains: ${componentSummary}`;
    rightSide.appendChild(componentsInfo);

    const controls = document.createElement('div');
    controls.className = 'card-controls';

    const quantityContainer = document.createElement('div');
    quantityContainer.className = 'quantity-container';

    const quantityLabel = document.createElement('label');
    quantityLabel.textContent = 'Quantity:';
    quantityLabel.htmlFor = `pack-qty-${pack.id}`;

    const quantityInput = document.createElement('input');
    quantityInput.type = 'number';
    quantityInput.id = `pack-qty-${pack.id}`;
    quantityInput.min = '0';
    quantityInput.step = '1';
    quantityInput.value = currentCount.toString();
    quantityInput.dataset.lastValidValue = quantityInput.value;
    quantityInput.disabled = false;

    quantityInput.addEventListener('change', (e) => {
      const rawValue = e.target.value;
      const newValue = Math.max(0, parseInt(rawValue, 10) || 0);
      const existing = packCounts.get(pack.id) || 0;
      const ensureValue = (val) => {
        const normalized = (Number.isFinite(val) ? val : existing).toString();
        if (e.target.value !== normalized) {
          e.target.value = normalized;
        }
        e.target.dataset.lastValidValue = normalized;
        return normalized;
      };

      if (newValue === existing) {
        ensureValue(existing);
        return;
      }

      // Immediately snap back to the last confirmed value before applying updates.
      ensureValue(existing);

      const applied = applyPackCount(pack.id, newValue);
      const resolved = packCounts.get(pack.id);
      if (resolved !== undefined) {
        ensureValue(resolved);
      } else {
        ensureValue(applied);
      }
    });

    quantityInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.target.blur();
      }
    });

    quantityContainer.appendChild(quantityLabel);
    quantityContainer.appendChild(quantityInput);
    controls.appendChild(quantityContainer);
    rightSide.appendChild(controls);

    card.appendChild(rightSide);

    if ((getPlacementMode?.() || 'limited') === 'limited' && isSelected) {
      const badge = document.createElement('div');
      badge.className = 'badge quantity-badge';
      badge.textContent = currentCount.toString();
      card.appendChild(badge);
    }

    const togglePackSelection = () => {
      const count = packCounts.get(pack.id) || 0;
      const currentlySelected = count > 0;
      if (currentlySelected) {
        applyPackCount(pack.id, 0);
      } else {
        const typed = parseInt(document.getElementById(`pack-qty-${pack.id}`)?.value || '1', 10);
        applyPackCount(pack.id, Math.max(1, typed));
      }
    };

    imageContainer.addEventListener('click', togglePackSelection);
    imageContainer.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        togglePackSelection();
      }
    });

    listEntry.addEventListener('click', (e) => {
      e.preventDefault();
      togglePackSelection();
    });

    return card;
  }

  function updatePackCardDisplay(packId) {
    const card = document.querySelector(`[data-pack-id="${packId}"]`);
    if (!card) return;

    const currentCount = packCounts.get(packId) || 0;
    const isSelected = currentCount > 0;
    const mode = getPlacementMode?.() || 'limited';

    card.classList.toggle('selected', isSelected);

    let badge = card.querySelector('.quantity-badge');
    if (mode === 'limited' && isSelected) {
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'badge quantity-badge';
        card.appendChild(badge);
      }
      badge.textContent = currentCount.toString();
      badge.style.display = 'block';
    } else if (badge) {
      badge.style.display = 'none';
    }

    const quantityInput = card.querySelector('input[type="number"]');
    if (quantityInput) {
      const normalizedCurrent = currentCount.toString();
      if (quantityInput.value !== normalizedCurrent) {
        quantityInput.value = normalizedCurrent;
      }
      quantityInput.dataset.lastValidValue = normalizedCurrent;
      quantityInput.disabled = false;
    }

    const listEntry = card.querySelector('.card-list-entry');
    if (listEntry) {
      listEntry.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    }
  }

  function applyPackCount(packId, newCount) {
    const previousCount = packCounts.get(packId) || 0;
    const applied = setPackCount(packId, newCount);
    const resolvedCountRaw = packCounts.get(packId);
    const resolvedCount = Number.isFinite(resolvedCountRaw)
      ? resolvedCountRaw
      : (Number.isFinite(applied) ? applied : newCount);

    const justActivated = previousCount <= 0 && resolvedCount > 0;
    let autoSelectedBiome = null;
    if (justActivated) {
      autoSelectedBiome = getFirstBiomeForPack(packId);
      if (autoSelectedBiome) {
        tileSourceFilter = 'all';
        tileSearchTerm = '';
        if (tileSearchDebounceId) {
          window.clearTimeout(tileSearchDebounceId);
          tileSearchDebounceId = null;
        }
        activeBiomeForGrid = autoSelectedBiome;
      }
    }

    updatePackCardDisplay(packId);

    if (activeTab === 'biomes') {
      renderBiomeSets();
    }

    updateTileSelection();
    updateHeaderStats?.();
    updateRightPanelStats?.();

    if (typeof markShareDirty === 'function' && resolvedCount !== previousCount) {
      markShareDirty('pack-count');
    }

    return applied;
  }

  function renderBiomeSets() {
  uiLog.log('Rendering Biome Sets...');
    const container = document.getElementById('biomes-grid');
    if (!container) return;

    container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'section-header section-header--with-controls';

    const heading = document.createElement('div');
    heading.className = 'section-heading';
    heading.innerHTML = `
      <h3>Biome Sets</h3>
      <span class="count">${biomeSets.length} available</span>
    `;
    header.appendChild(heading);

    const controls = document.createElement('div');
    controls.className = 'section-controls';
    controls.appendChild(createAssetViewToggle());
    header.appendChild(controls);

    container.appendChild(header);
    setupViewModeToggle();

    const gridContainer = document.createElement('div');
    gridContainer.className = 'cards-grid';
    container.appendChild(gridContainer);

    const emptyState = document.createElement('div');
    emptyState.className = 'asset-empty-state';
    emptyState.innerHTML = '<i class="fas fa-search"></i><span>No biome sets match your search.</span>';
    container.appendChild(emptyState);

    biomeSets.forEach((biome) => {
      const card = createBiomeSetCard(biome);
      gridContainer.appendChild(card);
    });

    applyAssetViewMode();
    if (searchQuery) {
      searchBiomeSets();
    } else {
      updateSearchResults('biomes', biomeSets.length, biomeSets.length);
    }
  }

  function renderBiomeAvailabilityContent(availabilityInfo, { availableFromPacks, totalFromPacks = 0, currentCount = 0 }) {
    if (!availabilityInfo) return;

    const resolvedPackSets = Math.max(0, Number(totalFromPacks) || 0);
    const hasPackContribution = availableFromPacks && resolvedPackSets > 0;
    const packSets = hasPackContribution ? resolvedPackSets : 0;
    const standaloneSets = Math.max(0, Number(currentCount) || 0);

    availabilityInfo.classList.toggle('packs-available', hasPackContribution);
    availabilityInfo.classList.toggle('packs-unavailable', !hasPackContribution);
    availabilityInfo.dataset.packSets = String(packSets);
    availabilityInfo.dataset.standaloneSets = String(standaloneSets);
    availabilityInfo.setAttribute('role', 'group');
    availabilityInfo.setAttribute('aria-label', 'Selection breakdown');

    const packChipTitle = hasPackContribution
      ? `Sets available from selected packs: ${packSets}`
      : 'No selected packs currently include this biome set.';
    const standaloneChipTitle = `Standalone sets selected: ${standaloneSets}`;

    availabilityInfo.innerHTML = `
      <span class="availability-chip pack-chip" aria-label="Sets from packs: ${packSets}" title="${packChipTitle}">
        <span class="chip-label">Packs</span>
        <span class="chip-value">${packSets}</span>
      </span>
      <span class="availability-chip standalone-chip${standaloneSets ? ' is-active' : ''}" aria-label="Standalone sets: ${standaloneSets}" title="${standaloneChipTitle}">
        <span class="chip-label">Standalone</span>
        <span class="chip-value">${standaloneSets}</span>
      </span>
    `;
  }

  function createBiomeSetCard(biome) {
    const card = document.createElement('div');
    card.className = 'card biome-card';
    card.dataset.biomeId = biome.id;

    const currentCount = standaloneBiomeSetCounts.get(biome.id) || 0;
    const isSelected = currentCount > 0;
    const availableFromPacks = isSimpleBiomeAvailable(biome.id);

    if (isSelected) {
      card.classList.add('selected');
    }
    card.classList.add(availableFromPacks ? 'available-from-packs' : 'unavailable');

    const leftSide = document.createElement('div');
    leftSide.className = 'card-left';

    const imageContainer = document.createElement('div');
    imageContainer.className = 'card-image';
    imageContainer.setAttribute('role', 'button');
    imageContainer.tabIndex = 0;

    const imagePath = getImagePath('biome', biome.id);
    imageContainer.style.backgroundImage = `url('${imagePath}')`;

    const testImg = new Image();
    testImg.onerror = () => {
      imageContainer.style.backgroundImage = `url('images/grids/placeholder-grid-biome-set.png')`;
    };
    testImg.src = imagePath;

    const titleOverlay = document.createElement('div');
    titleOverlay.className = 'card-title-overlay';
    titleOverlay.textContent = biome.name;
    imageContainer.appendChild(titleOverlay);

    const clickIndicator = document.createElement('div');
    clickIndicator.className = 'click-indicator';
    clickIndicator.innerHTML = '<i class="fas fa-check"></i>';
    imageContainer.appendChild(clickIndicator);

    const selectionIndicator = document.createElement('div');
    selectionIndicator.className = 'selection-indicator';
    selectionIndicator.innerHTML = '<i class="fas fa-check"></i>';
    imageContainer.appendChild(selectionIndicator);

    if (availableFromPacks) {
      const packIndicator = document.createElement('div');
      packIndicator.className = 'pack-indicator';
      packIndicator.innerHTML = '<i class="fas fa-box"></i>';
      packIndicator.title = 'Available from Environment Packs';
      imageContainer.appendChild(packIndicator);
    }

    leftSide.appendChild(imageContainer);
    card.appendChild(leftSide);

    const rightSide = document.createElement('div');
    rightSide.className = 'card-right';

    const listMetaParts = [];
    const metaItems = [];
    if (biome.biomeParent) {
      listMetaParts.push(biome.biomeParent);
      metaItems.push(`<span class="meta-item"><i class="fas fa-globe" aria-hidden="true"></i>${biome.biomeParent}</span>`);
    }
    if (Number.isFinite(biome.tiles)) {
      const tileLabel = biome.tiles === 1 ? 'tile' : 'tiles';
      listMetaParts.push(`${biome.tiles} ${tileLabel}`);
      metaItems.push(`<span class="meta-item"><i class="fas fa-th-large" aria-hidden="true"></i>${biome.tiles} ${tileLabel}</span>`);
    }
    if (biome.scale) {
      listMetaParts.push(biome.scale);
      metaItems.push(`<span class="meta-item"><i class="fas fa-ruler" aria-hidden="true"></i>${biome.scale}</span>`);
    }

    const totalFromPacks = availableFromPacks ? getTotalFromPacks(biome.id) : 0;

    const listEntry = document.createElement('button');
    listEntry.type = 'button';
    listEntry.className = 'card-list-entry';
    listEntry.setAttribute('aria-pressed', isSelected ? 'true' : 'false');

    const entryThumbnail = document.createElement('img');
    entryThumbnail.className = 'entry-thumb';
    entryThumbnail.src = imagePath;
    entryThumbnail.loading = 'lazy';
    entryThumbnail.decoding = 'async';
    entryThumbnail.alt = `${biome.name} preview image`;
    entryThumbnail.onerror = () => {
      entryThumbnail.onerror = null;
      entryThumbnail.src = 'images/grids/placeholder-grid-biome-set.png';
    };
    listEntry.appendChild(entryThumbnail);

    const entryTitle = document.createElement('span');
    entryTitle.className = 'entry-title';
    entryTitle.textContent = biome.name;
    listEntry.appendChild(entryTitle);

    const entryMetaText = listMetaParts.slice(0, 2).join(' • ');
    if (entryMetaText) {
      const entryMeta = document.createElement('span');
      entryMeta.className = 'entry-meta';
      entryMeta.textContent = entryMetaText;
      listEntry.appendChild(entryMeta);
      entryThumbnail.alt = `${biome.name} preview — ${entryMetaText}`;
    }

    const biomeTooltipLines = [biome.name];
    if (entryMetaText) biomeTooltipLines.push(entryMetaText);
    if (availableFromPacks) biomeTooltipLines.push(`In packs: ${totalFromPacks}`);
    const biomeTooltip = biomeTooltipLines.join('\n');
    listEntry.title = biomeTooltip;
    listEntry.setAttribute('aria-label', `${biomeTooltipLines.join('. ')}. Click to toggle selection.`);

    if (biomeTooltip) {
      imageContainer.title = `${biomeTooltip}\n\nClick to toggle selection.`;
      imageContainer.setAttribute('aria-label', `${biomeTooltipLines.join('. ')}. Click to toggle selection.`);
    } else {
      imageContainer.title = 'Click to select/deselect this biome set';
      imageContainer.setAttribute('aria-label', 'Select biome set: click to toggle');
    }
    rightSide.appendChild(listEntry);

    const availabilityInfo = document.createElement('div');
    availabilityInfo.className = 'biome-availability';
    renderBiomeAvailabilityContent(availabilityInfo, {
      availableFromPacks,
      totalFromPacks,
      currentCount,
      isSelected
    });
    rightSide.appendChild(availabilityInfo);

    if (biome.description) {
      const summary = document.createElement('p');
      summary.className = 'card-summary';
      summary.textContent = biome.description;
      rightSide.appendChild(summary);
    }

    if (metaItems.length) {
      const meta = document.createElement('div');
      meta.className = 'card-meta';
      meta.innerHTML = metaItems.join('');
      rightSide.appendChild(meta);
    }

    const controls = document.createElement('div');
    controls.className = 'card-controls';

    const quantityContainer = document.createElement('div');
    quantityContainer.className = 'quantity-container';

    const quantityLabel = document.createElement('label');
    quantityLabel.textContent = 'Standalone Quantity:';
    quantityLabel.htmlFor = `biome-qty-${biome.id}`;

    const quantityInput = document.createElement('input');
    quantityInput.type = 'number';
    quantityInput.id = `biome-qty-${biome.id}`;
    quantityInput.min = '0';
    quantityInput.step = '1';
    quantityInput.value = currentCount.toString();
    quantityInput.dataset.lastValidValue = quantityInput.value;
    quantityInput.disabled = false;

    quantityInput.addEventListener('change', (e) => {
      const rawValue = e.target.value;
      const newValue = Math.max(0, parseInt(rawValue, 10) || 0);
      const existing = standaloneBiomeSetCounts.get(biome.id) || 0;

      if (newValue !== existing) {
        const applied = applyStandaloneBiomeSetCount(biome.id, newValue);
        const normalizedApplied = Number.isFinite(applied) ? applied : existing;
        const actualStateCount = standaloneBiomeSetCounts.get(biome.id) ?? normalizedApplied;
        const resolvedValue = actualStateCount.toString();

        if (e.target.value !== resolvedValue) {
          e.target.value = resolvedValue;
        }
        e.target.dataset.lastValidValue = resolvedValue;
      } else {
        const normalizedExisting = existing.toString();
        if (rawValue !== normalizedExisting) {
          e.target.value = normalizedExisting;
        }
        e.target.dataset.lastValidValue = normalizedExisting;
      }
    });

    quantityInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.target.blur();
      }
    });

    quantityContainer.appendChild(quantityLabel);
    quantityContainer.appendChild(quantityInput);
    controls.appendChild(quantityContainer);
    rightSide.appendChild(controls);

    card.appendChild(rightSide);

    if ((getPlacementMode?.() || 'limited') === 'limited' && (isSelected || availableFromPacks)) {
      const badge = document.createElement('div');
      badge.className = 'badge quantity-badge';
      const totalSets = getBiomeTotalSets(biome.id);
      badge.textContent = totalSets.toString();
      card.appendChild(badge);
    }

    const toggleBiomeSelection = () => {
      const count = standaloneBiomeSetCounts.get(biome.id) || 0;
      const currentlySelected = count > 0;
      if (currentlySelected) {
        applyStandaloneBiomeSetCount(biome.id, 0);
      } else {
        const typed = parseInt(document.getElementById(`biome-qty-${biome.id}`)?.value || '1', 10);
        applyStandaloneBiomeSetCount(biome.id, Math.max(1, typed));
      }
    };

    imageContainer.addEventListener('click', toggleBiomeSelection);
    imageContainer.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleBiomeSelection();
      }
    });

    listEntry.addEventListener('click', (e) => {
      e.preventDefault();
      toggleBiomeSelection();
    });

    return card;
  }

  function updateBiomeCardDisplay(biomeId) {
    const card = document.querySelector(`[data-biome-id="${biomeId}"]`);
    if (!card) return;

    const currentCount = standaloneBiomeSetCounts.get(biomeId) || 0;
    const isSelected = currentCount > 0;
    const availableFromPacks = isAvailableFromPacks(biomeId);
    const totalSets = getBiomeTotalSets(biomeId);

    card.classList.toggle('selected', isSelected);
    card.classList.toggle('available-from-packs', availableFromPacks);
    card.classList.toggle('unavailable', !availableFromPacks);

    const availabilityInfo = card.querySelector('.biome-availability');
    if (availabilityInfo) {
      const totalFromPacks = availableFromPacks ? getTotalFromPacks(biomeId) : 0;
      renderBiomeAvailabilityContent(availabilityInfo, {
        availableFromPacks,
        totalFromPacks,
        currentCount,
        isSelected
      });
    }

    let badge = card.querySelector('.quantity-badge');
    if ((getPlacementMode?.() || 'limited') === 'limited' && (isSelected || availableFromPacks)) {
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'badge quantity-badge';
        card.appendChild(badge);
      }
      badge.textContent = totalSets.toString();
      badge.style.display = 'block';
    } else if (badge) {
      badge.style.display = 'none';
    }

    const quantityInput = card.querySelector('input[type="number"]');
    if (quantityInput) {
      const normalizedCurrent = currentCount.toString();
      if (quantityInput.value !== normalizedCurrent) {
        quantityInput.value = normalizedCurrent;
      }
      quantityInput.dataset.lastValidValue = normalizedCurrent;
      quantityInput.disabled = false;
    }

    const listEntry = card.querySelector('.card-list-entry');
    if (listEntry) {
      listEntry.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    }
  }

  function applyStandaloneBiomeSetCount(biomeId, newCount) {
    const previousCount = standaloneBiomeSetCounts.get(biomeId) || 0;
    const applied = setStandaloneBiomeSetCount(biomeId, newCount);
    const resolvedCountRaw = standaloneBiomeSetCounts.get(biomeId);
    const resolvedCount = Number.isFinite(resolvedCountRaw)
      ? resolvedCountRaw
      : (Number.isFinite(applied) ? applied : newCount);

    if (previousCount <= 0 && resolvedCount > 0) {
      const biome = biomeSets.find((b) => b.id === biomeId);
      if (biome) {
        tileSourceFilter = 'standalone';
        tileSearchTerm = '';
        if (tileSearchDebounceId) {
          window.clearTimeout(tileSearchDebounceId);
          tileSearchDebounceId = null;
        }
        activeBiomeForGrid = biome;
      }
    }

    updateBiomeCardDisplay(biomeId);
    refreshBiomeGridUI();
    updateTileSelection();
    updateHeaderStats?.();
    updateRightPanelStats?.();

    if (typeof markShareDirty === 'function' && resolvedCount !== previousCount) {
      markShareDirty('standalone-set-count');
    }

    return applied;
  }

  function refreshBiomeGridUI() {
    if (!activeBiomeForGrid) return;
    if (gridRefreshGuard) return;

    gridRefreshGuard = true;
    showBiomeTileGrid(activeBiomeForGrid);
    gridRefreshGuard = false;
  }

  function showBiomeTileGrid(biome) {
    if (!biome) return;

    activeBiomeForGrid = biome;
    ensureBiomeInitialized?.(biome.id);

    const container = document.getElementById('tile-grid-wrapper');
    if (!container) {
  uiLog.error('❌ tile-grid-wrapper container not found!');
      return;
    }

    container.innerHTML = '';

    const placementMode = getPlacementMode?.() || 'limited';
    const totalSets = getBiomeTotalSets?.(biome.id) ?? 0;
    const usedSlots = getUsedSlotsCount(biome.id);
    const availableSlots = placementMode === 'unlimited' ? '∞' : Math.max(0, totalSets * 50 - usedSlots);
    refreshTileSelectionSummary(biome, {
      placementMode,
      totalSets,
      usedSlots,
      availableSlots
    });

    const gridWrapper = document.createElement('div');
    gridWrapper.className = 'enhanced-tile-grid';

    const grid = document.createElement('div');
    grid.className = 'tile-grid modern-grid';
    grid.id = 'main-tile-grid';

    const gridSprite = getBiomeGridSprite(biome);
    const bgImage = `url('${gridSprite}')`;

    for (let i = 0; i < 50; i++) {
      grid.appendChild(createEnhancedTileSlot(biome, i, bgImage));
    }

    gridWrapper.appendChild(grid);
    container.appendChild(gridWrapper);

    const currentSelection = getSelectedTileInfo?.();
    if (!currentSelection || currentSelection.biomeId !== biome.id) {
      selectFirstAvailableSlot(biome);
    } else {
      highlightSelectedSlot();
    }

    const biomeSelect = document.getElementById('biome-select');
    if (biomeSelect) {
      biomeSelect.value = biome.id;
      const biomeApi = enhanceSelect(biomeSelect);
      biomeApi?.refresh?.();
    }
  }

  function createEnhancedTileSlot(biome, index, bgImage) {
    const placementMode = getPlacementMode?.() || 'limited';
    const slotNumber = index + 1;
    const key = `${biome.id}_${slotNumber}`;

    const slot = document.createElement('div');
    slot.className = 'tile-slot enhanced-slot';
    slot.dataset.slotIndex = String(index);
    slot.dataset.slotKey = key;
    slot.dataset.biomeId = biome.id;
    slot.setAttribute('tabindex', '0');

    // Get grid dimensions from texture config
    let gridCols = 5;
    let gridRows = 10;
    if (typeof getGridTexturePath === 'function') {
      const textureConfig = getGridTexturePath(biome.id);
      if (textureConfig && textureConfig.gridSize) {
        gridCols = textureConfig.gridSize.cols || 5;
        gridRows = textureConfig.gridSize.rows || 10;
      }
    }

    const col = index % gridCols;
    const row = Math.floor(index / gridCols);
    const x = gridCols === 1 ? 0 : (col / (gridCols - 1)) * 100;
    const y = gridRows === 1 ? 0 : (row / (gridRows - 1)) * 100;

    slot.style.backgroundImage = bgImage;
    slot.style.backgroundSize = `${gridCols * 100}% ${gridRows * 100}%`;
    slot.style.backgroundPosition = `${x}% ${y}%`;

    ensureBiomeInitialized?.(biome.id);

    const totalAvailable = getBiomeTotalSets?.(biome.id) ?? 0;
    const remaining = placementMode === 'limited'
      ? (tileInstanceLimits.get(key) ?? totalAvailable)
      : Infinity;
    const isAvailable = placementMode === 'unlimited' || remaining > 0;
    const isUsed = placementMode === 'limited' && remaining < totalAvailable;

    if (!isAvailable) slot.classList.add('used-up');
    if (isUsed) slot.classList.add('partially-used');
    if (isAvailable) slot.classList.add('available');

    const numberIndicator = document.createElement('div');
    numberIndicator.className = 'slot-number';
    numberIndicator.textContent = String(slotNumber);
    slot.appendChild(numberIndicator);

    const badge = document.createElement('div');
    badge.className = 'quantity-badge slot-badge';
    if (placementMode === 'limited') {
      badge.textContent = `${remaining}/${totalAvailable}`;
      if (remaining === 0) {
        badge.classList.add('depleted');
      } else if (remaining < totalAvailable) {
        badge.classList.add('partial');
      }
    } else {
      const placedCount = getInstancePlacementCount(key);
      badge.classList.add('slot-badge--unlimited');
      badge.textContent = `${placedCount} / ∞`;
    }
    slot.appendChild(badge);

    const selectionIndicator = document.createElement('div');
    selectionIndicator.className = 'slot-selection-indicator';
    selectionIndicator.innerHTML = '<i class="fas fa-check-circle"></i>';
    slot.appendChild(selectionIndicator);

    const tooltip = document.createElement('div');
    tooltip.className = 'slot-tooltip';
    if (placementMode === 'limited') {
      tooltip.innerHTML = `
        <strong>Slot ${slotNumber}</strong><br>
        Available: ${remaining}/${totalAvailable}<br>
        Status: ${!isAvailable ? 'Used Up' : isUsed ? 'Partially Used' : 'Available'}
      `;
    } else {
      const placedCount = getInstancePlacementCount(key);
      tooltip.innerHTML = `
        <strong>Slot ${slotNumber}</strong><br>
        Status: Unlimited<br>
        Tiles placed: ${placedCount}
      `;
    }
    slot.appendChild(tooltip);

    slot.addEventListener('click', (e) => {
      e.preventDefault();
      if (placementMode === 'limited' && !isAvailable) return;
      selectTileSlot(biome, index, key);
    });

    slot.addEventListener('keydown', (e) => {
      const i = parseInt(slot.dataset.slotIndex || '0', 10);
      const COLS = 5;
      if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
      }

      let next = i;
      if (e.key === 'ArrowRight') next = Math.min(49, i + 1);
      if (e.key === 'ArrowLeft') next = Math.max(0, i - 1);
      if (e.key === 'ArrowDown') next = Math.min(49, i + COLS);
      if (e.key === 'ArrowUp') next = Math.max(0, i - COLS);
      if (e.key === 'Home') next = 0;
      if (e.key === 'End') next = 49;

      if (next !== i && !['Enter', ' '].includes(e.key)) {
        slot.parentElement?.querySelector(`[data-slot-index="${next}"]`)?.focus();
      }

      if (['Enter', ' '].includes(e.key)) {
        if (placementMode === 'limited' && !isAvailable) return;
        selectTileSlot(biome, index, key);
      }
    });

    slot.addEventListener('mouseenter', () => {
      if (isAvailable) slot.classList.add('hover');
    });

    slot.addEventListener('mouseleave', () => {
      slot.classList.remove('hover');
    });

    return slot;
  }

  function selectTileSlot(biome, index, key) {
    const slotNumber = index + 1;
    const type = biome.name.split(' ')[0];

    setSelectedTileInfo?.({
      type,
      name: biome.name,
      biomeId: biome.id,
      instanceId: key,
      slotNumber,
      tileNumber: slotNumber
    });

    setSelectedTile?.({
      biomeId: biome.id,
      tileNumber: slotNumber,
      instanceId: key,
      type
    });

    resetPlacementRotation?.();
    createOrUpdateGhostTile?.();
    highlightSelectedSlot();
  }

  function highlightSelectedSlot() {
    document.querySelectorAll('.tile-slot').forEach((slot) => {
      slot.classList.remove('selected');
    });

    const info = getSelectedTileInfo?.();
    if (!info) return;

    const currentSlot = document.querySelector(`[data-slot-key="${info.instanceId}"]`);
    if (currentSlot) {
      currentSlot.classList.add('selected');
      try {
        currentSlot.focus({ preventScroll: true });
      } catch {
        currentSlot.focus?.();
      }
    }
  }

  function updateUnlimitedSlotDisplay(instanceId) {
    if (!instanceId) return;
    if ((getPlacementMode?.() || 'limited') !== 'unlimited') return;

    const slotEl = document.querySelector(`[data-slot-key="${instanceId}"]`);
    if (!slotEl) return;

    const placements = getInstancePlacementCount(instanceId);

    const badge = slotEl.querySelector('.slot-badge');
    if (badge) {
      badge.textContent = `${placements} / ∞`;
      badge.classList.add('slot-badge--unlimited');
    }

    const tooltip = slotEl.querySelector('.slot-tooltip');
    if (tooltip) {
      const slotIndex = parseInt(slotEl.dataset.slotIndex || '0', 10);
      const slotNumber = Number.isNaN(slotIndex) ? instanceId.split('_').pop() : slotIndex + 1;
      tooltip.innerHTML = `
        <strong>Slot ${slotNumber}</strong><br>
        Status: Unlimited<br>
        Tiles placed: ${placements}
      `;
    }

    slotEl.classList.remove('used-up', 'partially-used', 'used');
    slotEl.classList.add('available');

    if (activeBiomeForGrid) {
      refreshTileSelectionSummary(activeBiomeForGrid, {
        placementMode: 'unlimited',
        totalSets: getBiomeTotalSets?.(activeBiomeForGrid.id) ?? 0,
        usedSlots: getBiomePlacementCount(activeBiomeForGrid.id),
        availableSlots: '∞'
      });
    }
  }

  function refreshActiveBiomeSummary() {
    if (!activeBiomeForGrid) return;
    refreshTileSelectionSummary(activeBiomeForGrid);
  }

  function handleBiomeSelectChange(event) {
    const biomeId = event.target.value;
    if (!biomeId) {
      activeBiomeForGrid = null;
      const tileGridWrapper = document.getElementById('tile-grid-wrapper');
      if (tileGridWrapper) {
        tileGridWrapper.innerHTML = '<div class="empty-state">Select a biome above to view tiles</div>';
      }
      return;
    }

    const biome = biomeSets.find((b) => b.id === biomeId);
    if (biome) {
      showBiomeTileGrid(biome);
    }
  }

  function updateTileSelection() {
    const biomeSelect = document.getElementById('biome-select');
    if (!biomeSelect) return;

    if (!biomeSelect.dataset.controllerBound) {
      biomeSelect.addEventListener('change', handleBiomeSelectChange);
      biomeSelect.dataset.controllerBound = 'true';
    }

    setupTileFilters();

    const tileGridWrapper = document.getElementById('tile-grid-wrapper');

    biomeSelect.innerHTML = '<option value="">Select a biome to view tiles</option>';

    const selectedPacks = environmentPacks.filter((pack) => (packCounts.get(pack.id) || 0) > 0);
    refreshTileSourceFilterOptions(selectedPacks);

    const availableBiomes = getAvailableBiomes();
    if (!availableBiomes.length) {
      if (tileGridWrapper) {
        tileGridWrapper.innerHTML = '<div class="empty-state">Select packs or standalone biomes to unlock tile previews.</div>';
      }
  setTileSelectionSummaryText('No tiles selected yet');
      syncTileFilterUIState();
      return;
    }

    const packContributionMap = new Map();
    selectedPacks.forEach((pack) => {
      pack.components?.forEach((component) => {
        if (!component?.setId) return;
        const contribution = packContributionMap.get(component.setId) || [];
        contribution.push(pack);
        packContributionMap.set(component.setId, contribution);
      });
    });

    const filterPackId = tileSourceFilter.startsWith('pack:') ? tileSourceFilter.slice(5) : null;
    const searchTerm = tileSearchTerm.trim().toLowerCase();

    const filteredBiomes = availableBiomes.filter((biome) => {
      const associatedPacks = packContributionMap.get(biome.id) || [];
      const fromPacks = associatedPacks.length > 0;
      const fromStandalone = (standaloneBiomeSetCounts.get(biome.id) || 0) > 0;

      if (tileSourceFilter === 'packs' && !fromPacks) return false;
      if (tileSourceFilter === 'standalone' && !fromStandalone) return false;
      if (filterPackId && !associatedPacks.some((pack) => pack.id === filterPackId)) return false;
      if (searchTerm && !biome.name.toLowerCase().includes(searchTerm)) return false;
      return true;
    });

    if (!filteredBiomes.length) {
      biomeSelect.innerHTML = '<option value="">No biomes match the current filters</option>';
      if (tileGridWrapper) {
        tileGridWrapper.innerHTML = '<div class="empty-state">No biomes match your filters. Adjust the source filter or search to continue.</div>';
      }
      setTileSelectionSummaryText('No biomes match the current filters');
      syncTileFilterUIState();
      return;
    }

    const placementMode = getPlacementMode?.() || 'limited';

    const groupFromPacks = document.createElement('optgroup');
    groupFromPacks.label = 'Available from packs';
    const groupStandaloneOnly = document.createElement('optgroup');
    groupStandaloneOnly.label = 'Standalone only';

    filteredBiomes.forEach((biome) => {
      const option = document.createElement('option');
      option.value = biome.id;

      const totalSets = getBiomeTotalSets?.(biome.id) ?? 0;
      const packSets = getTotalFromPacks?.(biome.id) ?? 0;
      const standaloneSets = standaloneBiomeSetCounts.get(biome.id) || 0;
      const contributingPacks = packContributionMap.get(biome.id) || [];

      let quantityText = '';
      if (placementMode === 'limited') {
        if (packSets > 0 && standaloneSets > 0) {
          quantityText = ` (${packSets} from packs + ${standaloneSets} standalone = ${totalSets} total)`;
        } else if (packSets > 0) {
          quantityText = ` (${packSets} from packs)`;
        } else if (standaloneSets > 0) {
          quantityText = ` (${standaloneSets} standalone)`;
        }
      } else {
        quantityText = ' (unlimited)';
      }

      const defaultEmoji = `${biomeEmoji(biome)} `;
      let prefix = defaultEmoji;
      if (packSets > 0) {
        if (contributingPacks.length > 0) {
          const first = contributingPacks[0];
          const emoji = packEmoji(first.id || first.name);
          prefix = `${emoji}${contributingPacks.length > 1 ? `×${contributingPacks.length} ` : ' '}`;
          option.title = `From packs: ${contributingPacks.map((p) => p.name).join(', ')}`;
        } else {
          prefix = defaultEmoji;
        }
      } else if (standaloneSets > 0) {
        option.title = `Standalone sets: ${standaloneSets}`;
      }

      option.textContent = `${prefix}${biome.name}${quantityText}`;

      if (packSets > 0) {
        groupFromPacks.appendChild(option);
      } else {
        groupStandaloneOnly.appendChild(option);
      }
    });

    if (groupFromPacks.children.length) biomeSelect.appendChild(groupFromPacks);
    if (groupStandaloneOnly.children.length) biomeSelect.appendChild(groupStandaloneOnly);

    if (!activeBiomeForGrid || !filteredBiomes.some((biome) => biome.id === activeBiomeForGrid.id)) {
      activeBiomeForGrid = filteredBiomes[0];
    }

    if (activeBiomeForGrid) {
  biomeSelect.value = activeBiomeForGrid.id;
  const biomeApi = enhanceSelect(biomeSelect);
  biomeApi?.refresh?.();
      showBiomeTileGrid(activeBiomeForGrid);
    } else if (tileGridWrapper) {
      tileGridWrapper.innerHTML = '<div class="empty-state">Select a biome above to view tiles</div>';
      setTileSelectionSummaryText('Select a biome to view tiles');
    }

    syncTileFilterUIState();
  }

  function getFirstBiomeForPack(packId) {
    const pack = environmentPacks.find((p) => p.id === packId);
    if (!pack || !Array.isArray(pack.components)) return null;

    for (const component of pack.components) {
      if (!component?.setId) continue;
      const biome = biomeSets.find((b) => b.id === component.setId);
      if (biome) return biome;
    }
    return null;
  }

  function getAvailableBiomes() {
    const available = new Map();

    environmentPacks.forEach((pack) => {
      const count = packCounts.get(pack.id) || 0;
      if (count > 0) {
        pack.components?.forEach((component) => {
          const biome = biomeSets.find((b) => b.id === component.setId);
          if (biome && !available.has(biome.id)) {
            available.set(biome.id, biome);
          }
        });
      }
    });

    standaloneBiomeSetCounts.forEach((count, biomeId) => {
      if (count > 0 && !available.has(biomeId)) {
        const biome = biomeSets.find((b) => b.id === biomeId);
        if (biome) {
          available.set(biome.id, biome);
        }
      }
    });

    return Array.from(available.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  function isSimpleBiomeAvailable(biomeId) {
    if (!biomeId) return false;

    const availableThroughPacks = environmentPacks.some((pack) => {
      const count = packCounts.get(pack.id) || 0;
      if (count <= 0) return false;
      return pack.components?.some((component) => component.setId === biomeId);
    });

    if (availableThroughPacks) return true;

    const standaloneCount = standaloneBiomeSetCounts.get(biomeId) || 0;
    return standaloneCount > 0;
  }

  function selectFirstAvailableSlot(biome) {
    const placementMode = getPlacementMode?.() || 'limited';
    const totalSets = getBiomeTotalSets?.(biome.id) ?? 0;

    for (let i = 0; i < 50; i++) {
      const key = `${biome.id}_${i + 1}`;
      const remaining = placementMode === 'limited'
        ? (tileInstanceLimits.get(key) ?? totalSets)
        : 1;

      if (placementMode === 'unlimited' || remaining > 0) {
        selectTileSlot(biome, i, key);
        return;
      }
    }
  }

  function getUsedSlotsCount(biomeId) {
    const mode = getPlacementMode?.() || 'limited';
    if (mode === 'unlimited') {
      return getBiomePlacementCount(biomeId);
    }

    const totalSets = getBiomeTotalSets?.(biomeId) ?? 0;
    let used = 0;

    for (let i = 1; i <= 50; i++) {
      const key = `${biomeId}_${i}`;
      const remaining = tileInstanceLimits.get(key) ?? totalSets;
      const actualUsed = totalSets - remaining;
      used += Math.max(0, actualUsed);
    }

    return used;
  }

  function isAvailableFromPacks(biomeId) {
    return environmentPacks.some((pack) => {
      const count = packCounts.get(pack.id) || 0;
      return count > 0 && pack.components.some((comp) => comp.setId === biomeId);
    });
  }

  function advanceToNextAvailableInstance(biomeId, fromKey) {
    if (!biomeId) return false;

    const mode = getPlacementMode?.() || 'limited';
    const startIndex = fromKey ? (parseInt(fromKey.split('_').pop(), 10) % 50) : 0;

    for (let offset = 1; offset <= 50; offset++) {
      const index = ((startIndex + offset - 1) % 50) + 1;
      const key = `${biomeId}_${index}`;
      const remaining = mode === 'limited'
        ? (tileInstanceLimits.get(key) ?? getBiomeTotalSets(biomeId))
        : Infinity;

      if (mode === 'unlimited' || remaining > 0) {
        const biome = biomeSets.find((b) => b.id === biomeId);
        if (!biome) break;

        const type = biome.name.split(' ')[0];

        setSelectedTileInfo?.({
          type,
          name: biome.name,
          biomeId,
          instanceId: key,
          slotNumber: index,
          tileNumber: index
        });

        setSelectedTile?.({
          biomeId,
          tileNumber: index,
          instanceId: key,
          type
        });

        refreshBiomeGridUI();
        createOrUpdateGhostTile?.();
        return true;
      }
    }

    const biome = biomeSets.find((b) => b.id === biomeId);
    showNotification({
      type: 'warning',
      title: 'All tiles used',
      message: `All available tiles in the ${biome ? biome.name : biomeId} Biome Set are used.`,
      duration: 5000
    });
    return false;
  }

  function getImagePath(type, id) {
    if (type === 'pack') {
      const pack = environmentPacks.find((p) => p.id === id);
      return pack ? pack.img_main : PLACEHOLDER_SPRITE;
    }

    if (type === 'biome') {
      const biome = biomeSets.find((b) => b.id === id);
      return biome ? biome.img_pad1 : PLACEHOLDER_SPRITE;
    }

    return PLACEHOLDER_SPRITE;
  }

  function getBiomeGridSprite(biome) {
    if (!biome) return placeholderSprite;
    
    // Use the same getGridTexturePath function that's used for 3D tile textures
    if (typeof getGridTexturePath === 'function') {
      const textureConfig = getGridTexturePath(biome.id);
      if (textureConfig && textureConfig.gridTexture) {
        uiLog.log(`🎨 Using grid texture for ${biome.id}: ${textureConfig.gridTexture}`);
        return textureConfig.gridTexture;
      }
    }
    
    uiLog.warn(`⚠️ No grid texture found for biome ${biome.id}, using placeholder`);
    return placeholderSprite;
  }

  return {
    initialize,
    renderEnvironmentPacks,
    renderBiomeSets,
    refreshBiomeGridUI,
    refreshCurrentTab,
    updateTileSelection,
    applyPackCount,
    applyStandaloneBiomeSetCount,
    updatePackCardDisplay,
    updateBiomeCardDisplay,
    showBiomeTileGrid,
    advanceToNextAvailableInstance,
    switchToTab,
    updateUnlimitedSlotDisplay,
  refreshActiveBiomeSummary,
    getActiveBiomeForGrid: () => activeBiomeForGrid,
    getActiveTab: () => activeTab,
    getSearchQuery: () => searchQuery
  };
}