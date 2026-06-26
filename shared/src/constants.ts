// Game balance constants for a faithful standard (3–4 player) Catan game.

import type { ResourceBag, TileResource, DevCardType, PortType } from './types.js';

/** Victory points needed to win. */
export const WINNING_POINTS = 10;

/** Hand size above which a player must discard half on a 7. */
export const ROBBER_DISCARD_LIMIT = 7;

/** Build costs. */
export const COSTS = {
  road: { brick: 1, wood: 1, sheep: 0, wheat: 0, ore: 0 },
  settlement: { brick: 1, wood: 1, sheep: 1, wheat: 1, ore: 0 },
  city: { brick: 0, wood: 0, sheep: 0, wheat: 2, ore: 3 },
  devCard: { brick: 0, wood: 0, sheep: 1, wheat: 1, ore: 1 },
} satisfies Record<string, ResourceBag>;

/** Per-player piece limits. */
export const PIECE_LIMITS = {
  roads: 15,
  settlements: 5,
  cities: 4,
} as const;

/** How many of each resource the bank starts with. */
export const BANK_PER_RESOURCE = 19;

/**
 * The 19 tile resources for the standard board, by frequency.
 * 4 wood, 4 sheep, 4 wheat, 3 brick, 3 ore, 1 desert.
 */
export const STANDARD_TILE_RESOURCES: TileResource[] = [
  'wood', 'wood', 'wood', 'wood',
  'sheep', 'sheep', 'sheep', 'sheep',
  'wheat', 'wheat', 'wheat', 'wheat',
  'brick', 'brick', 'brick',
  'ore', 'ore', 'ore',
  'desert',
];

/**
 * The 18 number tokens placed on non-desert tiles (standard distribution).
 * Note there is no 7.
 */
export const STANDARD_NUMBER_TOKENS: number[] = [
  2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12,
];

/** The development card deck composition (25 cards total). */
export const DEV_DECK_COMPOSITION: Record<DevCardType, number> = {
  knight: 14,
  roadBuilding: 2,
  yearOfPlenty: 2,
  monopoly: 2,
  victoryPoint: 5,
};

/** The 9 ports on the standard board: 4 generic (3:1) + one 2:1 per resource. */
export const STANDARD_PORT_TYPES: PortType[] = [
  'generic', 'generic', 'generic', 'generic',
  'brick', 'wood', 'sheep', 'wheat', 'ore',
];

// ----- War layer (v1, abstract Soldier) -----

/** Cost to train one Soldier (ore = weapons, wheat = feeding troops). */
export const SOLDIER_COST = { brick: 0, wood: 0, sheep: 0, wheat: 1, ore: 1 } satisfies ResourceBag;

/** Army cap = base + per settlement + per city (economy gates army size). */
export const ARMY_CAP_BASE = 2;
export const ARMY_PER_SETTLEMENT = 1;
export const ARMY_PER_CITY = 2;

/** Combat: loser loses this many soldiers, winner this many (war is costly). */
export const LOSER_CASUALTIES = 2;
export const WINNER_CASUALTIES = 1;

/** Points awarded for the longest-road and largest-army bonuses. */
export const LONGEST_ROAD_POINTS = 2;
export const LARGEST_ARMY_POINTS = 2;
/** Minimums to first claim each bonus. */
export const LONGEST_ROAD_MIN = 5;
export const LARGEST_ARMY_MIN = 3;
