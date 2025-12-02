import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function createScene({
  container,
  backgroundColor = 0x56606d,
  antialias = true
} = {}) {
  if (!container) {
    throw new Error('createScene: container element is required');
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(backgroundColor);

  const width = container.clientWidth || 1;
  const height = container.clientHeight || 1;

  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);

  const renderer = new THREE.WebGLRenderer({ antialias });
  renderer.setSize(width, height);
  container.appendChild(renderer.domElement);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const resizeRenderer = () => {
    const nextWidth = container.clientWidth || 1;
    const nextHeight = container.clientHeight || 1;
    camera.aspect = nextWidth / nextHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(nextWidth, nextHeight);
  };

  const getMaxAnisotropy = () => {
    if (renderer.capabilities && typeof renderer.capabilities.getMaxAnisotropy === 'function') {
      return renderer.capabilities.getMaxAnisotropy();
    }
    return 1;
  };

  return {
    scene,
    camera,
    renderer,
    controls,
    resizeRenderer,
    getMaxAnisotropy
  };
}

export default createScene;
