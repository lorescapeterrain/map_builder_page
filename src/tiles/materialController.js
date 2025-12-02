import { createMaterialManager } from '../scene/materialManager.js';

export function createMaterialController(options) {
  return createMaterialManager(options);
}

export default createMaterialController;
