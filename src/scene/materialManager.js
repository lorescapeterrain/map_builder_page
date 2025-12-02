import * as THREE from 'three';
import createDebugLogger from '../utils/debugLogger.js';

const textureLog = createDebugLogger('scene:textures');

const MATERIAL_SIDE_REGEX = /side/i;
const MATERIAL_TOP_REGEX = /top|cap/i;
const SIDE_ROLE = 'side';
const TOP_ROLE = 'top';

function inferMeshRoleFromName(name = '') {
  const lower = String(name).toLowerCase();
  if (MATERIAL_SIDE_REGEX.test(lower)) return SIDE_ROLE;
  if (MATERIAL_TOP_REGEX.test(lower)) return TOP_ROLE;
  return TOP_ROLE;
}

function resolveMeshRole(child) {
  if (!child) return TOP_ROLE;
  if (child.geometry?.userData?.hexMaterialRole) return child.geometry.userData.hexMaterialRole;
  if (child.userData?.hexMaterialRole) return child.userData.hexMaterialRole;

  if (Array.isArray(child.material)) {
    for (const mat of child.material) {
      const role = inferMeshRoleFromName(mat?.name);
      if (role) return role;
    }
  }

  return inferMeshRoleFromName(child.material?.name || child.name);
}

function pickMaterialForRole(materials, role) {
  if (!materials || materials.length === 0) return null;
  if (role === SIDE_ROLE && materials.length > 1) {
    return materials[1];
  }
  return materials[0];
}

