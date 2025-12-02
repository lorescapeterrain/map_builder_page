/**
 * Provides undo/redo management for map interactions.
 * @param {Object} deps
 * @param {number} deps.maxUndoHistory
 * @param {() => string} deps.getPlacementMode
 * @param {() => import('three').Object3D | null} deps.getHexTileModel
 * @param {import('three').Scene} deps.scene
 * @param {Array<import('three').Object3D>} deps.interactableObjects
 * @param {Map<string, any>} deps.placedTiles
 * @param {Map<string, number>} deps.tileInstanceLimits
 * @param {Map<string, number>} deps.perBiomeDenominator
 * @param {(biomeId: string) => number} deps.getBiomeTotalSets
 * @param {(biomeId: string, tileNumber: number) => import('three').Material[]} deps.createTileMaterials
 * @param {(object: import('three').Object3D, materials: import('three').Material[]) => void} deps.applyMaterialsToTileObject
 * @param {number} deps.tileScale
 * @param {() => void} deps.updateHeaderStats
 * @param {() => void} deps.updateRightPanelStats
 * @param {() => any} [deps.getUIController]
 * @param {(info: { type: string, tileKey?: string }) => void} [deps.onTilesMutated]
 * @returns {{
 *  addToUndoStack: (action: any) => void,
 *  undo: () => void,
 *  redo: () => void,
 *  updateUndoRedoButtons: () => void,
 *  getUndoCount: () => number,
 *  getRedoCount: () => number
 * }}
 */
