/**
 * Persistence controller handles saving and loading map data.
 * @param {Object} deps - Dependencies required for persistence operations.
 * @param {() => string} deps.getPlacementMode - Returns the current placement mode.
 * @param {(mode: string) => void} [deps.setPlacementMode] - Updates the placement mode.
 * @param {Map<string, number>} deps.packCounts
 * @param {Map<string, number>} deps.standaloneBiomeSetCounts
 * @param {Map<string, number>} deps.tileInstanceLimits
 * @param {Map<string, number>} deps.perBiomeDenominator
 * @param {Array} deps.environmentPacks
 * @param {(biomeId: string) => void} deps.ensureBiomeInitialized
 * @param {(biomeId: string) => void} [deps.preloadBiomeTexture]
 * @param {() => import('three').Object3D | null} deps.getHexTileModel
 * @param {import('three').Scene} deps.scene
 * @param {Array} deps.interactableObjects
 * @param {(biomeId: string, tileNumber: number) => import('three').Material[]} deps.createTileMaterials
 * @param {(object: import('three').Object3D, materials: import('three').Material[]) => void} deps.applyMaterialsToTileObject
 * @param {number} deps.hexSize
 * @param {number} deps.tileHeight
 * @param {number} deps.baseRotationX
 * @param {number} deps.baseRotationY
 * @param {number} deps.tileScale
 * @param {Map<string, any>} deps.placedTiles
 * @param {() => void} deps.updateHeaderStats
 * @param {() => void} deps.updateRightPanelStats
 * @param {() => any} [deps.getUIController]
 * @param {() => void} deps.clearMap
 * @param {(info: { totalTiles: number }) => void} [deps.onTilesLoaded]
 * @returns {{
 *  saveMapWithName: (mapName: string) => void,
 *  saveMapToFileToolbar: () => void,
 *  loadMapFromFile: (event: Event) => void,
 *  loadMapFromFileToolbar: (event: Event) => void,
 *  fixExistingBiomeIds: () => void
 * }}
 */

import createDebugLogger from '../utils/debugLogger.js';
import { showNotification, showShareModal, showConfirm } from '../ui/notifications.js';

const persistenceLog = createDebugLogger('app:persistence');

const DEFAULT_RELATIVE_SHARE_API_BASE = '/api';
const DEV_FALLBACK_SHARE_API_BASE = 'http://localhost:8787/api';
const shareApiFromEnv = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SHARE_API_BASE_URL)
  ? String(import.meta.env.VITE_SHARE_API_BASE_URL).trim()
  : '';
const shareApiFromWindow = (typeof window !== 'undefined' && window.__LORESCAPE_SHARE_API_BASE__)
  ? String(window.__LORESCAPE_SHARE_API_BASE__).trim()
  : '';
const SHARE_SIZE_LIMIT_BYTES = 512 * 1024;

let statusTimeoutId = null;

function getStatusElement() {
  if (typeof document === 'undefined') {
    return null;
  }
  return document.getElementById('save-status');
}

function setStatusMessage(message, duration = 4000) {
  const statusEl = getStatusElement();
  if (!statusEl) {
    return;
  }

  statusEl.textContent = message || '';
  if (statusTimeoutId) {
    window.clearTimeout(statusTimeoutId);
    statusTimeoutId = null;
  }

  if (message && duration > 0) {
    statusTimeoutId = window.setTimeout(() => {
      statusEl.textContent = '';
      statusTimeoutId = null;
    }, duration);
  }
}

function calculateByteSize(text) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length;
  }
  return text.length;
}

function normalizeBaseUrl(candidate) {
  if (!candidate) {
    return '';
  }
  return String(candidate).trim().replace(/\/+$/, '');
}

function computeSameOriginApiBase() {
  if (typeof window === 'undefined' || !window.location || !window.location.origin) {
    return '';
  }
  const origin = window.location.origin.replace(/\/+$/, '');
  return `${origin}/api`;
}

