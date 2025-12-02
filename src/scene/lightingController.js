import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export function createLightingController({
  scene,
  renderer,
  ambientLight,
  dirLight,
  baseAmbientIntensity,
  baseAmbientColor,
  baseDirIntensity,
  baseDirColor,
  baseDirPosition,
  storageKey,
  placedTiles,
  getHexTileModel,
  createTileMaterials,
  applyMaterialsToTileObject,
  refreshGhostMaterials,
  clearMaterialCache
}) {
  if (!scene || !renderer || !ambientLight || !dirLight) {
    throw new Error('createLightingController: scene, renderer, ambientLight, and dirLight are required.');
  }

  const safeGetHexTileModel = typeof getHexTileModel === 'function' ? getHexTileModel : () => null;
  const safeCreateTileMaterials = typeof createTileMaterials === 'function' ? createTileMaterials : null;
  const safeApplyMaterialsToTileObject = typeof applyMaterialsToTileObject === 'function' ? applyMaterialsToTileObject : null;
  const safeRefreshGhostMaterials = typeof refreshGhostMaterials === 'function' ? refreshGhostMaterials : null;
  const safeClearMaterialCache = typeof clearMaterialCache === 'function' ? clearMaterialCache : null;

  let advancedLightingEnabled = true;
  let advancedLightingButton = null;
  let pmremGenerator = null;
  let advancedEnvironmentTexture = null;
  let advancedEnvironmentRenderTarget = null;
  const advancedLights = {
    hemi: null,
    fill: null,
    rim: null
  };
  let shadowCatcher = null;
  let groundPlaneReference = null;

  function ensurePMREMGenerator() {
    if (!pmremGenerator) {
      pmremGenerator = new THREE.PMREMGenerator(renderer);
      pmremGenerator.compileEquirectangularShader();
    }
  }

  function ensureAdvancedLightingInfrastructure() {
    ensurePMREMGenerator();

    if (!advancedLights.hemi) {
      const hemi = new THREE.HemisphereLight(0xfffbf0, 0x1a1a1a, 0.55);
      hemi.castShadow = false;
      advancedLights.hemi = hemi;
    }

    if (!advancedLights.fill) {
      const fill = new THREE.DirectionalLight(0xffd7a3, 0.35);
      fill.position.set(-8, 6, -6);
      fill.castShadow = false;
      advancedLights.fill = fill;
    }

    if (!advancedLights.rim) {
      const rim = new THREE.PointLight(0x7fbaff, 0.35, 60, 2);
      rim.position.set(0, 8, -10);
      rim.castShadow = false;
      advancedLights.rim = rim;
    }

    if (!shadowCatcher) {
  const catcherGeometry = new THREE.PlaneGeometry(80, 80);
      const catcherMaterial = new THREE.ShadowMaterial({ opacity: 0.35 });
      const catcher = new THREE.Mesh(catcherGeometry, catcherMaterial);
      catcher.rotation.x = -Math.PI / 2;
      catcher.position.y = -0.02;
      catcher.receiveShadow = true;
      catcher.visible = false;
      catcher.name = 'ShadowCatcher';
      shadowCatcher = catcher;
      scene.add(shadowCatcher);
    } else if (!scene.children.includes(shadowCatcher)) {
      scene.add(shadowCatcher);
    }

    if (!advancedEnvironmentTexture) {
      getAdvancedEnvironmentTexture();
    }
  }

  function getAdvancedEnvironmentTexture() {
    if (advancedEnvironmentTexture) {
      return advancedEnvironmentTexture;
    }

    ensurePMREMGenerator();

    const environment = new RoomEnvironment();
    const renderTarget = pmremGenerator.fromScene(environment, 0.04);
    advancedEnvironmentRenderTarget = renderTarget;
    advancedEnvironmentTexture = renderTarget.texture;
    if (advancedEnvironmentTexture) {
      advancedEnvironmentTexture.encoding = THREE.sRGBEncoding;
    }

    if (typeof environment.dispose === 'function') {
      environment.dispose();
    }

    return advancedEnvironmentTexture;
  }

  function disposeEnvironmentResources() {
    try {
      if (advancedEnvironmentRenderTarget && typeof advancedEnvironmentRenderTarget.dispose === 'function') {
        advancedEnvironmentRenderTarget.dispose();
      }
    } catch {
      // Best-effort cleanup only.
    }
    advancedEnvironmentRenderTarget = null;
    advancedEnvironmentTexture = null;

    try {
      if (pmremGenerator && typeof pmremGenerator.dispose === 'function') {
        pmremGenerator.dispose();
      }
    } catch {
      // Best-effort cleanup only.
    }
    pmremGenerator = null;
  }

  function applyAdvancedLightingSettings() {
    ensureAdvancedLightingInfrastructure();

    if (advancedLightingEnabled) {
      renderer.physicallyCorrectLights = true;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
      renderer.shadowMap.enabled = true;

  ambientLight.intensity = 0.21;
      ambientLight.color.setHex(0xf0dfcf);
  dirLight.intensity = 1.12;
      dirLight.color.setHex(0xffdbc0);
      dirLight.position.set(11, 17, 8.5);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.set(2048, 2048);
      dirLight.shadow.bias = -0.0004;
      dirLight.shadow.camera.near = 1;
      dirLight.shadow.camera.far = 80;
      dirLight.shadow.camera.left = -40;
      dirLight.shadow.camera.right = 40;
      dirLight.shadow.camera.top = 40;
      dirLight.shadow.camera.bottom = -40;
      dirLight.target.position.set(0, 0, 0);
      scene.add(dirLight.target);

      const envTexture = getAdvancedEnvironmentTexture();
      scene.environment = envTexture;

      if (advancedLights.hemi) {
  advancedLights.hemi.intensity = 0.43;
        advancedLights.hemi.color.setHex(0xfffbf0);
        scene.add(advancedLights.hemi);
      }
      if (advancedLights.fill) {
  advancedLights.fill.intensity = 0.27;
        advancedLights.fill.color.setHex(0xffd7a3);
        advancedLights.fill.castShadow = false;
        scene.add(advancedLights.fill);
      }
      if (advancedLights.rim) {
  advancedLights.rim.intensity = 0.29;
        advancedLights.rim.color.setHex(0x7fbaff);
        advancedLights.rim.castShadow = false;
        scene.add(advancedLights.rim);
      }

      if (shadowCatcher) {
        shadowCatcher.visible = true;
        if (shadowCatcher.material) {
          shadowCatcher.material.opacity = 0.35;
        }
      }
    } else {
      renderer.physicallyCorrectLights = false;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.toneMappingExposure = 0.92;
      renderer.shadowMap.enabled = false;

      if (typeof baseAmbientIntensity === 'number') {
        ambientLight.intensity = baseAmbientIntensity;
      }
      if (baseAmbientColor) {
        ambientLight.color.copy(baseAmbientColor);
      }
      if (typeof baseDirIntensity === 'number') {
        dirLight.intensity = baseDirIntensity;
      }
      if (baseDirColor) {
        dirLight.color.copy(baseDirColor);
      }
      if (baseDirPosition) {
        dirLight.position.copy(baseDirPosition);
      }
      dirLight.castShadow = false;
      if (dirLight.shadow) {
        dirLight.shadow.bias = 0;
      }
      scene.environment = null;

      ['hemi', 'fill', 'rim'].forEach(key => {
        if (advancedLights[key]) {
          scene.remove(advancedLights[key]);
        }
      });

      if (shadowCatcher) {
        shadowCatcher.visible = false;
      }
    }

    if (groundPlaneReference) {
      groundPlaneReference.receiveShadow = advancedLightingEnabled;
    }
  }

  function refreshTileMaterialsForLightingMode() {
    safeClearMaterialCache?.();

    const model = safeGetHexTileModel();
    if (model) {
      model.traverse(child => {
        if (child.isMesh) {
          child.castShadow = advancedLightingEnabled;
          child.receiveShadow = true;
        }
      });
    }

    if (placedTiles && typeof placedTiles.forEach === 'function' && safeCreateTileMaterials && safeApplyMaterialsToTileObject) {
      placedTiles.forEach(tileData => {
        if (!tileData || !tileData.object) return;
        const mats = safeCreateTileMaterials(tileData.biomeId, tileData.tileNumber || 1);
        safeApplyMaterialsToTileObject(tileData.object, mats);
      });
    }

    safeRefreshGhostMaterials?.();
  }

  function updateAdvancedLightingButtonState() {
    if (!advancedLightingButton) return;
    advancedLightingButton.classList.toggle('is-active', advancedLightingEnabled);
    advancedLightingButton.setAttribute('aria-pressed', advancedLightingEnabled ? 'true' : 'false');
  }

  function setAdvancedLighting(enabled, options = {}) {
    const { skipPersistence = false, force = false } = options;
    const nextState = !!enabled;
    if (!force && advancedLightingEnabled === nextState) {
      updateAdvancedLightingButtonState();
      return;
    }

    advancedLightingEnabled = nextState;

    if (!skipPersistence && storageKey) {
      try {
        localStorage.setItem(storageKey, advancedLightingEnabled ? '1' : '0');
      } catch {
        // ignore persistence errors
      }
    }

    applyAdvancedLightingSettings();
    refreshTileMaterialsForLightingMode();
    updateAdvancedLightingButtonState();
  }

  function setupAdvancedLightingToggle() {
    ensureAdvancedLightingInfrastructure();
    advancedLightingButton = document.getElementById('toggle-advanced-lighting');
    if (advancedLightingButton) {
      advancedLightingButton.addEventListener('click', () => {
        setAdvancedLighting(!advancedLightingEnabled);
      });
    }

    let initial = true;
    if (storageKey) {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored === '1') {
          initial = true;
        } else if (stored === '0') {
          initial = false;
        }
      } catch {
        initial = true;
      }
    }

    setAdvancedLighting(initial, { skipPersistence: true, force: true });
  }

  return {
    isEnabled: () => advancedLightingEnabled,
    setAdvancedLighting,
    setupToggle: setupAdvancedLightingToggle,
    refreshForLightingMode: refreshTileMaterialsForLightingMode,
    dispose: disposeEnvironmentResources,
    setGroundPlaneReference: (plane) => {
      groundPlaneReference = plane || null;
      if (groundPlaneReference) {
        groundPlaneReference.receiveShadow = advancedLightingEnabled;
      }
    }
  };
}

export default createLightingController;
