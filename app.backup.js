import * as THREE from 'three';
import { biomeSets, environmentPacks } from './data/data.js';
import { createStateManager } from './src/state/stateManager.js';
import createMaterialController from './src/tiles/materialController.js';
import { createLightingController } from './src/scene/lightingController.js';
import { createAnalyticsController } from './src/analytics/analyticsController.js';
import { createUIController } from './src/ui/uiController.js';
import { createScene } from './src/scene/createScene.js';
import createDebugLogger from './src/utils/debugLogger.js';
import {
  loadHexTileModel,
  prepareHexTileModel,
  createGhostTileInstance
} from './src/tiles/tileLoader.js';
import { createPersistenceController } from './src/app/persistence.js';
import { createUndoRedoController } from './src/app/undoRedoController.js';
import { setupKeyboardShortcuts } from './src/app/keyboardShortcuts.js';
import { createDebugOverlayController } from './src/app/debugOverlay.js';
import {
  TILE_COLOR_MAP,
  STORAGE_KEYS,
  GRID_CONFIG,
  BASE_PLASTIC_COLOR_HEX,
  MOUSE_CONSTANTS,
  MAX_UNDO_HISTORY,
  PLACEHOLDER_SPRITE_PATH
} from './src/config/constants.js';

let initAppRef = null;

const appLog = createDebugLogger('app');

export const initApp = (...args) => {
  if (typeof initAppRef === 'function') {
    return initAppRef(...args);
  }
  console.warn('initApp called before initialization is ready.');
  return undefined;
};

export default initApp;

appLog.log('🔍 Data loaded:');
appLog.log('environmentPacks:', environmentPacks.length, 'items');
appLog.log('biomeSets:', biomeSets.length, 'items');

