import { describe, it, expect } from 'vitest';
import { generateBoard } from './board.js';
import { STANDARD_TILE_RESOURCES } from './constants.js';
import type { TileResource } from './types.js';

describe('generateBoard', () => {
  const board = generateBoard({ seed: 42 });

  it('has the 19 standard tiles', () => {
    expect(Object.keys(board.tiles)).toHaveLength(19);
  });

  it('has 54 vertices and 72 edges (standard Catan topology)', () => {
    expect(Object.keys(board.vertices)).toHaveLength(54);
    expect(Object.keys(board.edges)).toHaveLength(72);
  });

  it('has the correct resource distribution', () => {
    const counts: Record<string, number> = {};
    for (const t of Object.values(board.tiles)) counts[t.resource] = (counts[t.resource] ?? 0) + 1;
    const expected: Record<string, number> = {};
    for (const r of STANDARD_TILE_RESOURCES) expected[r] = (expected[r] ?? 0) + 1;
    expect(counts).toEqual(expected);
  });

  it('gives every non-desert tile a number token (and the desert none)', () => {
    for (const t of Object.values(board.tiles)) {
      if (t.resource === 'desert') expect(t.numberToken).toBeUndefined();
      else expect(t.numberToken).toBeGreaterThanOrEqual(2);
    }
  });

  it('starts the robber on the desert', () => {
    expect(board.tiles[board.robberTileId].resource).toBe('desert');
  });

  it('places 9 ports, none sharing a vertex', () => {
    const ports = Object.values(board.ports);
    expect(ports).toHaveLength(9);
    const seen = new Set<string>();
    for (const p of ports) {
      for (const v of p.vertexIds) {
        expect(seen.has(v)).toBe(false);
        seen.add(v);
      }
    }
  });

  it('has symmetric vertex adjacency', () => {
    for (const v of Object.values(board.vertices)) {
      for (const n of v.vertexIds) {
        expect(board.vertices[n].vertexIds).toContain(v.id);
      }
    }
  });

  it('every edge references two real vertices that list it', () => {
    for (const e of Object.values(board.edges)) {
      const [a, b] = e.vertexIds;
      expect(board.vertices[a].edgeIds).toContain(e.id);
      expect(board.vertices[b].edgeIds).toContain(e.id);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = generateBoard({ seed: 7 });
    const b = generateBoard({ seed: 7 });
    expect(Object.values(a.tiles).map((t) => t.resource)).toEqual(
      Object.values(b.tiles).map((t) => t.resource as TileResource)
    );
  });
});