export function createMaterialManager({
  scene,
  getAdvancedLightingEnabled,
  maxSupportedAnisotropy = 1,
  basePlasticColorHex,
  getTileColor,
  getSelectedTileInfo,
  getGhostTile,
  getGridTexturePath
}) {
  if (typeof getAdvancedLightingEnabled !== 'function') {
    throw new Error('createMaterialManager requires getAdvancedLightingEnabled()');
  }
  if (typeof getSelectedTileInfo !== 'function') {
    throw new Error('createMaterialManager requires getSelectedTileInfo()');
  }
  if (typeof getGhostTile !== 'function') {
    throw new Error('createMaterialManager requires getGhostTile()');
  }
  if (typeof getTileColor !== 'function') {
    throw new Error('createMaterialManager requires getTileColor()');
  }

  const textureLoader = new THREE.TextureLoader();
  const loadedTextures = new Map();
  const materialCache = new Map();
  let collisionMaterialsCache = { profile: null, materials: null };
  const textureWaiters = new Map();
  const textureStatus = new Map();

  const basePlasticColorLinear = new THREE.Color(basePlasticColorHex).convertSRGBToLinear();

  // Use getGridTexturePath function instead of hard-coded biomeTextureMap
  const biomeTextureMap = {};

  let TEX_DEBUG = false;

  function texDbg(...args) {
    if (TEX_DEBUG) textureLog.log(...args);
  }

  function texDbgGroupCollapsed(...args) {
    if (TEX_DEBUG) textureLog.groupCollapsed(...args);
  }

  function texDbgGroupEnd() {
    if (TEX_DEBUG) textureLog.groupEnd();
  }

  function setTextureDebug(on) {
    TEX_DEBUG = !!on;
    if (typeof window !== 'undefined') window.DEBUG_TEXTURES = TEX_DEBUG;
    try {
      localStorage.setItem('debugTextures', TEX_DEBUG ? '1' : '0');
    } catch (error) {
      console.warn('Failed to persist texture debug flag', error);
    }
    textureLog.log(`🧩 Texture debug ${TEX_DEBUG ? 'ENABLED' : 'disabled'}`);
  }

  try {
    const fromWin = typeof window !== 'undefined' ? window.DEBUG_TEXTURES : undefined;
    const fromLS = (typeof localStorage !== 'undefined' && localStorage.getItem('debugTextures') === '1');
    const fromURL = (typeof location !== 'undefined' && new URLSearchParams(location.search).get('debug') === '1');
    const initial = (fromWin === true) || fromLS || fromURL;
    setTextureDebug(initial);
    if (typeof window !== 'undefined') {
      window.enableTextureDebug = () => setTextureDebug(true);
      window.disableTextureDebug = () => setTextureDebug(false);
    }
  } catch (error) {
    console.warn('Failed to initialize texture debug flag from environment', error);
  }

  textureLog.log('🧹 Clearing texture and material caches...');
  loadedTextures.clear();
  materialCache.clear();

  let ghostOpacityTop = (() => {
    const v = parseFloat(typeof localStorage !== 'undefined' ? localStorage.getItem('ghost:opacity:top') : '');
    return isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.75;
  })();
  let ghostOpacitySide = (() => {
    const v = parseFloat(typeof localStorage !== 'undefined' ? localStorage.getItem('ghost:opacity:side') : '');
    return isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5;
  })();

  function getGhostOpacities() {
    return { top: ghostOpacityTop, side: ghostOpacitySide };
  }

  function getTextureConfigForBiome(biomeId) {
    if (biomeTextureMap[biomeId]) return biomeTextureMap[biomeId];
    const fallback = typeof getGridTexturePath === 'function' ? getGridTexturePath(biomeId) : null;
    if (fallback && fallback.gridTexture) {
      return {
        type: 'grid',
        path: fallback.gridTexture,
        gridSize: fallback.gridSize || { cols: 5, rows: 10 },
        tileSize: { width: 450, height: 450 }
      };
    }
    return null;
  }

  function loadTexture(texturePath, onLoadCallback = null) {
    if (loadedTextures.has(texturePath)) {
      const cachedTexture = loadedTextures.get(texturePath);
      texDbg(`🎨 Using cached texture: ${texturePath}`);
      const ready = !!(cachedTexture.image && cachedTexture.image.complete);
      if (onLoadCallback) {
        if (ready) {
          setTimeout(() => onLoadCallback(cachedTexture), 0);
        } else {
          const waiters = textureWaiters.get(texturePath) || [];
          waiters.push(onLoadCallback);
          textureWaiters.set(texturePath, waiters);
          texDbg(`🕒 Registered waiter for ${texturePath}; waiting count: ${waiters.length}`);
        }
      }
      return cachedTexture;
    }

    texDbg(`🎨 Loading texture: ${texturePath}`);
    textureStatus.set(texturePath, { state: 'loading' });
    const texture = textureLoader.load(
      texturePath,
      function onLoad(loadedTexture) {
        const { width, height } = loadedTexture.image || {};
        textureStatus.set(texturePath, { state: 'ready', width, height });
        texDbg(`✅ Texture loaded successfully: ${texturePath}`, loadedTexture);
        if (width && height) texDbg(`📏 Texture dimensions: ${width}x${height}`);

        if (onLoadCallback) {
          try { onLoadCallback(loadedTexture); } catch (error) { console.error('⚠️ onLoadCallback error:', error); }
        }
        const waiters = textureWaiters.get(texturePath) || [];
        if (waiters.length) { texDbg(`📣 Flushing ${waiters.length} waiter(s) for ${texturePath}`); }
        for (const cb of waiters) {
          try { cb(loadedTexture); } catch (error) { console.error('⚠️ waiter callback error:', error); }
        }
        textureWaiters.delete(texturePath);
      },
      function onProgress(progress) {
        texDbg(`📊 Loading progress for ${texturePath}:`, progress?.loaded !== undefined ? `${progress.loaded}/${progress.total}` : progress);
      },
      function onError(error) {
        textureStatus.set(texturePath, { state: 'error' });
        console.error(`❌ Error loading texture ${texturePath}:`, error);
        const waiters = textureWaiters.get(texturePath) || [];
        for (const cb of waiters) {
          try { cb(null); } catch (error) { console.error('⚠️ waiter callback error:', error); }
        }
        textureWaiters.delete(texturePath);
      }
    );

    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.flipY = false;
    loadedTextures.set(texturePath, texture);
    return texture;
  }

  function clearMaterialCache() {
    texDbg('🧼 Clearing material cache');
    materialCache.clear();
    collisionMaterialsCache = { profile: null, materials: null };
  }

  function createTileTextureFromGrid(gridConfig, tileNumber) {
    texDbg(`🎨 Creating tile texture from grid: ${gridConfig.path}, tile: ${tileNumber}`);

    const baseTexture = loadTexture(gridConfig.path, () => {
      texDbg(`🎨 Grid texture loaded callback for tile ${tileNumber}`);
      extractTile();
    });

    const index = tileNumber - 1;
    const col = index % gridConfig.gridSize.cols;
    const row = Math.floor(index / gridConfig.gridSize.cols);
    texDbg(`📍 Grid position for tile ${tileNumber}: index=${index}, col=${col}, row=${row} (row-major)`);

    const tileTexture = new THREE.Texture();

    const extractTile = () => {
      if (!baseTexture.image) {
        texDbg('⏳ Base texture image not ready yet');
        return;
      }

      const img = baseTexture.image;
      texDbg(`🖼️ Base texture dimensions: ${img.width}x${img.height}`);
      texDbg(`🖼️ Expected grid: ${gridConfig.gridSize.cols}x${gridConfig.gridSize.rows} tiles`);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = gridConfig.tileSize.width;
      canvas.height = gridConfig.tileSize.height;

      const srcX = col * gridConfig.tileSize.width;
      const srcY = row * gridConfig.tileSize.height;
      texDbg(`🗜️ Extracting tile from source: x=${srcX}, y=${srcY}, w=${gridConfig.tileSize.width}, h=${gridConfig.tileSize.height}`);

      ctx.drawImage(
        baseTexture.image,
        srcX, srcY, gridConfig.tileSize.width, gridConfig.tileSize.height,
        0, 0, canvas.width, canvas.height
      );

      if (tileNumber === 1) {
        texDbg(`🔍 DEBUG: First tile canvas data:`, {
          width: canvas.width,
          height: canvas.height,
          srcX,
          srcY,
          canvasData: ctx.getImageData(0, 0, 50, 50).data.slice(0, 20)
        });
      }

      tileTexture.image = canvas;
      tileTexture.needsUpdate = true;
      tileTexture.rotation = Math.PI / 6;
      tileTexture.center.set(0.5, 0.5);

      setTimeout(() => {
        tileTexture.needsUpdate = true;
        texDbg(`🔄 Forced texture update for tile ${tileNumber} after extraction`);
      }, 50);
    };

    if (baseTexture.image && baseTexture.image.complete) {
      texDbg(`🎨 Base texture already loaded for tile ${tileNumber}, extracting immediately`);
      extractTile();
    } else {
      texDbg(`⏳ Base texture not loaded yet for tile ${tileNumber}, waiting for callback`);
    }

    tileTexture.wrapS = THREE.ClampToEdgeWrapping;
    tileTexture.wrapT = THREE.ClampToEdgeWrapping;
    tileTexture.flipY = false;
    tileTexture.userData = { source: gridConfig.path, tileNumber, col, row };
    texDbg(`🎨 Created tile texture ${tileNumber}: col=${col}, row=${row} | wrapS=${tileTexture.wrapS}, wrapT=${tileTexture.wrapT}, flipY=${tileTexture.flipY}`);

    return tileTexture;
  }

  function createTileMaterials(biomeId, tileNumber = 1) {
    const profile = getAdvancedLightingEnabled() ? 'pbr' : 'lambert';
    const materialKey = `${profile}:${biomeId}_${tileNumber}`;

    texDbg(`🎨 Creating materials for biome: ${biomeId}, tile: ${tileNumber}, key: ${materialKey}, profile=${profile}`);

    if (materialCache.has(materialKey)) {
      texDbg(`🎨 Using cached material for ${materialKey}`);
      return materialCache.get(materialKey);
    }

    let topMaterial;
    let sideMaterial;

    const textureConfig = getTextureConfigForBiome(biomeId);
    texDbg(`🎨 Texture config for ${biomeId}:`, textureConfig);

    const isPBR = profile === 'pbr';
    const TopMaterialCtor = isPBR ? THREE.MeshStandardMaterial : THREE.MeshLambertMaterial;
    const SideMaterialCtor = isPBR ? THREE.MeshStandardMaterial : THREE.MeshLambertMaterial;

    const buildPlasticParams = (overrides = {}) => {
      if (!isPBR) return overrides;
      return Object.assign({
        roughness: 0.52,
        metalness: 0.05,
        envMap: scene.environment || null,
        envMapIntensity: 0.7
      }, overrides);
    };

    if (textureConfig) {
      let tileTexture = null;
      if (textureConfig.type === 'grid') {
        texDbg(`🎨 Using grid texture system for ${biomeId}`);
        tileTexture = createTileTextureFromGrid(textureConfig, tileNumber);
      } else {
        texDbg(`🎨 Using legacy single texture system for ${biomeId}`);
        tileTexture = loadTexture(textureConfig);
        if (tileTexture) {
          tileTexture.rotation = Math.PI / 6;
          tileTexture.center.set(0.5, 0.5);
        }
      }

      if (tileTexture) {
        tileTexture.encoding = THREE.sRGBEncoding;
        if (isPBR && tileTexture.anisotropy !== undefined) {
          tileTexture.anisotropy = Math.max(tileTexture.anisotropy || 1, maxSupportedAnisotropy);
        }
      }

      const params = buildPlasticParams({
        map: tileTexture || null,
        color: 0xffffff
      });

      if (!isPBR) {
        params.color = new THREE.Color(0xffffff).convertSRGBToLinear();
      }

      if (isPBR) {
        params.roughness = 0.42;
        params.metalness = 0.07;
        params.envMapIntensity = 0.78;
      }

      topMaterial = new TopMaterialCtor(params);
    } else {
      texDbg(`🎨 No texture config found for ${biomeId}, using fallback color`);
      const fallbackHex = getTileColor(biomeId) || basePlasticColorHex;
      const fallbackColor = new THREE.Color(fallbackHex).convertSRGBToLinear();
      const params = buildPlasticParams({ color: fallbackColor });
      topMaterial = new TopMaterialCtor(params);
      texDbg(`🎨 Fallback color material for ${biomeId}: #${fallbackHex.toString(16)}`);
    }

    const sideParams = buildPlasticParams({ color: basePlasticColorLinear.clone() });
    if (isPBR) {
      sideParams.roughness = 0.6;
      sideParams.metalness = 0.05;
      sideParams.envMapIntensity = 0.58;
    }
    sideMaterial = new SideMaterialCtor(sideParams);

    const materials = [topMaterial, sideMaterial];
    materialCache.set(materialKey, materials);
    texDbg(`🎨 Cached new materials for ${materialKey}`);
    return materials;
  }

  function applyMaterialsToTileObject(tileObject, materials) {
    if (!tileObject || !materials || materials.length === 0) return;
    tileObject.traverse(child => {
      if (child.isMesh) {
        const role = resolveMeshRole(child);
        const material = pickMaterialForRole(materials, role) || materials[0];
        if (!material) return;
        child.material = material;
        child.material.needsUpdate = true;
        child.userData = child.userData || {};
        child.userData.hexMaterialRole = role;
        child.castShadow = getAdvancedLightingEnabled();
        child.receiveShadow = true;
      }
    });
  }

  function preloadBiomeTexture(biomeId) {
    const cfg = getTextureConfigForBiome(biomeId);
    if (!cfg) return;
    if (cfg.type === 'grid' && cfg.path) {
      texDbg(`🧯 Preloading grid texture for ${biomeId}: ${cfg.path}`);
      loadTexture(cfg.path);
    } else if (typeof cfg === 'string') {
      texDbg(`🧯 Preloading single texture for ${biomeId}: ${cfg}`);
      loadTexture(cfg);
    }
  }

  function dumpTextureDebug() {
    try {
      const entries = Array.from(loadedTextures.keys());
      texDbgGroupCollapsed(`🧪 Texture Debug: ${entries.length} cached`);
      for (const key of entries) {
        const t = loadedTextures.get(key);
        const st = textureStatus.get(key);
  textureLog.log(`• ${key}`, { ready: !!(t?.image && t.image.complete), width: t?.image?.width, height: t?.image?.height, status: st });
      }
      texDbgGroupEnd();
    } catch (error) {
      console.error('dumpTextureDebug error', error);
    }
  }

  if (typeof window !== 'undefined') {
    window.dumpTextureDebug = dumpTextureDebug;
  }

  function createGhostMaterials(selInfo = getSelectedTileInfo()) {
    const isPBR = getAdvancedLightingEnabled();
    const GhostMaterialCtor = isPBR ? THREE.MeshStandardMaterial : THREE.MeshLambertMaterial;

    const baseParams = {
      color: 0xffffff,
      transparent: true,
      depthWrite: false
    };

    const sideParams = Object.assign({}, baseParams, { opacity: ghostOpacitySide });
    if (isPBR) {
      sideParams.roughness = 0.2;
      sideParams.metalness = 0.0;
      sideParams.envMap = scene.environment || null;
      sideParams.envMapIntensity = 0.25;
    }
    const sideGhost = new GhostMaterialCtor(sideParams);

    const topParams = Object.assign({}, baseParams, { opacity: ghostOpacityTop });
    if (isPBR) {
      topParams.roughness = 0.15;
      topParams.metalness = 0.0;
      topParams.envMap = scene.environment || null;
      topParams.envMapIntensity = 0.3;
    }

    let topGhost = new GhostMaterialCtor(topParams);

    try {
      if (selInfo && selInfo.biomeId && selInfo.tileNumber != null) {
        const mats = createTileMaterials(selInfo.biomeId, selInfo.tileNumber);
        const realTop = mats && mats[0];
        if (realTop && realTop.map) {
          topParams.map = realTop.map;
          topGhost = new GhostMaterialCtor(topParams);
          texDbg(`👻 Ghost overlay using texture for ${selInfo.biomeId}_${selInfo.tileNumber}`);
        } else {
          texDbg(`👻 Ghost overlay fallback (no texture) for ${selInfo.biomeId}_${selInfo.tileNumber}`);
        }
      }
    } catch (error) {
      console.warn('Ghost material creation failed, falling back to plain white:', error);
    }

    return [topGhost, sideGhost];
  }

  function getCollisionMaterials() {
    const profile = getAdvancedLightingEnabled() ? 'pbr' : 'lambert';
    if (collisionMaterialsCache.profile === profile && collisionMaterialsCache.materials) {
      return collisionMaterialsCache.materials;
    }

    const isPBR = profile === 'pbr';
    const CollisionMaterialCtor = isPBR ? THREE.MeshStandardMaterial : THREE.MeshLambertMaterial;

    const createColor = hex => {
      const color = new THREE.Color(hex);
      if (!isPBR) {
        color.convertSRGBToLinear();
      }
      return color;
    };

    const topParams = {
      color: createColor(0xff6b6b),
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      side: THREE.DoubleSide
    };

    const sideParams = {
      color: createColor(0xcc1f1f),
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      side: THREE.DoubleSide
    };

    if (isPBR) {
      const emissive = new THREE.Color(0x330000);
      topParams.roughness = 0.42;
      topParams.metalness = 0.08;
      topParams.envMap = scene.environment || null;
      topParams.envMapIntensity = 0.65;
      topParams.emissive = emissive;
      topParams.emissiveIntensity = 0.28;

      sideParams.roughness = 0.5;
      sideParams.metalness = 0.05;
      sideParams.envMap = scene.environment || null;
      sideParams.envMapIntensity = 0.5;
      sideParams.emissive = emissive;
      sideParams.emissiveIntensity = 0.18;
    }

    const topMaterial = new CollisionMaterialCtor(topParams);
    const sideMaterial = new CollisionMaterialCtor(sideParams);

    collisionMaterialsCache = {
      profile,
      materials: [topMaterial, sideMaterial]
    };

    return collisionMaterialsCache.materials;
  }

  function refreshGhostMaterials() {
    const ghostTile = getGhostTile();
    if (!ghostTile) return;
    const ghostMaterials = createGhostMaterials();
    ghostTile.traverse(child => {
      if (child.isMesh) {
        const role = resolveMeshRole(child);
        const material = pickMaterialForRole(ghostMaterials, role) || ghostMaterials[0];
        if (!material) return;
        child.material = material;
        child.material.needsUpdate = true;
        child.castShadow = false;
        child.receiveShadow = getAdvancedLightingEnabled();
      }
    });
  }

  function setupGhostOpacityControls() {
    const topInp = document.getElementById('ghost-top-opacity');
    const sideInp = document.getElementById('ghost-side-opacity');
    const topVal = document.getElementById('ghost-top-opacity-value');
    const sideVal = document.getElementById('ghost-side-opacity-value');
    if (!topInp || !sideInp || !topVal || !sideVal) return;

    const syncUI = () => {
      topInp.value = String(ghostOpacityTop);
      sideInp.value = String(ghostOpacitySide);
      topVal.textContent = ghostOpacityTop.toFixed(2);
      sideVal.textContent = ghostOpacitySide.toFixed(2);
    };
    syncUI();

    const onChange = () => {
      ghostOpacityTop = parseFloat(topInp.value);
      ghostOpacitySide = parseFloat(sideInp.value);
      if (!isFinite(ghostOpacityTop)) ghostOpacityTop = 0.75;
      if (!isFinite(ghostOpacitySide)) ghostOpacitySide = 0.5;
      try {
        localStorage.setItem('ghost:opacity:top', String(ghostOpacityTop));
        localStorage.setItem('ghost:opacity:side', String(ghostOpacitySide));
      } catch (error) {
        console.warn('Ghost opacity persistence failed', error);
      }
      syncUI();
      refreshGhostMaterials();
    };

    topInp.addEventListener('input', onChange);
    sideInp.addEventListener('input', onChange);
  }

  return {
    createTileMaterials,
    applyMaterialsToTileObject,
    createGhostMaterials,
    refreshGhostMaterials,
    preloadBiomeTexture,
    setupGhostOpacityControls,
    dumpTextureDebug,
    setTextureDebug,
    getGhostOpacities,
    getCollisionMaterials,
    clearCache: clearMaterialCache
  };
}