function getShareApiCandidates() {
  const bases = [];
  const pushUnique = (value) => {
    const normalized = normalizeBaseUrl(value);
    if (!normalized) {
      return;
    }
    if (!bases.includes(normalized)) {
      bases.push(normalized);
    }
  };

  const runtimeWindowBase = (typeof window !== 'undefined' && window.__LORESCAPE_SHARE_API_BASE__)
    ? String(window.__LORESCAPE_SHARE_API_BASE__).trim()
    : shareApiFromWindow;

  pushUnique(runtimeWindowBase);
  pushUnique(shareApiFromEnv);
  pushUnique(DEFAULT_RELATIVE_SHARE_API_BASE);
  pushUnique(computeSameOriginApiBase());
  pushUnique(DEV_FALLBACK_SHARE_API_BASE);

  return bases;
}

async function performShareApiRequest(path, options = {}, config = {}) {
  const { allowStatuses = [] } = config;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const attempts = [];
  const bases = getShareApiCandidates();

  for (const base of bases) {
    const endpoint = base === '/'
      ? normalizedPath
      : `${base}${normalizedPath}`;

    const fetchOptions = {
      mode: options.mode ?? 'cors',
      ...options
    };

    if (options.headers) {
      fetchOptions.headers = { ...options.headers };
    }

    try {
      const response = await fetch(endpoint, fetchOptions);
      if (response.ok || allowStatuses.includes(response.status)) {
        return {
          response,
          endpoint,
          base
        };
      }

      attempts.push({
        endpoint,
        status: response.status,
        statusText: response.statusText
      });
    } catch (error) {
      attempts.push({
        endpoint,
        error
      });
    }
  }

  const summary = attempts.map((attempt) => {
    if (attempt.status) {
      return `${attempt.endpoint} (status ${attempt.status})`;
    }
    return `${attempt.endpoint} (${attempt.error?.message ?? 'network error'})`;
  }).join('; ');

  const error = new Error(
    `Unable to reach the map sharing service. Tried: ${summary || 'no endpoints attempted'}.` +
    ' Make sure the share server is running (npm run server) or configure window.__LORESCAPE_SHARE_API_BASE__.'
  );
  error.attempts = attempts;
  throw error;
}
export function createPersistenceController(deps) {
  const {
    getPlacementMode,
    setPlacementMode,
    packCounts,
    standaloneBiomeSetCounts,
    tileInstanceLimits,
    perBiomeDenominator,
    environmentPacks,
    ensureBiomeInitialized,
    preloadBiomeTexture,
    getHexTileModel,
    scene,
    interactableObjects,
  createTileMaterials,
  applyMaterialsToTileObject,
  hexSize,
  tileHeight,
  tileVerticalGapRatio = 0,
  baseRotationX,
  baseRotationY,
  tileScale,
    placedTiles,
    updateHeaderStats,
    updateRightPanelStats,
    getUIController,
    clearMap,
    onTilesLoaded
  } = deps;

  const tileVerticalStep = tileHeight * (1 + tileVerticalGapRatio);

  const ROTATION_STEP_DEGREES = 60;
  const TWO_PI = Math.PI * 2;

  const degToRad = (degrees) => (degrees * Math.PI) / 180;
  const radToDeg = (radians) => (radians * 180) / Math.PI;

  const normalizeDegrees = (value) => {
    if (!Number.isFinite(value)) {
      return 0;
    }
    const normalized = value % 360;
    return normalized < 0 ? normalized + 360 : normalized;
  };

  const snapToRotationStep = (value) => {
    const normalized = normalizeDegrees(value);
    const snapped = Math.round(normalized / ROTATION_STEP_DEGREES) * ROTATION_STEP_DEGREES;
    return normalizeDegrees(snapped);
  };

  const normalizeRadians = (value) => {
    if (!Number.isFinite(value)) {
      return 0;
    }
    const normalized = value % TWO_PI;
    return normalized < 0 ? normalized + TWO_PI : normalized;
  };

  const instructionToSceneRadians = (rotationDegrees = 0) => {
    const snappedInstruction = snapToRotationStep(rotationDegrees);
    const sceneDegrees = normalizeDegrees(360 - snappedInstruction);
    return normalizeRadians(degToRad(sceneDegrees));
  };

  const sceneRotationToInstructionDegrees = (sceneRotationRadians) => {
    if (!Number.isFinite(sceneRotationRadians)) {
      return 0;
    }
    const relativeDegrees = radToDeg(sceneRotationRadians - baseRotationY);
    const snappedScene = snapToRotationStep(relativeDegrees);
    return normalizeDegrees(360 - snappedScene);
  };

  const resolveTileInstructionRotation = (tileData) => {
    if (!tileData || typeof tileData !== 'object') {
      return 0;
    }

    const directDegrees = Number(tileData.rotationDegrees);
    if (Number.isFinite(directDegrees)) {
      return snapToRotationStep(directDegrees);
    }

    const sceneDegrees = Number(tileData.sceneRotationDegrees);
    if (Number.isFinite(sceneDegrees)) {
      const snappedScene = snapToRotationStep(sceneDegrees);
      return normalizeDegrees(360 - snappedScene);
    }

    const sceneRadians = Number(tileData?.sceneRotationRadians ?? tileData?.rotationSceneRadians ?? tileData?.rotationRadians);
    if (Number.isFinite(sceneRadians)) {
      const snappedScene = snapToRotationStep(radToDeg(normalizeRadians(sceneRadians)));
      return normalizeDegrees(360 - snappedScene);
    }

    const sceneRotation = tileData?.rotation?.y;
    if (Number.isFinite(sceneRotation)) {
      return sceneRotationToInstructionDegrees(sceneRotation);
    }

    return 0;
  };

  let lastSharedState = null;
  let hasUnsharedChanges = true;

  const fingerprintJson = (text) => {
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16);
  };

  const createMapFingerprint = (mapData) => {
    try {
      const sanitized = JSON.stringify(mapData, (key, value) => {
        if (key === 'createdAt' || key === 'updatedAt') {
          return undefined;
        }
        return value;
      });
      return fingerprintJson(sanitized);
    } catch (error) {
      persistenceLog.warn('⚠️ Failed to fingerprint map data, falling back to hash of canonical JSON.', error);
      return fingerprintJson(JSON.stringify(mapData));
    }
  };

  function markShareDirty(reason = 'unspecified') {
    if (!hasUnsharedChanges) {
      persistenceLog.log('🟡 Share state marked dirty', { reason });
    }
    hasUnsharedChanges = true;
  }

  function resetShareState(reason = 'reset') {
    if (lastSharedState || !hasUnsharedChanges) {
      persistenceLog.log('♻️ Share state reset', { reason });
    }
    hasUnsharedChanges = true;
    lastSharedState = null;
  }

  const levelToWorldY = (level) => (level <= 0 ? 0 : level * tileVerticalStep);

  function buildMapData(mapName) {
    const placementMode = getPlacementMode?.() ?? 'limited';
    const safeName = mapName?.trim() || 'Unnamed Map';

    const tiles = Array.from(placedTiles.entries())
      .map(([key, tileData]) => {
        const match = key.match(/q:(-?\d+),r:(-?\d+),y:(-?\d+)/);
        if (!match) {
          return null;
        }

        const instanceId = tileData.instanceId;
        const biomeId = instanceId
          ? instanceId.split('_').slice(0, -1).join('_')
          : tileData.name;
        const tileNumber = instanceId
          ? Number.parseInt(instanceId.split('_').slice(-1)[0], 10)
          : 1;
        const rotationDegrees = resolveTileInstructionRotation(tileData);

        return {
          key,
          q: Number.parseInt(match[1], 10),
          r: Number.parseInt(match[2], 10),
          y: Number.parseInt(match[3], 10),
          biomeId,
          tileNumber,
          rotationDegrees,
          instanceId
        };
      })
      .filter(Boolean);

    const mapData = {
      version: '1.0',
      name: safeName,
      createdAt: new Date().toISOString(),
      placementMode,
      packCounts: Object.fromEntries(packCounts),
      standaloneBiomeSetCounts: Object.fromEntries(standaloneBiomeSetCounts),
      tiles
    };

    persistenceLog.log('📊 Map data prepared:', mapData);
    return mapData;
  }

  function saveMapWithName(mapName) {
    const safeName = mapName?.trim() || 'Unnamed Map';
    persistenceLog.log('💾 Saving map:', safeName);

    const mapData = buildMapData(safeName);
    const jsonString = JSON.stringify(mapData, null, 2);
    const fileName = `${safeName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.lsm`;

    // Try to use File System Access API for folder selection
    if ('showSaveFilePicker' in window) {
      saveMapWithFilePicker(jsonString, fileName, safeName);
    } else {
      // Fallback to traditional download
      saveMapWithDownload(jsonString, fileName, safeName);
    }
  }

  async function saveMapWithFilePicker(jsonString, fileName, safeName) {
    try {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{
          description: 'Lorescape Map files',
          accept: {
            'application/json': ['.lsm']
          }
        }]
      });

      const writable = await fileHandle.createWritable();
      await writable.write(jsonString);
      await writable.close();

      persistenceLog.log('✅ Map saved successfully with file picker');
      setStatusMessage(`Saved "${safeName}".`, 3000);
      
      showNotification({
        type: 'success',
        title: 'Map Saved',
        message: `"${safeName}" saved successfully`,
        duration: 3000
      });

    } catch (error) {
      if (error.name !== 'AbortError') {
        persistenceLog.error('❌ Error saving with file picker:', error);
        // Fallback to download method
        saveMapWithDownload(jsonString, fileName, safeName);
      }
    }
  }

  function saveMapWithDownload(jsonString, fileName, safeName) {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    persistenceLog.log('✅ Map saved successfully with download');
    setStatusMessage(`Saved "${safeName}".`, 3000);
    
    showNotification({
      type: 'success',
      title: 'Map Saved',
      message: `"${safeName}" saved successfully`,
      duration: 3000
    });
  }

  function saveMapToFileToolbar() {
    const mapNameInput = document.getElementById('map-name-input-toolbar');
    const mapName = mapNameInput?.value?.trim() || 'Unnamed Map';

    if (!mapName) {
      showNotification({
        type: 'warning',
        title: 'Map Name Required',
        message: 'Please enter a map name before saving.',
        duration: 4000
      });
      mapNameInput?.focus();
      return;
    }

    saveMapWithName(mapName);
    persistenceLog.log('💾 Map saved from toolbar');
  }

  function loadMapFromFileToolbar(event) {
    // Try to use File System Access API first
    if ('showOpenFilePicker' in window && !event) {
      loadMapWithFilePicker();
    } else {
      loadMapFromFile(event);
    }
    persistenceLog.log('📂 Map loaded from toolbar');
  }

  async function loadMapWithFilePicker() {
    try {
      if (!(await confirmMapReplacement())) {
        return;
      }

      const [fileHandle] = await window.showOpenFilePicker({
        types: [{
          description: 'Lorescape Map files',
          accept: {
            'application/json': ['.lsm', '.json']
          }
        }]
      });

      const file = await fileHandle.getFile();
      const text = await file.text();
      
      // Process the file content (same logic as loadMapFromFile)
      await processMapFileContent(text, file.name);

    } catch (error) {
      if (error.name !== 'AbortError') {
        persistenceLog.error('❌ Error loading with file picker:', error);
        showNotification({
          type: 'error',
          title: 'Error loading map',
          message: 'Failed to load the map file. Please try again.',
          duration: 5000
        });
      }
    }
  }

  function fixExistingBiomeIds() {
    persistenceLog.log('🔧 Fixing existing biome IDs...');
    let fixedCount = 0;

    placedTiles.forEach((tileData, key) => {
      if (!tileData?.instanceId) {
        return;
      }
      const correctBiomeId = tileData.instanceId.split('_').slice(0, -1).join('_');
      if (tileData.name && tileData.name !== correctBiomeId) {
        tileData.name = correctBiomeId;
        fixedCount += 1;
        persistenceLog.log(`🔧 Fixed biome ID for tile at ${key}: ${tileData.name}`);
      }
    });

    if (fixedCount > 0) {
      persistenceLog.log(`✅ Fixed ${fixedCount} biome IDs`);
      updateRightPanelStats?.();
    }
  }

  async function confirmMapReplacement() {
    const hasTiles = placedTiles.size > 0;
    const hasSelections = packCounts.size > 0 || standaloneBiomeSetCounts.size > 0;

    if (!hasTiles && !hasSelections) {
      return true;
    }

    const confirmMessage = `Loading a new map will clear your current map and all selected environment packs or biome sets.\n\n`
      + `Current map status:\n`
      + `- Placed tiles: ${placedTiles.size}\n`
      + `- Selected packs: ${packCounts.size}\n`
      + `- Selected standalone biome sets: ${standaloneBiomeSetCounts.size}\n\n`
      + 'Do you want to continue?';

    return await showConfirm(confirmMessage, { 
      title: 'Replace Current Map?',
      confirmText: 'Continue',
      cancelText: 'Cancel'
    });
  }

  function validateIncomingMapData(mapData) {
    if (!mapData || typeof mapData !== 'object') {
      throw new Error('Invalid map data payload');
    }

    if (!mapData.version) {
      throw new Error('Missing map version');
    }

    if (!mapData.name) {
      throw new Error('Missing map name');
    }

    if (!Array.isArray(mapData.tiles)) {
      throw new Error('Missing tile data');
    }
  }

  function ensureLimitedModeBiomeInitialization() {
    if ((getPlacementMode?.() ?? 'limited') !== 'limited') {
      return;
    }

    tileInstanceLimits.clear();
    perBiomeDenominator.clear();

    environmentPacks.forEach((pack) => {
      const count = packCounts.get(pack.id) || 0;
      if (count > 0 && pack.components) {
        pack.components.forEach((component) => {
          ensureBiomeInitialized(component.setId);
        });
      }
    });

    standaloneBiomeSetCounts.forEach((count, biomeId) => {
      if (count > 0) {
        ensureBiomeInitialized(biomeId);
      }
    });
  }

  function syncPlacementModeRadio(mode) {
    if (!mode) {
      return;
    }

    if (setPlacementMode) {
      setPlacementMode(mode);
    }

    const modeRadios = document.querySelectorAll('input[name="buildMode"]');
    modeRadios.forEach((radio) => {
      radio.checked = radio.value === mode;
    });
  }

  function updateMapNameInputs(name) {
    const mapNameInput = document.getElementById('map-name-input');
    const mapNameInputToolbar = document.getElementById('map-name-input-toolbar');
    if (mapNameInput) {
      mapNameInput.value = name;
    }
    if (mapNameInputToolbar) {
      mapNameInputToolbar.value = name;
    }
  }

  async function loadMapData(mapData, {
    skipConfirm = false,
    showSummaryDialog = true,
    source = 'file',
    notify = true
  } = {}) {
    validateIncomingMapData(mapData);

    if (!skipConfirm && !(await confirmMapReplacement())) {
      return { loaded: false };
    }

    persistenceLog.log('📋 Parsed map data:', mapData);

    if (mapData.version !== '1.0') {
      console.warn('⚠️ Map file version mismatch. Expected 1.0, got:', mapData.version);
    }

    clearMap({ skipConfirm: true });
    packCounts.clear();
    standaloneBiomeSetCounts.clear();

    if (mapData.packCounts) {
      Object.entries(mapData.packCounts).forEach(([packId, count]) => {
        packCounts.set(packId, Number.parseInt(String(count), 10));
      });
    }

    const loadedStandaloneCounts = mapData.standaloneBiomeSetCounts || mapData.biomeAddonCounts;
    if (loadedStandaloneCounts) {
      Object.entries(loadedStandaloneCounts).forEach(([biomeId, count]) => {
        standaloneBiomeSetCounts.set(biomeId, Number.parseInt(String(count), 10));
      });
    }

    if (mapData.placementMode) {
      syncPlacementModeRadio(mapData.placementMode);
    }

    ensureLimitedModeBiomeInitialization();

    try {
      const usedBiomes = new Set(
        mapData.tiles.map((tile) => tile.biomeId).filter(Boolean)
      );
      const t0 = performance.now();
      usedBiomes.forEach((biomeId) => preloadBiomeTexture?.(biomeId));
      const t1 = performance.now();
      persistenceLog.log(`⏱️ Preload dispatch took ${(t1 - t0).toFixed(1)}ms`);
    } catch (error) {
      console.warn('⚠️ Texture preload skipped:', error);
    }

    const hexTileModel = getHexTileModel();
    let loadedTilesCount = 0;

    mapData.tiles.forEach((tileData) => {
      try {
        if (!hexTileModel) {
          console.warn('⚠️ Hex tile model not loaded yet, skipping tile placement');
          return;
        }

        const hexCoords = { q: tileData.q, r: tileData.r };
        const yLevel = tileData.y;
        const key = `q:${hexCoords.q},r:${hexCoords.r},y:${yLevel}`;
        const biomeId = tileData.biomeId;
        const tileNumber = tileData.tileNumber || 1;
        const rotationDegrees = resolveTileInstructionRotation(tileData);
        const sceneRotationRadians = (() => {
          if (Number.isFinite(tileData.sceneRotationRadians)) {
            return normalizeRadians(tileData.sceneRotationRadians);
          }
          if (Number.isFinite(tileData.rotationRadians)) {
            return normalizeRadians(tileData.rotationRadians);
          }
          if (Number.isFinite(tileData.sceneRotationDegrees)) {
            return normalizeRadians(degToRad(snapToRotationStep(tileData.sceneRotationDegrees)));
          }
          return instructionToSceneRadians(rotationDegrees);
        })();
        const sceneRotationDegrees = normalizeDegrees(radToDeg(sceneRotationRadians));
        const finalRotationY = baseRotationY + sceneRotationRadians;

        const newTile = hexTileModel.clone();
        newTile.userData = {
          isTile: true,
          tileKey: key,
          instanceId: tileData.instanceId || `${biomeId}_${tileNumber}`,
          biomeId
        };

        const materials = createTileMaterials(biomeId, tileNumber);
        applyMaterialsToTileObject(newTile, materials);

        const x = hexSize * Math.sqrt(3) * (hexCoords.q + hexCoords.r / 2);
        const y = levelToWorldY(yLevel);
        const z = hexSize * 1.5 * hexCoords.r;
        newTile.position.set(x, y, z);
        newTile.rotation.x = baseRotationX;
        newTile.rotation.y = finalRotationY;
        newTile.scale.set(tileScale, tileScale, tileScale);

        scene.add(newTile);
        interactableObjects.push(newTile);

        placedTiles.set(key, {
          name: biomeId,
          biomeId,
          tileNumber,
          object: newTile,
          instanceId: tileData.instanceId,
          yLevel,
          rotation: {
            x: newTile.rotation.x,
            y: newTile.rotation.y,
            z: newTile.rotation.z
          },
          rotationDegrees,
          rotationSceneDegrees: sceneRotationDegrees,
          rotationSceneRadians: sceneRotationRadians
        });

        if ((getPlacementMode?.() ?? 'limited') === 'limited' && tileData.instanceId) {
          const currentLimit = tileInstanceLimits.get(tileData.instanceId) || 0;
          if (currentLimit > 0) {
            tileInstanceLimits.set(tileData.instanceId, currentLimit - 1);
          }
        }

        loadedTilesCount += 1;
      } catch (error) {
        console.error('❌ Error loading tile:', tileData, error);
      }
    });

    updateMapNameInputs(mapData.name);

    updateHeaderStats?.();
    updateRightPanelStats?.();
    const uiController = getUIController?.();
    uiController?.renderEnvironmentPacks?.();
    uiController?.renderBiomeSets?.();
    uiController?.refreshBiomeGridUI?.();
    uiController?.updateTileSelection?.();

    onTilesLoaded?.({ totalTiles: loadedTilesCount });

    persistenceLog.log(`✅ Map "${mapData.name}" loaded successfully with ${loadedTilesCount} tiles`);

    const standaloneCounts = mapData.standaloneBiomeSetCounts || mapData.biomeAddonCounts || {};

    if (showSummaryDialog) {
      const packCount = Object.keys(mapData.packCounts || {}).length;
      const standaloneCount = Object.keys(standaloneCounts).length;
      
      showNotification({
        type: 'success',
        title: `Map "${mapData.name}" Loaded`,
        message: `${loadedTilesCount} tiles • ${packCount} env. packs • ${standaloneCount} biome sets`,
        duration: 5000
      });
    }

    if (notify) {
      setStatusMessage(`Loaded map "${mapData.name}" from ${source}.`, 4000);
    }

    resetShareState('map-loaded');

    return {
      loaded: true,
      tileCount: loadedTilesCount,
      mapData
    };
  }

  async function processMapFileContent(fileContent, fileName) {
    try {
      const mapData = JSON.parse(fileContent);
      await loadMapData(mapData, { skipConfirm: true });
      
      showNotification({
        type: 'success',
        title: 'Map Loaded',
        message: `"${mapData.name || fileName}" loaded successfully`,
        duration: 3000
      });
    } catch (error) {
      console.error('❌ Error loading map file:', error);
      
      showNotification({
        type: 'error',
        title: 'Load Failed',
        message: `Error loading map file: ${error.message}`,
        duration: 6000
      });
    }
  }

  async function loadMapFromFile(event) {
    const fileInput = event?.target;
    const file = fileInput?.files?.[0];
    if (!file) {
      return;
    }

    persistenceLog.log('📂 Loading map from file:', file.name);

    if (!(await confirmMapReplacement())) {
      fileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (loadEvent) => {
      try {
        const fileContent = loadEvent.target?.result ?? '{}';
        await processMapFileContent(fileContent, file.name);
      } catch (error) {
        console.error('❌ Error loading map file:', error);
        
        showNotification({
          type: 'error',
          title: 'Load Failed',
          message: `Error loading map file: ${error.message}`,
          duration: 6000
        });
      } finally {
        fileInput.value = '';
      }
    };

    reader.readAsText(file);
  }

  async function shareMapOnline(mapName, { copyToClipboard = true, notify = true } = {}) {
    const safeName = mapName?.trim() || 'Unnamed Map';

    try {
      if (placedTiles.size === 0) {
        const proceed = await showConfirm('This map has no tiles. Share an empty map?', {
          title: 'Empty Map',
          confirmText: 'Share Anyway',
          cancelText: 'Cancel'
        });
        if (!proceed) {
          return null;
        }
      }

      const mapData = buildMapData(safeName);
      const jsonString = JSON.stringify(mapData);
      const payloadSize = calculateByteSize(jsonString);
      const currentFingerprint = createMapFingerprint(mapData);

      if (!hasUnsharedChanges && lastSharedState && lastSharedState.fingerprint === currentFingerprint) {
        persistenceLog.log('🔁 Reusing existing share link', {
          id: lastSharedState.id,
          url: lastSharedState.url
        });

        let copiedToClipboard = false;
        if (copyToClipboard && navigator?.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(lastSharedState.url);
            copiedToClipboard = true;
          } catch (clipboardError) {
            console.warn('📎 Clipboard copy failed while reusing share link.', clipboardError);
          }
        }

        showShareModal({ shareUrl: lastSharedState.url, shareId: lastSharedState.id });

        if (notify) {
          const message = copiedToClipboard
            ? `Share link for "${safeName}" is unchanged and was copied again.`
            : `Share link for "${safeName}" is unchanged.`;
          setStatusMessage(message, 5000);
        }

        hasUnsharedChanges = false;
        return {
          ...lastSharedState,
          reused: true
        };
      }

      if (payloadSize > SHARE_SIZE_LIMIT_BYTES) {
        throw new Error(`Map is too large to share (${(payloadSize / 1024).toFixed(1)} KB). Reduce complexity and try again.`);
      }

      const candidates = getShareApiCandidates();
      persistenceLog.log('🌐 Uploading map for sharing:', {
        name: safeName,
        bytes: payloadSize,
        candidates
      });

      if (notify) {
        setStatusMessage(`Sharing "${safeName}"...`, 0);
      }

      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: jsonString
      };

      const { response, endpoint } = await performShareApiRequest('/maps', requestOptions);
      const result = await response.json().catch(() => ({}));

      const shareId = (result && typeof result.id === 'string') ? result.id : null;
      if (!shareId) {
        const apiMessage = (result && typeof result.error === 'string') ? result.error : '';
        const fallbackMessage = apiMessage || 'Sharing service returned an unexpected response.';
        throw new Error(fallbackMessage);
      }

      const url = new URL(window.location.href);
      url.searchParams.set('share', shareId);
      const shareUrl = url.toString();

      let copiedToClipboard = false;
      if (copyToClipboard && navigator?.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(shareUrl);
          copiedToClipboard = true;
        } catch (clipboardError) {
          console.warn('📎 Clipboard copy failed, falling back to manual copy.', clipboardError);
        }
      }

      // Show success modal with share link
      showShareModal({ shareUrl, shareId });

      if (notify) {
        const message = copiedToClipboard
          ? `Share link copied for "${safeName}".`
          : `Share link ready for "${safeName}".`;
        setStatusMessage(message, 6000);
      }

      lastSharedState = {
        id: shareId,
        url: shareUrl,
        fingerprint: currentFingerprint,
        name: safeName
      };
      hasUnsharedChanges = false;

      persistenceLog.log('✅ Map shared successfully:', {
        id: shareId,
        url: shareUrl,
        bytes: payloadSize,
        endpoint
      });

      return {
        id: shareId,
        url: shareUrl,
        response: result
      };
    } catch (error) {
      console.error('❌ Failed to share map online:', error);
      
      showNotification({
        type: 'error',
        title: 'Share Failed',
        message: `Unable to share map online: ${error.message}`,
        duration: 6000
      });
      
      if (notify) {
        setStatusMessage('Share failed. Please try again.', 5000);
      }
      throw error;
    }
  }

  async function shareMapOnlineToolbar() {
    const mapNameInput = document.getElementById('map-name-input-toolbar');
    const mapName = mapNameInput?.value?.trim() || 'Unnamed Map';

    if (!mapName) {
      showNotification({
        type: 'warning',
        title: 'Map Name Required',
        message: 'Please enter a map name before sharing.',
        duration: 4000
      });
      mapNameInput?.focus();
      return null;
    }

    return shareMapOnline(mapName, { copyToClipboard: true, notify: true });
  }

  async function loadMapFromShareId(shareId, {
    skipConfirm = false,
    showSummaryDialog = false,
    notify = true
  } = {}) {
    const trimmedId = String(shareId || '').trim();
    if (!trimmedId) {
      throw new Error('Share id is required.');
    }

    const candidates = getShareApiCandidates();
    persistenceLog.log('🌐 Fetching shared map:', { shareId: trimmedId, candidates });

    if (notify) {
      setStatusMessage(`Loading shared map (${trimmedId})...`, 0);
    }

    try {
      persistenceLog.log('📡 Starting API request for share ID:', trimmedId);
      
      const { response, endpoint } = await performShareApiRequest(
        `/maps/${encodeURIComponent(trimmedId)}`,
        {
          headers: {
            Accept: 'application/json'
          }
        },
        { allowStatuses: [404] }
      );

      persistenceLog.log('📡 API response received:', { status: response.status, endpoint });

      if (response.status === 404) {
        throw new Error('Shared map was not found or has expired.');
      }

      const mapData = await response.json();
      persistenceLog.log('📦 Map data parsed:', { name: mapData.name, tiles: mapData.tiles?.length });
      
      const loadResult = loadMapData(mapData, {
        skipConfirm,
        showSummaryDialog,
        source: 'share link',
        notify
      });

      persistenceLog.log('✅ Shared map loaded from API:', {
        shareId: trimmedId,
        endpoint
      });

      if (notify) {
        setStatusMessage(`Loaded shared map "${mapData.name}".`, 5000);
      }

      return {
        ...loadResult,
        shareId: trimmedId
      };
    } catch (error) {
      console.error('❌ Error loading shared map:', error);
      
      showNotification({
        type: 'error',
        title: 'Share Load Failed',
        message: `Unable to load shared map: ${error.message}`,
        duration: 6000
      });
      
      if (notify) {
        setStatusMessage('Failed to load shared map.', 5000);
      }
      throw error;
    }
  }

  return {
    saveMapWithName,
    saveMapToFileToolbar,
    loadMapFromFile,
    loadMapFromFileToolbar,
    fixExistingBiomeIds,
    shareMapOnline,
    shareMapOnlineToolbar,
    loadMapData,
    loadMapFromShareId,
    markShareDirty,
    resetShareState
  };
}

export default createPersistenceController;
