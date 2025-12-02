/**
 * Sets up keyboard shortcuts and associated UI button handlers for the map builder.
 * @param {Object} deps
 * @param {Window} deps.windowRef
 * @param {Document} deps.documentRef
 * @param {() => void} deps.undo
 * @param {() => void} deps.redo
 * @param {(coords: { q: number, r: number }) => void} deps.removeTileAtHex
 * @param {() => { q: number, r: number } | null} deps.getLastHexCoords
 * @param {() => import('three').Object3D | null} deps.getGhostTile
 * @param {() => number} deps.getCurrentRotation
 * @param {(rotation: number) => void} deps.setCurrentRotation
 * @param {number} deps.baseRotationY
 * @param {(selectedTileInfo?: any) => import('three').Material[]} deps.createGhostMaterials
 * @param {() => any} deps.getSelectedTileInfo
 * @param {() => void} deps.refreshGhostTile
 * @param {() => void} deps.updateUndoRedoButtons
 * @param {() => void} deps.generateBuildInstructions
 * @param {() => void} deps.clearMap
 * @param {() => number} deps.getCurrentYLevel
 * @param {(level: number) => void} deps.setCurrentYLevel
 * @param {(value: boolean) => void} deps.setManualLevelOverride
 * @param {() => void} deps.updateLevelIndicator
 * @param {() => void} deps.saveMapToFile
 * @param {(event: Event) => void} deps.loadMapFromFile
 * @param {() => void} deps.saveMapToFileToolbar
 * @param {(event: Event) => void} deps.loadMapFromFileToolbar
 * @param {(message: string) => boolean} [deps.confirmFn]
 * @param {() => void} deps.toggleDebugOverlay
 * @param {() => boolean} [deps.isFirstPersonActive]
 * @param {(preset: string) => void} deps.handleCameraPresetSelection
 * @param {(direction: 1 | -1) => void} deps.shiftViewLayer
 * @param {(layer: number | null) => void} deps.setActiveViewLayer
 * @param {() => void} deps.captureCurrentView
 */

import createDebugLogger from '../utils/debugLogger.js';

