import * as THREE from 'three';
import { biomeSets, environmentPacks } from './data/data.js';
import { createStateManager } from './src/state/stateManager.js';
import createMaterialController from './src/tiles/materialController.js';
import { createLightingController } from './src/scene/lightingController.js';
import { createAnalyticsController } from './src/analytics/analyticsController.js';
import { createUIController } from './src/ui/uiController.js';
import { createScene } from './src/scene/createScene.js';
import createDebugLogger from './src/utils/debugLogger.js';
import { createInstructionsRenderer, registerInstructionsEnhancer } from './src/app/instructions/instructionsRenderer.js';
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
import { assetLoadingManager, registerAsset } from './src/utils/assetLoadingManager.js';
import welcomeScreenController from './src/ui/welcomeScreenController.js';
import restartModalController from './src/ui/restartModalController.js';
import { showNotification, showConfirm } from './src/ui/notifications.js';

let initAppRef = null;
let shareLinkBootstrapHandled = false;
let mobileViewerMode = false;

const appLog = createDebugLogger('app');

registerInstructionsEnhancer();

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

  const detectMobileDevice = () => {
    if (typeof window === 'undefined') {
      return false;
    }
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    const uaDataMobile = typeof navigator !== 'undefined' ? navigator.userAgentData?.mobile : false;
    const coarse = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
    const smallWidth = window.matchMedia?.('(max-width: 1024px)')?.matches ?? false;
    const mobileRegex = /android|iphone|ipad|ipod|windows phone|mobile|blackberry|opera mini|silk/i;
    return Boolean(uaDataMobile) || mobileRegex.test(ua) || (coarse && smallWidth);
  };

  const isMobileViewerMode = () => mobileViewerMode;

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
    hexRadius: HEX_RADIUS,
    tileVerticalGapRatio = 0
  } = GRID_CONFIG;
  const TILE_VERTICAL_GAP_RATIO = tileVerticalGapRatio;
  const TILE_VERTICAL_STEP = tileHeight * (1 + TILE_VERTICAL_GAP_RATIO);
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
  let activeViewLayer = null;
  const viewControls = {
    container: null,
    status: null,
    upButton: null,
    downButton: null,
    allButton: null,
    captureButton: null,
    mobilePanel: null,
    mobileStatus: null,
    mobileUpButton: null,
    mobileDownButton: null,
    mobileAllButton: null,
    messageTimeout: null
  };

  let activeCameraPreset = 'default';
  let previousOrbitPreset = 'default';
  const orbitFlipState = {
    front: 1,
    side: 1
  };

  const cameraClock = new THREE.Clock();
  const cameraTransitionState = { animationId: null };
  const cameraStartPos = new THREE.Vector3();
  const cameraStartTarget = new THREE.Vector3();
  const cameraStartUp = new THREE.Vector3();
  const cameraTargetBuffer = new THREE.Vector3();
  const cameraPositionBuffer = new THREE.Vector3();
  const cameraUpBuffer = new THREE.Vector3();
  const firstPersonEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  const mapBoundsMin = new THREE.Vector3();
  const mapBoundsMax = new THREE.Vector3();
  const mapBoundsCenter = new THREE.Vector3();
  const mapBoundsRadiusCenter = new THREE.Vector3();
  const mapTempVec = new THREE.Vector3();

  const boardBounds = {
    minX: 0,
    maxX: 0,
    minZ: 0,
    maxZ: 0,
    center: new THREE.Vector3(0, 0, 0)
  };
  let boardBoundsInitialized = false;

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  const mapSpan = gridSize * hexSize;
  const CAMERA_TARGET_MARGIN_X = hexSize * 0.85;
  const CAMERA_TARGET_MARGIN_Z = hexSize * 1.25;
  const CAMERA_POSITION_MARGIN_X = Math.max(hexSize * 6, mapSpan * 0.25);
  const CAMERA_POSITION_MARGIN_Z = Math.max(hexSize * 7.5, mapSpan * 0.3);
  const FIRST_PERSON_MARGIN_X = hexSize * 0.6;
  const FIRST_PERSON_MARGIN_Z = hexSize * 0.9;
  const baseFirstPersonHeight = 1.9;
  const baseFirstPersonForwardOffset = Math.max(10, mapSpan * 0.9);

  const defaultUpVector = new THREE.Vector3(0, 1, 0);
  const topDownUpVector = new THREE.Vector3(0, 0, -1);

  const CAMERA_COLLISION_RADIUS = Math.max(0.45, hexSize * 0.55);
  const CAMERA_VERTICAL_PADDING = tileHeight * 0.75;
  const CAMERA_BODY_HEIGHT = baseFirstPersonHeight * 0.95;
  const CAMERA_VERTICAL_SOFT_LIMIT = baseFirstPersonHeight * 1.25;

  const easeInOutSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

  const DIMMED_LAYER_OPACITY = 0.15;

  const firstPersonState = {
    active: false,
    pointerLocked: false,
    suppressUnlockHandler: false,
    yaw: 0,
    pitch: 0,
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    moveUp: false,
    moveDown: false,
    sprint: false,
    baseSpeed: Math.max(10, mapSpan * 0.75),
    sprintMultiplier: 1.6,
    sensitivity: 0.0025,
    minHeight: 0.6
  };

  let cameraButtons = [];
  let firstPersonHintElement = null;

  const firstPersonMoveVector = new THREE.Vector3();
  const firstPersonHorizontalMove = new THREE.Vector3();
  const firstPersonDesiredPosition = new THREE.Vector3();
  const cameraForwardVector = new THREE.Vector3();
  const cameraRightVector = new THREE.Vector3();
  const collisionOffset = new THREE.Vector3();
  const orbitOffset = new THREE.Vector3();
  const orbitClampOffset = new THREE.Vector3();
  const scratchSpherical = new THREE.Spherical();
  const scratchSphericalEnd = new THREE.Spherical();
  const scratchOrbitClamp = new THREE.Spherical();
  const scratchTarget = new THREE.Vector3();
  const scratchUp = new THREE.Vector3();
  const upAxis = new THREE.Vector3(0, 1, 0);

  let isDragging = false;
  let mouseDownTime = 0;
  let mouseDownPosition = { x: 0, y: 0 };
  let isBrushPainting = false;
  const brushPaintedKeys = new Set();
  const brushPaintedCells = new Set();
  let brushLastCellKey = null;
  let brushLastTileKey = null;
  let controlsSuppressedForBrush = false;
  let brushControlState = null;
  let brushActiveLevel = null;
  let brushCanResumeWithCache = false;
  let brushFirstCellKey = null;

  function parseCellKey(cellKey) {
    if (!cellKey) return null;
    const match = /q:(-?\d+),r:(-?\d+)/.exec(cellKey);
    if (!match) return null;
    return { q: Number(match[1]), r: Number(match[2]) };
  }

  function areCellKeysAdjacent(aKey, bKey) {
    if (!aKey || !bKey) return false;
    if (aKey === bKey) return false;
    const a = parseCellKey(aKey);
    const b = parseCellKey(bKey);
    if (!a || !b) return false;
    return getNeighborCoordinates(a.q, a.r).some((neighbor) => neighbor.q === b.q && neighbor.r === b.r);
  }

  function levelToWorldY(level) {
    if (level <= 0) return 0;
    return level * TILE_VERTICAL_STEP;
  }

  function worldYToNearestLevel(worldY) {
    if (worldY <= 0) return 0;
    return Math.round(worldY / TILE_VERTICAL_STEP);
  }

  function startBrushStroke({ preserveCache = false } = {}) {
    if (isBrushPainting) return;
    isBrushPainting = true;
    if (!preserveCache) {
      brushPaintedKeys.clear();
      brushPaintedCells.clear();
      brushLastCellKey = null;
      brushLastTileKey = null;
      brushActiveLevel = null;
      brushFirstCellKey = null;
    }
    brushCanResumeWithCache = false;
    suppressControlsForBrush();
  }

  function endBrushStroke({ preserveCache = false } = {}) {
    if (!isBrushPainting) return;
    isBrushPainting = false;
    if (!preserveCache) {
      brushPaintedKeys.clear();
      brushPaintedCells.clear();
      brushLastCellKey = null;
      brushLastTileKey = null;
      brushActiveLevel = null;
      brushCanResumeWithCache = false;
      brushFirstCellKey = null;
    } else {
      brushCanResumeWithCache = true;
    }
    restoreControlsAfterBrush();
  }

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
  const ORBIT_MIN_DISTANCE = Math.max(hexSize * 1.5, mapSpan * 0.2);
  const ORBIT_MAX_DISTANCE = Math.max(hexSize * 60, mapSpan * 3.7);
  const ORBIT_DISTANCE_MULTIPLIER = 2;
  const ORBIT_MAX_POLAR_ANGLE = THREE.MathUtils.degToRad(94);
  controls.minDistance = ORBIT_MIN_DISTANCE;
  controls.maxDistance = ORBIT_MAX_DISTANCE;
  controls.maxPolarAngle = ORBIT_MAX_POLAR_ANGLE;
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

  function getGridTexturePath(biomeId) {
    const textureConfigs = {
      // Grassland sets
      gs_grass: { gridTexture: 'textures/grid-Grassland---plain-grass.png', gridSize: { cols: 5, rows: 10 } },
      gs_tracks_streams: { gridTexture: 'textures/grid-Grassland---Tracks-and-Streams.png', gridSize: { cols: 5, rows: 10 } },
      gs_forest_flora: { gridTexture: 'textures/grid-Grassland-Forest-and-Flora.png', gridSize: { cols: 5, rows: 10 } },
      // Barrenland sets
      bl_earth: { gridTexture: 'textures/grid-Barrenland-set---dirt.png', gridSize: { cols: 5, rows: 10 } },
      bl_tracks_streams: { gridTexture: 'textures/grid-Barrenland-tracks-and-streams.png', gridSize: { cols: 5, rows: 10 } },
      bl_wasteland_forest: { gridTexture: 'textures/grid-Barrenland-Forest-and-Rocks.png', gridSize: { cols: 5, rows: 10 } },
      // Mountain sets
      mt_stone: { gridTexture: 'textures/grid-Mountains---Stone.png', gridSize: { cols: 5, rows: 10 } },
      mt_streams_forest: { gridTexture: 'textures/grid-Mountains---Streams-and-Forests.png', gridSize: { cols: 5, rows: 10 } },
      // Oceanic sets
      oc_water: { gridTexture: 'textures/grid-Oceanic---Water.png', gridSize: { cols: 5, rows: 10 } },
      oc_coastal: { gridTexture: 'textures/grid-Oceanic---Coastal.png', gridSize: { cols: 5, rows: 10 } },
      oc_tropical_island: { gridTexture: 'textures/grid-Oceanic---Tropical-Island-and-Shallows.png', gridSize: { cols: 5, rows: 10 } },
      // Desert sets
      ds_sand: { gridTexture: 'textures/grid-Desert-set---Sand.png', gridSize: { cols: 5, rows: 10 } },
      ds_tracks_ridgelines: { gridTexture: 'textures/grid-Desert-Tracks-and-Ridgelines.png', gridSize: { cols: 5, rows: 10 } },
      ds_ruins_oases: { gridTexture: 'textures/grid-Desert-set---Oases-and-Ruins.png', gridSize: { cols: 5, rows: 10 } },
      // Arctic sets
      ar_snow: { gridTexture: 'textures/grid-Arctic---Snow.png', gridSize: { cols: 5, rows: 10 } },
      ar_frozen_forest: { gridTexture: 'textures/grid-Arctic---Frozen-Streams-and-Forests.png', gridSize: { cols: 5, rows: 10 } },
      ar_ice_rocks: { gridTexture: 'textures/grid-Arctic---Rocks-and-Ice.png', gridSize: { cols: 5, rows: 10 } },
      // Volcanic sets
      vo_basalt: { gridTexture: 'textures/grid-Volcano---Basalt.png', gridSize: { cols: 5, rows: 10 } },
      vo_volcanic_crater: { gridTexture: 'textures/grid-Volcano---Lava-Lake.png', gridSize: { cols: 5, rows: 10 } },
      vo_lava_flows: { gridTexture: 'textures/grid-Volcano---Lava-flow.png', gridSize: { cols: 5, rows: 10 } },
      // Marshland sets
      ms_marsh: { gridTexture: 'textures/grid-Marshland---Marsh.png', gridSize: { cols: 5, rows: 10 } },
      ms_swamp_streams: { gridTexture: 'textures/grid-Marshland---Swamp-and-Causeways.png', gridSize: { cols: 5, rows: 10 } },
      ms_fetid_forest: { gridTexture: 'textures/grid-Marshland---Fetid-Forest.png', gridSize: { cols: 5, rows: 10 } },
      // Tavern sets
      tv_walls: { gridTexture: 'textures/grid-Tavern-Walls.png', gridSize: { cols: 5, rows: 10 } },
      tv_floors: { gridTexture: 'textures/grid-Tavern-floor.png', gridSize: { cols: 5, rows: 10 } },
      // Cavern sets
      cv_walls: { gridTexture: 'textures/grid-Cavern-walls.png', gridSize: { cols: 5, rows: 10 } },
      cv_floors: { gridTexture: 'textures/grid-Cavern-floors.png', gridSize: { cols: 5, rows: 10 } },
      // Street sets
      st_road: { gridTexture: 'textures/grid-Streets---Road.png', gridSize: { cols: 5, rows: 10 } },
      st_market: { gridTexture: 'textures/grid-Streets---Market.png', gridSize: { cols: 5, rows: 10 } },
      // Dungeon sets
      dg_walls: { gridTexture: 'textures/grid-Dungeons---Walls.png', gridSize: { cols: 5, rows: 10 } },
      dg_floors: { gridTexture: 'textures/grid-Dungeons---Floors.png', gridSize: { cols: 5, rows: 10 } },
      // Shadowlands sets
      sh_cursed_earth: { gridTexture: 'textures/grid-Shadowlands---Cursed-Earth.png', gridSize: { cols: 5, rows: 10 } },
      sh_dead_forest: { gridTexture: 'textures/grid-Shadowlands---Dead-Forest.png', gridSize: { cols: 5, rows: 10 } },
      sh_twisted_roads_and_ruins: { gridTexture: 'textures/grid-Shadowlands---Twisted-Roads-and-Ruins.png', gridSize: { cols: 5, rows: 10 } },
      // Modern city sets
      mc_concrete: { gridTexture: 'textures/grid-Modern-city---Concrete.png', gridSize: { cols: 5, rows: 10 } },
      mc_streets: { gridTexture: 'textures/grid-Modern-city---Streets.png', gridSize: { cols: 5, rows: 10 } },
      mc_pavement: { gridTexture: 'textures/grid-Modern-city---Pavement.png', gridSize: { cols: 5, rows: 10 } },
      // Castle building sets
      cb_walls: { gridTexture: 'textures/grid-Castle-buildings---Walls.png', gridSize: { cols: 5, rows: 10 } },
      cb_floors: { gridTexture: 'textures/grid-Castle-buildings---Floors.png', gridSize: { cols: 5, rows: 10 } },
      // Blank sets - using grassland as fallback since no brick textures found
      bk_brown: { gridTexture: 'textures/grid-Grassland---plain-grass.png', gridSize: { cols: 5, rows: 10 } },
      bk_gray: { gridTexture: 'textures/grid-Grassland---plain-grass.png', gridSize: { cols: 5, rows: 10 } }
    };

    return textureConfigs[biomeId] || null;
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
  tileVerticalGapRatio: TILE_VERTICAL_GAP_RATIO,
    baseRotationX: BASE_ROTATION_X,
    baseRotationY: BASE_ROTATION_Y,
    tileScale: TILE_SCALE,
    placedTiles,
    updateHeaderStats,
    updateRightPanelStats,
    getUIController: () => uiController,
    clearMap,
    onTilesLoaded: () => {
      activeViewLayer = null;
      manualLevelOverride = false;
      applyLayerVisibility();
      updateLevelIndicator();
      refreshGhostTile();
    }
  });

  const escapeHtmlText = (value) => {
    if (value == null) {
      return '';
    }
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  function updateMobileAnalyticsPanel() {
    if (!isMobileViewerMode()) {
      return;
    }

    const summaryContainer = document.getElementById('mobile-analytics-summary');
    const setsContainer = document.getElementById('mobile-analytics-sets');
    if (!summaryContainer || !setsContainer) {
      return;
    }

    if (!analytics) {
      const clearButtonFallback = document.getElementById('mobile-clear-map-btn');
      if (clearButtonFallback) {
        clearButtonFallback.disabled = true;
        clearButtonFallback.classList.add('is-disabled');
      }
      summaryContainer.innerHTML = '';
      setsContainer.classList.add('empty');
      setsContainer.innerHTML = 'Analytics will appear once a map is loaded.';
      return;
    }

    const metrics = analytics?.mapMetrics;
    const placedCount = placedTiles.size;
    const mapSize = analytics?.calculateMapDimensions?.() ?? '0x0';
    const heightLevels = metrics?.calculateHeightLevels?.() ?? 0;
    const uniqueBiomes = metrics?.calculateUniqueBiomes?.() ?? 0;
    const totalSetsRequired = metrics?.calculateTotalSetsRequired?.() ?? 0;
    const totalPacksRequired = metrics?.calculateSetsRequired?.() ?? 0;

    const summaryCards = [
      { label: 'Total Tiles', value: placedCount },
      { label: 'Map Size', value: mapSize },
      { label: 'Height Levels', value: heightLevels },
      { label: 'Biome Sets', value: uniqueBiomes },
      { label: 'Sets Required', value: totalSetsRequired },
      { label: 'Packs Required', value: totalPacksRequired }
    ];

    const clearButton = document.getElementById('mobile-clear-map-btn');
    if (clearButton) {
      const shouldDisable = placedCount === 0;
      clearButton.disabled = shouldDisable;
      clearButton.classList.toggle('is-disabled', shouldDisable);
    }

    summaryContainer.innerHTML = summaryCards.map((item) => `
      <div class="mobile-analytics-card">
        <span class="value">${escapeHtmlText(item.value)}</span>
        <span class="label">${escapeHtmlText(item.label)}</span>
      </div>
    `).join('');

    const analysis = analytics?.biomeAnalysis?.generateSetUsageAnalysis?.();
    const entries = analysis ? Object.values(analysis.biomesUsed || {}) : [];

    if (!entries.length) {
      setsContainer.classList.add('empty');
      setsContainer.innerHTML = 'No tile sets in use yet.';
      return;
    }

    entries.sort((a, b) => (b.tilesUsed || 0) - (a.tilesUsed || 0));
    setsContainer.classList.remove('empty');
    setsContainer.innerHTML = entries.map((entry) => {
      const tilesLabel = `${entry.tilesUsed ?? 0} tiles`;
      const setsLabel = `Sets ${entry.setsRequired ?? 0}/${entry.setsOwned ?? 0}`;

      return `
        <div class="mobile-set-row">
          <div class="set-name">${escapeHtmlText(entry.name)}</div>
          <div class="set-tiles">${escapeHtmlText(tilesLabel)}</div>
          <div class="set-required">${escapeHtmlText(setsLabel)}</div>
        </div>
      `;
    }).join('');
  }

  function setupMobileViewerUI() {
    const shell = document.getElementById('mobile-viewer-shell');
    if (!shell) {
      return;
    }

    shell.classList.remove('hidden');

    if (shell.dataset.initialized === 'true') {
      return;
    }
    shell.dataset.initialized = 'true';

    viewControls.mobilePanel = document.getElementById('mobile-view-panel') ?? null;
    viewControls.mobileStatus = document.getElementById('mobile-view-status') ?? null;
    viewControls.mobileUpButton = document.getElementById('mobile-layer-up') ?? null;
    viewControls.mobileDownButton = document.getElementById('mobile-layer-down') ?? null;
    viewControls.mobileAllButton = document.getElementById('mobile-layer-reset') ?? null;

    viewControls.mobileDownButton?.addEventListener('click', () => shiftViewLayer(-1));
    viewControls.mobileUpButton?.addEventListener('click', () => shiftViewLayer(1));
    viewControls.mobileAllButton?.addEventListener('click', () => setActiveViewLayer(null));

    updateViewControls();

    const themeToggle = document.getElementById('mobile-theme-toggle');
    if (themeToggle) {
      const updateIcon = () => {
        const icon = themeToggle.querySelector('i');
        if (!icon) return;
        const isDark = document.body.getAttribute('data-theme') === 'dark';
        icon.classList.toggle('fa-moon', !isDark);
        icon.classList.toggle('fa-sun', isDark);
      };

      themeToggle.addEventListener('click', () => {
        const isDark = document.body.getAttribute('data-theme') === 'dark';
        if (isDark) {
          document.body.removeAttribute('data-theme');
          localStorage.setItem('ls_theme', 'light');
        } else {
          document.body.setAttribute('data-theme', 'dark');
          localStorage.setItem('ls_theme', 'dark');
        }
        updateIcon();
      });

      updateIcon();
    }

    const fileInput = document.getElementById('mobile-map-file-input');
    const loadFileButton = document.getElementById('mobile-load-file-btn');
    if (fileInput && loadFileButton) {
      loadFileButton.addEventListener('click', () => {
        fileInput.click();
      });

      fileInput.addEventListener('change', (event) => {
        if (!event?.target?.files || event.target.files.length === 0) {
          return;
        }
        persistenceController.loadMapFromFile(event);
        fileInput.value = '';
      });
    }

    const clearButton = document.getElementById('mobile-clear-map-btn');
    if (clearButton) {
      clearButton.addEventListener('click', () => {
        void clearMap({ skipConfirm: false, recordUndo: false });
      });
    }

    const loadIdPanel = document.getElementById('mobile-load-id-panel');
    const analyticsPanel = document.getElementById('mobile-analytics-panel');
    const loadIdButton = document.getElementById('mobile-load-id-toggle');
    const analyticsButton = document.getElementById('mobile-analytics-toggle');
    const panelMap = [
      { button: loadIdButton, panel: loadIdPanel },
      { button: analyticsButton, panel: analyticsPanel }
    ];

    panelMap.forEach((entry) => {
      const { button, panel } = entry;
      if (!button || !panel) {
        return;
      }

      entry.container = button.closest('.mobile-collapsible') ?? null;
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-controls', panel.id ?? '');
      panel.setAttribute('aria-labelledby', button.id ?? '');
      entry.container?.setAttribute('data-expanded', 'false');
      panel.hidden = true;
    });

    const hideAllPanels = () => {
      panelMap.forEach(({ panel, button, container }) => {
        if (panel) {
          panel.hidden = true;
        }
        if (button) {
          button.setAttribute('aria-expanded', 'false');
        }
        container?.setAttribute('data-expanded', 'false');
      });
    };

    panelMap.forEach(({ button, panel, container }) => {
      if (!button || !panel) {
        return;
      }

      button.addEventListener('click', () => {
        const willOpen = panel.hidden;
        hideAllPanels();

        if (willOpen) {
          panel.hidden = false;
          button.setAttribute('aria-expanded', 'true');
          container?.setAttribute('data-expanded', 'true');
          if (panel === analyticsPanel) {
            updateMobileAnalyticsPanel();
          } else if (panel === loadIdPanel) {
            document.getElementById('mobile-share-id-input')?.focus();
          }
        }
      });
    });

    const loadIdForm = document.getElementById('mobile-load-id-form');
    if (loadIdForm) {
      loadIdForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = document.getElementById('mobile-share-id-input');
        const shareIdValue = input?.value?.trim();
        if (!shareIdValue) {
          input?.focus();
          return;
        }

        try {
          await persistenceController.loadMapFromShareId(shareIdValue, {
            skipConfirm: false,
            showSummaryDialog: false,
            notify: true
          });
          hideAllPanels();
          input?.blur();
        } catch (error) {
          // Notifications are handled inside the persistence controller.
        }
      });
    }
  }

  function initializeMobileViewerMode() {
    mobileViewerMode = detectMobileDevice();

    const root = typeof document !== 'undefined' ? document.body : null;
    if (root) {
      root.classList.toggle('mobile-viewer-mode', mobileViewerMode);
    }

    const shell = document.getElementById('mobile-viewer-shell');
    if (shell) {
      if (mobileViewerMode) {
        shell.classList.remove('hidden');
        setupMobileViewerUI();
        updateMobileAnalyticsPanel();
      } else {
        shell.classList.add('hidden');
      }
    }

    if (typeof resizeRenderer === 'function') {
      requestAnimationFrame(() => {
        resizeRenderer();
      });
    }
  }

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
    getUIController: () => uiController,
    onTilesMutated: ({ type }) => {
      if (type === 'clear') {
        activeViewLayer = null;
        manualLevelOverride = false;
      }
      persistenceController.markShareDirty('tiles-mutated');
      applyLayerVisibility();
      updateLevelIndicator();
      refreshGhostTile();
    }
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
  
  function clampVectorToBoard(vector, marginX, marginZ) {
    if (!boardBoundsInitialized || !vector) return false;

    const minX = boardBounds.minX - marginX;
    const maxX = boardBounds.maxX + marginX;
    const minZ = boardBounds.minZ - marginZ;
    const maxZ = boardBounds.maxZ + marginZ;

    const clampedX = Math.min(Math.max(vector.x, minX), maxX);
    const clampedZ = Math.min(Math.max(vector.z, minZ), maxZ);

    const changed = clampedX !== vector.x || clampedZ !== vector.z;
    if (changed) {
      vector.x = clampedX;
      vector.z = clampedZ;
    }
    return changed;
  }

  function isWithinHexGrid(q, r, buffer = 0) {
    const limit = gridSize + buffer;
    return Math.abs(q) <= limit && Math.abs(r) <= limit && Math.abs(-q - r) <= limit;
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
    if (!isWithinHexGrid(q, r)) return 0;
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
    if (!isWithinHexGrid(q, r)) return 0;
    const local = [];
    for (let y = 0; y <= 50; y++) if (placedTiles.has(`q:${q},r:${r},y:${y}`)) local.push(y);

    if (local.length === 0) {
      for (let y = 0; y <= 50; y++) if (canPlaceTileAtHeight(q, r, y)) return y;
      return 0;
    }

  const cursorLevel = worldYToNearestLevel(cursorWorldY);
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

  function suppressControlsForBrush() {
    if (controlsSuppressedForBrush) return;
    brushControlState = {
      enabled: controls.enabled,
      enableRotate: controls.enableRotate,
      enablePan: controls.enablePan,
      enableZoom: controls.enableZoom
    };
    controls.enabled = false;
    controls.enableRotate = false;
    controls.enablePan = false;
    controls.enableZoom = false;
    controlsSuppressedForBrush = true;
  }

  function restoreControlsAfterBrush() {
    if (!controlsSuppressedForBrush) return;
    if (brushControlState) {
      controls.enabled = brushControlState.enabled;
      controls.enableRotate = brushControlState.enableRotate;
      controls.enablePan = brushControlState.enablePan;
      controls.enableZoom = brushControlState.enableZoom;
    } else {
      controls.enabled = true;
      controls.enableRotate = true;
      controls.enablePan = true;
      controls.enableZoom = true;
    }
    brushControlState = null;
    controlsSuppressedForBrush = false;
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
    if (!isWithinHexGrid(q, r)) return 0;
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

  function getHighestOccupiedLevel(q, r) {
    if (!isWithinHexGrid(q, r)) return -1;
    for (let y = 50; y >= 0; y--) {
      if (placedTiles.has(`q:${q},r:${r},y:${y}`)) return y;
    }
    return -1;
  }

  function canPlaceTileAtHeight(q, r, yLevel) {
    if (!isWithinHexGrid(q, r)) return false;
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

  function getPlacementCountForInstance(instanceId) {
    if (!instanceId) return 0;
    let count = 0;
    placedTiles.forEach((tile) => {
      if (tile.instanceId === instanceId) {
        count += 1;
      }
    });
    return count;
  }

  function getPlacementCountForBiome(biomeId) {
    if (!biomeId) return 0;
    let count = 0;
    placedTiles.forEach((tile) => {
      if (tile.biomeId === biomeId) {
        count += 1;
      }
    });
    return count;
  }

  // =========================
  // EXISTING FUNCTIONS (copied from original)
  // =========================
  function loadAssets() {
    // Register all assets that need to be loaded (expanded to include more biome sets)
    registerAsset('hex-tile-model', 'Hexagonal Tile Model', 'model');
    registerAsset('fonts-interface', 'Interface Fonts', 'font');
    registerAsset('icons-ui', 'UI Icons', 'icons');
    
    // Grassland biome textures
    registerAsset('textures-grassland-plain', 'Grassland Textures - Plains', 'texture');
    registerAsset('textures-grassland-streams', 'Grassland Textures - Streams', 'texture');
    registerAsset('textures-grassland-forest', 'Grassland Textures - Forest', 'texture');
    
    // Barrenland biome textures
    registerAsset('textures-barrenland-earth', 'Barrenland Textures - Earth', 'texture');
    registerAsset('textures-barrenland-streams', 'Barrenland Textures - Streams', 'texture');
    registerAsset('textures-barrenland-forest', 'Barrenland Textures - Forest', 'texture');
    
    // Mountain biome textures
    registerAsset('textures-mountain-stone', 'Mountain Textures - Stone', 'texture');
    registerAsset('textures-mountain-streams', 'Mountain Textures - Streams & Forest', 'texture');
    
    // Oceanic biome textures
    registerAsset('textures-oceanic-water', 'Oceanic Textures - Water', 'texture');
    registerAsset('textures-oceanic-coastal', 'Oceanic Textures - Coastal', 'texture');
    registerAsset('textures-oceanic-tropical', 'Oceanic Textures - Tropical Island', 'texture');
    
    // Desert biome textures
    registerAsset('textures-desert-sand', 'Desert Textures - Sand', 'texture');
    registerAsset('textures-desert-tracks', 'Desert Textures - Tracks & Ridgelines', 'texture');
    registerAsset('textures-desert-oases', 'Desert Textures - Oases & Ruins', 'texture');
    
    // Arctic biome textures
    registerAsset('textures-arctic-snow', 'Arctic Textures - Snow', 'texture');
    registerAsset('textures-arctic-forest', 'Arctic Textures - Frozen Forest', 'texture');
    registerAsset('textures-arctic-ice', 'Arctic Textures - Ice & Rocks', 'texture');
    
    // Volcano biome textures
    registerAsset('textures-volcano-basalt', 'Volcano Textures - Basalt', 'texture');
    registerAsset('textures-volcano-crater', 'Volcano Textures - Crater', 'texture');
    registerAsset('textures-volcano-lava', 'Volcano Textures - Lava Flows', 'texture');
    
    // Marshland biome textures
    registerAsset('textures-marsh-marsh', 'Marshland Textures - Marsh', 'texture');
    registerAsset('textures-marsh-swamp', 'Marshland Textures - Swamp & Streams', 'texture');
    registerAsset('textures-marsh-forest', 'Marshland Textures - Fetid Forest', 'texture');
    
    // Load hex tile model with tracking
    loadHexTileModel({ 
      url: 'models/hex_tile.gltf',
      assetId: 'hex-tile-model',
      assetName: 'Hexagonal Tile Model'
    })
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
        
        // Simulate loading other assets for demo
        simulateAssetLoading();
      })
      .catch((err) => {
        console.error('GLTF load error', err);
        showNotification({
          type: 'error',
          title: 'Failed to load 3D model',
          message: 'There was an error loading the hex tile model. Please try refreshing the page.',
          duration: 0
        });
      });
  }

  function simulateAssetLoading() {
    // Simulate progressive loading of other assets with realistic delays
    const assets = [
      { id: 'fonts-interface', delay: 150 },
      { id: 'icons-ui', delay: 300 },
      
      // Grassland biome (core set)
      { id: 'textures-grassland-plain', delay: 500 },
      { id: 'textures-grassland-streams', delay: 650 },
      { id: 'textures-grassland-forest', delay: 800 },
      
      // Barrenland biome
      { id: 'textures-barrenland-earth', delay: 950 },
      { id: 'textures-barrenland-streams', delay: 1100 },
      { id: 'textures-barrenland-forest', delay: 1250 },
      
      // Mountain biome
      { id: 'textures-mountain-stone', delay: 1400 },
      { id: 'textures-mountain-streams', delay: 1550 },
      
      // Oceanic biome
      { id: 'textures-oceanic-water', delay: 1700 },
      { id: 'textures-oceanic-coastal', delay: 1850 },
      { id: 'textures-oceanic-tropical', delay: 2000 },
      
      // Desert biome
      { id: 'textures-desert-sand', delay: 2150 },
      { id: 'textures-desert-tracks', delay: 2300 },
      { id: 'textures-desert-oases', delay: 2450 },
      
      // Arctic biome
      { id: 'textures-arctic-snow', delay: 2600 },
      { id: 'textures-arctic-forest', delay: 2750 },
      { id: 'textures-arctic-ice', delay: 2900 },
      
      // Volcano biome
      { id: 'textures-volcano-basalt', delay: 3050 },
      { id: 'textures-volcano-crater', delay: 3200 },
      { id: 'textures-volcano-lava', delay: 3350 },
      
      // Marshland biome
      { id: 'textures-marsh-marsh', delay: 3500 },
      { id: 'textures-marsh-swamp', delay: 3650 },
      { id: 'textures-marsh-forest', delay: 3800 }
    ];

    assets.forEach(asset => {
      setTimeout(() => {
        assetLoadingManager.markAssetLoaded(asset.id);
      }, asset.delay);
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

  function calculateMapBoundingInfo() {
    mapBoundsMin.set(Infinity, Infinity, Infinity);
    mapBoundsMax.set(-Infinity, -Infinity, -Infinity);
    let hasTiles = false;

    placedTiles.forEach((tile) => {
      const obj = tile?.object;
      if (!obj) return;
      hasTiles = true;
      mapTempVec.copy(obj.position);
      mapBoundsMin.min(mapTempVec);
      mapBoundsMax.max(mapTempVec);

      const tileTop = obj.position.y + tileHeight;
      if (tileTop > mapBoundsMax.y) mapBoundsMax.y = tileTop;
      if (obj.position.y < mapBoundsMin.y) mapBoundsMin.y = obj.position.y;
    });

    if (!hasTiles) {
      let fallbackRadius = Math.max(mapSpan * 0.55, hexSize * 8);
      let focusX = 0;
      let focusZ = 0;

      if (boardBoundsInitialized) {
        const halfWidth = (boardBounds.maxX - boardBounds.minX) * 0.5;
        const halfDepth = (boardBounds.maxZ - boardBounds.minZ) * 0.5;
        const halfDiagonal = Math.sqrt(halfWidth * halfWidth + halfDepth * halfDepth);
        fallbackRadius = Math.max(halfDiagonal, halfWidth, halfDepth, hexSize * 6);
        focusX = boardBounds.center.x;
        focusZ = boardBounds.center.z;
      }

      const marginScalar = Math.max(CAMERA_TARGET_MARGIN_X, CAMERA_TARGET_MARGIN_Z);
      const effectiveRadius = fallbackRadius + marginScalar;
      const fallbackHeight = Math.max(tileHeight * 6, effectiveRadius * 0.6);
      const focus = new THREE.Vector3(focusX, tileHeight * 0.5, focusZ);
      const center = new THREE.Vector3(focusX, fallbackHeight * 0.5, focusZ);
      const bounds = {
        hasTiles: false,
        radius: effectiveRadius,
        planeRadius: fallbackRadius,
        verticalExtent: fallbackHeight,
        minY: 0,
        maxY: fallbackHeight,
        target: focus,
        center
      };
      syncOrbitLimits(bounds);
      return bounds;
    }

    const horizontalMargin = hexSize * 1.8;
    mapBoundsMin.x -= horizontalMargin;
    mapBoundsMin.z -= horizontalMargin;
    mapBoundsMax.x += horizontalMargin;
    mapBoundsMax.z += horizontalMargin;

    mapBoundsMin.y = Math.min(mapBoundsMin.y, 0);
    mapBoundsMax.y += tileHeight * 1.5;

    const centerX = (mapBoundsMin.x + mapBoundsMax.x) * 0.5;
    const centerZ = (mapBoundsMin.z + mapBoundsMax.z) * 0.5;
    const centerY = (mapBoundsMin.y + mapBoundsMax.y) * 0.5;

    mapBoundsCenter.set(centerX, centerY, centerZ);

    const verticalExtent = Math.max(mapBoundsMax.y - mapBoundsMin.y, tileHeight * 2);
    const planeWidth = Math.max(mapBoundsMax.x - mapBoundsMin.x, hexSize * 2);
    const planeDepth = Math.max(mapBoundsMax.z - mapBoundsMin.z, hexSize * 2);
    const planeRadius = Math.max(planeWidth, planeDepth) * 0.5;

    const unclampedFocusY = mapBoundsMin.y + verticalExtent * 0.55;
    const focusY = Math.max(
      mapBoundsMin.y,
      Math.min(mapBoundsMax.y - tileHeight * 0.6, unclampedFocusY)
    );
    const focus = new THREE.Vector3(centerX, focusY, centerZ);

    mapBoundsRadiusCenter.set(centerX, centerY, centerZ);
    let maxDistSq = 0;
    placedTiles.forEach((tile) => {
      const obj = tile?.object;
      if (!obj) return;
      mapTempVec.set(obj.position.x, obj.position.y + tileHeight * 0.5, obj.position.z);
      mapTempVec.sub(mapBoundsRadiusCenter);
      maxDistSq = Math.max(maxDistSq, mapTempVec.lengthSq());
    });

    const radius = Math.max(Math.sqrt(maxDistSq) + Math.max(hexSize, tileHeight) * 1.2, planeRadius, verticalExtent * 0.5);

    const bounds = {
      hasTiles: true,
      radius,
      planeRadius,
      verticalExtent,
      minY: mapBoundsMin.y,
      maxY: mapBoundsMax.y,
      target: focus,
      center: mapBoundsCenter.clone()
    };
    syncOrbitLimits(bounds);
    return bounds;
  }

  function computeFitDistance(radius, fovVertical, aspect, { margin = 1.15, minDistance = 12 } = {}) {
    const safeRadius = Math.max(radius, hexSize * 1.2);
    const halfFov = fovVertical * 0.5;
    const verticalDistance = safeRadius / Math.sin(Math.max(0.1, Math.min(Math.PI / 2 - 0.01, halfFov)));
    const horizontalFov = 2 * Math.atan(Math.tan(halfFov) * aspect);
    const horizontalDistance = safeRadius / Math.sin(Math.max(0.1, Math.min(Math.PI / 2 - 0.01, horizontalFov * 0.5)));
    return Math.max(verticalDistance, horizontalDistance, minDistance) * margin;
  }

  function syncOrbitLimits(bounds) {
    if (!bounds || !controls) return;
    const dom = renderer?.domElement;
    const width = dom?.clientWidth || window.innerWidth || 1;
    const height = dom?.clientHeight || window.innerHeight || 1;
    const aspect = Math.max(width / Math.max(height, 1), 0.1);
    const fovVertical = THREE.MathUtils.degToRad(camera.fov);
    const fitDistance = computeFitDistance(bounds.radius, fovVertical, aspect, {
      margin: 1.1,
      minDistance: ORBIT_MIN_DISTANCE
    });
    const lateralPadding = Math.max(bounds.planeRadius * 0.45, hexSize * 8);
    const desiredMax = Math.max(
      ORBIT_MAX_DISTANCE,
      (fitDistance + lateralPadding) * ORBIT_DISTANCE_MULTIPLIER
    );
    controls.maxDistance = desiredMax;
    if (Number.isFinite(controls.minDistance) && controls.minDistance >= desiredMax) {
      controls.minDistance = Math.max(ORBIT_MIN_DISTANCE, desiredMax * 0.35);
    }
  }

  function enforceCameraBounds() {
    if (!boardBoundsInitialized) return;

    if (firstPersonState.active) {
      clampVectorToBoard(camera.position, FIRST_PERSON_MARGIN_X, FIRST_PERSON_MARGIN_Z);
      return;
    }

    let controlsAdjusted = false;

    const prevTargetX = controls.target.x;
    const prevTargetZ = controls.target.z;
    if (clampVectorToBoard(controls.target, CAMERA_TARGET_MARGIN_X, CAMERA_TARGET_MARGIN_Z)) {
      const deltaX = controls.target.x - prevTargetX;
      const deltaZ = controls.target.z - prevTargetZ;
      camera.position.x += deltaX;
      camera.position.z += deltaZ;
      controlsAdjusted = true;
    }

    if (clampVectorToBoard(camera.position, CAMERA_POSITION_MARGIN_X, CAMERA_POSITION_MARGIN_Z)) {
      controlsAdjusted = true;
    }

    const maxDistance = controls.maxDistance;
    const minDistance = controls.minDistance;
    const polarLimit = controls.maxPolarAngle;
    const shouldClampOrbit = (Number.isFinite(maxDistance) && maxDistance > 0)
      || (Number.isFinite(minDistance) && minDistance > 0)
      || (Number.isFinite(polarLimit) && polarLimit > 0 && polarLimit < Math.PI);

    if (shouldClampOrbit) {
      orbitClampOffset.copy(camera.position).sub(controls.target);
      let mutated = false;
      let distance = orbitClampOffset.length();

      if (Number.isFinite(maxDistance) && maxDistance > 0 && distance > maxDistance) {
        orbitClampOffset.setLength(maxDistance);
        distance = maxDistance;
        mutated = true;
      }

      if (Number.isFinite(minDistance) && minDistance > 0 && distance < minDistance) {
        orbitClampOffset.setLength(minDistance);
        distance = minDistance;
        mutated = true;
      }

      if (Number.isFinite(polarLimit) && polarLimit > 0 && polarLimit < Math.PI) {
        scratchOrbitClamp.setFromVector3(orbitClampOffset);
        if (scratchOrbitClamp.phi > polarLimit) {
          scratchOrbitClamp.phi = polarLimit;
          orbitClampOffset.setFromSpherical(scratchOrbitClamp);
          mutated = true;
        }
      }

      if (mutated) {
        camera.position.copy(controls.target).add(orbitClampOffset);
        controlsAdjusted = true;
      }
    }

    if (controlsAdjusted && controls.enabled) {
      controls.update();
    }
  }

  function createPositionFromAngles(target, distance, { elevationDeg, azimuthDeg }) {
    const elevation = THREE.MathUtils.degToRad(elevationDeg);
    const azimuth = THREE.MathUtils.degToRad(azimuthDeg);
    const phi = Math.max(0.0001, Math.min(Math.PI - 0.0001, Math.PI / 2 - elevation));
    const theta = azimuth;
    const spherical = new THREE.Spherical(distance, phi, theta);
    const position = new THREE.Vector3().setFromSpherical(spherical);
    return position.add(target);
  }

  function resolveCameraPreset(presetName) {
    const bounds = calculateMapBoundingInfo();
    const canvas = renderer?.domElement;
    const width = canvas?.clientWidth || window.innerWidth || 1;
    const height = canvas?.clientHeight || window.innerHeight || 1;
    const aspect = Math.max(width / height, 0.1);
    const fovVertical = THREE.MathUtils.degToRad(camera.fov);

    switch (presetName) {
      case 'default': {
        const distance = computeFitDistance(bounds.radius, fovVertical, aspect, { margin: 0.98, minDistance: 8 });
        const position = createPositionFromAngles(bounds.target, distance, { elevationDeg: 32, azimuthDeg: 0 });
        return {
          position,
          target: bounds.target.clone(),
          up: defaultUpVector,
          duration: 0.65
        };
      }
      case 'top': {
        const planeRadius = Math.max(bounds.planeRadius, hexSize * 2);
        const verticalPadding = Math.max(bounds.verticalExtent * 0.6, tileHeight * 4);
        const heightAbove = Math.max(
          planeRadius / Math.tan(Math.max(0.35, fovVertical * 0.5)) * 1.05,
          planeRadius * 1.1
        ) + verticalPadding;
        const position = new THREE.Vector3(
          bounds.target.x + 0.0001,
          bounds.target.y + heightAbove,
          bounds.target.z + 0.0001
        );
        return {
          position,
          target: bounds.target.clone(),
          up: topDownUpVector,
          duration: 0.7
        };
      }
      case 'front': {
        const flip = orbitFlipState.front >= 0 ? 0 : 180;
        const distance = computeFitDistance(bounds.radius, fovVertical, aspect, { margin: 1.25, minDistance: 12 });
        const position = createPositionFromAngles(bounds.target, distance, { elevationDeg: 24, azimuthDeg: flip });
        return {
          position,
          target: bounds.target.clone(),
          up: defaultUpVector,
          duration: 0.6
        };
      }
      case 'side': {
        const flip = orbitFlipState.side >= 0 ? 90 : -90;
        const distance = computeFitDistance(bounds.radius, fovVertical, aspect, { margin: 1.25, minDistance: 12 });
        const position = createPositionFromAngles(bounds.target, distance, { elevationDeg: 24, azimuthDeg: flip });
        return {
          position,
          target: bounds.target.clone(),
          up: defaultUpVector,
          duration: 0.6
        };
      }
      case 'isometric': {
        const distance = computeFitDistance(bounds.radius, fovVertical, aspect, { margin: 1.15, minDistance: 12 });
        const position = createPositionFromAngles(bounds.target, distance, { elevationDeg: 58, azimuthDeg: 45 });
        return {
          position,
          target: bounds.target.clone(),
          up: defaultUpVector,
          duration: 0.65
        };
      }
      default:
        appLog.warn(`Unknown camera preset requested: ${presetName}`);
        return null;
    }
  }

  function moveCameraTo(config, { immediate = false, duration } = {}) {
    if (!config) return;
    const { position, target, up = new THREE.Vector3(0, 1, 0) } = config;
    const travelDuration = typeof duration === 'number' ? duration : (config.duration ?? 0.65);

    if (cameraTransitionState.animationId !== null) {
      cancelAnimationFrame(cameraTransitionState.animationId);
      cameraTransitionState.animationId = null;
    }

    if (immediate || travelDuration <= 0) {
      camera.position.copy(position);
      controls.target.copy(target);
      camera.up.copy(up);
      enforceCameraBounds();
      controls.update();
      return;
    }

    cameraStartPos.copy(camera.position);
    cameraStartTarget.copy(controls.target);
    cameraStartUp.copy(camera.up);

    const targetPosition = position.clone();
    const targetTarget = target.clone();
    const targetUp = up.clone();

    let startTime = null;

    const step = (timestamp) => {
      if (startTime === null) startTime = timestamp;
      const elapsed = (timestamp - startTime) / 1000;
      const t = Math.min(Math.max(elapsed / travelDuration, 0), 1);
      const eased = easeOutCubic(t);

      cameraPositionBuffer.lerpVectors(cameraStartPos, targetPosition, eased);
      cameraTargetBuffer.lerpVectors(cameraStartTarget, targetTarget, eased);
      cameraUpBuffer.lerpVectors(cameraStartUp, targetUp, eased);

      camera.position.copy(cameraPositionBuffer);
      controls.target.copy(cameraTargetBuffer);
      camera.up.copy(cameraUpBuffer);

      controls.update();
      enforceCameraBounds();

      if (t < 1) {
        cameraTransitionState.animationId = requestAnimationFrame(step);
      } else {
        cameraTransitionState.animationId = null;
        controls.update();
        enforceCameraBounds();
      }
    };

    cameraTransitionState.animationId = requestAnimationFrame(step);
  }

  function orbitCameraTo(config, { duration } = {}) {
    if (!config) return;

    const travelDuration = duration ?? config.duration ?? 0.75;
    if (travelDuration <= 0) {
      moveCameraTo(config, { immediate: true });
      return;
    }

    if (cameraTransitionState.animationId !== null) {
      cancelAnimationFrame(cameraTransitionState.animationId);
      cameraTransitionState.animationId = null;
    }

    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const startUp = camera.up.clone();

    const endPos = config.position.clone();
    const endTarget = config.target.clone();
    const endUp = config.up?.clone?.() ?? defaultUpVector.clone();

    scratchSpherical.setFromVector3(startPos.clone().sub(startTarget));
    scratchSphericalEnd.setFromVector3(endPos.clone().sub(endTarget));

    let deltaTheta = scratchSphericalEnd.theta - scratchSpherical.theta;
    while (deltaTheta > Math.PI) deltaTheta -= Math.PI * 2;
    while (deltaTheta < -Math.PI) deltaTheta += Math.PI * 2;

    let deltaPhi = scratchSphericalEnd.phi - scratchSpherical.phi;
    while (deltaPhi > Math.PI) deltaPhi -= Math.PI * 2;
    while (deltaPhi < -Math.PI) deltaPhi += Math.PI * 2;

    const startRadius = scratchSpherical.radius;
    const endRadius = scratchSphericalEnd.radius;

    let startTime = null;

    const step = (timestamp) => {
      if (startTime === null) startTime = timestamp;
      const elapsed = (timestamp - startTime) / 1000;
      const t = Math.min(Math.max(elapsed / travelDuration, 0), 1);
      const eased = easeInOutSine(t);

      const radius = THREE.MathUtils.lerp(startRadius, endRadius, eased);
      const theta = scratchSpherical.theta + deltaTheta * eased;
      const phi = scratchSpherical.phi + deltaPhi * eased;

      scratchTarget.copy(startTarget).lerp(endTarget, eased);
      scratchUp.copy(startUp).lerp(endUp, eased);

      orbitOffset.setFromSpherical(new THREE.Spherical(radius, phi, theta));

      camera.position.copy(scratchTarget).add(orbitOffset);
      controls.target.copy(scratchTarget);
      camera.up.copy(scratchUp);

      controls.update();
      enforceCameraBounds();

      if (t < 1) {
        cameraTransitionState.animationId = requestAnimationFrame(step);
      } else {
        cameraTransitionState.animationId = null;
        controls.update();
        enforceCameraBounds();
      }
    };

    cameraTransitionState.animationId = requestAnimationFrame(step);
  }

  function syncCameraButtonState() {
    if (!cameraButtons.length) return;
    cameraButtons.forEach((button) => {
      const preset = button.dataset?.cameraPreset;
      if (!preset) return;
      const shouldBeActive = firstPersonState.active
        ? preset === 'first-person'
        : preset === activeCameraPreset;
      button.classList.toggle('active', shouldBeActive);
      button.setAttribute('aria-pressed', shouldBeActive ? 'true' : 'false');
    });

    if (firstPersonHintElement) {
      firstPersonHintElement.classList.toggle('hidden', !firstPersonState.active);
    }
  }

  function applyCameraPreset(presetName, options = {}) {
    const {
      immediate = false,
      duration,
      skipButtonSync = false,
      animation = 'default'
    } = options;
    const config = resolveCameraPreset(presetName);
    if (!config) return;

    if (animation === 'orbit') {
      orbitCameraTo(config, { duration });
    } else {
      moveCameraTo(config, { immediate, duration });
    }
    activeCameraPreset = presetName;
    previousOrbitPreset = presetName;
    if (!skipButtonSync) {
      syncCameraButtonState();
    }
  }

  function animateOrbitFlip(presetName) {
    const config = resolveCameraPreset(presetName);
    if (!config) return;
    const flipDuration = (config.duration ?? 0.75) * 1.2;
    orbitCameraTo(config, { duration: flipDuration });
    activeCameraPreset = presetName;
    previousOrbitPreset = presetName;
    syncCameraButtonState();
  }

  function getFirstPersonStartPosition(bounds = calculateMapBoundingInfo()) {
    const forwardOffset = Math.max(bounds.planeRadius * 0.7, baseFirstPersonForwardOffset);
    const startY = Math.max(bounds.minY + baseFirstPersonHeight, baseFirstPersonHeight);
    const start = new THREE.Vector3(bounds.target.x, startY, bounds.target.z + forwardOffset);
    clampVectorToBoard(start, FIRST_PERSON_MARGIN_X, FIRST_PERSON_MARGIN_Z);
    return start;
  }

  function handlePointerLockChange() {
    const isLocked = document.pointerLockElement === renderer.domElement;
    firstPersonState.pointerLocked = isLocked;

    if (!isLocked) {
      if (firstPersonState.suppressUnlockHandler) {
        firstPersonState.suppressUnlockHandler = false;
        return;
      }
      if (firstPersonState.active) {
        const fallbackPreset = previousOrbitPreset || 'default';
        disableFirstPerson({ skipPointerUnlock: true });
        applyCameraPreset(fallbackPreset);
      }
    }
  }

  function handlePointerMove(event) {
    if (!firstPersonState.active || !firstPersonState.pointerLocked) return;

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    firstPersonState.yaw -= movementX * firstPersonState.sensitivity;
    firstPersonState.pitch -= movementY * firstPersonState.sensitivity;

    const maxPitch = Math.PI / 2 - 0.05;
    firstPersonState.pitch = Math.max(-maxPitch, Math.min(maxPitch, firstPersonState.pitch));

    firstPersonEuler.set(firstPersonState.pitch, firstPersonState.yaw, 0);
    camera.quaternion.setFromEuler(firstPersonEuler);
  }

  function handleFirstPersonKeyDown(event) {
    if (!firstPersonState.active) return;

    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        firstPersonState.moveForward = true;
        event.preventDefault();
        break;
      case 'KeyS':
      case 'ArrowDown':
        firstPersonState.moveBackward = true;
        event.preventDefault();
        break;
      case 'KeyA':
      case 'ArrowLeft':
        firstPersonState.moveLeft = true;
        event.preventDefault();
        break;
      case 'KeyD':
      case 'ArrowRight':
        firstPersonState.moveRight = true;
        event.preventDefault();
        break;
      case 'Space':
        firstPersonState.moveUp = true;
        event.preventDefault();
        break;
      case 'ControlLeft':
      case 'ControlRight':
        firstPersonState.moveDown = true;
        event.preventDefault();
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        firstPersonState.sprint = true;
        break;
      case 'KeyF':
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        disableFirstPerson();
        appLog.log('🚪 Exiting first-person mode via ' + event.code);
        break;
      case 'KeyP':
        if (typeof captureCurrentView === 'function') {
          event.preventDefault();
          event.stopPropagation();
          captureCurrentView();
        }
        break;
      default:
        break;
    }
  }

  function handleFirstPersonKeyUp(event) {
    if (!firstPersonState.active) return;

    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        firstPersonState.moveForward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        firstPersonState.moveBackward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        firstPersonState.moveLeft = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        firstPersonState.moveRight = false;
        break;
      case 'Space':
        firstPersonState.moveUp = false;
        break;
      case 'ControlLeft':
      case 'ControlRight':
        firstPersonState.moveDown = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        firstPersonState.sprint = false;
        break;
      default:
        break;
    }
  }

  function resolveFirstPersonCollisions(position) {
    const cameraFeetY = position.y - CAMERA_BODY_HEIGHT;
    const cameraHeadY = position.y + CAMERA_VERTICAL_PADDING;
    const cameraRadius = CAMERA_COLLISION_RADIUS;
    const minHorizontalDistance = (hexSize * 0.95) + cameraRadius;
    const minHorizontalDistanceSq = minHorizontalDistance * minHorizontalDistance;

    placedTiles.forEach((tile) => {
      const obj = tile?.object;
      if (!obj) return;

      const tileBottom = obj.position.y - tileHeight * 0.3;
      const tileTop = obj.position.y + tileHeight * 1.2;

      if (cameraFeetY > tileTop + CAMERA_VERTICAL_SOFT_LIMIT) return;
      if (cameraHeadY < tileBottom - CAMERA_VERTICAL_SOFT_LIMIT) return;

      const dx = position.x - obj.position.x;
      const dz = position.z - obj.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq >= minHorizontalDistanceSq) return;

      const dist = Math.sqrt(distSq) || 0.0001;
      const push = minHorizontalDistance - dist;
      collisionOffset.set(dx / dist, 0, dz / dist).multiplyScalar(push);
      position.add(collisionOffset);
    });
  }

  function updateFirstPerson(delta) {
    if (!firstPersonState.active) return;

    const sprintMultiplier = firstPersonState.sprint ? firstPersonState.sprintMultiplier : 1;
    const baseSpeed = firstPersonState.baseSpeed * sprintMultiplier;
    const horizontalSpeed = baseSpeed * delta;
    const verticalSpeed = baseSpeed * 0.65 * delta;

    cameraForwardVector.set(0, 0, -1).applyQuaternion(camera.quaternion);
    cameraForwardVector.y = 0;
    if (cameraForwardVector.lengthSq() > 0.0001) {
      cameraForwardVector.normalize();
    }

    cameraRightVector.copy(cameraForwardVector).cross(upAxis);
    if (cameraRightVector.lengthSq() > 0.0001) {
      cameraRightVector.normalize();
    } else {
      cameraRightVector.set(1, 0, 0);
    }

    firstPersonMoveVector.set(0, 0, 0);
    if (firstPersonState.moveForward) firstPersonMoveVector.add(cameraForwardVector);
    if (firstPersonState.moveBackward) firstPersonMoveVector.sub(cameraForwardVector);
    if (firstPersonState.moveRight) firstPersonMoveVector.add(cameraRightVector);
    if (firstPersonState.moveLeft) firstPersonMoveVector.sub(cameraRightVector);

    if (firstPersonMoveVector.lengthSq() > 0) {
      firstPersonMoveVector.normalize().multiplyScalar(horizontalSpeed);
      firstPersonHorizontalMove.copy(firstPersonMoveVector);
      firstPersonDesiredPosition.copy(camera.position).add(firstPersonHorizontalMove);
      resolveFirstPersonCollisions(firstPersonDesiredPosition);
      camera.position.copy(firstPersonDesiredPosition);
    }

    let verticalDelta = 0;
    if (firstPersonState.moveUp) verticalDelta += verticalSpeed;
    if (firstPersonState.moveDown) verticalDelta -= verticalSpeed;
    if (verticalDelta !== 0) {
      camera.position.y += verticalDelta;
      resolveFirstPersonCollisions(camera.position);
    }

    camera.position.y = Math.max(firstPersonState.minHeight, camera.position.y);
    clampVectorToBoard(camera.position, FIRST_PERSON_MARGIN_X, FIRST_PERSON_MARGIN_Z);
  }

  function disableFirstPerson({ skipPointerUnlock = false } = {}) {
    if (!firstPersonState.active) return;

    firstPersonState.active = false;
    firstPersonState.moveForward = false;
    firstPersonState.moveBackward = false;
    firstPersonState.moveLeft = false;
    firstPersonState.moveRight = false;
    firstPersonState.moveUp = false;
    firstPersonState.moveDown = false;
    firstPersonState.sprint = false;
    firstPersonState.pointerLocked = false;

  activeCameraPreset = previousOrbitPreset || 'default';

    controls.enabled = true;
    document.body?.classList.remove('camera-first-person');
    document.removeEventListener('pointerlockchange', handlePointerLockChange);
    document.removeEventListener('mousemove', handlePointerMove);
    window.removeEventListener('keydown', handleFirstPersonKeyDown, true);
    window.removeEventListener('keyup', handleFirstPersonKeyUp, true);

    if (!skipPointerUnlock && document.pointerLockElement === renderer.domElement) {
      firstPersonState.suppressUnlockHandler = true;
      document.exitPointerLock?.();
    }

    controls.update();
    syncCameraButtonState();
  }

  function enterFirstPerson() {
    if (firstPersonState.active) return;

    previousOrbitPreset = activeCameraPreset || previousOrbitPreset || 'default';
    firstPersonState.active = true;
    firstPersonState.pointerLocked = false;
    activeCameraPreset = 'first-person';

    const bounds = calculateMapBoundingInfo();
    firstPersonState.baseSpeed = Math.max(8, bounds.planeRadius * 0.9);
    firstPersonState.minHeight = Math.max(bounds.minY + 0.4, 0.35);

    const startPosition = getFirstPersonStartPosition(bounds);
    camera.position.copy(startPosition);

  const lookTarget = bounds.target.clone();
  lookTarget.y = Math.max(bounds.minY + tileHeight * 0.5, bounds.minY + tileHeight);
    camera.lookAt(lookTarget);

    firstPersonEuler.setFromQuaternion(camera.quaternion, 'YXZ');
    firstPersonState.pitch = firstPersonEuler.x;
    firstPersonState.yaw = firstPersonEuler.y;

    controls.enabled = false;
    document.body?.classList.add('camera-first-person');
    syncCameraButtonState();

  lastMouseEvent = null;

    document.addEventListener('pointerlockchange', handlePointerLockChange);
    document.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('keydown', handleFirstPersonKeyDown, true);
    window.addEventListener('keyup', handleFirstPersonKeyUp, true);

    renderer.domElement.requestPointerLock?.();
  }

  function handleCameraPresetSelection(presetName) {
    if (presetName === 'first-person') {
      if (firstPersonState.active) {
        disableFirstPerson();
        applyCameraPreset(previousOrbitPreset || 'default');
      } else {
        enterFirstPerson();
      }
      return;
    }

    if (firstPersonState.active) {
      disableFirstPerson();
    }

    if (presetName === 'front') {
      if (activeCameraPreset === 'front') {
        orbitFlipState.front *= -1;
        animateOrbitFlip('front');
        return;
      }
      orbitFlipState.front = 1;
    } else if (presetName === 'side') {
      if (activeCameraPreset === 'side') {
        orbitFlipState.side *= -1;
        animateOrbitFlip('side');
        return;
      }
      orbitFlipState.side = 1;
    }

    applyCameraPreset(presetName);
  }

  function setupCameraPresetButtons() {
    const toolbar = document.getElementById('camera-toolbar');
    if (!toolbar) {
      appLog.warn('Camera toolbar element not found');
      return;
    }

    cameraButtons = Array.from(toolbar.querySelectorAll('[data-camera-preset]'));
    firstPersonHintElement = document.getElementById('first-person-hint');

    cameraButtons.forEach((button) => {
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        const presetName = button.dataset?.cameraPreset;
        if (!presetName) return;
        handleCameraPresetSelection(presetName);
      });
    });

    syncCameraButtonState();
  }

  // =========================
  // LAYER VIEW CONTROLS
  // =========================
  function parseYLevelFromKey(key, tileData) {
    if (tileData?.yLevel !== undefined && tileData.yLevel !== null) {
      return tileData.yLevel;
    }
    const match = key.match(/y:(-?\d+)/);
    if (!match) return 0;
    const parsed = Number.parseInt(match[1], 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function applyMaterialLayerMode(material, mode) {
    if (!material) return material;

    let working = material;
    if (!working.userData) working.userData = {};

    if (working.userData.layerFilterBaseOpacity === undefined) {
      working = working.clone();
      if (!working.userData) working.userData = {};
      working.userData.layerFilterBaseOpacity = working.opacity ?? 1;
      working.userData.layerFilterOriginalDepthWrite = working.depthWrite;
      working.userData.layerFilterOriginalTransparent = working.transparent;
    }

    const baseOpacity = working.userData.layerFilterBaseOpacity ?? 1;
    if (mode === 'dim') {
      const dimOpacity = Math.max(DIMMED_LAYER_OPACITY, baseOpacity * DIMMED_LAYER_OPACITY);
      working.opacity = dimOpacity;
      working.transparent = true;
      working.depthWrite = false;
    } else {
      working.opacity = baseOpacity;
      const originalTransparent = working.userData.layerFilterOriginalTransparent ?? (baseOpacity < 1);
      working.transparent = originalTransparent || working.opacity < 0.999;
      if (working.userData.layerFilterOriginalDepthWrite !== undefined) {
        working.depthWrite = working.userData.layerFilterOriginalDepthWrite;
      }
    }

    working.needsUpdate = true;
    return working;
  }

  function updateChildLayerAppearance(child, mode) {
    if (!child.isMesh) return;
    if (Array.isArray(child.material)) {
      child.material = child.material.map((mat) => applyMaterialLayerMode(mat, mode));
    } else if (child.material) {
      child.material = applyMaterialLayerMode(child.material, mode);
    }
  }

  function applyLayerModeToTile(tileObject, mode) {
    if (!tileObject) return;
    tileObject.visible = true;
    tileObject.traverse((child) => updateChildLayerAppearance(child, mode));
  }

  function getLayersWithTiles() {
    if (placedTiles.size === 0) return [];
    const layers = new Set();
    placedTiles.forEach((tile, key) => {
      layers.add(parseYLevelFromKey(key, tile));
    });
    return Array.from(layers).sort((a, b) => a - b);
  }

  function showTemporaryViewMessage(message, duration = 2000) {
    const { status } = viewControls;
    if (!status) return;

    if (viewControls.messageTimeout) {
      window.clearTimeout(viewControls.messageTimeout);
      viewControls.messageTimeout = null;
    }

    status.textContent = message;
    status.classList.add('view-status--flash');

    viewControls.messageTimeout = window.setTimeout(() => {
      status.classList.remove('view-status--flash');
      viewControls.messageTimeout = null;
      updateViewControls();
    }, duration);
  }

  function getSnapshotFilename() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    const y = now.getFullYear();
    const m = pad(now.getMonth() + 1);
    const d = pad(now.getDate());
    const hh = pad(now.getHours());
    const mm = pad(now.getMinutes());
    const ss = pad(now.getSeconds());
    return `lorescape-view-${y}${m}${d}-${hh}${mm}${ss}.png`;
  }

  function captureCurrentView() {
    if (!renderer?.domElement) {
      appLog.warn('📸 Renderer canvas not available for capture');
      showTemporaryViewMessage('Capture unavailable');
      return;
    }

    const ghostWasVisible = ghostTile?.visible ?? null;
    const highlightWasVisible = highlightHex?.visible ?? null;
    const restoreOverlayVisibility = () => {
      if (ghostTile && ghostWasVisible !== null) {
        ghostTile.visible = ghostWasVisible;
      }
      if (highlightHex && highlightWasVisible !== null) {
        highlightHex.visible = highlightWasVisible;
      }
    };

    if (ghostTile) ghostTile.visible = false;
    if (highlightHex) highlightHex.visible = false;

    let dataUrl = null;
    let captureError = null;
    try {
      renderer.render(scene, camera);
      dataUrl = renderer.domElement.toDataURL('image/png');
    } catch (error) {
      captureError = error;
      appLog.error('❌ Failed to capture canvas image', error);
    } finally {
      restoreOverlayVisibility();
      try {
        renderer.render(scene, camera);
      } catch (error) {
        appLog.warn('📸 Re-render after capture failed', error);
      }
    }

    if (captureError || !dataUrl) {
      if (!captureError && !dataUrl) {
        appLog.error('❌ Canvas capture returned empty data URL');
      }
      showTemporaryViewMessage('Capture failed');
      return;
    }

    const filename = getSnapshotFilename();
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    appLog.log(`📸 Saved snapshot as ${filename}`);
    showTemporaryViewMessage('Snapshot saved');
  }

  function updateViewControls({ layers } = {}) {
    const sortedLayers = layers ?? getLayersWithTiles();
    const {
      container,
      status,
      upButton,
      downButton,
      allButton,
      mobilePanel,
      mobileStatus,
      mobileUpButton,
      mobileDownButton,
      mobileAllButton
    } = viewControls;

    const statusLabel = (() => {
      if (sortedLayers.length === 0) return 'No layers';
      if (activeViewLayer === null) return 'All layers';
      return `Layer ${activeViewLayer + 1}`;
    })();

    if (status) {
      status.textContent = statusLabel;
    }

    if (mobileStatus) {
      mobileStatus.textContent = statusLabel;
    }

    const isIsolated = activeViewLayer !== null && sortedLayers.length > 0;

    if (container) {
      container.classList.toggle('view-toolbar--isolated', isIsolated);
    }

    if (mobilePanel) {
      mobilePanel.classList.toggle('mobile-view-panel--isolated', isIsolated);
    }

    const allLayersActive = activeViewLayer === null;

    if (allButton) {
      allButton.disabled = allLayersActive;
      allButton.classList.toggle('is-active', allLayersActive);
    }

    if (mobileAllButton) {
      mobileAllButton.disabled = allLayersActive;
      mobileAllButton.classList.toggle('is-active', allLayersActive);
      mobileAllButton.setAttribute('aria-pressed', allLayersActive ? 'true' : 'false');
    }

    let disableUp = true;
    let disableDown = true;

    if (sortedLayers.length > 0) {
      if (activeViewLayer === null) {
        disableUp = !sortedLayers.some((layer) => layer > currentYLevel);
        disableDown = !sortedLayers.some((layer) => layer <= currentYLevel);
      } else {
        const idx = sortedLayers.indexOf(activeViewLayer);
        disableUp = idx === -1 || idx === sortedLayers.length - 1;
        disableDown = idx <= 0;
      }
    }

    if (upButton) {
      upButton.disabled = disableUp;
    }

    if (downButton) {
      downButton.disabled = disableDown;
    }

    if (mobileUpButton) {
      mobileUpButton.disabled = disableUp;
    }

    if (mobileDownButton) {
      mobileDownButton.disabled = disableDown;
    }
  }

  function applyLayerVisibility(layers = null) {
    const sortedLayers = layers ?? getLayersWithTiles();

    if (sortedLayers.length === 0) {
      activeViewLayer = null;
    } else if (activeViewLayer !== null && !sortedLayers.includes(activeViewLayer)) {
      let fallback = null;
      for (let i = sortedLayers.length - 1; i >= 0; i -= 1) {
        if (sortedLayers[i] < activeViewLayer) {
          fallback = sortedLayers[i];
          break;
        }
      }
      if (fallback === null) {
        fallback = sortedLayers.find((layer) => layer > activeViewLayer) ?? sortedLayers[0];
      }
      activeViewLayer = fallback ?? null;
      if (activeViewLayer !== null) {
        currentYLevel = activeViewLayer;
        manualLevelOverride = true;
        updateLevelIndicator();
      }
    }

    placedTiles.forEach((tile, key) => {
      const tileObject = tile?.object;
      if (!tileObject) return;
      const tileLayer = parseYLevelFromKey(key, tile);
      const mode = activeViewLayer === null || tileLayer === activeViewLayer ? 'full' : 'dim';
      applyLayerModeToTile(tileObject, mode);
    });

    updateViewControls({ layers: sortedLayers });
  }

  function setCurrentYLevelValue(value, { syncView = true } = {}) {
    const normalized = Math.max(0, Math.floor(value));
    currentYLevel = normalized;
    if (syncView && activeViewLayer !== null) {
      activeViewLayer = normalized;
      manualLevelOverride = true;
      applyLayerVisibility();
    } else {
      updateViewControls();
    }
  }

  function setActiveViewLayer(layer) {
    if (layer === null || layer === undefined) {
      if (activeViewLayer === null) return;
      activeViewLayer = null;
      manualLevelOverride = false;
      applyLayerVisibility();
      updateLevelIndicator();
      refreshGhostTile();
      return;
    }

    const normalizedLayer = Math.max(0, Math.floor(layer));
    if (activeViewLayer === normalizedLayer) return;

    activeViewLayer = normalizedLayer;
    currentYLevel = normalizedLayer;
    manualLevelOverride = true;
    updateLevelIndicator();
    applyLayerVisibility();
    refreshGhostTile();
  }

  function shiftViewLayer(direction) {
    const layers = getLayersWithTiles();
    if (layers.length === 0) {
      setActiveViewLayer(null);
      return;
    }

    const step = direction >= 0 ? 1 : -1;
    let target = null;

    if (activeViewLayer === null) {
      if (step > 0) {
        target = layers.find((layer) => layer > currentYLevel) ?? null;
      } else {
        for (let i = layers.length - 1; i >= 0; i -= 1) {
          if (layers[i] <= currentYLevel) {
            target = layers[i];
            break;
          }
        }
        if (target === null || target === undefined) {
          target = layers[0];
        }
      }
    } else {
      const idx = layers.indexOf(activeViewLayer);
      if (idx !== -1) {
        const nextIdx = idx + step;
        if (nextIdx >= 0 && nextIdx < layers.length) {
          target = layers[nextIdx];
        }
      } else if (step > 0) {
        target = layers[0];
      } else {
        target = layers[layers.length - 1];
      }
    }

    if (target === null || target === undefined) {
      return;
    }

    setActiveViewLayer(target);
  }

  function setupLayerViewControls() {
    const container = document.getElementById('view-toolbar');
    if (!container) {
      appLog.warn('View toolbar element not found');
      return;
    }

    viewControls.container = container;
    viewControls.status = container.querySelector('#view-status');
    viewControls.upButton = container.querySelector('[data-layer-action="up"]');
    viewControls.downButton = container.querySelector('[data-layer-action="down"]');
    viewControls.allButton = container.querySelector('[data-layer-action="all"]');
    viewControls.captureButton = container.querySelector('#view-capture-btn');

    viewControls.upButton?.addEventListener('click', () => shiftViewLayer(1));
    viewControls.downButton?.addEventListener('click', () => shiftViewLayer(-1));
    viewControls.allButton?.addEventListener('click', () => setActiveViewLayer(null));
    viewControls.captureButton?.addEventListener('click', captureCurrentView);

    updateViewControls();
  }

  function setupOverlayControlStack() {
    const stack = document.getElementById('overlay-control-stack');
    if (!stack) {
      return;
    }

  const collapsedButtons = Array.from(stack.querySelectorAll('.control-pill'));
    const collapseButton = stack.querySelector('#overlay-control-collapse');
    const expanded = stack.querySelector('#overlay-control-expanded');
    const cameraToolbarEl = document.getElementById('camera-toolbar');
    const viewToolbarEl = document.getElementById('view-toolbar');

  stack.classList.add('is-collapsed');

    const focusTargets = {
      camera: () => cameraToolbarEl?.querySelector('.camera-btn'),
      view: () => viewToolbarEl?.querySelector('.view-btn')
    };

    const setExpandedState = (expandedState) => {
      stack.dataset.expanded = expandedState ? 'true' : 'false';
      expanded?.setAttribute('aria-hidden', expandedState ? 'false' : 'true');
      if (!expandedState) {
        collapsedButtons.forEach((button) => {
          button.classList.remove('is-active');
          button.setAttribute('aria-expanded', 'false');
        });
      }
    };

    const updateActiveSection = (section) => {
      // Show both toolbars when opened
      if (section === 'camera' || section === 'view') {
        if (cameraToolbarEl) cameraToolbarEl.style.display = 'flex';
        if (viewToolbarEl) viewToolbarEl.style.display = 'flex';
      }
      stack.dataset.openSection = section;
      collapsedButtons.forEach((button) => {
        const isActive = true; // Always active when open
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-expanded', !stack.classList.contains('is-collapsed') && isActive ? 'true' : 'false');
      });
    };

    const focusSection = (section) => {
      window.setTimeout(() => {
        const target = focusTargets[section]?.();
        target?.focus();
      }, 80);
    };

    const openStack = (section = 'camera') => {
      stack.classList.remove('is-collapsed');
      updateActiveSection(section);
      setExpandedState(true);
      focusSection(section);
    };

    const closeStack = () => {
      stack.classList.add('is-collapsed');
      setExpandedState(false);
      stack.removeAttribute('data-open-section');
      // Hide both toolbars
      if (cameraToolbarEl) cameraToolbarEl.style.display = 'none';
      if (viewToolbarEl) viewToolbarEl.style.display = 'none';
      window.setTimeout(() => {
        collapsedButtons[0]?.focus();
      }, 60);
    };

    collapsedButtons.forEach((button) => {
      const section = button.dataset.section || 'camera';
      button.addEventListener('click', () => {
        if (stack.classList.contains('is-collapsed')) {
          openStack(section);
        } else {
          // If already open, close it
          closeStack();
        }
      });
    });

    collapseButton?.addEventListener('click', closeStack);

    stack.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !stack.classList.contains('is-collapsed')) {
        event.preventDefault();
        closeStack();
      }
    });

    // Initialize - hide toolbars when collapsed
    if (cameraToolbarEl) cameraToolbarEl.style.display = 'none';
    if (viewToolbarEl) viewToolbarEl.style.display = 'none';

    setExpandedState(false);
  }

  function animate() {
    requestAnimationFrame(animate);
    const delta = cameraClock.getDelta();
    if (firstPersonState.active) {
      updateFirstPerson(delta);
    } else {
      controls.update();
    }
    enforceCameraBounds();
    renderer.render(scene, camera);
  }

  function updateLevelIndicator() {
    const indicator = document.getElementById('level-indicator');
    if (indicator) {
      let text = `Level: ${currentYLevel + 1}`;
      if (activeViewLayer !== null && activeViewLayer !== currentYLevel) {
        text += ` • View ${activeViewLayer + 1}`;
      }
      indicator.textContent = text;
    }
    updateViewControls();
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
    activeViewLayer = null;
    manualLevelOverride = false;
    applyLayerVisibility();
    updateLevelIndicator();
    refreshGhostTile();

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

  async function clearMap(options = {}) {
    const {
      skipConfirm = false,
      recordUndo = true
    } = options;

    if (placedTiles.size === 0) return;

    if (!skipConfirm && !(await showConfirm('Are you sure you want to clear the entire map?'))) {
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
    persistenceController.markShareDirty('map-cleared');

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
      showNotification({
        type: 'warning',
        title: 'Map name required',
        message: 'Please enter a map name before saving.',
        duration: 5000
      });
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

  async function shareMapOnlineToolbar() {
    await persistenceController.shareMapOnlineToolbar();
  }

  function handleShareButton(event) {
    if (event) {
      event.preventDefault?.();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
    }
    shareMapOnlineToolbar().catch((error) => {
      appLog.log('Share button handler caught error:', error);
    });
  }

  function fixExistingBiomeIds() {
    persistenceController.fixExistingBiomeIds();
  }

  async function handleInitialShareLoad() {
    if (shareLinkBootstrapHandled) {
      appLog.log('⏭️ Share load already handled, skipping');
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const shareId = params.get('share');
    if (!shareId) {
      shareLinkBootstrapHandled = true;
      return;
    }

    appLog.log(`🔗 Loading shared map: ${shareId}`);
    
    try {
      await persistenceController.loadMapFromShareId(shareId, {
        skipConfirm: true,
        showSummaryDialog: false,
        notify: true
      });
      shareLinkBootstrapHandled = true;
      
      // Remove share parameter from URL to prevent reload loop
      const url = new URL(window.location.href);
      url.searchParams.delete('share');
      window.history.replaceState({}, '', url.toString());
      appLog.log('✅ Shared map loaded and URL cleaned');
    } catch (error) {
      console.error('❌ Unable to load shared map from URL:', error);
      shareLinkBootstrapHandled = true;
      
      // Remove share parameter even on error to prevent reload loop
      const url = new URL(window.location.href);
      url.searchParams.delete('share');
      window.history.replaceState({}, '', url.toString());
      
      showNotification({
        type: 'error',
        title: 'Unable to load shared map',
        message: `There was an error loading the shared map: ${error.message}`,
        duration: 8000
      });
    }
  }

  // Placeholder functions for mouse events and stats
  function onPointerDown(event) { 
    if (isMobileViewerMode()) {
      return;
    }
    if (firstPersonState.active) {
      mouseDownTime = 0;
      return;
    }
    mouseDownTime = Date.now();
    mouseDownPosition = { x: event.clientX, y: event.clientY };
    isDragging = false;
    brushLastCellKey = null;
    brushLastTileKey = null;
    brushActiveLevel = null;
    brushCanResumeWithCache = false;
    brushFirstCellKey = null;

    if (event.button === 0 && event.shiftKey && placementMode === 'unlimited' && selectedTile && selectedTileInfo) {
      startBrushStroke();
      isDragging = true;
      const brushContext = computeBrushContext(event);
      if (brushContext) {
        tryBrushPlacementWithContext(brushContext);
      }
    } else {
      endBrushStroke();
    }
  }
  
  function onPointerUp(event) { 
    if (isMobileViewerMode()) {
      return;
    }
    if (firstPersonState.active) return;
    if (isBrushPainting) {
      endBrushStroke();
      mouseDownTime = 0;
      isDragging = false;
      return;
    }
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
    if (isMobileViewerMode()) {
      return;
    }
    if (firstPersonState.active) {
      return;
    }
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

    if (!isWithinHexGrid(finalQ, finalR)) {
      ghostTile.visible = false;
      if (highlightHex) highlightHex.visible = false;
      return;
    }

    if (lastHexCoords.q !== finalQ || lastHexCoords.r !== finalR) {
      lastHexCoords = { q: finalQ, r: finalR };
      if (activeViewLayer === null) {
        manualLevelOverride = false;
      }
    }

    if (!manualLevelOverride) {
      const smartLevel = getSmartLevel(finalQ, finalR, firstIntersect.point.y);
      if (smartLevel !== currentYLevel) {
        setCurrentYLevelValue(smartLevel, { syncView: false });
        updateLevelIndicator();
      }
    } else if (activeViewLayer !== null && currentYLevel !== activeViewLayer) {
      setCurrentYLevelValue(activeViewLayer, { syncView: false });
      updateLevelIndicator();
    }

  const maxAllowedHeight = getMaxAllowedHeight(finalQ, finalR);
  const effectiveYLevel = Math.min(currentYLevel, maxAllowedHeight);

    const x = hexSize * Math.sqrt(3) * (finalQ + finalR / 2);
    const z = hexSize * 1.5 * finalR;
  const y = levelToWorldY(effectiveYLevel);

    ghostTile.position.set(x, y, z);
    ghostTile.rotation.y = BASE_ROTATION_Y + currentRotation;
    ghostTile.rotation.x = BASE_ROTATION_X;
    ghostTile.scale.set(TILE_SCALE, TILE_SCALE, TILE_SCALE);
    ghostTile.visible = true;

    if (highlightHex) {
      highlightHex.position.set(x, 0.01, z);
      highlightHex.visible = true;
    }

    const tileKey = `q:${finalQ},r:${finalR},y:${effectiveYLevel}`;
    let canPlace = canPlaceTileAtHeight(finalQ, finalR, effectiveYLevel);
    let isOccupied = placedTiles.has(tileKey);
    const pointerHasPrimaryButton = (event.buttons & 1) === 1;

    if (isBrushPainting) {
      if (!pointerHasPrimaryButton) {
        endBrushStroke();
      } else if (!event.shiftKey || placementMode !== 'unlimited' || !selectedTile || !selectedTileInfo) {
        endBrushStroke({ preserveCache: true });
      } else {
        // Brush ignores ghost level, computes its own
        tryBrushPlacementAtHex(finalQ, finalR);
        isOccupied = placedTiles.has(tileKey);
        canPlace = canPlaceTileAtHeight(finalQ, finalR, effectiveYLevel);
      }
    } else if (placementMode === 'unlimited' && event.shiftKey && pointerHasPrimaryButton && selectedTile && selectedTileInfo) {
      startBrushStroke({ preserveCache: brushCanResumeWithCache });
      // Brush ignores ghost level, computes its own
      tryBrushPlacementAtHex(finalQ, finalR);
      isOccupied = placedTiles.has(tileKey);
      canPlace = canPlaceTileAtHeight(finalQ, finalR, effectiveYLevel);
    }

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

  function computeBrushContext(event) {
    if (!event) return null;
    const intersects = getIntersects(event);
    if (!intersects.length) return null;

    let firstIntersect = intersects[0];
    let obj = firstIntersect.object;
    while (obj.parent && !obj.userData.isGround && !obj.userData.isTile) obj = obj.parent;

    let target = firstIntersect.point;
    if (obj.userData.isTile) target = obj.position;

    const { q, r } = worldToAxial(target);
    const { q: finalQ, r: finalR } = axialRound(q, r);

    if (!isWithinHexGrid(finalQ, finalR)) {
      return null;
    }

    const maxAllowedHeight = getMaxAllowedHeight(finalQ, finalR);
    const effectiveYLevel = Math.min(currentYLevel, maxAllowedHeight);
    const tileKey = `q:${finalQ},r:${finalR},y:${effectiveYLevel}`;

    return {
      finalQ,
      finalR,
      effectiveYLevel,
      tileKey,
      canPlace: canPlaceTileAtHeight(finalQ, finalR, effectiveYLevel),
      isOccupied: placedTiles.has(tileKey)
    };
  }

  function tryBrushPlacementAtHex(q, r) {
    if (!isBrushPainting) return;
    if (placementMode !== 'unlimited') return;
    if (!selectedTile || !selectedTileInfo) return;
    if (!isWithinHexGrid(q, r)) return;
    
    const cellKey = `q:${q},r:${r}`;
    
    // Already painted this cell in current stroke
    if (brushPaintedCells.has(cellKey)) {
      appLog.log(`⏭️ Brush skip: ${cellKey} already painted in this stroke`);
      return;
    }
    
    // Same cell as last - skip to prevent double placement
    if (brushLastCellKey && brushLastCellKey === cellKey) {
      appLog.log(`⏭️ Brush skip: ${cellKey} same as last cell`);
      return;
    }
    
    // Must be adjacent to last cell (except for first cell)
    if (brushLastCellKey && !areCellKeysAdjacent(brushLastCellKey, cellKey)) {
      appLog.log(`⏭️ Brush skip: ${cellKey} not adjacent to ${brushLastCellKey}`);
      return;
    }
    
    // Compute the lowest available level for this cell
    const lowestLevel = getLowestPossibleLevel(q, r);
    if (!Number.isFinite(lowestLevel)) {
      appLog.log(`⚠️ Brush skip: no valid level found for ${cellKey}`);
      return;
    }
    
    // Set brush level on first placement only
    if (brushActiveLevel == null) {
      brushActiveLevel = lowestLevel;
      appLog.log(`🎨 Brush stroke started at level ${brushActiveLevel} for cell ${cellKey}`);
    }
    
    // Always use the locked brush level
    const targetLevel = brushActiveLevel;
    const targetTileKey = `q:${q},r:${r},y:${targetLevel}`;
    
    // Skip if this exact position is occupied
    if (placedTiles.has(targetTileKey)) {
      appLog.log(`⚠️ Brush skip: ${targetTileKey} already occupied`);
      return;
    }
    
    // Skip if placement rules forbid this level
    if (!canPlaceTileAtHeight(q, r, targetLevel)) {
      appLog.log(`⚠️ Brush skip: cannot place at ${targetTileKey} (placement rules)`);
      return;
    }
    
    // Mark as painted BEFORE placement to prevent race condition
    brushPaintedCells.add(cellKey);
    brushPaintedKeys.add(targetTileKey);
    
    appLog.log(`🔨 Attempting placement at ${targetTileKey}`);
    
    // Attempt placement
    const placementSucceeded = placeTileAtHex({ q, r }, targetLevel);
    
    if (!placementSucceeded) {
      // Rollback on failure
      brushPaintedCells.delete(cellKey);
      brushPaintedKeys.delete(targetTileKey);
      appLog.log(`❌ Brush placement failed at ${cellKey}`);
      return;
    }
    
    appLog.log(`✅ Brush painted ${targetTileKey}`);
    
    // Aggressively remove any tiles placed above target level
    let cleanedCount = 0;
    for (let scrubLevel = targetLevel + 1; scrubLevel <= targetLevel + 10; scrubLevel++) {
      const scrubKey = `q:${q},r:${r},y:${scrubLevel}`;
      if (placedTiles.has(scrubKey)) {
        appLog.log(`🧹 Removing unwanted tile at ${scrubKey}`);
        removeTileAtHex({ q, r }, scrubLevel);
        brushPaintedKeys.delete(scrubKey);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      appLog.log(`🧹 Cleaned ${cleanedCount} stacked tile(s) above ${targetTileKey}`);
    }
    
    brushLastCellKey = cellKey;
    brushLastTileKey = targetTileKey;
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
      appLog.log('📜 Left panel opened');
    }
    if (el) {
      try {
        el.scrollIntoView({ behavior: 'smooth', block: opts.block || 'center' });
      } catch {
        // no-op if scrollIntoView options unsupported
        el.scrollIntoView();
      }
      // Force focus by removing it from other elements first
      if (document.activeElement && document.activeElement !== el) {
        appLog.log(`🔄 Removing focus from: ${document.activeElement.tagName}.${document.activeElement.className}`);
        document.activeElement.blur();
      }
      if (typeof el.focus === 'function') {
        el.focus();
        appLog.log(`✅ Focus set to: ${el.tagName}.${el.className}`);
        // Double-check focus was set after a short delay
        window.setTimeout(() => {
          if (document.activeElement !== el) {
            appLog.log('🔄 Focus lost, re-attempting...');
            el.focus();
            if (document.activeElement === el) {
              appLog.log('✅ Focus successfully re-set');
            } else {
              appLog.log('❌ Focus re-attempt failed. Active element is: ' + document.activeElement.tagName);
            }
          } else {
            appLog.log('✅ Focus confirmed stable');
          }
        }, 100);
      }
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
    appLog.log('🎯 === STARTING focusEnvironmentPacksList ===');
    
    // Switch to the packs tab so the list is visible
    if (uiController && typeof uiController.switchToTab === 'function') {
      appLog.log('📑 Switching to packs tab...');
      uiController.switchToTab('packs');
    } else {
      appLog.log('⚠️ uiController or switchToTab not available');
    }
    
    // Add delay to ensure tab is switched and DOM is ready
    window.setTimeout(() => {
      appLog.log('🔍 Searching for pack elements...');
      
      // Try to focus the first pack card image (it is focusable via tabindex)
      const firstPackImage = document.querySelector('#tab-packs #packs-grid .card .card-left .card-image');
      if (firstPackImage) {
        appLog.log('✅ Found first pack image!');
        ensureLeftPanelAndFocus(firstPackImage);
        return;
      } else {
        appLog.log('❌ First pack image NOT found');
      }
      
      // Fallback: focus the Packs tab button
      const packsTabBtn = Array.from(document.querySelectorAll('.tab-btn')).find(btn => btn.dataset.tab === 'packs');
      if (packsTabBtn) {
        appLog.log('✅ Found packs tab button (fallback)');
        ensureLeftPanelAndFocus(packsTabBtn);
      } else {
        appLog.log('❌ Could not find any element to focus!');
      }
    }, 200);
    
    return true;
  }

  // Focus the biome dropdown in the Tile Selection section
  function focusBiomeDropdown() {
    appLog.log('🎯 === STARTING focusBiomeDropdown ===');
    const biomeSelect = document.getElementById('biome-select');
    if (biomeSelect) {
      appLog.log('✅ Found biome select element');
      
      // Check if dropdown is already focused/open
      const wasAlreadyFocused = document.activeElement === biomeSelect;
      appLog.log(`📌 Dropdown already focused: ${wasAlreadyFocused}`);
      
      ensureLeftPanelAndFocus(biomeSelect, { block: 'nearest' });
      
      // Only try to open dropdown if it wasn't already focused
      // (to avoid re-opening animation when already open)
      if (!wasAlreadyFocused) {
        window.setTimeout(() => {
          try {
            // Try showPicker if available (Chrome 99+)
            if (typeof biomeSelect.showPicker === 'function') {
              biomeSelect.showPicker();
              appLog.log('✅ Dropdown opened with showPicker()');
            } else {
              // Fallback: simulate click
              const mouseDownEvent = new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                view: window
              });
              biomeSelect.dispatchEvent(mouseDownEvent);
              appLog.log('✅ Dropdown opened with mousedown event');
            }
          } catch (e) {
            appLog.log('⚠️ Could not auto-open dropdown: ' + e.message);
          }
        }, 100);
      } else {
        appLog.log('ℹ️ Dropdown already open, skipping re-open animation');
      }
      
      return true;
    }
    appLog.log('❌ Biome select element not found');
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
    if (isMobileViewerMode()) {
      return;
    }
    appLog.log('🖱️ Map clicked');
    
    // Check if user needs guidance (no pack selected or no tile selected)
    if (!selectedTile || !selectedTileInfo || !hexTileModel) {
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

      let target = firstIntersect.point;
      if (obj.userData.isTile) target = obj.position;

      // Use original worldToAxial and axialRound from app.js
      const { q, r } = worldToAxial(target);
      const { q: finalQ, r: finalR } = axialRound(q, r);

      if (!isWithinHexGrid(finalQ, finalR)) {
        appLog.log('❌ Cannot place tiles outside the map boundary');
        return;
      }

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
          const yLevel = worldYToNearestLevel(obj.position.y);
          removeTileAtHex({ q: finalQ, r: finalR }, yLevel);
        }
      }
    }
  }

  function placeTileAtHex(hexCoords, yLevel = currentYLevel) {
    let placementSucceeded = false;
    if (!selectedTile) {
      appLog.log('❌ No tile selected');
      return placementSucceeded;
    }

    if (!isWithinHexGrid(hexCoords.q, hexCoords.r)) {
      appLog.log(`❌ Cannot place tile outside the map boundary at q:${hexCoords.q}, r:${hexCoords.r}`);
      return placementSucceeded;
    }

    const key = `q:${hexCoords.q},r:${hexCoords.r},y:${yLevel}`;
    
    // Check if position is already occupied
    if (placedTiles.has(key)) {
      appLog.log(`❌ Position ${key} is already occupied`);
      return placementSucceeded;
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
        if (!advanced) return placementSucceeded;
        const left2 = tileInstanceLimits.get(selectedTileInfo.instanceId) ?? 0;
        if (left2 <= 0) return placementSucceeded;
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
  const y = levelToWorldY(yLevel);
    const z = hexSize * 1.5 * hexCoords.r;
    newTile.position.set(x, y, z);
    newTile.rotation.x = BASE_ROTATION_X;
    const normalizedRotationDegrees = ((currentRotation * 180 / Math.PI) % 360 + 360) % 360;
    const snappedSceneDegreesRaw = Math.round(normalizedRotationDegrees / 60) * 60;
    const snappedSceneDegrees = ((snappedSceneDegreesRaw % 360) + 360) % 360;
    const sceneRotationRadians = snappedSceneDegrees * Math.PI / 180;
    newTile.rotation.y = BASE_ROTATION_Y + sceneRotationRadians;
    newTile.scale.set(TILE_SCALE, TILE_SCALE, TILE_SCALE);

  appLog.log(`🔄 Tile rotation: base=${BASE_ROTATION_Y}, requested=${currentRotation}, snapped=${sceneRotationRadians}, final=${BASE_ROTATION_Y + sceneRotationRadians}, placementMode=${placementMode}`);

    scene.add(newTile);
    interactableObjects.push(newTile);
    
    // Store the tile placement with rotation data
    // Convert from 3D rotation to instruction rotation (60° increments)
    // In 3D: 0°=0, 60°=300°, 120°=240°, etc. (clockwise from top view)
    // In instructions: 0°=0, 60°=60°, 120°=120°, etc. (clockwise from flat view)
    const instructionRotation = (360 - snappedSceneDegrees) % 360;
    
    placedTiles.set(key, { 
      name: selectedTileInfo.name, 
      biomeId: selectedTileInfo?.biomeId || null,
      tileNumber: selectedTileInfo?.tileNumber || null,
      object: newTile, 
      instanceId: newTile.userData.instanceId,
      yLevel,
      rotation: {
        x: newTile.rotation.x,
        y: newTile.rotation.y,
        z: newTile.rotation.z
      },
      // Store rotation in degrees for easier instruction generation
      rotationDegrees: instructionRotation,
      rotationSceneDegrees: snappedSceneDegrees,
      rotationSceneRadians: sceneRotationRadians
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

    if (placementMode === 'unlimited' && selectedTileInfo?.instanceId) {
      uiController?.updateUnlimitedSlotDisplay?.(selectedTileInfo.instanceId);
    }

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
      if (activeViewLayer === null) {
        currentYLevel = getLowestPossibleLevel(hexCoords.q, hexCoords.r);
        manualLevelOverride = false;
      } else {
        currentYLevel = activeViewLayer;
        manualLevelOverride = true;
      }
      updateLevelIndicator();
      refreshGhostTile();
    }
    
    // Reset rotation for the next tile to be placed
    currentRotation = 0;
    if (ghostTile) {
      ghostTile.rotation.y = BASE_ROTATION_Y + currentRotation;
      appLog.log('🔄 Reset rotation to 0° for next tile');
    }

    applyLayerVisibility();
    
    appLog.log(`✅ Placed tile ${selectedTileInfo.instanceId} at ${key}`);
    placementSucceeded = true;
    return placementSucceeded;
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
    
    let viewUpdated = false;

    if (tileObject) {
      // Use helper that handles undo and scene updates
      removeTileObject(tileObject);
      viewUpdated = true;
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
    if (placementMode === 'unlimited') {
      if (tileData?.instanceId) {
        uiController?.updateUnlimitedSlotDisplay?.(tileData.instanceId);
      }
    } else {
      uiController?.refreshBiomeGridUI?.();
    }
    if (!viewUpdated) {
      applyLayerVisibility();
      refreshGhostTile();
    }
    
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
  
  /**
   * Updates the controls hint display based on the current placement mode
   * @param {string} mode - The placement mode ('limited' or 'unlimited')
   */
  function updateControlsHintForMode(mode) {
    const controlsHint = document.getElementById('controls-hint');
    if (!controlsHint) return;
    
    const longHint = controlsHint.querySelector('.hint-long');
    const shortHint = controlsHint.querySelector('.hint-short');
    
    if (!longHint || !shortHint) return;
    
    // Define the base controls text (without mode-specific additions)
    const baseControls = {
      long: '<strong>Controls:</strong> Click: Place | RMB: Remove | R: Rotate | C: Clear | Page Up/Down: Height<br>' +
            '<strong>Camera:</strong> 1-5 presets • F: First-person • L-Drag: Orbit • RMB-Drag: Pan • Wheel: Zoom<br>' +
            '<strong>View:</strong> Q: Layer ↓ | E: Layer ↑ | A: Full map | P: Capture view',
      short: '<strong>Controls:</strong> Click=Place • RMB=Remove • R=Rotate • C=Clear • PgUp/Down=Height<br>' +
             '<strong>Camera:</strong> 1-5 presets • F=FP • L-Drag=Orbit • R-Drag=Pan • Wheel=Zoom<br>' +
             '<strong>View:</strong> Q=Layer↓ • E=Layer↑ • A=Full • P=Capture'
    };
    
    // Add brush mode hint for unlimited mode
    if (mode === 'unlimited') {
      longHint.innerHTML = baseControls.long + '<br><strong>Brush:</strong> Hold Shift + Drag: Paint tiles';
      shortHint.innerHTML = baseControls.short + '<br><strong>Brush:</strong> Shift+Drag=Paint';
    } else {
      // Restore base controls for limited mode
      longHint.innerHTML = baseControls.long;
      shortHint.innerHTML = baseControls.short;
    }
  }
  
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
    if (placementMode === 'unlimited' && tileObject.userData.instanceId) {
      uiController?.updateUnlimitedSlotDisplay?.(tileObject.userData.instanceId);
    } else {
      uiController?.refreshBiomeGridUI?.();
    }
    updateHeaderStats();
    updateRightPanelStats();
    applyLayerVisibility();
    refreshGhostTile();
    }
  }
  
  function init() {
    initializeMobileViewerMode();
    // Initialize welcome screen controller
    welcomeScreenController.onClose(() => {
      appLog.log('🎉 Welcome screen closed - Application ready for use');
      // Focus on the main application
      const mapNameInput = document.getElementById('map-name-input-toolbar');
      if (mapNameInput) {
        mapNameInput.focus();
      }
    });
    
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
        if (isMobileViewerMode()) {
          updateMobileAnalyticsPanel();
        }
      }
    });

  analytics = analyticsController.initialize();
  appLog.log('📊 Analytics system initialized');

  if (isMobileViewerMode()) {
    updateMobileAnalyticsPanel();
  }

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
        uiController?.updateTileSelection?.();
        uiController?.refreshActiveBiomeSummary?.();
        updateControlsHintForMode(mode);
        persistenceController.markShareDirty('placement-mode');
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
      placeholderSprite: PLACEHOLDER_SPRITE,
      getGridTexturePath,
      getPlacementCountForInstance,
      getPlacementCountForBiome,
      markShareDirty: (reason) => persistenceController.markShareDirty(reason || 'ui-interaction')
    });

    const ringGeo = new THREE.RingGeometry(HEX_RADIUS * 0.9, HEX_RADIUS, 32, 1);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide });
    highlightHex = new THREE.Mesh(ringGeo, ringMat);
    highlightHex.rotation.x = -Math.PI / 2;
    highlightHex.visible = false;
    scene.add(highlightHex);

  applyCameraPreset('default', { immediate: true, skipButtonSync: true });

    initializeNewUI();
  lightingController?.setupToggle?.();
    fixExistingBiomeIds();
    loadAssets();
    createHexGrid();
    setupEventListeners();
    animate();
    
    // Delay share load until after scene is fully initialized
    setTimeout(() => {
      void handleInitialShareLoad();
    }, 100);
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
    setupCameraPresetButtons();
    setupLayerViewControls();
    setupOverlayControlStack();

    if (!isMobileViewerMode()) {
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
        setCurrentYLevel: (value) => { setCurrentYLevelValue(value); },
        setManualLevelOverride: (value) => { manualLevelOverride = value; },
        updateLevelIndicator,
        saveMapToFile,
        loadMapFromFile,
        saveMapToFileToolbar,
        loadMapFromFileToolbar,
        confirmFn: (message) => showConfirm(message),
        toggleDebugOverlay,
        isFirstPersonActive: () => firstPersonState.active,
        handleCameraPresetSelection,
        shiftViewLayer,
        setActiveViewLayer,
        captureCurrentView
      });
    }

    const shareToolbarButton = document.getElementById('share-map-toolbar');
    if (shareToolbarButton) {
      if (shareToolbarButton.tagName === 'BUTTON') {
        shareToolbarButton.type = 'button';
      }
      shareToolbarButton.addEventListener('click', handleShareButton);
    }

    const sharePanelButton = document.getElementById('share-map');
    if (sharePanelButton) {
      if (sharePanelButton.tagName === 'BUTTON') {
        sharePanelButton.type = 'button';
      }
      sharePanelButton.addEventListener('click', handleShareButton);
    }
    updateHeaderStats();
    updateRightPanelStats();
    updateUndoRedoButtons();
    updateControlsHintForMode(placementMode);
    applyLayerVisibility();
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
      persistenceController.markShareDirty('map-name-input');
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
    disableFirstPerson({ skipPointerUnlock: true });
    lightingController?.dispose?.();
  }
  
  
  // ========================================
  // BUILD INSTRUCTIONS GENERATOR
  // ========================================
  const instructionsLog = appLog.child('instructions');
  const instructionsRenderer = createInstructionsRenderer({
    instructionsLog,
    biomeSets,
    placedTiles
  });

  function generateBuildInstructions() {
    instructionsLog.log('🏗️ Generating build instructions...');
    instructionsLog.log('📊 placedTiles size:', placedTiles.size);
    
    if (placedTiles.size === 0) {
      showNotification({
        type: 'warning',
        title: 'Cannot generate instructions',
        message: 'Map is empty! Please add some tiles before generating build instructions.',
        duration: 5000
      });
      return;
    }
    
    // Layer analysis
    const layerAnalysis = analyzeMapLayers();
    instructionsLog.log('📊 Layer analysis result:', layerAnalysis);
    
    if (layerAnalysis.layers.length === 0) {
      showNotification({
        type: 'error',
        title: 'Error analyzing map layers',
        message: 'There was an error analyzing the map structure. Please check that your tiles are properly placed.',
        duration: 6000
      });
      return;
    }
    
    instructionsLog.log(`📊 Found ${layerAnalysis.layers.length} layers`, layerAnalysis);
    
    // Generate instructions
    instructionsRenderer.generateLayerInstructions(layerAnalysis);
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

