// Board generation for a standard 19-tile Catan board.
//
// Hex math uses axial coordinates with a POINTY-TOP layout. References:
//   https://www.redblobgames.com/grids/hexagons/
//
// Vertices (settlement/city corners) and edges (road slots) are derived from
// the tiles and de-duplicated by geometry: a corner shared by up to three hexes
// becomes ONE vertex; an edge shared by two hexes becomes ONE edge.

import type { Axial, Board, Edge, Point, Port, PortType, ResourceType, Tile, TileResource, Vertex } from './types.js';
import {
  STANDARD_NUMBER_TOKENS,
  STANDARD_PORT_TYPES,
  STANDARD_TILE_RESOURCES,
} from './constants.js';

/** Circumradius of a hex in SVG units. Drives the size of everything. */
export const HEX_SIZE = 60;

const SQRT3 = Math.sqrt(3);

// ----- Seeded RNG (mulberry32) so boards are reproducible in tests -----

export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ----- Geometry -----

/** Cube distance of an axial coord from the origin. */
function axialDistance(q: number, r: number): number {
  return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
}

/** All axial coordinates within `radius` of center (a hexagon of hexes). */
function coordsForRadius(radius: number): Axial[] {
  const coords: Axial[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      if (axialDistance(q, r) <= radius) coords.push({ q, r });
    }
  }
  return coords;
}

/** Pixel center of a tile (pointy-top). */
export function tileCenter(coord: Axial): Point {
  return {
    x: HEX_SIZE * SQRT3 * (coord.q + coord.r / 2),
    y: HEX_SIZE * (3 / 2) * coord.r,
  };
}

/** The six corner points of a pointy-top hex, ordered clockwise. */
export function hexCorners(center: Point): Point[] {
  const corners: Point[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners.push({
      x: center.x + HEX_SIZE * Math.cos(angle),
      y: center.y + HEX_SIZE * Math.sin(angle),
    });
  }
  return corners;
}