const bootstrapApp = () => {
  appLog.log('🚀 DOM Content Loaded - Starting initialization...');

  let placementMode = 'limited';
  const getPlacementMode = () => placementMode;
  const setPlacementModeState = (mode) => {
    placementMode = mode;
  };

  const stateManager = createStateManager({
    getPlacementMode
  });

  const {
    packCounts,
    standaloneBiomeSetCounts,
    perBiomeDenominator,
    tileInstanceLimits,
    placedTiles,
    setUpdateCallbacks: registerStateCallbacks,
    setPackCount,
    setStandaloneBiomeSetCount,
    removeTile: recordTileRemoval,
    getBiomeTotalSets,
    ensureBiomeInitialized,
    getTotalFromPacks
  } = stateManager;

  const tileColorMap = TILE_COLOR_MAP;
  const basePlasticColorHex = BASE_PLASTIC_COLOR_HEX;
  const ADVANCED_LIGHTING_STORAGE_KEY = STORAGE_KEYS.advancedLighting;
  const {
    gridSize,
    hexSize,
    tileHeight,
    tileScale: TILE_SCALE,
    baseRotationX: BASE_ROTATION_X,
    baseRotationY: BASE_ROTATION_Y,
    hexRadius: HEX_RADIUS
  } = GRID_CONFIG;
  const { clickThreshold: CLICK_THRESHOLD, dragThreshold: DRAG_THRESHOLD } = MOUSE_CONSTANTS;
  const PLACEHOLDER_SPRITE = PLACEHOLDER_SPRITE_PATH;
  let lightingController = null;
  const isAdvancedLightingEnabled = () => lightingController?.isEnabled?.() ?? false;
  let maxSupportedAnisotropy = 1;
  let selectedTileInfo = null;
  let selectedTile = null;
  let analyticsController = null;
  let analytics = null;
  let uiController = null;

  let currentRotation = 0;
  let currentYLevel = 0;
  let lastMouseEvent = null;
  let lastHexCoords = { q: 0, r: 0 };
  let manualLevelOverride = false;

  let isDragging = false;
  let mouseDownTime = 0;
  let mouseDownPosition = { x: 0, y: 0 };

  const mapContainer = document.getElementById('map-container');
  const {
    scene,
    camera,
    renderer,
    controls,
    resizeRenderer,
    getMaxAnisotropy
  } = createScene({
    container: mapContainer,
    backgroundColor: 0x56606d
  });

  controls.enableDamping = true;
  maxSupportedAnisotropy = getMaxAnisotropy();

  const LEGACY_AMBIENT_COLOR = new THREE.Color(0xffffff);
  const LEGACY_AMBIENT_INTENSITY = 0.3;
  const LEGACY_DIR_INTENSITY = 1.1;
  const LEGACY_DIR_COLOR = new THREE.Color(0xfff1d6);
  const LEGACY_DIR_POSITION = new THREE.Vector3(9.5, 17, 8.2);

  const ambientLight = new THREE.AmbientLight(LEGACY_AMBIENT_COLOR.clone(), LEGACY_AMBIENT_INTENSITY);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(LEGACY_DIR_COLOR.clone(), LEGACY_DIR_INTENSITY);
  dirLight.position.copy(LEGACY_DIR_POSITION);
  scene.add(dirLight);
  const BASE_AMBIENT_INTENSITY = ambientLight.intensity;
  const BASE_DIR_INTENSITY = dirLight.intensity;
  const BASE_DIR_POSITION = dirLight.position.clone();
  const BASE_DIR_COLOR = dirLight.color.clone();
  const BASE_AMBIENT_COLOR = ambientLight.color.clone();

  let hexTileModel = null;
  let ghostTile = null;
  let highlightHex = null;

  function getTileColor(biomeId) {
    const biomeToColorMap = {
      gs_grass: 'Grass',
      gs_tracks_streams: 'Streams',
      gs_forest_flora: 'Forest',
      bl_earth: 'Earth',
      bl_tracks_streams: 'Tracks',
      bl_wasteland_forest: 'Forest',
      mt_stone: 'Stone',
      mt_streams_forest: 'Forest',
      oc_water: 'Water',
      oc_coastal: 'Coastal',
      oc_tropical_island: 'Forest',
      ds_sand: 'Sand',
      ds_tracks_ridgelines: 'Tracks',
      ds_ruins_oases: 'Stone',
      ar_snow: 'Snow',
      ar_frozen_forest: 'Forest',
      ar_ice_rocks: 'Stone',
      vo_basalt: 'Basalt',
      vo_volcanic_crater: 'Basalt',
      vo_lava_flows: 'Lava',
      ms_marsh: 'Marsh',
      ms_swamp_streams: 'Swamp',
      ms_fetid_forest: 'Forest',
      tv_walls: 'Walls',
      tv_floors: 'Floors',
      cv_walls: 'Walls',
      cv_floors: 'Floors',
      st_road: 'Stone',
      st_market: 'Stone',
      dg_walls: 'Walls',
      dg_floors: 'Floors',
      sh_cursed_earth: 'Cursed',
      sh_dead_forest: 'Forest',
      sh_twisted_roads_and_ruins: 'Stone',
      mc_concrete: 'Concrete',
      mc_streets: 'Stone',
      mc_pavement: 'Stone',
      cb_walls: 'Walls',
      cb_floors: 'Floors',
      bk_brown: 'Blank',
      bk_gray: 'Blank'
    };

    const colorKey = biomeToColorMap[biomeId] || 'Blank';
    return tileColorMap[colorKey] || basePlasticColorHex;
  }

  const materialManager = createMaterialController({
    scene,
    getAdvancedLightingEnabled: isAdvancedLightingEnabled,
    maxSupportedAnisotropy,
    basePlasticColorHex,
    getTileColor,
    getSelectedTileInfo: () => selectedTileInfo,
    getGhostTile: () => ghostTile,
    getGridTexturePath
  });

  const {
    createTileMaterials,
    applyMaterialsToTileObject,
    createGhostMaterials,
    refreshGhostMaterials,
    preloadBiomeTexture,
    setupGhostOpacityControls,
    getGhostOpacities,
    getCollisionMaterials,
    clearCache: clearMaterialCache
  } = materialManager;

  lightingController = createLightingController({
    scene,
    renderer,
    ambientLight,
    dirLight,
    baseAmbientIntensity: BASE_AMBIENT_INTENSITY,
    baseAmbientColor: BASE_AMBIENT_COLOR,
    baseDirIntensity: BASE_DIR_INTENSITY,
    baseDirColor: BASE_DIR_COLOR,
    baseDirPosition: BASE_DIR_POSITION,
    storageKey: ADVANCED_LIGHTING_STORAGE_KEY,
    placedTiles,
    getHexTileModel: () => hexTileModel,
    createTileMaterials,
    applyMaterialsToTileObject,
    refreshGhostMaterials,
    clearMaterialCache
  });

  const interactableObjects = [];

  const persistenceController = createPersistenceController({
    getPlacementMode,
    setPlacementMode: setPlacementModeState,
    packCounts,
    standaloneBiomeSetCounts,
    tileInstanceLimits,
    perBiomeDenominator,
    environmentPacks,
    ensureBiomeInitialized,
    preloadBiomeTexture,
    getHexTileModel: () => hexTileModel,
    scene,
    interactableObjects,
    createTileMaterials,
    applyMaterialsToTileObject,
    hexSize,
    tileHeight,
    baseRotationX: BASE_ROTATION_X,
    baseRotationY: BASE_ROTATION_Y,
    tileScale: TILE_SCALE,
    placedTiles,
    updateHeaderStats,
    updateRightPanelStats,
    getUIController: () => uiController,
    clearMap
  });

  const undoRedoController = createUndoRedoController({
    maxUndoHistory: MAX_UNDO_HISTORY,
    getPlacementMode,
    getHexTileModel: () => hexTileModel,
    scene,
    interactableObjects,
    placedTiles,
    tileInstanceLimits,
    perBiomeDenominator,
    getBiomeTotalSets,
    createTileMaterials,
    applyMaterialsToTileObject,
    tileScale: TILE_SCALE,
    updateHeaderStats,
    updateRightPanelStats,
    getUIController: () => uiController
  });

  const {
    addToUndoStack,
    undo,
    redo,
    updateUndoRedoButtons,
    getUndoCount,
    getRedoCount
  } = undoRedoController;

  const { toggleDebugOverlay } = createDebugOverlayController({
    windowRef: typeof window !== 'undefined' ? window : null,
    documentRef: typeof document !== 'undefined' ? document : null,
    getSelectedTileInfo: () => selectedTileInfo,
    getLastHexCoords: () => lastHexCoords,
    getActiveTab: () => uiController?.getActiveTab?.(),
    getSearchQuery: () => uiController?.getSearchQuery?.(),
    getAnalyticsSummary: () => analytics?.getQuickSummary?.() ?? null,
    getPlacedTileCount: () => placedTiles.size,
    getUndoCount,
    getRedoCount,
    getPlacementMode,
    getCurrentYLevel: () => currentYLevel
  });

  if (typeof window !== 'undefined') {
    window.toggleDebugOverlay = toggleDebugOverlay;
  }

  function resetPlacementRotation() {
    currentRotation = 0;
    if (ghostTile) {
      ghostTile.rotation.y = BASE_ROTATION_Y + currentRotation;
      ghostTile.rotation.z = 0;
    }
  }
  
  // =========================
  // HEX COORDINATE HELPERS (from original app.js)
  // =========================
  
  function worldToAxial(position) {
    const q = (Math.sqrt(3) / 3 * position.x - 1 / 3 * position.z) / hexSize;
    const r = (2 / 3 * position.z) / hexSize;
    return { q, r };
  }

  function axialRound(q, r) {
    const s = -q - r;
    let rq = Math.round(q);
    let rr = Math.round(r);
    let rs = Math.round(s);
    const qd = Math.abs(rq - q);
    const rd = Math.abs(rr - r);
    const sd = Math.abs(rs - s);
    if (qd > rd && qd > sd) rq = -rr - rs;
    else if (rd > sd) rr = -rq - rs;
    else rs = -rq - rr;
    return { q: rq, r: rr };
  }

  function getNeighborCoordinates(q, r) {
    return [
      { q: q + 1, r: r - 1 }, { q: q + 1, r: r },
      { q: q, r: r + 1 },     { q: q - 1, r: r + 1 },
      { q: q - 1, r: r },     { q: q, r: r - 1 }
    ];
  }

  function getMaxAllowedHeight(q, r) {
    const neighbors = getNeighborCoordinates(q, r);
    let maxNeighborHeight = 0;
    neighbors.forEach(n => {
      for (let y = 0; y <= 50; y++) {
        if (placedTiles.has(`q:${n.q},r:${n.r},y:${y}`)) maxNeighborHeight = Math.max(maxNeighborHeight, y);
      }
    });

    let maxCurrentHeight = -1;
    for (let y = 0; y <= 50; y++) {
      if (placedTiles.has(`q:${q},r:${r},y:${y}`)) maxCurrentHeight = Math.max(maxCurrentHeight, y);
    }

    return Math.max(maxNeighborHeight, maxCurrentHeight >= 0 ? maxCurrentHeight + 1 : 0);
  }

  function getSmartLevel(q, r, cursorWorldY) {
    const local = [];
    for (let y = 0; y <= 50; y++) if (placedTiles.has(`q:${q},r:${r},y:${y}`)) local.push(y);

    if (local.length === 0) {
      for (let y = 0; y <= 50; y++) if (canPlaceTileAtHeight(q, r, y)) return y;
      return 0;
    }

    const cursorLevel = Math.round(cursorWorldY / tileHeight);
    let below = -1, above = 51;
    for (const y of local) {
      if (y <= cursorLevel && y > below) below = y;
      if (y > cursorLevel && y < above) above = y;
    }

    if (cursorLevel >= Math.max(...local)) return Math.max(...local) + 1;
    if (cursorLevel <= Math.min(...local)) {
      for (let y = 0; y <= Math.min(...local); y++) if (canPlaceTileAtHeight(q, r, y)) return y;
    }
    if (below >= 0) {
      for (let y = below + 1; y < above; y++) if (canPlaceTileAtHeight(q, r, y)) return y;
    }
    return Math.max(...local) + 1;
  }

  function getIntersects(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    return raycaster.intersectObjects(interactableObjects, true);
  }

  function getLowestPossibleLevel(q, r) {
    let hasLocal = false;
    for (let y = 0; y <= 50; y++) {
      if (placedTiles.has(`q:${q},r:${r},y:${y}`)) { hasLocal = true; break; }
    }
    if (hasLocal) {
      for (let y = 50; y >= 0; y--) {
        if (placedTiles.has(`q:${q},r:${r},y:${y}`)) return y + 1;
      }
    }
    for (let y = 0; y <= 50; y++) if (canPlaceTileAtHeight(q, r, y)) return y;
    return 0;
  }

  function canPlaceTileAtHeight(q, r, yLevel) {
    const key = `q:${q},r:${r},y:${yLevel}`;
    if (placedTiles.has(key)) return false;
    if (yLevel === 0) return true;

    const below = `q:${q},r:${r},y:${yLevel - 1}`;
    if (placedTiles.has(below)) return true;

    const neighbors = getNeighborCoordinates(q, r);
    for (const n of neighbors) {
      if (placedTiles.has(`q:${n.q},r:${n.r},y:${yLevel}`)) return true;
    }
    return false;
  }

  // =========================
  // EXISTING FUNCTIONS (copied from original)
  // =========================
  function loadAssets() {
    loadHexTileModel({ url: 'models/hex_tile.gltf' })
      .then((model) => {
        const advancedEnabled = isAdvancedLightingEnabled();
        hexTileModel = prepareHexTileModel({
          model,
          lightingEnabled: advancedEnabled
        });
        createGhostTile();
        if (advancedEnabled) {
          refreshGhostMaterials();
        }
        lightingController?.refreshForLightingMode?.();
      })
      .catch((err) => {
        console.error('GLTF load error', err);
        alert('Failed to load 3D model.');
      });
  }

  function createGhostTile() {
    if (!hexTileModel) return;
    if (ghostTile && ghostTile.parent) {
      ghostTile.parent.remove(ghostTile);
    }
    ghostTile = createGhostTileInstance({
      baseModel: hexTileModel,
      scene,
      createGhostMaterials,
      lightingEnabled: isAdvancedLightingEnabled(),
      tileScale: TILE_SCALE,
      baseRotationX: BASE_ROTATION_X,
      baseRotationY: BASE_ROTATION_Y,
      currentRotation
    });
  }

  function createOrUpdateGhostTile() {
    if (!hexTileModel) return;
    if (!ghostTile) {
      createGhostTile();
      return;
    }
    refreshGhostTile();
  }

  function createHexGrid() {
    const group = new THREE.Group();
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.2, transparent: true });

    for (let q = -gridSize; q <= gridSize; q++) {
      for (let r = -gridSize; r <= gridSize; r++) {
        if (Math.abs(q + r) > gridSize) continue;

        const x = hexSize * Math.sqrt(3) * (q + r / 2);
        const z = hexSize * 1.5 * r;

        const pts = [];
        for (let i = 0; i < 7; i++) {
          const angle = Math.PI / 3 * i + Math.PI / 6;
          pts.push(new THREE.Vector3(x + hexSize * Math.cos(angle), 0, z + hexSize * Math.sin(angle)));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        group.add(new THREE.Line(geo, lineMat));
      }
    }
    scene.add(group);

    const plane = new THREE.Mesh(new THREE.PlaneGeometry(gridSize * 4, gridSize * 4), new THREE.MeshBasicMaterial({ visible: false }));
    plane.rotation.x = -Math.PI / 2;
    plane.userData.isGround = true;
    plane.receiveShadow = isAdvancedLightingEnabled();
    scene.add(plane);
    lightingController?.setGroundPlaneReference?.(plane);
    interactableObjects.push(plane);
  }

  function setupEventListeners() {
    mapContainer.addEventListener('pointerdown', onPointerDown);
    mapContainer.addEventListener('pointerup', onPointerUp);
    mapContainer.addEventListener('pointermove', onPointerMove);
    mapContainer.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  function updateLevelIndicator() {
    const indicator = document.getElementById('level-indicator');
    if (indicator) {
  indicator.textContent = `Level: ${currentYLevel + 1}`;
    }
  }

  function refreshGhostTile() {
    if (lastMouseEvent && ghostTile && hexTileModel) {
      onPointerMove(lastMouseEvent);
    }
  }

  function performMapClear() {
    placedTiles.forEach(tile => {
      if (tile.object) {
        scene.remove(tile.object);
        const idx = interactableObjects.indexOf(tile.object);
        if (idx > -1) interactableObjects.splice(idx, 1);
      }
    });

    placedTiles.clear();

    if (placementMode === 'limited') {
      tileInstanceLimits.clear();

      environmentPacks.forEach(pack => {
        const count = packCounts.get(pack.id) || 0;
        if (count > 0 && pack.components) {
          pack.components.forEach(component => {
            ensureBiomeInitialized(component.setId);
          });
        }
      });

      standaloneBiomeSetCounts.forEach((count, biomeId) => {
        if (count > 0) {
          ensureBiomeInitialized(biomeId);
        }
      });

  appLog.log('🔄 Reset all tile instance limits after map clear');
    }

    updateHeaderStats();
    updateRightPanelStats();
    uiController?.refreshBiomeGridUI?.();
  }

  function clearMap(options = {}) {
    const {
      skipConfirm = false,
      recordUndo = true
    } = options;

    if (placedTiles.size === 0) return;

    if (!skipConfirm && !confirm('Are you sure you want to clear the entire map? This action can be undone with Ctrl+Z.')) {
      return;
    }

    let undoAction = null;

    if (recordUndo) {
      const savedTiles = [];
      const savedLimits = new Map();

      placedTiles.forEach((tile, key) => {
        if (!tile?.object) return;

        const tileNumber = tile.instanceId ? Number.parseInt(tile.instanceId.split('_').pop(), 10) : 1;

        savedTiles.push({
          tileKey: key,
          name: tile.name,
          instanceId: tile.instanceId,
          biomeId: tile.object.userData.biomeId,
          tileNumber,
          type: tile.name?.split(' ')[0],
          position: {
            x: tile.object.position.x,
            y: tile.object.position.y,
            z: tile.object.position.z
          },
          rotation: {
            x: tile.object.rotation.x,
            y: tile.object.rotation.y,
            z: tile.object.rotation.z
          }
        });
      });

      if (placementMode === 'limited') {
        tileInstanceLimits.forEach((value, key) => {
          savedLimits.set(key, value);
        });
      }

      undoAction = {
        type: 'clear',
        savedTiles,
        savedLimits
      };
    }

    performMapClear();

    if (undoAction) {
      addToUndoStack(undoAction);
    }
  }

  // =========================
  // MAP SAVE/LOAD SYSTEM
  // =========================
  
  function saveMapToFile() {
    const mapNameInput = document.getElementById('map-name-input');
    const mapName = mapNameInput?.value?.trim() || 'Unnamed Map';

    if (!mapName) {
      alert('Please enter a map name before saving.');
      mapNameInput?.focus();
      return;
    }

  persistenceController.saveMapWithName(mapName);
  appLog.log('💾 Map saved from right panel');
  }

  function loadMapFromFile(event) {
    persistenceController.loadMapFromFile(event);
  }

  function saveMapToFileToolbar() {
    persistenceController.saveMapToFileToolbar();
  }

  function loadMapFromFileToolbar(event) {
    persistenceController.loadMapFromFileToolbar(event);
  }

  function fixExistingBiomeIds() {
    persistenceController.fixExistingBiomeIds();
  }

  // Placeholder functions for mouse events and stats
  function onPointerDown(event) { 
    mouseDownTime = Date.now();
    mouseDownPosition = { x: event.clientX, y: event.clientY };
    isDragging = false;
  }
  
  function onPointerUp(event) { 
    event.preventDefault();
    const timeDiff = Date.now() - mouseDownTime;
    const distance = Math.hypot(event.clientX - mouseDownPosition.x, event.clientY - mouseDownPosition.y);
    if (timeDiff < CLICK_THRESHOLD && distance < DRAG_THRESHOLD && !isDragging) {
  appLog.log('Canvas click detected');
      handleMapClick(event);
    }
    isDragging = false;
  }
  
  function onPointerMove(event) { 
    if (!hexTileModel || !ghostTile) return;

    if (mouseDownTime > 0) {
      const distance = Math.hypot(event.clientX - mouseDownPosition.x, event.clientY - mouseDownPosition.y);
      if (distance > DRAG_THRESHOLD) isDragging = true;
    }

    lastMouseEvent = event;
    const intersects = getIntersects(event);
    if (intersects.length === 0) {
      ghostTile.visible = false;
      if (highlightHex) highlightHex.visible = false;
      return;
    }

    let firstIntersect = intersects[0];
    let obj = firstIntersect.object;
    while (obj.parent && !obj.userData.isGround && !obj.userData.isTile) obj = obj.parent;

    let target = firstIntersect.point;
    if (obj.userData.isTile) target = obj.position;

    const { q, r } = worldToAxial(target);
    const { q: finalQ, r: finalR } = axialRound(q, r);

    if (lastHexCoords.q !== finalQ || lastHexCoords.r !== finalR) {
      lastHexCoords = { q: finalQ, r: finalR };
      manualLevelOverride = false;
    }

    if (!manualLevelOverride) {
      const smartLevel = getSmartLevel(finalQ, finalR, firstIntersect.point.y);
      if (smartLevel !== currentYLevel) {
        currentYLevel = smartLevel;
        updateLevelIndicator();
      }
    }

    const maxAllowedHeight = getMaxAllowedHeight(finalQ, finalR);
    const effectiveYLevel = Math.min(currentYLevel, maxAllowedHeight);

    const x = hexSize * Math.sqrt(3) * (finalQ + finalR / 2);
    const z = hexSize * 1.5 * finalR;
    const y = effectiveYLevel * tileHeight;

    ghostTile.position.set(x, y, z);
    ghostTile.rotation.y = BASE_ROTATION_Y + currentRotation;
    ghostTile.rotation.x = BASE_ROTATION_X;
    ghostTile.scale.set(TILE_SCALE, TILE_SCALE, TILE_SCALE);
    ghostTile.visible = true;

    if (highlightHex) {
      highlightHex.position.set(x, 0.01, z);
      highlightHex.visible = true;
    }

  const canPlace = canPlaceTileAtHeight(finalQ, finalR, effectiveYLevel);
    const tileKey = `q:${finalQ},r:${finalR},y:${effectiveYLevel}`;
    const isOccupied = placedTiles.has(tileKey);
  const advancedEnabled = isAdvancedLightingEnabled();
    
    if (canPlace && !isOccupied && selectedTile) {
      // Use white ghost tile material like createOrUpdateGhostTile
      const ghostMaterials = createGhostMaterials();
      let meshIndex = 0;
      ghostTile.traverse(child => {
        if (child.isMesh) {
          child.material = ghostMaterials[meshIndex] || ghostMaterials[0];
          meshIndex++;
        }
      });
    } else {
      // Use collision materials for invalid placement
      const collisionMaterials = getCollisionMaterials();
      let meshIndex = 0;
      ghostTile.traverse(child => {
        if (child.isMesh) {
          child.material = collisionMaterials[meshIndex] || collisionMaterials[0];
          child.material.needsUpdate = true;
          child.castShadow = false;
              child.receiveShadow = advancedEnabled;
          meshIndex++;
        }
      });
    }
  }

  // =========================
  // MAP INTERACTION
  // =========================
  // Helper: ensure left panel is visible and scroll to a target element
  function ensureLeftPanelAndFocus(el, opts = { block: 'center' }) {
    const leftPanel = document.getElementById('left-panel');
    if (leftPanel) {
      leftPanel.classList.remove('collapsed');
      leftPanel.classList.add('open');
    }
    if (el) {
      try {
        el.scrollIntoView({ behavior: 'smooth', block: opts.block || 'center' });
      } catch {
        // no-op if scrollIntoView options unsupported
        el.scrollIntoView();
      }
      if (typeof el.focus === 'function') el.focus();
    }
  }

  // Helper: check if any environment pack is selected (quantity > 0)
  function hasAnySelectedPack() {
    for (const v of packCounts.values()) {
      if ((v || 0) > 0) return true;
    }
    return false;
  }

  // Focus Environment Packs list (switch tab, focus first pack card image)
  function focusEnvironmentPacksList() {
    // Switch to the packs tab so the list is visible
    uiController?.switchToTab?.('packs');
    // Try to focus the first pack card image (it is focusable via tabindex)
    const firstPackImage = document.querySelector('#tab-packs #packs-grid .card .card-left .card-image');
    if (firstPackImage) {
      ensureLeftPanelAndFocus(firstPackImage);
      return true;
    }
    // Fallback: focus the Packs tab button
    const packsTabBtn = Array.from(document.querySelectorAll('.tab-btn')).find(btn => btn.dataset.tab === 'packs');
    if (packsTabBtn) {
      ensureLeftPanelAndFocus(packsTabBtn);
      return true;
    }
    return false;
  }

  // Focus the biome dropdown in the Tile Selection section
  function focusBiomeDropdown() {
    const biomeSelect = document.getElementById('biome-select');
    if (biomeSelect) {
      ensureLeftPanelAndFocus(biomeSelect, { block: 'nearest' });
      return true;
    }
    return false;
  }

  // Guide the user to the right selector when they click the map without a valid selection
  function guideUserForSelection() {
    // Steer user to select Environment Packs first if none selected
    if (!hasAnySelectedPack()) {
      return focusEnvironmentPacksList();
    }
    // Otherwise, if no biome chosen in Tile Selection, focus the dropdown
    const biomeSelect = document.getElementById('biome-select');
    const activeBiome = uiController?.getActiveBiomeForGrid?.();
    const hasBiomeChosen = !!(biomeSelect && biomeSelect.value) || !!activeBiome;
    if (!hasBiomeChosen) {
      return focusBiomeDropdown();
    }
    return false;
  }

  function handleMapClick(event) {
    appLog.log('🖱️ Map clicked');
    
    if (!selectedTile) {
      // New UX: direct focus to Packs or Biome selector to help the user proceed
      const guided = guideUserForSelection();
      if (!guided) {
        appLog.log('❌ No tile selected - please select a tile first');
      }
      return;
    }

    // Use original coordinate calculation from app.js
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactableObjects, true);
    
    if (intersects.length === 0) return;

    let firstIntersect = intersects[0];
    let obj = firstIntersect.object;
    while (obj.parent && !obj.userData.isGround && !obj.userData.isTile) obj = obj.parent;

    if (event.button === 0) { // Left click - place tile
      if (!selectedTileInfo || !hexTileModel) return;

      let target = firstIntersect.point;
      if (obj.userData.isTile) target = obj.position;

      // Use original worldToAxial and axialRound from app.js
      const { q, r } = worldToAxial(target);
      const { q: finalQ, r: finalR } = axialRound(q, r);

      const maxAllowedHeight = getMaxAllowedHeight(finalQ, finalR);
      const effectiveYLevel = Math.min(currentYLevel, maxAllowedHeight);

      if (!canPlaceTileAtHeight(finalQ, finalR, effectiveYLevel)) return;

      const key = `q:${finalQ},r:${finalR},y:${effectiveYLevel}`;
      if (placedTiles.has(key)) return;

      placeTileAtHex({ q: finalQ, r: finalR }, effectiveYLevel);
    } else if (event.button === 2) { // Right click - remove tile
      if (obj.userData.isTile) {
        // Get tile position directly from object userData
        const tileKey = obj.userData.tileKey;
        if (tileKey) {
          removeTileByKey(tileKey);
        } else {
          // Fallback - calculate from position
          const { q, r } = worldToAxial(obj.position);
          const { q: finalQ, r: finalR } = axialRound(q, r);
          const yLevel = Math.round(obj.position.y / tileHeight);
          removeTileAtHex({ q: finalQ, r: finalR }, yLevel);
        }
      }
    }
  }

  function placeTileAtHex(hexCoords, yLevel = currentYLevel) {
    if (!selectedTile) {
      appLog.log('❌ No tile selected');
      return;
    }

    const key = `q:${hexCoords.q},r:${hexCoords.r},y:${yLevel}`;
    
    // Check if position is already occupied
    if (placedTiles.has(key)) {
      appLog.log(`❌ Position ${key} is already occupied`);
      return;
    }

    // HARD GUARD: if selected slot has 0 left, try to advance; otherwise abort (from original app.js)
    if (placementMode === 'limited' && selectedTileInfo?.instanceId) {
      let left = tileInstanceLimits.get(selectedTileInfo.instanceId);
      if (left == null) {
        ensureBiomeInitialized(selectedTileInfo.biomeId);
        left = tileInstanceLimits.get(selectedTileInfo.instanceId) ?? 0;
      }
      if (left <= 0) {
  const advanced = uiController?.advanceToNextAvailableInstance?.(selectedTileInfo.biomeId, selectedTileInfo.instanceId) ?? false;
        if (!advanced) return;
        const left2 = tileInstanceLimits.get(selectedTileInfo.instanceId) ?? 0;
        if (left2 <= 0) return;
      }
    }

    // Create the 3D tile
    const newTile = hexTileModel.clone();
    newTile.userData = {
      isTile: true,
      tileKey: key,
      instanceId: selectedTileInfo?.instanceId || null,
      biomeId: selectedTileInfo?.biomeId || null
    };

    // Apply textured materials to the tile
    const materials = createTileMaterials(selectedTileInfo?.biomeId, selectedTileInfo?.tileNumber);
    applyMaterialsToTileObject(newTile, materials);

    // Position the tile using original app.js formula
    const x = hexSize * Math.sqrt(3) * (hexCoords.q + hexCoords.r / 2);
    const y = yLevel * tileHeight;
    const z = hexSize * 1.5 * hexCoords.r;
    newTile.position.set(x, y, z);
    newTile.rotation.x = BASE_ROTATION_X;
    newTile.rotation.y = BASE_ROTATION_Y + currentRotation;
    newTile.scale.set(TILE_SCALE, TILE_SCALE, TILE_SCALE);

  appLog.log(`🔄 Tile rotation: BASE_ROTATION_Y=${BASE_ROTATION_Y}, currentRotation=${currentRotation}, final=${BASE_ROTATION_Y + currentRotation}, placementMode=${placementMode}`);

    scene.add(newTile);
    interactableObjects.push(newTile);
    
    // Store the tile placement with rotation data
    // Convert from 3D rotation to instruction rotation (60° increments)
    // In 3D: 0°=0, 60°=300°, 120°=240°, etc. (clockwise from top view)
    // In instructions: 0°=0, 60°=60°, 120°=120°, etc. (clockwise from flat view)
    const normalizedRotation = ((currentRotation * 180 / Math.PI) % 360 + 360) % 360;
    let instructionRotation = 0;
    if (normalizedRotation > 270 && normalizedRotation <= 330) instructionRotation = 60;
    else if (normalizedRotation > 210 && normalizedRotation <= 270) instructionRotation = 120;
    else if (normalizedRotation > 150 && normalizedRotation <= 210) instructionRotation = 180;
    else if (normalizedRotation > 90 && normalizedRotation <= 150) instructionRotation = 240;
    else if (normalizedRotation > 30 && normalizedRotation <= 90) instructionRotation = 300;
    
    placedTiles.set(key, { 
      name: selectedTileInfo.name, 
      biomeId: selectedTileInfo?.biomeId || null,
      tileNumber: selectedTileInfo?.tileNumber || null,
      object: newTile, 
      instanceId: newTile.userData.instanceId,
      rotation: {
        x: newTile.rotation.x,
        y: newTile.rotation.y,
        z: newTile.rotation.z
      },
      // Store rotation in degrees for easier instruction generation
      rotationDegrees: instructionRotation
    });

    // Decrement selected slot (from original app.js)
    if (placementMode === 'limited' && selectedTileInfo?.instanceId) {
      const leftNow = tileInstanceLimits.get(selectedTileInfo.instanceId) ?? 0;
      if (leftNow > 0) {
  tileInstanceLimits.set(selectedTileInfo.instanceId, leftNow - 1);
  appLog.log(`🔄 Used tile ${selectedTileInfo.instanceId}, remaining: ${leftNow - 1}`);
        
        const usedUp = (tileInstanceLimits.get(selectedTileInfo.instanceId) === 0);
        uiController?.refreshBiomeGridUI?.();
        if (usedUp) {
          uiController?.advanceToNextAvailableInstance?.(selectedTileInfo.biomeId, selectedTileInfo.instanceId);
        }
      }
    }

    updateHeaderStats();
    updateRightPanelStats();

    // Add to undo stack
    const undoAction = {
      type: 'place',
      tileKey: key,
      selectedTileInfo: { ...selectedTileInfo },
      instanceId: selectedTileInfo?.instanceId,
      position: {
        x: newTile.position.x,
        y: newTile.position.y,
        z: newTile.position.z
      },
      rotation: {
        x: newTile.rotation.x,
        y: newTile.rotation.y,
        z: newTile.rotation.z
      }
    };
    addToUndoStack(undoAction);

    // Update level for stacking logic like in original app.js
    if (lastHexCoords.q === hexCoords.q && lastHexCoords.r === hexCoords.r) {
      currentYLevel = getLowestPossibleLevel(hexCoords.q, hexCoords.r);
      manualLevelOverride = false;
      updateLevelIndicator();
      refreshGhostTile();
    }
    
    // Reset rotation for the next tile to be placed
    currentRotation = 0;
    if (ghostTile) {
      ghostTile.rotation.y = BASE_ROTATION_Y + currentRotation;
      appLog.log('🔄 Reset rotation to 0° for next tile');
    }
    
    appLog.log(`✅ Placed tile ${selectedTileInfo.instanceId} at ${key}`);
  }

  function removeTileAtHex(hexCoords, yLevel = null) {
    // If no yLevel provided, find the highest tile at this hex
    if (yLevel === null) {
      for (let y = 50; y >= 0; y--) {
        const testKey = `q:${hexCoords.q},r:${hexCoords.r},y:${y}`;
        if (placedTiles.has(testKey)) {
          yLevel = y;
          break;
        }
      }
      if (yLevel === null) {
        appLog.log(`❌ No tile found at hex q:${hexCoords.q},r:${hexCoords.r}`);
        return;
      }
    }

    const key = `q:${hexCoords.q},r:${hexCoords.r},y:${yLevel}`;
    const tileData = placedTiles.get(key);
    
    if (!tileData) {
      appLog.log(`❌ No tile at position ${key}`);
      return;
    }

    // Find the 3D object to remove
    const tileObject = interactableObjects.find(obj => obj.userData.tileKey === key);
    
    if (tileObject) {
      // Use helper that handles undo and scene updates
      removeTileObject(tileObject);
    } else {
      // Fallback: update state directly
      recordTileRemoval(hexCoords, yLevel);
    }
    
    // Remove 3D object if not already removed
    remove3DTile(key);
    
    // Restore available count in limited mode
    if (placementMode === 'limited' && tileData.instanceId) {
      const originalTotal = perBiomeDenominator.get(tileData.biomeId) || getBiomeTotalSets(tileData.biomeId);
      const current = tileInstanceLimits.get(tileData.instanceId) || 0;
      // Only restore if we haven't reached the original total for this tile slot
      if (current < originalTotal) {
        tileInstanceLimits.set(tileData.instanceId, current + 1);
        appLog.log(`🔄 Restored tile ${tileData.instanceId}, now available: ${current + 1}/${originalTotal}`);
      } else {
        appLog.log(`🔄 Tile ${tileData.instanceId} already at maximum availability: ${current}/${originalTotal}`);
      }
    }
    
    // Update UI
    updateHeaderStats();
    updateRightPanelStats();
    uiController?.refreshBiomeGridUI?.();
    
    appLog.log(`✅ Removed tile from ${key}`);
  }

  function removeTileByKey(tileKey) {
    const tileData = placedTiles.get(tileKey);
    
    if (!tileData) {
      appLog.log(`❌ No tile found with key ${tileKey}`);
      return;
    }

    // Extract coordinates from key (format: q:x,r:y,y:z)
    const parts = tileKey.split(',');
    const q = parseInt(parts[0].split(':')[1]);
    const r = parseInt(parts[1].split(':')[1]);
    const y = parseInt(parts[2].split(':')[1]);

    removeTileAtHex({ q, r }, y);
  }

  // =========================
  // 3D TILE MANAGEMENT
  // =========================
  function remove3DTile(key) {
    const tileIndex = interactableObjects.findIndex(obj => obj.userData.tileKey === key);
    
    if (tileIndex !== -1) {
      const tileObj = interactableObjects[tileIndex];
      scene.remove(tileObj);
      interactableObjects.splice(tileIndex, 1);
      
  appLog.log(`✅ Removed 3D tile from ${key}`);
      return true;
    } else {
      appLog.log(`❌ Could not find 3D tile with key ${key}`);
      return false;
    }
  }

  // =========================
  // UNDO/REDO SYSTEM
  // =========================
  // (Managed by createUndoRedoController)
  
  // =========================
  // ENHANCED STATISTICS PANEL
  // =========================
  function updateHeaderStats() {
    analyticsController?.updateHeaderStats?.();
  }

  function updateRightPanelStats() {
    analyticsController?.updateRightPanelStats?.();
  }
  
  // =========================
  // ENHANCED TILE OPERATIONS WITH UNDO SUPPORT
  // =========================  // Note: placeTile override removed - undo support added directly to placeTileAtHex
  
  function removeTileObject(tileObject) {
    if (!tileObject || !tileObject.userData.isTile) return;
    
    // Save state for undo before removing
    const undoAction = {
      type: 'remove',
      tileKey: tileObject.userData.tileKey,
      instanceId: tileObject.userData.instanceId,
      selectedTileInfo: {
        type: placedTiles.get(tileObject.userData.tileKey)?.name?.split(' ')[0] || 'Unknown',
        name: placedTiles.get(tileObject.userData.tileKey)?.name || 'Unknown',
        biomeId: tileObject.userData.biomeId
      },
      position: {
        x: tileObject.position.x,
        y: tileObject.position.y,
        z: tileObject.position.z
      },
      rotation: {
        x: tileObject.rotation.x,
        y: tileObject.rotation.y,
        z: tileObject.rotation.z
      }
    };
    
    addToUndoStack(undoAction);
    
    // Remove tile from scene directly
    const tileKey = tileObject.userData.tileKey;
    const tileData = placedTiles.get(tileKey);
    if (tileData && tileData.object) {
      scene.remove(tileData.object);
      const idx = interactableObjects.indexOf(tileData.object);
      if (idx > -1) interactableObjects.splice(idx, 1);
      
      // Restore tile instance limit
      if (placementMode === 'limited' && tileObject.userData.instanceId) {
        const biomeId = tileObject.userData.biomeId;
        const originalTotal = perBiomeDenominator.get(biomeId) || getBiomeTotalSets(biomeId);
        const current = tileInstanceLimits.get(tileObject.userData.instanceId) || 0;
        // Only restore if we haven't reached the original total for this tile slot
        if (current < originalTotal) {
          tileInstanceLimits.set(tileObject.userData.instanceId, current + 1);
        }
      }
      
  placedTiles.delete(tileKey);
  uiController?.refreshBiomeGridUI?.();
      updateHeaderStats();
      updateRightPanelStats();
    }
  }
  
  function init() {
    analyticsController = createAnalyticsController({
      stateManager,
      biomeSets,
      environmentPacks,
      getPlacementMode: () => placementMode,
      onHeaderStatsUpdated: () => {
        const exportBtn = document.getElementById('export-map-toolbar');
        if (exportBtn) {
          const hasTiles = placedTiles.size > 0;
          exportBtn.classList.toggle('is-outline', !hasTiles);
        }
      },
      onRightPanelStatsUpdated: () => {
        // right panel is refreshed via updateRightPanelStats wrapper
      }
    });

  analytics = analyticsController.initialize();
  appLog.log('📊 Analytics system initialized');

    uiController = createUIController({
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
      setPlacementMode: (mode) => {
        setPlacementModeState(mode);
        resetPlacementRotation();
        updateHeaderStats();
        updateRightPanelStats();
        uiController?.refreshCurrentTab?.();
      },
      resetPlacementRotation,
      createOrUpdateGhostTile,
      getSelectedTileInfo: () => selectedTileInfo,
      setSelectedTileInfo: (info) => { selectedTileInfo = info; },
      setSelectedTile: (tile) => { selectedTile = tile; },
      updateHeaderStats,
      updateRightPanelStats,
      updateUndoRedoButtons,
      getGhostOpacities,
      setupGhostOpacityControls,
      placeholderSprite: PLACEHOLDER_SPRITE
    });

    const ringGeo = new THREE.RingGeometry(HEX_RADIUS * 0.9, HEX_RADIUS, 32, 1);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide });
    highlightHex = new THREE.Mesh(ringGeo, ringMat);
    highlightHex.rotation.x = -Math.PI / 2;
    highlightHex.visible = false;
    scene.add(highlightHex);

    camera.position.set(0, 20, 20);
    controls.target.set(0, 0, 0);
    controls.update();

    initializeNewUI();
  lightingController?.setupToggle?.();
    fixExistingBiomeIds();
    loadAssets();
    createHexGrid();
    setupEventListeners();
    animate();
  }

  initAppRef = init;
  if (typeof window !== 'undefined') {
    window.initApp = init;
  }

  // =========================
  // FINAL INITIALIZATION ENHANCEMENTS
  // =========================
  function initializeNewUI() {
  appLog.log('🎨 Initializing new UI...');
    uiController?.initialize();
    setupKeyboardShortcuts({
      windowRef: window,
      documentRef: document,
      undo,
      redo,
      removeTileAtHex,
      getLastHexCoords: () => lastHexCoords,
      getGhostTile: () => ghostTile,
      getCurrentRotation: () => currentRotation,
      setCurrentRotation: (value) => { currentRotation = value; },
      baseRotationY: BASE_ROTATION_Y,
      createGhostMaterials,
      getSelectedTileInfo: () => selectedTileInfo,
      refreshGhostTile,
      updateUndoRedoButtons,
      generateBuildInstructions,
      clearMap,
      getCurrentYLevel: () => currentYLevel,
      setCurrentYLevel: (value) => { currentYLevel = value; },
      setManualLevelOverride: (value) => { manualLevelOverride = value; },
      updateLevelIndicator,
      saveMapToFile,
      loadMapFromFile,
      saveMapToFileToolbar,
      loadMapFromFileToolbar,
      confirmFn: (message) => window.confirm(message),
      toggleDebugOverlay
    });
    updateHeaderStats();
    updateRightPanelStats();
    updateUndoRedoButtons();
  appLog.log('🎉 Modern interface fully initialized!');
  }

  // Start the application
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('pagehide', handlePageHide, { once: true });
  // Ensure default map name is visible on first load
  const mapNameInputInit = document.getElementById('map-name-input-toolbar');
  if (mapNameInputInit && !mapNameInputInit.value) {
    const stored = localStorage.getItem('lorescape:mapName');
    mapNameInputInit.value = stored || 'Unnamed Map';
  }
  // Persist map name as user types
  const mapNameInputPersist = document.getElementById('map-name-input-toolbar');
  if (mapNameInputPersist) {
    mapNameInputPersist.addEventListener('input', (e) => {
      localStorage.setItem('lorescape:mapName', e.target.value || '');
    });
  }
  // Keyboard shortcuts: N focuses map name, Ctrl+S saves
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const el = document.getElementById('map-name-input-toolbar');
      if (el) { el.focus(); el.select(); e.preventDefault(); }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveMapToFileToolbar();
    }
  });
  
  function onWindowResize() {
    resizeRenderer();
  }

  function handlePageHide() {
    lightingController?.dispose?.();
  }
  
  
  // ========================================
  // BUILD INSTRUCTIONS GENERATOR
  // ========================================
  const instructionsLog = appLog.child('instructions');
  
  function generateBuildInstructions() {
    instructionsLog.log('🏗️ Generating build instructions...');
    instructionsLog.log('📊 placedTiles size:', placedTiles.size);
    
    if (placedTiles.size === 0) {
      alert('❌ Cannot generate instructions - map is empty!');
      return;
    }
    
    // Layer analysis
    const layerAnalysis = analyzeMapLayers();
  instructionsLog.log('📊 Layer analysis result:', layerAnalysis);
    
    if (layerAnalysis.layers.length === 0) {
      alert('❌ Error analyzing map layers!');
      return;
    }
    
  instructionsLog.log(`📊 Found ${layerAnalysis.layers.length} layers`, layerAnalysis);
    
    // Generate instructions
    generateLayerInstructions(layerAnalysis);
  }
  
  function analyzeMapLayers() {
    const layerData = new Map(); // yLevel -> tiles array
    const bounds = { minQ: Infinity, maxQ: -Infinity, minR: Infinity, maxR: -Infinity };

    placedTiles.forEach((tile, key) => {
      if (!tile) {
        console.error('❌ ERROR: Tile is null/undefined');
        return;
      }

      let hexCoords = tile.hexCoords;
      let yLevel = tile.yLevel;

      if (!hexCoords) {
        const keyMatch = key.match(/q:(-?\d+),r:(-?\d+),y:(\d+)/);
        if (keyMatch) {
          hexCoords = {
            q: parseInt(keyMatch[1], 10),
            r: parseInt(keyMatch[2], 10)
          };
          yLevel = parseInt(keyMatch[3], 10);
        } else {
          console.error('❌ ERROR: Cannot extract coordinates from key:', key);
          return;
        }
      }

      if (typeof yLevel === 'undefined') {
        const keyMatch = key.match(/q:(-?\d+),r:(-?\d+),y:(\d+)/);
        yLevel = keyMatch ? parseInt(keyMatch[3], 10) : 0;
      }

      const instanceId = tile.instanceId ?? null;
      const finalBiomeId = tile.biomeId
        || (instanceId ? instanceId.split('_').slice(0, -1).join('_') : null);
      const finalTileNumber = typeof tile.tileNumber === 'number' && !Number.isNaN(tile.tileNumber)
        ? tile.tileNumber
        : (instanceId ? parseInt(instanceId.split('_').pop() || '1', 10) : 1);

      if (!finalBiomeId) {
        console.warn('⚠️ Skipping tile without biome information:', { key, tile });
        return;
      }

      if (typeof hexCoords.q === 'undefined' || typeof hexCoords.r === 'undefined') {
        console.error('❌ ERROR: Invalid hexCoords:', hexCoords);
        return;
      }

      bounds.minQ = Math.min(bounds.minQ, hexCoords.q);
      bounds.maxQ = Math.max(bounds.maxQ, hexCoords.q);
      bounds.minR = Math.min(bounds.minR, hexCoords.r);
      bounds.maxR = Math.max(bounds.maxR, hexCoords.r);

      if (!layerData.has(yLevel)) {
        layerData.set(yLevel, []);
      }

      layerData.get(yLevel).push({
        q: hexCoords.q,
        r: hexCoords.r,
        yLevel,
        biomeId: finalBiomeId,
        tileNumber: finalTileNumber,
        key,
        instanceId,
        rotation: tile.rotation || { x: 0, y: 0, z: 0 },
        rotationDegrees: tile.rotationDegrees || 0
      });
    });

    if (layerData.size === 0) {
      appLog.error('❌ ERROR: No valid tiles found!');
      return { layers: [], layerData: new Map(), bounds: {}, mapWidth: 0, mapHeight: 0 };
    }

    const layers = Array.from(layerData.keys()).sort((a, b) => a - b);

    appLog.log('📋 Layer analysis summary', {
      layers,
      bounds,
      tileCount: placedTiles.size
    });

    return {
      layers,
      layerData,
      bounds,
      mapWidth: bounds.maxQ - bounds.minQ + 1,
      mapHeight: bounds.maxR - bounds.minR + 1
    };
  }
  
  async function generateLayerInstructions(analysis) {
    // Tworzenie okna z instrukcjami
    const instructionsWindow = createInstructionsWindow();
    const container = instructionsWindow.container;
  // Let content define width; we'll size container dynamically after rendering
    
    // Nagłówek
    const header = document.createElement('div');
    header.className = 'instructions-header';
    header.innerHTML = `
      <h2><i class="fas fa-layer-group"></i> Map Build Instructions</h2>
      <div class="instructions-summary">
        <span><i class="fas fa-th"></i> ${analysis.mapWidth}×${analysis.mapHeight} tiles</span>
        <span><i class="fas fa-layers"></i> ${analysis.layers.length} ${analysis.layers.length === 1 ? 'layer' : 'layers'}</span>
        <span><i class="fas fa-puzzle-piece"></i> ${placedTiles.size} tiles total</span>
      </div>
    `;
  container.appendChild(header);

  // Global view toolbar (applies to all layers)
  const globalView = { simple: true, showAxes: true, showTextures: true, showLabels: true };
  const rerenders = [];
  const addRerender = (fn) => { if (typeof fn === 'function') rerenders.push(fn); };
  const rerenderAll = () => rerenders.forEach(fn => fn());

  const viewToolbar = document.createElement('div');
  viewToolbar.className = 'layer-view-toolbar';
  // Grow-only modal width adjuster
  const adjustModalWidthGrowOnly = () => {
    requestAnimationFrame(() => {
      try {
        const frames = container.querySelectorAll('.axis-frame');
        let maxW = 0;
        frames.forEach(f => { maxW = Math.max(maxW, f.offsetWidth || 0); });
        if (maxW > 0) {
          const padding = 48;
          const cap = window.innerWidth * 0.9;
          const desired = Math.min(cap, maxW + padding);
          const prev = parseFloat(container.style.width) || 0;
          const next = Math.min(cap, Math.max(prev, desired));
          container.style.width = next + 'px';
        }
      } catch (error) {
        console.warn('Failed to adjust modal width', error);
      }
    });
  };
  const mkBtn = (label, key) => {
    const b = document.createElement('button');
    b.className = 'btn btn-secondary btn-compact';
    const sync = () => b.innerHTML = `${label}: <strong>${globalView[key] ? 'ON' : 'OFF'}</strong>`;
    sync();
    b.addEventListener('click', () => { globalView[key] = !globalView[key]; sync(); rerenderAll(); adjustModalWidthGrowOnly(); });
    return b;
  };
  // Group all left-side toggles to keep them together and reduce wrap jitter
  const leftGroup = document.createElement('div');
  leftGroup.className = 'toolbar-group';
  const title = document.createElement('span'); title.className = 'toolbar-title'; title.textContent = 'View:';
  const bSimple = mkBtn('Simple view', 'simple');
  const bAxes = mkBtn('Show axes', 'showAxes');
  const bTextures = mkBtn('Show textures', 'showTextures');
  const bLabels = mkBtn('Show labels', 'showLabels');
  leftGroup.append(title, bSimple, bAxes, bTextures, bLabels);
  viewToolbar.appendChild(leftGroup);

  const toggleListsBtn = document.createElement('button');
  toggleListsBtn.className = 'btn btn-secondary btn-compact toggle-all-lists';
  // Keep to the far right and avoid wrapping the label mid-button
  try {
    toggleListsBtn.style.marginLeft = 'auto';
    toggleListsBtn.style.whiteSpace = 'nowrap';
  } catch {
    // Some host stylesheets may prevent overriding layout here.
  }
  let listsExpanded = false;
  const syncToggleText = () => {
    // Use arrow icons for consistency with other expanders
    toggleListsBtn.innerHTML = listsExpanded
      ? '<i class="fas fa-angles-up"></i> Collapse all tiles lists'
      : '<i class="fas fa-angles-down"></i> Expand all tiles lists';
  };
  syncToggleText();
  toggleListsBtn.addEventListener('click', () => {
    const accs = container.querySelectorAll('.tiles-accordion, .biome-accordion');
    listsExpanded = !listsExpanded;
    accs.forEach(d => { d.open = listsExpanded; });
    syncToggleText();
  });
  viewToolbar.appendChild(toggleListsBtn);

  container.appendChild(viewToolbar);

  // Top actions row removed to avoid duplication; single actions bar remains below.
    
  // Generate layers
    for (let i = 0; i < analysis.layers.length; i++) {
      const yLevel = analysis.layers[i];
      const layerTiles = analysis.layerData.get(yLevel);
      
  instructionsLog.log(`🎨 Rendering layer ${yLevel} with ${layerTiles.length} tiles...`);

      const layerElement = await createLayerVisualization(yLevel, layerTiles, analysis, i + 1, globalView, addRerender);
      container.appendChild(layerElement);
    }

    // After layers mount, adapt modal width to the widest layer view
  requestAnimationFrame(() => {
      try {
        const frames = container.querySelectorAll('.axis-frame');
        let maxW = 0;
        frames.forEach(f => { maxW = Math.max(maxW, f.offsetWidth || 0); });
        if (maxW > 0) {
      const padding = 48; // account for container padding
      const cap = window.innerWidth * 0.9;
      const desired = Math.min(cap, maxW + padding);
      const prev = parseFloat(container.style.width) || 0;
      const next = Math.min(cap, Math.max(prev, desired));
      container.style.width = next + 'px';
        }
      } catch {
        // Non-critical: resizing is best-effort only.
      }
    });
    
    // Dodanie przycisków akcji na dole (print/save/close)
    const actions = document.createElement('div');
    actions.className = 'instructions-actions';
    actions.innerHTML = `
      <button class="btn btn-primary" onclick="printInstructions()">
        <i class="fas fa-print"></i> Print / PDF
      </button>
      <button class="btn btn-secondary" onclick="downloadAllLayerImages()">
        <i class="fas fa-images"></i> Save all layers (PNG)
      </button>
      <button class="btn btn-secondary" onclick="closeInstructions()">
        <i class="fas fa-times"></i> Close
      </button>
    `;
    container.appendChild(actions);
    
    instructionsLog.log('✅ Build instructions generated!');
  }
  
  async function createLayerVisualization(yLevel, tiles, analysis, layerNumber, globalView, registerRerender) {
    const layerDiv = document.createElement('div');
    layerDiv.className = 'layer-visualization';
    layerDiv.dataset.layerNumber = String(layerNumber);
    
    // Layer header
    const layerHeader = document.createElement('div');
    layerHeader.className = 'layer-header';
    layerHeader.innerHTML = `
      <h3>
        <i class="fas fa-layer-group"></i> 
        Layer ${layerNumber} ${yLevel === 0 ? '(Ground Level)' : `(+${yLevel})`}
      </h3>
      <div class="layer-stats">
        <span><i class="fas fa-puzzle-piece"></i> ${tiles.length} tiles</span>
        <span><i class="fas fa-rulers"></i> Top view</span>
      </div>
    `;
    layerDiv.appendChild(layerHeader);
    
  // Create canvas container to host axis labels around canvas
  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'canvas-wrap';
  canvasWrap.className = 'canvas-wrap';
  canvasWrap.style.position = 'relative';
  // Make wrapper match canvas size so absolute labels hug the edges
  canvasWrap.style.display = 'inline-block';
  canvasWrap.style.justifyContent = 'center';
  canvasWrap.style.alignItems = 'center';
  canvasWrap.style.margin = '4px 0';

  // Create canvas for visualization
  const canvas = document.createElement('canvas');
  canvas.className = 'layer-canvas';
    
    // Canvas size - use hexagonal layout calculations with minimal margins
    const hexSize = 30; // radius of hexagon
    const hexWidth = hexSize * 2;
    const hexHeight = hexSize * Math.sqrt(3);
    const margin = hexSize * 0.25; // Minimal margin - just enough border
    
    // Instead of using only current layer's bounds, use GLOBAL bounds from ALL layers
    // This ensures all layers have the same canvas size for better comparison
    const paddingHexes = 2; // User requested exactly 2 fields around boundary hexes
    
    // Find actual pixel positions of ALL tiles across ALL layers (not just current layer)
    let minPixelX = Infinity, maxPixelX = -Infinity;
    let minPixelY = Infinity, maxPixelY = -Infinity;
    
    // Calculate global bounds from all layers
    analysis.layerData.forEach((layerTiles) => {
      layerTiles.forEach(tile => {
        const x = hexSize * (3/2 * tile.q);
        const y = hexSize * (Math.sqrt(3)/2 * tile.q + Math.sqrt(3) * tile.r);
        
        minPixelX = Math.min(minPixelX, x);
        maxPixelX = Math.max(maxPixelX, x);
        minPixelY = Math.min(minPixelY, y);
        maxPixelY = Math.max(maxPixelY, y);
      });
    });
    
    // Add padding for 2 hex fields around the actual content
    const hexPaddingX = paddingHexes * hexSize * 1.5; // Hex spacing horizontally
    const hexPaddingY = paddingHexes * hexHeight; // Hex spacing vertically
    
    const canvasWidth = (maxPixelX - minPixelX) + hexWidth + (hexPaddingX * 2) + (margin * 2);
    const canvasHeight = (maxPixelY - minPixelY) + hexHeight + (hexPaddingY * 2) + (margin * 2);
    
  canvas.width = Math.ceil(canvasWidth);
  canvas.height = Math.ceil(canvasHeight);
  canvas.style.maxWidth = '100%';
  canvas.style.height = 'auto';
  // Canvas border follows theme; background stays light in both themes (per request)
  try {
    const root = getComputedStyle(document.body);
    const borderColor = (root.getPropertyValue('--border-color') || '#333').trim() || '#333';
    canvas.style.border = `2px solid ${borderColor}`;
    canvas.style.backgroundColor = '#f8f8f8';
  } catch {
    // Fallback if computed styles cannot be resolved (e.g., SSR or strict CSP environments).
    canvas.style.border = '2px solid #333';
    canvas.style.backgroundColor = '#f8f8f8';
  }
    
  instructionsLog.log(`Canvas dimensions: ${canvas.width}x${canvas.height} for GLOBAL bounds Q:${analysis.bounds.minQ}-${analysis.bounds.maxQ}, R:${analysis.bounds.minR}-${analysis.bounds.maxR} (Layer ${yLevel}: ${tiles.length} tiles)`);
  instructionsLog.log(`🎯 Using GLOBAL positioning: minPixelX=${minPixelX.toFixed(1)}, minPixelY=${minPixelY.toFixed(1)} - ALL LAYERS CENTERED TO SAME POINT`);
    
  const ctx = canvas.getContext('2d');

  // Prepare wrappers and toolbar
  canvasWrap.style.width = `${canvas.width}px`;
  canvasWrap.style.height = `${canvas.height}px`;
  canvasWrap.appendChild(canvas);

  const axisFrame = document.createElement('div');
  axisFrame.className = 'axis-frame';
  const leftAxis = document.createElement('div');
  leftAxis.className = 'axis-left';
  const bottomAxis = document.createElement('div');
  bottomAxis.className = 'axis-bottom';
  axisFrame.appendChild(leftAxis);
  axisFrame.appendChild(canvasWrap);
  axisFrame.appendChild(bottomAxis);

  layerDiv.appendChild(axisFrame);

  // Small tools bar for this layer (download image)
  const tools = document.createElement('div');
  tools.className = 'layer-tools';
  const saveImgBtn = document.createElement('button');
  saveImgBtn.className = 'btn btn-secondary btn-compact';
  saveImgBtn.innerHTML = '<i class="fas fa-image"></i> <span>Save image</span>';
  saveImgBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      const nameEl = document.getElementById('map-name-input-toolbar');
      const mapName = (nameEl?.value || 'map').trim().replace(/[^a-z0-9-_]+/gi, '_').toLowerCase();
      const fileName = `${mapName || 'map'}_layer-${layerNumber}.png`;
      if (canvas.toBlob) {
        canvas.toBlob((blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
          URL.revokeObjectURL(url);
        }, 'image/png');
      } else {
        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
      }
    } catch (err) {
      console.error('Failed to save layer image:', err);
      alert('Could not save the image.');
    }
  });
  tools.appendChild(saveImgBtn);
  layerDiv.appendChild(tools);

  const adjustContainerWidth = () => {
    const container = layerDiv.closest('.instructions-container');
    if (!container) return;
    requestAnimationFrame(() => {
      const frames = container.querySelectorAll('.axis-frame');
      let maxW = 0;
      frames.forEach(f => { maxW = Math.max(maxW, f.offsetWidth || 0); });
      if (maxW > 0) {
  const padding = 48;
  const cap = window.innerWidth * 0.9;
  const desired = Math.min(cap, maxW + padding);
  const prev = parseFloat(container.style.width) || 0;
  const next = Math.min(cap, Math.max(prev, desired));
  container.style.width = next + 'px';
      }
    });
  };

  async function render() {
    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Grid first; keep banding off in simple mode
  ctx.__drawBands = !globalView.simple; // guard for banding
    ctx.__showRef = false; // hide ref coordinates for clarity
  ctx.__showLabels = !!globalView.showLabels; // control tile labels
  await drawHexagonalGrid(ctx, analysis, hexSize, margin);

    // Always draw grayed-out shadows from lower layers when above ground
    if (yLevel !== 0) {
      await drawLowerLayerShadows(ctx, analysis, yLevel, hexSize, margin);
    }

    // Tiles
    if (globalView.showTextures) {
      await drawHexLayerTiles(ctx, tiles, analysis, hexSize, margin);
    } else {
      await drawSimpleLayerTiles(ctx, tiles, analysis, hexSize, margin);
    }

    // Axes
    leftAxis.innerHTML = '';
    bottomAxis.innerHTML = '';
    if (globalView.showAxes) {
      const b = analysis.bounds || computeBoundsFromTiles(tiles);
      const rMin = document.createElement('div'); rMin.className = 'axis-label r'; rMin.textContent = `R:${b.minR}`;
      const rMax = document.createElement('div'); rMax.className = 'axis-label r'; rMax.textContent = `R:${b.maxR}`;
      leftAxis.append(rMin, rMax);
      const qMin = document.createElement('div'); qMin.className = 'axis-label q'; qMin.textContent = `Q:${b.minQ}`;
      const qMax = document.createElement('div'); qMax.className = 'axis-label q'; qMax.textContent = `Q:${b.maxQ}`;
      bottomAxis.append(qMin, qMax);
      drawAxisArrows(ctx, analysis, hexSize, margin);
    }

    adjustContainerWidth();
  }

  await render();
  // Register for global rerenders
  registerRerender && registerRerender(render);

    // Tiles list for layer
    const tilesList = createTilesListForLayer(tiles, yLevel);
    layerDiv.appendChild(tilesList);

    return layerDiv;
  }

  function computeBoundsFromTiles(tiles) {
    if (!Array.isArray(tiles) || tiles.length === 0) {
      return {
        minQ: 0,
        maxQ: 0,
        minR: 0,
        maxR: 0
      };
    }

    let minQ = Number.POSITIVE_INFINITY;
    let maxQ = Number.NEGATIVE_INFINITY;
    let minR = Number.POSITIVE_INFINITY;
    let maxR = Number.NEGATIVE_INFINITY;

    tiles.forEach((tile) => {
      if (!tile) return;
      const { q = 0, r = 0 } = tile;
      minQ = Math.min(minQ, q);
      maxQ = Math.max(maxQ, q);
      minR = Math.min(minR, r);
      maxR = Math.max(maxR, r);
    });

    return { minQ, maxQ, minR, maxR };
  }

  // Draw clear axis arrows inside the canvas for orientation (Q blue ↗︎, R green ↘︎)
  function drawAxisArrows(ctx, analysis, hexSize, margin) {
    const cW = ctx.canvas.width;
    const cH = ctx.canvas.height;
    // Keep arrows fully inside the canvas with a safe inset
    const inset = Math.max(12, Math.min(28, (margin || 0) + 10));
    const startX = Math.max(inset, 14);
    const startY = cH - Math.max(inset + 2, 20);

    // 30° from horizontal
    const cos = Math.cos(Math.PI / 6);
    const sin = Math.sin(Math.PI / 6);
    const baseLen = Math.max(26, Math.min(44, Math.min(cW, cH) * 0.085));
    // Compute available room so arrows and arrowheads don't cross the edges
    const roomRight = (cW - inset) - startX;
    const roomUp = startY - inset;
    const roomDown = (cH - inset) - startY;
    const maxLenQ = Math.min(roomRight / cos, roomUp / sin);
    const maxLenR = Math.min(roomRight / cos, roomDown / sin);
    const pad = 6;
    const lenQ = Math.max(18, Math.min(baseLen, maxLenQ - pad));
    const lenR = Math.max(18, Math.min(baseLen, maxLenR - pad));
    const vQ = { x: cos * lenQ, y: -sin * lenQ }; // up-right
    const vR = { x: cos * lenR, y:  sin * lenR };  // down-right

    const drawArrow = (x1, y1, x2, y2, color, label) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
      ctx.lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5);
      ctx.stroke();
      const angle = Math.atan2(y2 - y1, x2 - x1);
  const ah = 4.5;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - ah * Math.cos(angle - Math.PI / 6), y2 - ah * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x2 - ah * Math.cos(angle + Math.PI / 6), y2 - ah * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
  ctx.font = 'bold 9px Arial';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x2 + 3, y2);
      ctx.restore();
    };

  drawArrow(startX, startY, startX + vQ.x, startY + vQ.y, '#38AB19', 'Q+');
  drawArrow(startX, startY, startX + vR.x, startY + vR.y, '#272727', 'R+');
  }

  // Draw hexagonal grid background
  async function drawHexagonalGrid(ctx, analysis, hexSize, margin) {
    instructionsLog.log('🔲 drawHexagonalGrid called - START');
    
    // Use GLOBAL pixel bounds from analysis instead of per-layer bounds
    // This ensures all layers are centered relative to the same global map center
    let minPixelX = Infinity, maxPixelX = -Infinity;
    let minPixelY = Infinity, maxPixelY = -Infinity;
    
    // Calculate global bounds from all layers (same as in createLayerVisualization)
    analysis.layerData.forEach((layerTiles) => {
      layerTiles.forEach(tile => {
        const x = hexSize * (3/2 * tile.q);
        const y = hexSize * (Math.sqrt(3)/2 * tile.q + Math.sqrt(3) * tile.r);
        
        minPixelX = Math.min(minPixelX, x);
        maxPixelX = Math.max(maxPixelX, x);
        minPixelY = Math.min(minPixelY, y);
        maxPixelY = Math.max(maxPixelY, y);
      });
    });
    
  instructionsLog.log(`🎯 GRID: Using GLOBAL positioning: minPixelX=${minPixelX.toFixed(1)}, minPixelY=${minPixelY.toFixed(1)} - ALL LAYERS CENTERED TO SAME POINT`);
    
    // Calculate hex coordinate bounds from all layers for proper grid coverage
    let minQ = Infinity, maxQ = -Infinity;
    let minR = Infinity, maxR = -Infinity;
    
    analysis.layerData.forEach((layerTiles) => {
      layerTiles.forEach(tile => {
        minQ = Math.min(minQ, tile.q);
        maxQ = Math.max(maxQ, tile.q);
        minR = Math.min(minR, tile.r);
        maxR = Math.max(maxR, tile.r);
      });
    });
    
    instructionsLog.log(`📐 Content hex bounds: Q(${minQ} to ${maxQ}), R(${minR} to ${maxR})`);
    
    // Add buffer of extra hexagons around the content
    const hexBuffer = 4; // Number of extra hex rings around the content
    const qRange = Math.max(Math.abs(minQ), Math.abs(maxQ)) + hexBuffer;
    const rRange = Math.max(Math.abs(minR), Math.abs(maxR)) + hexBuffer;
    
  instructionsLog.log(`🔲 Grid with buffer: q range ±${qRange}, r range ±${rRange} (buffer: ${hexBuffer} hexes)`);
    
    // Helper function to draw a hexagon outline
    function drawHexagonOutline(ctx, centerX, centerY, size, strokeStyle = '#ddd', lineWidth = 1) {
      // Round coordinates to prevent anti-aliasing blur
      centerX = Math.round(centerX) + 0.5;
      centerY = Math.round(centerY) + 0.5;
      
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        // Use EXACTLY the same orientation as tiles (pointy-top hexagons)
        const angle = (Math.PI / 3) * i;
        const x = centerX + size * Math.cos(angle);
        const y = centerY + size * Math.sin(angle);
        if (i === 0) {
          ctx.moveTo(Math.round(x) + 0.5, Math.round(y) + 0.5);
        } else {
          ctx.lineTo(Math.round(x) + 0.5, Math.round(y) + 0.5);
        }
      }
      ctx.closePath();
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
      
      // Debug log for grid hexagon drawing
      // console.log(`Drew grid hex at ${centerX.toFixed(1)}, ${centerY.toFixed(1)}`);
    }
    
  // Optional: alternating bands to improve Q/R orientation
  const bandAlpha = 0.06;
  const bandQColor = 'rgba(56,171,25,' + bandAlpha + ')';
  const bandRColor = 'rgba(39,39,39,' + bandAlpha + ')';

  // Draw proper hexagonal grid to cover the content area with buffer
    // Use EXACTLY the same coordinate system and positioning as the tiles
    const drawHexSize = hexSize * 0.98; // Maximum size for optimal visual coverage
    
    // Get the same padding and positioning values used for tiles
    const paddingHexes = 2;
    const hexPaddingX = paddingHexes * hexSize * 1.5;
    const hexPaddingY = paddingHexes * hexSize * Math.sqrt(3);
    
    let gridHexCount = 0;
    const drawnPositions = new Set(); // Track drawn positions to detect duplicates
    
    // Generate proper hexagonal grid pattern
    // Use axial coordinates (q, r) but ensure we cover the visible area properly
    for (let q = -qRange; q <= qRange; q++) {
      for (let r = -rRange; r <= rRange; r++) {
        // Skip invalid hexagonal coordinates that would create visual artifacts
        // In hexagonal grids, we want to maintain proper neighbor relationships
        if (Math.abs(q + r) > Math.max(qRange, rRange)) {
          continue; // Skip coordinates that are too far from center
        }
        
        // Use EXACTLY the same coordinate-to-pixel conversion as tiles
        const tilePixelX = hexSize * (3/2 * q);
        const tilePixelY = hexSize * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);
        
        // Use EXACTLY the same positioning offset as tiles
        const x = (tilePixelX - minPixelX) + hexPaddingX + margin;
        const y = (tilePixelY - minPixelY) + hexPaddingY + margin;
        
        const centerX = x + hexSize;
        const centerY = y + hexSize;
        
        // Only draw if the hexagon would be visible on canvas with some buffer
        if (centerX > -hexSize && centerX < ctx.canvas.width + hexSize &&
            centerY > -hexSize && centerY < ctx.canvas.height + hexSize) {
          
          // Check for duplicate positions
          const positionKey = `${Math.round(centerX)},${Math.round(centerY)}`;
          if (drawnPositions.has(positionKey)) {
            console.warn(`🔄 DUPLICATE hex position detected: ${positionKey} (q:${q}, r:${r})`);
          } else {
            drawnPositions.add(positionKey);
          }
          
          // Subtle background banding: tint every other Q and R (configurable)
          if (ctx.__drawBands && Math.abs(q) % 2 === 0) {
            ctx.fillStyle = bandQColor;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
              const angle = (Math.PI / 3) * i;
              const px = centerX + (drawHexSize) * Math.cos(angle);
              const py = centerY + (drawHexSize) * Math.sin(angle);
              if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
          }
          if (ctx.__drawBands && Math.abs(r) % 2 === 0) {
            ctx.fillStyle = bandRColor;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
              const angle = (Math.PI / 3) * i;
              const px = centerX + (drawHexSize) * Math.cos(angle);
              const py = centerY + (drawHexSize) * Math.sin(angle);
              if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
          }

          drawHexagonOutline(ctx, centerX, centerY, drawHexSize, '#ddd', 0.8); // Slightly thicker lines for better visibility
          gridHexCount++;
          
          // Add coordinate labels for reference grid (every few hexagons)
          if (ctx.__showRef && q % 5 === 0 && r % 5 === 0) {
            ctx.fillStyle = '#999';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`${q},${r}`, centerX, centerY + 3);
          }
        }
      }
    }
    
    instructionsLog.log(`Grid drawing completed - drew ${gridHexCount} hexagons, unique positions: ${drawnPositions.size}`);
  }

  // Draw shadows from lower layers to provide context
  async function drawLowerLayerShadows(ctx, analysis, currentYLevel, hexSize, margin) {
    instructionsLog.log(`👤 Drawing shadows from layers below ${currentYLevel}`);
    
    // Only draw shadows if we're not on the ground level
    if (currentYLevel === 0) {
      instructionsLog.log('👤 Ground level - no shadows to draw');
      return;
    }
    
    // Use GLOBAL pixel bounds for consistent positioning
    let minPixelX = Infinity, maxPixelX = -Infinity;
    let minPixelY = Infinity, maxPixelY = -Infinity;
    
    // Calculate global bounds from all layers
    analysis.layerData.forEach((layerTiles) => {
      layerTiles.forEach(tile => {
        const x = hexSize * (3/2 * tile.q);
        const y = hexSize * (Math.sqrt(3)/2 * tile.q + Math.sqrt(3) * tile.r);
        
        minPixelX = Math.min(minPixelX, x);
        maxPixelX = Math.max(maxPixelX, x);
        minPixelY = Math.min(minPixelY, y);
        maxPixelY = Math.max(maxPixelY, y);
      });
    });
    
    const paddingHexes = 2;
    const hexPaddingX = paddingHexes * hexSize * 1.5;
    const hexPaddingY = paddingHexes * hexSize * Math.sqrt(3);
    
    let shadowCount = 0;
    
    // Iterate through all lower layers (from 0 to currentYLevel-1)
    for (let layerY = 0; layerY < currentYLevel; layerY++) {
      const layerTiles = analysis.layerData.get(layerY);
      if (!layerTiles || layerTiles.length === 0) continue;
      
      // Calculate opacity - closer layers are more visible
      const layerDistance = currentYLevel - layerY;
      const opacity = Math.max(0.1, 0.4 / layerDistance); // Closer layers more visible
      
  instructionsLog.log(`👤 Drawing ${layerTiles.length} shadows from layer ${layerY} with opacity ${opacity.toFixed(2)}`);
      
  for (const tile of layerTiles) {
        // Calculate position using same formula as tiles
        const tilePixelX = hexSize * (3/2 * tile.q);
        const tilePixelY = hexSize * (Math.sqrt(3)/2 * tile.q + Math.sqrt(3) * tile.r);
        
        const x = (tilePixelX - minPixelX) + hexPaddingX + margin;
        const y = (tilePixelY - minPixelY) + hexPaddingY + margin;
        
        const centerX = x + hexSize;
        const centerY = y + hexSize;
        
        // Draw semi-transparent hexagon with fill and outline
        ctx.save();
        ctx.globalAlpha = opacity;
        
        // Create hexagon path
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i;
          const px = centerX + (hexSize * 0.9) * Math.cos(angle); // Slightly smaller
          const py = centerY + (hexSize * 0.9) * Math.sin(angle);
          if (i === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.closePath();
        
  // Fill with light gray (subtle)
  ctx.fillStyle = '#E6E6E6';
        ctx.fill();
        
  // Add dashed outline (muted)
  ctx.strokeStyle = '#9a9a9a';
  ctx.lineWidth = 1.25;
        ctx.setLineDash([3, 3]); // Dashed line for shadows
        ctx.stroke();
        
        // Add small layer indicator with better contrast (use new 1-based numbering)
        ctx.setLineDash([]); // Reset line dash for text
  ctx.fillStyle = '#5b5b5b';
        ctx.font = 'bold 9px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(255,255,255,0.8)';
        ctx.shadowBlur = 1;
        try {
          // Determine display layer number from analysis.layers array if present
          // layerY is the actual Y level; find its 1-based index for display
          let displayNum = 1;
          if (Array.isArray(analysis.layers)) {
            const idx = analysis.layers.indexOf(layerY);
            displayNum = idx >= 0 ? (idx + 1) : (layerY + 1);
          } else {
            displayNum = layerY + 1; // fallback: shift from 0-based to 1-based
          }
          ctx.fillText(`L${displayNum}`, centerX, centerY + 3);
        } catch {
          // If bounds aren't ready yet, fall back to naive numbering.
          ctx.fillText(`L${layerY + 1}`, centerX, centerY + 3);
        }
        ctx.shadowBlur = 0; // Reset shadow
        
        ctx.restore();
        shadowCount++;
      }
    }
    
    instructionsLog.log(`👤 Drew ${shadowCount} shadow hexagons from lower layers`);
  }

  // Draw hexagonal grid with textures
  async function drawHexLayerTiles(ctx, tiles, analysis, hexSize, margin) {
  const hexHeight = hexSize * Math.sqrt(3);
    
    instructionsLog.log(`Drawing ${tiles.length} tiles in hexagonal layout`);

    // Use GLOBAL pixel bounds from analysis instead of per-layer bounds
    // This ensures all layers are centered relative to the same global map center
    let minPixelX = Infinity, maxPixelX = -Infinity;
    let minPixelY = Infinity, maxPixelY = -Infinity;
    
    // Calculate global bounds from all layers (same as in drawHexagonalGrid)
    analysis.layerData.forEach((layerTiles) => {
      layerTiles.forEach(tile => {
        const x = hexSize * (3/2 * tile.q);
        const y = hexSize * (Math.sqrt(3)/2 * tile.q + Math.sqrt(3) * tile.r);
        
        minPixelX = Math.min(minPixelX, x);
        maxPixelX = Math.max(maxPixelX, x);
        minPixelY = Math.min(minPixelY, y);
        maxPixelY = Math.max(maxPixelY, y);
      });
    });
    
  instructionsLog.log(`🎯 TILES: Using GLOBAL positioning: minPixelX=${minPixelX.toFixed(1)}, minPixelY=${minPixelY.toFixed(1)} - ALL LAYERS CENTERED TO SAME POINT`);

    // Create a map to store loaded texture images
    const textureImages = new Map();
    
    // Helper function to load and cache texture images
    async function getTextureImage(biomeId, tileNumber) {
      const cacheKey = `${biomeId}_${tileNumber}`;
      if (textureImages.has(cacheKey)) {
        return textureImages.get(cacheKey);
      }
      
      // Get grid texture config for this biome
      const gridConfig = getGridTexturePath(biomeId);
      if (!gridConfig) {
        instructionsLog.log(`No grid texture config found for biome: ${biomeId}`);
        return null;
      }
      
      // Extract specific tile from grid texture
      const extractedImg = await extractTileFromGrid(gridConfig.gridTexture, tileNumber, gridConfig);
      if (extractedImg) {
        textureImages.set(cacheKey, extractedImg);
        instructionsLog.log(`✅ Extracted texture for ${biomeId} tile ${tileNumber}`);
      } else {
        instructionsLog.log(`❌ Failed to extract texture for ${biomeId} tile ${tileNumber}`);
      }
      
      return extractedImg;
    }
    
    // Helper function to draw a hexagon
    function drawHexagon(ctx, centerX, centerY, size, fillStyle = null, strokeStyle = '#333') {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const x = centerX + size * Math.cos(angle);
        const y = centerY + size * Math.sin(angle);
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      
      if (fillStyle) {
        ctx.fillStyle = fillStyle;
        ctx.fill();
      }
      
      // Only draw stroke if we have a fill color (colored fallback hexagons)
      // Don't draw stroke for textured tiles since grid already provides the outline
      if (fillStyle && strokeStyle) {
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    
    // Helper function to convert hex coordinates to pixel coordinates with margin
    // Draw all tiles
    for (const tile of tiles) {
      try {
        if (!tile.q && tile.q !== 0 || !tile.r && tile.r !== 0) {
          console.error('❌ ERROR: Invalid tile coordinates:', tile);
          continue;
        }

        const biomeId = tile.biomeId;
        if (!biomeId) {
          console.error('❌ ERROR: No biomeId found in tile:', tile);
          continue;
        }

        // Convert hex coordinates to pixel position with margin
        // Calculate relative to the actual content bounds, not the analysis bounds
        const tilePixelX = hexSize * (3/2 * tile.q);
        const tilePixelY = hexSize * (Math.sqrt(3)/2 * tile.q + Math.sqrt(3) * tile.r);
        
        // Position relative to the tightest bounding box with padding
        const paddingHexes = 2;
        const hexPaddingX = paddingHexes * hexSize * 1.5;
        const hexPaddingY = paddingHexes * hexHeight;
        
        const x = (tilePixelX - minPixelX) + hexPaddingX + margin;
        const y = (tilePixelY - minPixelY) + hexPaddingY + margin;
        
        const centerX = x + hexSize;
        const centerY = y + hexSize;// Load texture image for this specific tile
        const textureImg = await getTextureImage(biomeId, tile.tileNumber);
        
        if (textureImg) {
          // Create a clipping path for the hexagon
          ctx.save();
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            const px = centerX + hexSize * Math.cos(angle);
            const py = centerY + hexSize * Math.sin(angle);
            if (i === 0) {
              ctx.moveTo(px, py);
            } else {
              ctx.lineTo(px, py);
            }
          }
          ctx.closePath();
          ctx.clip();
          
          // Apply base 60° rotation + user rotation to match 3D model alignment
          ctx.translate(centerX, centerY);
          // Base 60° rotation for hex alignment + user rotation in 60° increments
          const baseRotation = Math.PI / 3; // 60 degrees base alignment (30° + 30°)
          const userRotation = tile.rotationDegrees ? (tile.rotationDegrees * Math.PI) / 180 : 0;
          const totalRotation = baseRotation + userRotation;
          ctx.rotate(totalRotation);
          ctx.translate(-centerX, -centerY);
          
          // Draw the texture image within the hexagon
          const imgSize = hexSize * 1.8;
          ctx.drawImage(textureImg, 
            centerX - imgSize/2, centerY - imgSize/2, 
            imgSize, imgSize);
            
          ctx.restore(); // This restores both clipping and transformation
          
          // Draw hexagon border
          drawHexagon(ctx, centerX, centerY, hexSize, null, '#333');
        } else {
          // Fallback to colored hexagon if texture fails to load
          const color = getBiomeDisplayColor(biomeId);
          drawHexagon(ctx, centerX, centerY, hexSize, color, '#333');
        }
        
        // Draw tile label (optional)
        if (ctx.__showLabels) {
          ctx.fillStyle = '#000';
          ctx.font = '600 9px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const biomeName = biomeId ? biomeId.split('_')[0].toUpperCase() : 'UNK';
          const tileNum = tile.tileNumber || '?';
          const rotationInfo = (tile.rotationDegrees && tile.rotationDegrees !== 0) ? ` (${tile.rotationDegrees}°)` : '';
          const text = `${biomeName}-${tileNum}${rotationInfo}`;
          const textMetrics = ctx.measureText(text);
          const textWidth = textMetrics.width;
          const textHeight = 12;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.fillRect(centerX - textWidth/2 - 2, centerY - textHeight/2 - 1,
                       textWidth + 4, textHeight + 2);
          ctx.fillStyle = '#000';
          ctx.fillText(text, centerX, centerY);
        }
        
      } catch (error) {
        console.error('Error drawing tile:', tile, error);
      }
    }
  }

  // Minimal, texture-free tiles for Simple view
  async function drawSimpleLayerTiles(ctx, tiles, analysis, hexSize, margin) {
    const hexHeight = hexSize * Math.sqrt(3);
    // Compute global pixel bounds once
    let minPixelX = Infinity, minPixelY = Infinity;
    analysis.layerData.forEach(layerTiles => {
      layerTiles.forEach(tile => {
        const x = hexSize * (3/2 * tile.q);
        const y = hexSize * (Math.sqrt(3)/2 * tile.q + Math.sqrt(3) * tile.r);
        minPixelX = Math.min(minPixelX, x);
        minPixelY = Math.min(minPixelY, y);
      });
    });

    const paddingHexes = 2;
    const hexPaddingX = paddingHexes * hexSize * 1.5;
    const hexPaddingY = paddingHexes * hexHeight;

    const drawHex = (cx, cy, size, fill, stroke) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI / 3) * i;
        const px = cx + size * Math.cos(ang);
        const py = cy + size * Math.sin(ang);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
    };

    for (const tile of tiles) {
      const tilePixelX = hexSize * (3/2 * tile.q);
      const tilePixelY = hexSize * (Math.sqrt(3)/2 * tile.q + Math.sqrt(3) * tile.r);
      const x = (tilePixelX - minPixelX) + hexPaddingX + margin;
      const y = (tilePixelY - minPixelY) + hexPaddingY + margin;
      const cx = x + hexSize, cy = y + hexSize;
  const color = getBiomeDisplayColor(tile.biomeId);
      drawHex(cx, cy, hexSize, color, '#333');
      // Tiny center label (optional)
      if (ctx.__showLabels) {
        const short = (tile.biomeId || '').split('_')[0]?.toUpperCase() || 'UNK';
        const num = tile.tileNumber || '?';
        ctx.fillStyle = '#000'; ctx.font = '600 9px Arial';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`${short}-${num}`, cx, cy);
      }
    }
  }

  function getBiomeDisplayColor(biomeId) {
    // Check if biomeId is defined
    if (!biomeId || typeof biomeId !== 'string') {
      console.warn('⚠️ getBiomeColor: Invalid biomeId:', biomeId);
      return '#999999';
    }
    
    const colorMap = {
      'gs': '#4CAF50', // grass - green
      'ar': '#87CEEB', // arctic - blue
      'ds': '#DEB887', // desert - sand
      'bl': '#8B4513', // barren - brown
      'cb': '#708090', // cavern buildings - gray
      'cv': '#696969', // caverns - dark gray
      'dg': '#2F4F4F', // dungeons - dark
      'bk': '#8B7355', // brick - brick color
    };
    
    const prefix = biomeId.split('_')[0];
    return colorMap[prefix] || '#999999';
  }

  // Helper function to get grid texture path from biome ID
  function getGridTexturePath(biomeId) {
    // Use the same texture config system as the 3D rendering
    const textureConfigs = {
      'gs_grass': { gridTexture: 'textures/grass-grid-texture.png', gridSize: { cols: 5, rows: 10 } },
      'gs_tracks_streams': { gridTexture: 'textures/grass-grid-texture.png', gridSize: { cols: 5, rows: 10 } }, // Use grass as fallback
      'ar_frozen_forest': { gridTexture: 'textures/arctic-grid-texture.png', gridSize: { cols: 5, rows: 10 } },
      'ar_ice_rocks': { gridTexture: 'textures/grass-grid-texture.png', gridSize: { cols: 5, rows: 10 } }, // Use grass as fallback
      'ar_snow': { gridTexture: 'textures/grass-grid-texture.png', gridSize: { cols: 5, rows: 10 } }, // Use grass as fallback
      'ds_sand': { gridTexture: 'textures/desert-grid-texture.png', gridSize: { cols: 5, rows: 10 } },
      'bl_earth': { gridTexture: 'textures/grass-grid-texture.png', gridSize: { cols: 5, rows: 10 } }, // Use grass as fallback
      'cb_floors': { gridTexture: 'textures/cavern-buildings-grid-texture.png', gridSize: { cols: 5, rows: 10 } },
      'cv_floors': { gridTexture: 'textures/caverns-grid-texture.png', gridSize: { cols: 5, rows: 10 } },
      'dg_floors': { gridTexture: 'textures/dungeons-grid-texture.png', gridSize: { cols: 5, rows: 10 } },
      'bk_brown': { gridTexture: 'textures/brick-grid-texture.png', gridSize: { cols: 5, rows: 10 } }
    };
    
    return textureConfigs[biomeId] || null;
  }

  // Helper function to extract specific tile from grid texture
  async function extractTileFromGrid(gridTexturePath, tileNumber, gridConfig) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Create canvas to extract the specific tile
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        const { cols, rows } = gridConfig.gridSize;
        const tileWidth = img.width / cols;
        const tileHeight = img.height / rows;
        
        canvas.width = tileWidth;
        canvas.height = tileHeight;
        
        // Calculate grid position for this tile number (1-based to 0-based)
        const index = tileNumber - 1;
        const col = index % cols;
        const row = Math.floor(index / cols);
        
        // Extract the specific tile region
        ctx.drawImage(img, 
          col * tileWidth, row * tileHeight, tileWidth, tileHeight,  // source
          0, 0, tileWidth, tileHeight                                // destination
        );
        
        // Convert canvas to image
        const extractedImg = new Image();
        extractedImg.onload = () => resolve(extractedImg);
        extractedImg.onerror = () => resolve(null);
        extractedImg.src = canvas.toDataURL();
      };
      img.onerror = () => resolve(null);
      img.src = gridTexturePath;
    });
  }
  
  function createTilesListForLayer(tiles, yLevel) {
    const listDiv = document.createElement('div');
    listDiv.className = 'tiles-list';
    
    // Collapsible container for the whole layer list
    const details = document.createElement('details');
    // Always collapsed by default
    details.open = false;
    details.className = 'tiles-accordion';
    const summary = document.createElement('summary');
    // Calculate unique biomes for this layer
    const uniqueBiomes = new Set(tiles.map(t => t.biomeId).filter(Boolean));
  summary.innerHTML = `<i class="fas fa-list"></i> Tiles List (Layer ${yLevel + 1}) — ${tiles.length} tiles, ${uniqueBiomes.size} biomes <span class="coords-hint">· Q = columns, R = rows</span>`;
    details.appendChild(summary);

    // When the summary is toggled open, expand all biome accordions within this list
  summary.addEventListener('click', (_event) => {
      // Let the native <details> toggle first, then expand biomes if opening
      setTimeout(() => {
        try {
          const isOpen = details.open;
          if (isOpen) {
            listDiv.querySelectorAll('.biome-accordion').forEach(d => { d.open = true; });
          }
        } catch {
          // If the DOM element disappears mid-toggle we just stop expanding.
        }
      }, 0);
    });
    
  // Per-layer toolbar no longer includes an "Expand all biomes" button.
  const listToolbar = document.createElement('div');
  listToolbar.className = 'tiles-list-toolbar';

    // Group by biomes
    const biomeGroups = new Map();
    tiles.forEach(tile => {
      // Use biomeId from tile
      const biomeId = tile.biomeId;
      
      if (biomeId) {
        if (!biomeGroups.has(biomeId)) {
          biomeGroups.set(biomeId, []);
        }
        biomeGroups.get(biomeId).push(tile);
      }
    });
    
  const listContent = document.createElement('div');
  listContent.className = 'tiles-list-content';
  // Intentionally no global biomes expander inside the list content.
    
    biomeGroups.forEach((biomeTiles, biomeId) => {
      const biome = biomeSets.find(b => b.id === biomeId);
      const biomeName = biome ? biome.name : biomeId;
      // Per-biome collapsible
  const biomeDetails = document.createElement('details');
  biomeDetails.className = 'biome-accordion';
  // Always collapsed by default; opened when the parent summary is toggled open.
  biomeDetails.open = false;
      const biomeSummary = document.createElement('summary');
      biomeSummary.innerHTML = `<strong>${biomeName}</strong> <span class="biome-count">(${biomeTiles.length})</span>`;
      biomeDetails.appendChild(biomeSummary);

      const biomeSection = document.createElement('div');
      biomeSection.className = 'biome-section';
      biomeSection.innerHTML = `
        <div class="biome-tiles">
          ${biomeTiles.map(tile => {
            const tileNum = tile.tileNumber || '?';
            const rot = (tile.rotationDegrees && tile.rotationDegrees !== 0) ? `<span class="rot">· ${tile.rotationDegrees}°</span>` : '';
            const short = (biomeId || '').split('_')[0]?.toUpperCase() || 'UNK';
            return `<span class="tile-tag"><span class="tile-num">${short}-${tileNum}</span><span class="coords">Q: ${tile.q} · R: ${tile.r}</span>${rot}</span>`;
          }).join('')}
        </div>
      `;
      biomeDetails.appendChild(biomeSection);
      listContent.appendChild(biomeDetails);
    });
    
    details.appendChild(listContent);
    listDiv.appendChild(details);
    return listDiv;
  }
  
  function createInstructionsWindow() {
    // Tworzenie overlay
    const overlay = document.createElement('div');
    overlay.className = 'instructions-overlay';
  // Styling is handled in CSS for theming (light/dark)
    
    // Główny kontener
    const container = document.createElement('div');
    container.className = 'instructions-container';
  // Sizing handled via CSS; JS may adjust width after render if needed
    
  // Add a top-right close (X) button inside the container
  const closeBtn = document.createElement('button');
  closeBtn.className = 'instructions-close';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close instructions');
  closeBtn.innerHTML = '<i class="fas fa-times"></i>';
  closeBtn.addEventListener('click', (e) => { e.preventDefault(); document.body.removeChild(overlay); });
  container.appendChild(closeBtn);

  overlay.appendChild(container);
    document.body.appendChild(overlay);
    
    // Zamknięcie na kliknięcie poza oknem
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
      }
    });
    
    // Globalne funkcje dla przycisków
    window.closeInstructions = () => {
      document.body.removeChild(overlay);
    };
    
    window.printInstructions = () => {
      window.print();
    };

    // Bulk download all layer canvases as PNGs
    window.downloadAllLayerImages = async () => {
      const containerEl = document.querySelector('.instructions-container');
      if (!containerEl) return;
      const canvases = containerEl.querySelectorAll('canvas.layer-canvas');
      if (!canvases.length) { alert('No layers to save.'); return; }
      const nameEl = document.getElementById('map-name-input-toolbar');
      const mapName = (nameEl?.value || 'map').trim().replace(/[^a-z0-9-_]+/gi, '_').toLowerCase();
      let idx = 1;
      for (const cv of canvases) {
        const fileName = `${mapName || 'map'}_layer-${idx}.png`;
        if (cv.toBlob) {
          await new Promise((resolve) => {
            cv.toBlob((blob) => {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
              URL.revokeObjectURL(url);
              resolve();
            }, 'image/png');
          });
        } else {
          const dataUrl = cv.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = dataUrl; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
        }
        idx++;
        await new Promise(r => setTimeout(r, 60));
      }
    };
    
  // PDF export was redundant to Print-to-PDF; feature removed per request.
  window.downloadInstructionsAsPDF = () => window.print();

    // Global helpers for expand/collapse all lists
    window.expandAllInstructionLists = () => {
      try {
        container.querySelectorAll('.tiles-accordion, .biome-accordion').forEach(d => { d.open = true; });
      } catch {
        // Ignore if instructions modal is not mounted.
      }
    };
    window.collapseAllInstructionLists = () => {
      try {
        container.querySelectorAll('.biome-accordion').forEach(d => { d.open = false; });
        container.querySelectorAll('.tiles-accordion').forEach(d => { d.open = false; });
      } catch {
        // Ignore if instructions modal is not mounted.
      }
    };
    
    return { overlay, container };
  }

  // Global function to make it accessible from HTML buttons
  window.switchToTab = (tabName) => {
    uiController?.switchToTab?.(tabName);
  };

  registerStateCallbacks({
    updateHeaderStats,
    updateRightPanelStats
  });
  
  init();
};

