import { describe, it, expect } from 'vitest';
import { emptyBag, RESOURCE_TYPES } from './index.js';

describe('shared scaffold', () => {
  it('emptyBag has every resource at zero', () => {
    const bag = emptyBag();
    expect(Object.keys(bag).sort()).toEqual([...RESOURCE_TYPES].sort());
    expect(Object.values(bag).every((n) => n === 0)).toBe(true);
  });
});
