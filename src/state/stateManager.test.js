import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createStateManager } from './stateManager.js';
import { environmentPacks } from '../../data/data.js';

const grassPack = environmentPacks.find((pack) => pack.components?.some((component) => component.setId === 'gs_grass'));

describe('createStateManager', () => {
  let originalAlert;

  beforeEach(() => {
    originalAlert = globalThis.alert;
    globalThis.alert = vi.fn();
  });

  afterEach(() => {
    globalThis.alert = originalAlert;
    vi.restoreAllMocks();
  });

  it('initializes empty collections', () => {
    const manager = createStateManager({ getPlacementMode: () => 'unlimited' });

    expect(manager.packCounts.size).toBe(0);
    expect(manager.standaloneBiomeSetCounts.size).toBe(0);
    expect(manager.placedTiles.size).toBe(0);
  });

  it('sets pack count in unlimited mode', () => {
    const manager = createStateManager({ getPlacementMode: () => 'unlimited' });
    const result = manager.setPackCount(grassPack.id, '3');

    expect(result).toBe(3);
    expect(manager.packCounts.get(grassPack.id)).toBe(3);
  });

  it('prevents lowering pack count below required sets when limited', () => {
    const manager = createStateManager({ getPlacementMode: () => 'limited' });

    // Start with two packs available
    manager.setPackCount(grassPack.id, 2);
    expect(manager.packCounts.get(grassPack.id)).toBe(2);

    // Simulate placed tile requiring at least one set
    manager.placedTiles.set('q:0,r:0,y:0', { instanceId: 'gs_grass_1' });

    const lowered = manager.setPackCount(grassPack.id, 0);

    expect(lowered).toBe(2);
    expect(manager.packCounts.get(grassPack.id)).toBe(2);
    expect(globalThis.alert).toHaveBeenCalled();
  });

  it('updates standalone biome set counts', () => {
    const manager = createStateManager({ getPlacementMode: () => 'unlimited' });
    const result = manager.setStandaloneBiomeSetCount('gs_grass', 5);

    expect(result).toBe(5);
    expect(manager.standaloneBiomeSetCounts.get('gs_grass')).toBe(5);
  });
});