let appBootstrapped = false;

const invokeBootstrap = () => {
  if (appBootstrapped) return;
  appBootstrapped = true;
  bootstrapApp();
};

const scheduleBootstrap = () => {
  if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
    window.requestAnimationFrame(() => {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(invokeBootstrap, { timeout: 120 });
      } else {
        invokeBootstrap();
      }
    });
  } else {
    invokeBootstrap();
  }
};

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  scheduleBootstrap();
} else {
  document.addEventListener('DOMContentLoaded', scheduleBootstrap, { once: true });
}

// --- Instructions UI Enhancer: add per-layer "Expand all (all layers)" and bottom Print/PDF ---
document.addEventListener('DOMContentLoaded', () => {
  const ENHANCED_FLAG = 'data-instructions-enhanced';

  function expandAllLayers(container) {
    container.querySelectorAll('details').forEach(d => { d.open = true; });
  }

  function ensureBottomActions(container) {
    if (container.querySelector('.instructions-actions.bottom')) return;

    const actions = document.createElement('div');
  actions.className = 'instructions-actions bottom';

  const btnPrint = document.createElement('button');
  btnPrint.className = 'btn btn-primary';
  btnPrint.type = 'button';
  btnPrint.innerHTML = '<i class="fas fa-print"></i> <span>Print / PDF</span>';
  // Use inline onclick so enhancer logic recognizes it's already wired
  btnPrint.setAttribute('onclick', 'printInstructions()');

    const btnSaveAll = document.createElement('button');
    btnSaveAll.className = 'btn btn-secondary';
    btnSaveAll.style.marginLeft = '8px';
    btnSaveAll.innerHTML = '<i class="fas fa-images"></i> <span>Save all layers (PNG)</span>';
  btnSaveAll.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.downloadAllLayerImages) window.downloadAllLayerImages();
    });

    actions.appendChild(btnPrint);
    actions.appendChild(btnSaveAll);
    container.appendChild(actions);
  }

  function ensureExpandAllPerTilesList(container) {
    const lists = container.querySelectorAll('.tiles-list, .tiles-accordion');
    lists.forEach(list => {
      if (list.hasAttribute(ENHANCED_FLAG)) return;

      // Prefer placing control inside the top summary if present
      const summary = list.querySelector(':scope > summary') || list.querySelector(':scope .tiles-accordion > summary');
      const target = summary || list;

      // Avoid duplicates
      if (target.querySelector('.tiles-list-toolbar')) {
        list.setAttribute(ENHANCED_FLAG, '1');
        return;
      }

      const toolbar = document.createElement('div');
      toolbar.className = 'tiles-list-toolbar';

      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary btn-compact';
      btn.type = 'button';
      btn.title = 'Expand all tiles lists across all layers';
      btn.innerHTML = '<i class="fas fa-angle-double-down"></i> <span>Expand all (all layers)</span>';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const containerRoot = document.querySelector('.instructions-container') || document;
        expandAllLayers(containerRoot);
      });

      toolbar.appendChild(btn);

      // Insert toolbar: if summary exists, add at the end of summary; else as first child of list
      if (summary) {
  summary.appendChild(toolbar);
      } else {
        list.insertBefore(toolbar, list.firstChild);
      }

      list.setAttribute(ENHANCED_FLAG, '1');
    });
  }

  function enhanceInstructionsUI() {
    const container = document.querySelector('.instructions-container');
    if (!container) return;

    // Avoid rerunning heavy work too often
    if (!container.hasAttribute(ENHANCED_FLAG)) {
      ensureBottomActions(container);
      container.setAttribute(ENHANCED_FLAG, '1');
    }

    ensureExpandAllPerTilesList(container);

    // Wire up any Print/PDF buttons only if they don't have handlers;
    // attach a single listener per button to avoid duplicates
    const candidates = container.querySelectorAll('.instructions-actions button, .instructions-actions a');
    candidates.forEach(btn => {
      if (btn.dataset.wiredAny === '1') return;
      const label = (btn.textContent || btn.title || '').toLowerCase();
      const hasOnclick = btn.hasAttribute('onclick');
      const hasHref = btn.hasAttribute('href');
      const isPrintish = label.includes('print') || (label.includes('pdf') && !label.includes('expand'));
      if (!hasOnclick && isPrintish) {
        btn.addEventListener('click', (e) => {
          if (!hasHref) {
            e.preventDefault();
            window.print();
          }
        });
        btn.dataset.wiredAny = '1';
      }
    });
  }

  // Run once and observe DOM for changes while overlay is open
  enhanceInstructionsUI();
  const mo = new MutationObserver(() => enhanceInstructionsUI());
  mo.observe(document.body, { childList: true, subtree: true });
});
