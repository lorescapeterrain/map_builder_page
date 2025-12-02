import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { registerAsset, markAssetLoaded, markAssetError } from '../utils/assetLoadingManager.js';

const TOP_ROLE = 'top';
const SIDE_ROLE = 'side';
const ROLE_FALLBACK = TOP_ROLE;
const MATERIAL_SIDE_REGEX = /side/i;
const MATERIAL_TOP_REGEX = /top|cap/i;

const sharedBox = new THREE.Box3();
const sharedCenter = new THREE.Vector3();
const sharedSize = new THREE.Vector3();

function inferRoleFromName(name = '') {
  const lower = String(name).toLowerCase();
  if (MATERIAL_SIDE_REGEX.test(lower)) return SIDE_ROLE;
  if (MATERIAL_TOP_REGEX.test(lower)) return TOP_ROLE;
  return ROLE_FALLBACK;
}

function getMeshRole(mesh) {
  if (!mesh) return ROLE_FALLBACK;
  return mesh.geometry?.userData?.hexMaterialRole
    || mesh.userData?.hexMaterialRole
    || inferRoleFromName(mesh.material?.name || mesh.name);
}

function ensureHexTileUVs(mesh) {
  const geometry = mesh.geometry;
  if (!geometry || geometry.attributes.uv) return;

  geometry.computeBoundingBox();
  if (!geometry.boundingBox) return;

  sharedBox.copy(geometry.boundingBox);
  sharedCenter.copy(sharedBox.min).add(sharedBox.max).multiplyScalar(0.5);
  sharedSize.subVectors(sharedBox.max, sharedBox.min);

  const position = geometry.attributes.position;
  if (!position) return;

  const uvArray = new Float32Array(position.count * 2);
  const role = getMeshRole(mesh);
  const maxPlanarDimension = Math.max(sharedSize.x, sharedSize.z, 1e-5);
  const height = Math.max(sharedSize.y, 1e-5);

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    let u;
    let v;

    if (role === SIDE_ROLE) {
      let angle = Math.atan2(z - sharedCenter.z, x - sharedCenter.x);
      if (angle < 0) angle += Math.PI * 2;
      u = angle / (Math.PI * 2);
      v = (y - sharedBox.min.y) / height;
    } else {
      u = (x - sharedCenter.x) / maxPlanarDimension + 0.5;
      v = (z - sharedCenter.z) / maxPlanarDimension + 0.5;
    }

    uvArray[i * 2] = u;
    uvArray[i * 2 + 1] = v;
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
  geometry.attributes.uv.needsUpdate = true;
}

export function loadHexTileModel({ url, assetId, assetName }) {
  return new Promise((resolve, reject) => {
    // Register asset for tracking if provided
    if (assetId && assetName) {
      registerAsset(assetId, assetName, 'model');
    }
    
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        if (assetId) {
          markAssetLoaded(assetId);
        }
        resolve(gltf.scene);
      },
      undefined,
      (error) => {
        if (assetId) {
          markAssetError(assetId, error);
        }
        reject(error);
      }
    );
  });
}

export function prepareHexTileModel({ model, lightingEnabled }) {
  if (!model) return null;
  model.traverse(child => {
    if (child.isMesh) {
      const role = inferRoleFromName(child.material?.name || child.name);
      child.userData = child.userData || {};
      child.userData.hexMaterialRole = role;
      if (child.geometry) {
        child.geometry.userData = child.geometry.userData || {};
        child.geometry.userData.hexMaterialRole = role;
        ensureHexTileUVs(child);
      }
      child.castShadow = !!lightingEnabled;
      child.receiveShadow = true;
    }
  });
  return model;
}

export function createGhostTileInstance({
  baseModel,
  scene,
  createGhostMaterials,
  lightingEnabled,
  tileScale,
  baseRotationX,
  baseRotationY,
  currentRotation = 0
}) {
  if (!baseModel || !scene || typeof createGhostMaterials !== 'function') {
    return null;
  }

  const ghostTile = baseModel.clone();
  const ghostMaterials = createGhostMaterials();
  ghostTile.traverse(child => {
    if (child.isMesh) {
      child.castShadow = false;
      child.receiveShadow = !!lightingEnabled;
      const role = getMeshRole(child);
      const materialIndex = role === SIDE_ROLE ? 1 : 0;
      child.material = ghostMaterials[materialIndex] || ghostMaterials[0];
      child.material.needsUpdate = true;
    }
  });

  if (typeof tileScale === 'number') {
    ghostTile.scale.set(tileScale, tileScale, tileScale);
  }
  ghostTile.rotation.x = baseRotationX || 0;
  ghostTile.rotation.y = (baseRotationY || 0) + currentRotation;
  ghostTile.visible = false;
  scene.add(ghostTile);
  return ghostTile;
}

export default {
  loadHexTileModel,
  prepareHexTileModel,
  createGhostTileInstance
};