/** Quantized key so the same geometric point from different tiles collapses to one id. */
function pointKey(p: Point): string {
  return `${Math.round(p.x)},${Math.round(p.y)}`;
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// ----- Board sizing for different player counts -----

/** Map a player count to a board radius (ring count). */
export function boardRadiusForPlayers(players: number): number {
  if (players <= 4) return 2; // 19 tiles — the classic board
  if (players <= 6) return 3; // 37 tiles
  if (players <= 8) return 4; // 61 tiles
  return 5; // 91 tiles
}

/** Number of deserts for a given radius. */
function desertsForRadius(radius: number): number {
  return { 2: 1, 3: 2, 4: 3, 5: 4 }[radius] ?? 1;
}

/** Build the tile-resource multiset for a board of `total` tiles and `deserts`. */
function buildResources(total: number, deserts: number): TileResource[] {
  const nonDesert = total - deserts;
  // Base Catan ratio (out of 18 land tiles): 4 wood, 4 sheep, 4 wheat, 3 brick, 3 ore.
  const weights: Array<[ResourceType, number]> = [
    ['wood', 4], ['sheep', 4], ['wheat', 4], ['brick', 3], ['ore', 3],
  ];
  const out: TileResource[] = [];
  for (const [res, w] of weights) {
    const count = Math.round((nonDesert * w) / 18);
    for (let i = 0; i < count; i++) out.push(res);
  }
  // Fix rounding drift to land exactly on nonDesert.
  let cycle = 0;
  while (out.length < nonDesert) out.push(weights[cycle++ % weights.length][0]);
  while (out.length > nonDesert) out.pop();
  for (let i = 0; i < deserts; i++) out.push('desert');
  return out;
}

/** Build the number-token multiset for `count` land tiles (no 7s). */
function buildNumberTokens(count: number): number[] {
  // Relative frequencies (sum 18) — 6 and 8 deliberately no more common than 5/9.
  const weights: Array<[number, number]> = [
    [2, 1], [3, 2], [4, 2], [5, 2], [6, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 1],
  ];
  const out: number[] = [];
  for (const [num, w] of weights) {
    const n = Math.round((count * w) / 18);
    for (let i = 0; i < n; i++) out.push(num);
  }
  let cycle = 0;
  const fillers = weights.map(([n]) => n);
  while (out.length < count) out.push(fillers[cycle++ % fillers.length]);
  while (out.length > count) out.pop();
  return out;
}

/** Build the port-type list (~half generic, one 2:1 of each resource, repeated). */
function buildPortTypes(count: number): PortType[] {
  const pattern: PortType[] = ['generic', 'generic', 'generic', 'generic', 'brick', 'wood', 'sheep', 'wheat', 'ore'];
  const out: PortType[] = [];
  for (let i = 0; i < count; i++) out.push(pattern[i % pattern.length]);
  return out;
}

// ----- Board assembly -----

export interface GenerateOptions {
  seed?: number;
  /** Board radius (ring count). Default 2 = the classic 19-tile board. */
  radius?: number;
}

export function generateBoard(opts: GenerateOptions = {}): Board {
  const rng = makeRng(opts.seed ?? 1);
  const radius = opts.radius ?? 2;
  const coords = coordsForRadius(radius);

  const tiles: Record<string, Tile> = {};
  const vertices: Record<string, Vertex> = {};
  const edges: Record<string, Edge> = {};

  const vertexByPoint = new Map<string, string>(); // pointKey -> vertexId
  const edgeByPair = new Map<string, string>(); // edgeKey -> edgeId

  // 1) Resources + number tokens. Radius 2 uses the exact classic distribution;
  //    larger boards scale the same ratios up.
  const deserts = desertsForRadius(radius);
  const baseResources = radius === 2 ? STANDARD_TILE_RESOURCES : buildResources(coords.length, deserts);
  const baseNumbers = radius === 2 ? STANDARD_NUMBER_TOKENS : buildNumberTokens(coords.length - deserts);
  const resources = shuffle(baseResources, rng);
  const numbers = shuffle(baseNumbers, rng);
  let numberIdx = 0;

  // 2) Create tiles, vertices, edges.
  coords.forEach((coord, i) => {
    const tileId = `t${i}`;
    const center = tileCenter(coord);
    const corners = hexCorners(center);
    const resource = resources[i];

    const vertexIds: string[] = corners.map((corner) => {
      const key = pointKey(corner);
      let vId = vertexByPoint.get(key);
      if (!vId) {
        vId = `v${vertexByPoint.size}`;
        vertexByPoint.set(key, vId);
        vertices[vId] = {
          id: vId,
          position: corner,
          tileIds: [],
          vertexIds: [],
          edgeIds: [],
          building: null,
        };
      }
      vertices[vId].tileIds.push(tileId);
      return vId;
    });

    // Edges between consecutive corners.
    for (let c = 0; c < 6; c++) {
      const a = vertexIds[c];
      const b = vertexIds[(c + 1) % 6];
      const key = edgeKey(a, b);
      let eId = edgeByPair.get(key);
      if (!eId) {
        eId = `e${edgeByPair.size}`;
        edgeByPair.set(key, eId);
        edges[eId] = { id: eId, vertexIds: [a, b], road: null };
        vertices[a].edgeIds.push(eId);
        vertices[b].edgeIds.push(eId);
      }
    }

    tiles[tileId] = {
      id: tileId,
      coord,
      center,
      resource,
      numberToken: resource === 'desert' ? undefined : numbers[numberIdx++],
      vertexIds,
    };
  });

  // 3) Vertex adjacency (neighbours sharing an edge) — needed for the distance rule.
  for (const edge of Object.values(edges)) {
    const [a, b] = edge.vertexIds;
    vertices[a].vertexIds.push(b);
    vertices[b].vertexIds.push(a);
  }

  // 4) Robber starts on the desert.
  const desert = Object.values(tiles).find((t) => t.resource === 'desert')!;

  // 5) Ports along the coast. Density mirrors the classic board (~1 per 3 coast edges).
  const portTypes = radius === 2 ? STANDARD_PORT_TYPES : buildPortTypes(4 * radius + 2);
  const ports = generatePorts(tiles, vertices, edges, portTypes, rng);

  return {
    tiles,
    vertices,
    edges,
    ports,
    robberTileId: desert.id,
  };
}

/**
 * Place the 9 standard ports on coastal edges, spaced as evenly as possible so
 * no two ports share a vertex. (Not the exact canonical layout, but balanced
 * and legal — fine for v1.)
 */
function generatePorts(
  tiles: Record<string, Tile>,
  vertices: Record<string, Vertex>,
  edges: Record<string, Edge>,
  portTypes: PortType[],
  rng: () => number
): Record<string, Port> {
  // A coastal edge touches exactly one tile (i.e. both its vertices are on the
  // board boundary AND it bounds a single hex). We detect it via: each edge of
  // a tile that is not shared with another tile.
  const edgeTileCount = new Map<string, number>();
  for (const tile of Object.values(tiles)) {
    const vIds = tile.vertexIds;
    for (let c = 0; c < 6; c++) {
      const a = vIds[c];
      const b = vIds[(c + 1) % 6];
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      edgeTileCount.set(key, (edgeTileCount.get(key) ?? 0) + 1);
    }
  }

  const coastalEdges = Object.values(edges).filter((e) => {
    const [a, b] = e.vertexIds;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    return edgeTileCount.get(key) === 1;
  });

  // Order coastal edges by angle around the board center for even spacing.
  const center = { x: 0, y: 0 };
  const angleOf = (e: Edge) => {
    const [a, b] = e.vertexIds;
    const mx = (vertices[a].position.x + vertices[b].position.x) / 2;
    const my = (vertices[a].position.y + vertices[b].position.y) / 2;
    return Math.atan2(my - center.y, mx - center.x);
  };
  coastalEdges.sort((e1, e2) => angleOf(e1) - angleOf(e2));

  const shuffledPorts = shuffle(portTypes, rng);
  const ports: Record<string, Port> = {};
  const used = new Set<string>(); // vertex ids already adjacent to a port
  const stride = coastalEdges.length / shuffledPorts.length;

  let placed = 0;
  let cursor = 0;
  while (placed < shuffledPorts.length && cursor < coastalEdges.length * 2) {
    const edge = coastalEdges[Math.floor((placed * stride + cursor) % coastalEdges.length)];
    const [a, b] = edge.vertexIds;
    if (used.has(a) || used.has(b)) {
      cursor++;
      continue;
    }
    const id = `p${placed}`;
    ports[id] = { id, type: shuffledPorts[placed], vertexIds: [a, b] };
    vertices[a].portId = id;
    vertices[b].portId = id;
    used.add(a);
    used.add(b);
    placed++;
    cursor = 0;
  }

  return ports;
}

/** Bounding box for an SVG viewBox, with padding for ports/labels. */
export function boardViewBox(board: Board, pad = HEX_SIZE): { x: number; y: number; w: number; h: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const v of Object.values(board.vertices)) {
    xs.push(v.position.x);
    ys.push(v.position.y);
  }
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad;
  const maxY = Math.max(...ys) + pad;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