const shortcutsLog = createDebugLogger('app:shortcuts');
export function setupKeyboardShortcuts(deps) {
  const {
    windowRef,
    documentRef,
    undo,
    redo,
    removeTileAtHex,
    getLastHexCoords,
    getGhostTile,
    getCurrentRotation,
    setCurrentRotation,
    baseRotationY,
    createGhostMaterials,
    getSelectedTileInfo,
    refreshGhostTile,
    updateUndoRedoButtons,
    generateBuildInstructions,
    clearMap,
    getCurrentYLevel,
    setCurrentYLevel,
    setManualLevelOverride,
    updateLevelIndicator,
    saveMapToFile,
    loadMapFromFile,
    saveMapToFileToolbar,
    loadMapFromFileToolbar,
    confirmFn = (message) => windowRef.confirm(message),
    toggleDebugOverlay,
    isFirstPersonActive = () => false,
    handleCameraPresetSelection = null,
    shiftViewLayer = null,
    setActiveViewLayer = null,
    captureCurrentView = null
  } = deps;

  if (!windowRef || !documentRef) return;

  windowRef.addEventListener('keydown', async (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
        return;
      }
    }

    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    const isEditable = (e.target && (e.target.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select'));
    const isDebugToggle = (e.key.toLowerCase() === 'd' && (e.ctrlKey || e.metaKey) && e.altKey);
    if (isDebugToggle) {
      e.preventDefault();
      toggleDebugOverlay();
      return;
    }
    if (isEditable) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (isFirstPersonActive()) {
      return;
    }

    const key = e.key.toLowerCase();
    const firstPersonActive = isFirstPersonActive();
    if (firstPersonActive && key !== 'f') {
      return;
    }

    switch (key) {
      case 'delete':
      case 'backspace': {
        const coords = getLastHexCoords();
        if (coords && coords.q !== undefined && coords.r !== undefined) {
          removeTileAtHex(coords);
        }
        break;
      }
      case 'r': {
        const ghostTile = getGhostTile();
        if (ghostTile) {
          let currentRotation = getCurrentRotation();
          currentRotation = (currentRotation - Math.PI / 3) % (2 * Math.PI);
          if (currentRotation < 0) currentRotation += 2 * Math.PI;
          setCurrentRotation(currentRotation);
          ghostTile.rotation.y = baseRotationY + currentRotation;
          shortcutsLog.log(`🔄 Rotated ghost tile to ${currentRotation} radians (${(currentRotation * 180 / Math.PI).toFixed(0)}°) - CLOCKWISE`);
          try {
            const ghostMaterials = createGhostMaterials(getSelectedTileInfo());
            ghostTile.traverse((child) => {
              if (child.isMesh) {
                const role = child.geometry?.userData?.hexMaterialRole
                  || child.userData?.hexMaterialRole
                  || 'top';
                const materialIndex = role === 'side' ? 1 : 0;
                child.material = ghostMaterials[materialIndex] || ghostMaterials[0];
              }
            });
          } catch (error) {
            void error;
          }
        }
        break;
      }
      case 'c': {
        await clearMap();
        break;
      }
      case 'pageup':
        e.preventDefault();
        setCurrentYLevel(getCurrentYLevel() + 1);
        setManualLevelOverride(true);
        updateLevelIndicator();
        refreshGhostTile();
        break;
      case 'pagedown':
        e.preventDefault();
        if (getCurrentYLevel() > 0) {
          setCurrentYLevel(getCurrentYLevel() - 1);
        }
        setManualLevelOverride(true);
        updateLevelIndicator();
        refreshGhostTile();
        break;
      case '1':
        if (handleCameraPresetSelection) {
          e.preventDefault();
          handleCameraPresetSelection('default');
        }
        break;
      case '2':
        if (handleCameraPresetSelection) {
          e.preventDefault();
          handleCameraPresetSelection('top');
        }
        break;
      case '3':
        if (handleCameraPresetSelection) {
          e.preventDefault();
          handleCameraPresetSelection('front');
        }
        break;
      case '4':
        if (handleCameraPresetSelection) {
          e.preventDefault();
          handleCameraPresetSelection('side');
        }
        break;
      case '5':
        if (handleCameraPresetSelection) {
          e.preventDefault();
          handleCameraPresetSelection('isometric');
        }
        break;
      case 'f':
        // Let first-person handler manage F when already active
        if (!isFirstPersonActive()) {
          if (handleCameraPresetSelection) {
            e.preventDefault();
            handleCameraPresetSelection('first-person');
          }
        }
        break;
      case 'q':
        if (shiftViewLayer) {
          e.preventDefault();
          shiftViewLayer(-1);
        }
        break;
      case 'e':
        if (shiftViewLayer) {
          e.preventDefault();
          shiftViewLayer(1);
        }
        break;
      case 'a':
        if (setActiveViewLayer) {
          e.preventDefault();
          setActiveViewLayer(null);
        }
        break;
      case 'p':
        if (captureCurrentView) {
          e.preventDefault();
          captureCurrentView();
        }
        break;
      default:
        break;
    }
  });

  const undoBtn = documentRef.getElementById('undo-action');
  const redoBtn = documentRef.getElementById('redo-action');
  const exportBtn = documentRef.getElementById('export-map');
  const clearMapBtn = documentRef.getElementById('clear-map');
  const saveMapBtn = documentRef.getElementById('save-map');
  const loadMapBtn = documentRef.getElementById('load-map');
  const mapFileInput = documentRef.getElementById('map-file-input');

  const undoBtnToolbar = documentRef.getElementById('undo-action-toolbar');
  const redoBtnToolbar = documentRef.getElementById('redo-action-toolbar');
  const exportBtnToolbar = documentRef.getElementById('export-map-toolbar');
  const clearMapBtnToolbar = documentRef.getElementById('clear-map-toolbar');
  const saveMapBtnToolbar = documentRef.getElementById('save-map-toolbar');
  const loadMapBtnToolbar = documentRef.getElementById('load-map-toolbar');
  const mapFileInputToolbar = documentRef.getElementById('map-file-input-toolbar');

  undoBtn?.addEventListener('click', undo);
  redoBtn?.addEventListener('click', redo);
  exportBtn?.addEventListener('click', generateBuildInstructions);
  clearMapBtn?.addEventListener('click', async () => {
    await clearMap();
  });
  saveMapBtn?.addEventListener('click', saveMapToFile);
  loadMapBtn?.addEventListener('click', () => {
    // Try File System Access API first, fallback to traditional input
    if ('showOpenFilePicker' in window) {
      loadMapFromFileToolbar();
    } else {
      mapFileInput?.click();
    }
  });
  mapFileInput?.addEventListener('change', loadMapFromFile);

  undoBtnToolbar?.addEventListener('click', undo);
  redoBtnToolbar?.addEventListener('click', redo);
  exportBtnToolbar?.addEventListener('click', generateBuildInstructions);
  clearMapBtnToolbar?.addEventListener('click', async () => {
    await clearMap();
  });
  saveMapBtnToolbar?.addEventListener('click', saveMapToFileToolbar);
  loadMapBtnToolbar?.addEventListener('click', () => {
    // Try File System Access API first, fallback to traditional input  
    if ('showOpenFilePicker' in window) {
      loadMapFromFileToolbar();
    } else {
      mapFileInputToolbar?.click();
    }
  });
  mapFileInputToolbar?.addEventListener('change', loadMapFromFileToolbar);

  updateUndoRedoButtons();
}

export default setupKeyboardShortcuts;