export function createUndoRedoController(deps) {
  const {
    maxUndoHistory,
    getPlacementMode,
    getHexTileModel,
    scene,
    interactableObjects,
    placedTiles,
    tileInstanceLimits,
    perBiomeDenominator,
    getBiomeTotalSets,
    createTileMaterials,
    applyMaterialsToTileObject,
    tileScale,
    updateHeaderStats,
    updateRightPanelStats,
    getUIController,
    onTilesMutated
  } = deps;

  const extractYLevel = (tileKey) => {
    if (!tileKey) return 0;
    const match = tileKey.match(/y:(-?\d+)/);
    if (!match) return 0;
    const parsed = Number.parseInt(match[1], 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const notifyTilesChanged = (info) => {
    if (typeof onTilesMutated === 'function') {
      try {
        onTilesMutated(info);
      } catch (error) {
        console.warn('onTilesMutated callback failed', error);
      }
    }
  };

  const positiveModulo = (value, modulus) => {
    if (!Number.isFinite(value)) return 0;
    const result = value % modulus;
    return result < 0 ? result + modulus : result;
  };

  const computeRotationMetadata = (absoluteRotationY) => {
    if (!Number.isFinite(absoluteRotationY)) {
      return {
        instructionDegrees: 0,
        sceneDegrees: 0,
        sceneRadians: 0
      };
    }

    const normalizedDegrees = positiveModulo((absoluteRotationY * 180) / Math.PI, 360);
    const snappedSceneDegreesRaw = Math.round(normalizedDegrees / 60) * 60;
    const sceneDegrees = positiveModulo(snappedSceneDegreesRaw, 360);
    const sceneRadians = (sceneDegrees * Math.PI) / 180;
    const instructionDegrees = positiveModulo(360 - sceneDegrees, 360);

    return {
      instructionDegrees,
      sceneDegrees,
      sceneRadians
    };
  };

  const undoStack = [];
  const redoStack = [];

  function addToUndoStack(action) {
    undoStack.push({
      ...action,
      timestamp: Date.now()
    });

    if (undoStack.length > maxUndoHistory) {
      undoStack.shift();
    }

    redoStack.length = 0;

    updateUndoRedoButtons();
  }

  function undo() {
    if (undoStack.length === 0) return;

    const action = undoStack.pop();

    switch (action.type) {
      case 'place':
        undoPlaceTile(action);
        break;
      case 'remove':
        undoRemoveTile(action);
        break;
      case 'clear':
        undoClearMap(action);
        break;
      default:
        break;
    }

    redoStack.push(action);
    updateUndoRedoButtons();
  }

  function redo() {
    if (redoStack.length === 0) return;

    const action = redoStack.pop();

    switch (action.type) {
      case 'place':
        redoPlaceTile(action);
        break;
      case 'remove':
        redoRemoveTile(action);
        break;
      case 'clear':
        redoClearMap(action);
        break;
      default:
        break;
    }

    undoStack.push(action);
    updateUndoRedoButtons();
  }

  function undoPlaceTile(action) {
    const tileData = placedTiles.get(action.tileKey);
    if (tileData && tileData.object) {
      scene.remove(tileData.object);
      const idx = interactableObjects.indexOf(tileData.object);
      if (idx > -1) interactableObjects.splice(idx, 1);

      if (getPlacementMode() === 'limited' && action.instanceId) {
        const current = tileInstanceLimits.get(action.instanceId) || 0;
        tileInstanceLimits.set(action.instanceId, current + 1);
      }

      placedTiles.delete(action.tileKey);
      getUIController?.()?.refreshBiomeGridUI?.();
      updateHeaderStats();
      updateRightPanelStats();
      notifyTilesChanged({ type: 'remove', tileKey: action.tileKey });
    }
  }

  function undoRemoveTile(action) {
    if (!action.selectedTileInfo) return;

    const hexTileModel = getHexTileModel();
    if (!hexTileModel) return;

    const newTile = hexTileModel.clone();
    newTile.userData = {
      isTile: true,
      tileKey: action.tileKey,
      instanceId: action.instanceId,
      biomeId: action.selectedTileInfo.biomeId
    };

    const materials = createTileMaterials(action.selectedTileInfo.biomeId, action.selectedTileInfo.tileNumber);
    applyMaterialsToTileObject(newTile, materials);

    newTile.position.set(action.position.x, action.position.y, action.position.z);
    newTile.rotation.set(action.rotation.x, action.rotation.y, action.rotation.z);
    newTile.scale.set(tileScale, tileScale, tileScale);

    scene.add(newTile);
    interactableObjects.push(newTile);
    const rotationMeta = computeRotationMetadata(action.rotation.y);
    placedTiles.set(action.tileKey, {
      name: action.selectedTileInfo.name,
      biomeId: action.selectedTileInfo.biomeId,
      tileNumber: action.selectedTileInfo.tileNumber,
      object: newTile,
      instanceId: action.instanceId,
      yLevel: extractYLevel(action.tileKey),
      rotation: {
        x: action.rotation.x,
        y: action.rotation.y,
        z: action.rotation.z
      },
      rotationDegrees: rotationMeta.instructionDegrees,
      rotationSceneDegrees: rotationMeta.sceneDegrees,
      rotationSceneRadians: rotationMeta.sceneRadians
    });

    if (getPlacementMode() === 'limited' && action.instanceId) {
      const current = tileInstanceLimits.get(action.instanceId) || 0;
      if (current > 0) {
        tileInstanceLimits.set(action.instanceId, current - 1);
      }
    }

    getUIController?.()?.refreshBiomeGridUI?.();
    updateHeaderStats();
    updateRightPanelStats();
    notifyTilesChanged({ type: 'add', tileKey: action.tileKey });
  }

  function undoClearMap(action) {
    const hexTileModel = getHexTileModel();
    if (!hexTileModel) return;

    action.savedTiles.forEach((tileData) => {
      const newTile = hexTileModel.clone();
      newTile.userData = {
        isTile: true,
        tileKey: tileData.tileKey,
        instanceId: tileData.instanceId,
        biomeId: tileData.biomeId
      };

      const materials = createTileMaterials(tileData.biomeId, tileData.tileNumber);
      applyMaterialsToTileObject(newTile, materials);

      newTile.position.set(tileData.position.x, tileData.position.y, tileData.position.z);
      newTile.rotation.set(tileData.rotation.x, tileData.rotation.y, tileData.rotation.z);
      newTile.scale.set(tileScale, tileScale, tileScale);

      scene.add(newTile);
      interactableObjects.push(newTile);
      const rotationMeta = computeRotationMetadata(tileData.rotation.y);
      placedTiles.set(tileData.tileKey, {
        name: tileData.name,
        biomeId: tileData.biomeId,
        tileNumber: tileData.tileNumber,
        object: newTile,
        instanceId: tileData.instanceId,
        yLevel: extractYLevel(tileData.tileKey),
        rotation: {
          x: tileData.rotation.x,
          y: tileData.rotation.y,
          z: tileData.rotation.z
        },
        rotationDegrees: rotationMeta.instructionDegrees,
        rotationSceneDegrees: rotationMeta.sceneDegrees,
        rotationSceneRadians: rotationMeta.sceneRadians
      });
    });

    if (getPlacementMode() === 'limited') {
      action.savedLimits.forEach((value, key) => {
        tileInstanceLimits.set(key, value);
      });
    }

    getUIController?.()?.refreshBiomeGridUI?.();
    updateHeaderStats();
    updateRightPanelStats();
    notifyTilesChanged({ type: 'refresh' });
  }

  function redoPlaceTile(action) {
    const hexTileModel = getHexTileModel();
    if (!hexTileModel) return;

    const newTile = hexTileModel.clone();
    newTile.userData = {
      isTile: true,
      tileKey: action.tileKey,
      instanceId: action.instanceId,
      biomeId: action.selectedTileInfo.biomeId
    };

    const materials = createTileMaterials(action.selectedTileInfo.biomeId, action.selectedTileInfo.tileNumber);
    applyMaterialsToTileObject(newTile, materials);

    newTile.position.set(action.position.x, action.position.y, action.position.z);
    newTile.rotation.set(action.rotation.x, action.rotation.y, action.rotation.z);
    newTile.scale.set(tileScale, tileScale, tileScale);

    scene.add(newTile);
    interactableObjects.push(newTile);
    const rotationMeta = computeRotationMetadata(action.rotation.y);
    placedTiles.set(action.tileKey, {
      name: action.selectedTileInfo.name,
      biomeId: action.selectedTileInfo.biomeId,
      tileNumber: action.selectedTileInfo.tileNumber,
      object: newTile,
      instanceId: action.instanceId,
      yLevel: extractYLevel(action.tileKey),
      rotation: {
        x: action.rotation.x,
        y: action.rotation.y,
        z: action.rotation.z
      },
      rotationDegrees: rotationMeta.instructionDegrees,
      rotationSceneDegrees: rotationMeta.sceneDegrees,
      rotationSceneRadians: rotationMeta.sceneRadians
    });

    if (getPlacementMode() === 'limited' && action.instanceId) {
      const current = tileInstanceLimits.get(action.instanceId) || 0;
      if (current > 0) {
        tileInstanceLimits.set(action.instanceId, current - 1);
      }
    }

    getUIController?.()?.refreshBiomeGridUI?.();
    updateHeaderStats();
    updateRightPanelStats();
    notifyTilesChanged({ type: 'add', tileKey: action.tileKey });
  }

  function redoRemoveTile(action) {
    const tileData = placedTiles.get(action.tileKey);
    if (tileData && tileData.object) {
      scene.remove(tileData.object);
      const idx = interactableObjects.indexOf(tileData.object);
      if (idx > -1) interactableObjects.splice(idx, 1);

      if (getPlacementMode() === 'limited' && action.instanceId) {
        const biomeId = action.selectedTileInfo?.biomeId;
        const originalTotal = perBiomeDenominator.get(biomeId) || getBiomeTotalSets(biomeId);
        const current = tileInstanceLimits.get(action.instanceId) || 0;
        if (current < originalTotal) {
          tileInstanceLimits.set(action.instanceId, current + 1);
        }
      }

      placedTiles.delete(action.tileKey);
      getUIController?.()?.refreshBiomeGridUI?.();
      updateHeaderStats();
      updateRightPanelStats();
      notifyTilesChanged({ type: 'remove', tileKey: action.tileKey });
    }
  }

  function redoClearMap() {
    placedTiles.forEach((tile) => {
      if (tile.object) {
        scene.remove(tile.object);
        const idx = interactableObjects.indexOf(tile.object);
        if (idx > -1) interactableObjects.splice(idx, 1);
      }
    });
    placedTiles.clear();

    getUIController?.()?.refreshBiomeGridUI?.();
    updateHeaderStats();
    updateRightPanelStats();
    notifyTilesChanged({ type: 'clear' });
  }

  function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undo-action');
    const redoBtn = document.getElementById('redo-action');
    const undoBtnToolbar = document.getElementById('undo-action-toolbar');
    const redoBtnToolbar = document.getElementById('redo-action-toolbar');

    if (undoBtn) {
      undoBtn.disabled = undoStack.length === 0;
      undoBtn.title = undoStack.length === 0 ? 'Nothing to undo' : `Undo (${undoStack.length} actions)`;
    }

    if (redoBtn) {
      redoBtn.disabled = redoStack.length === 0;
      redoBtn.title = redoStack.length === 0 ? 'Nothing to redo' : `Redo (${redoStack.length} actions)`;
    }

    if (undoBtnToolbar) {
      undoBtnToolbar.disabled = undoStack.length === 0;
      undoBtnToolbar.title = undoStack.length === 0 ? 'Nothing to undo' : `Undo (${undoStack.length} actions)`;
    }

    if (redoBtnToolbar) {
      redoBtnToolbar.disabled = redoStack.length === 0;
      redoBtnToolbar.title = redoStack.length === 0 ? 'Nothing to redo' : `Redo (${redoStack.length} actions)`;
    }
  }

  function getUndoCount() {
    return undoStack.length;
  }

  function getRedoCount() {
    return redoStack.length;
  }

  return {
    addToUndoStack,
    undo,
    redo,
    updateUndoRedoButtons,
    getUndoCount,
    getRedoCount
  };
}

export default createUndoRedoController;
