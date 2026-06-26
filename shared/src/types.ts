// Core shared types for the Catan game. Imported by both client and server so
// the two sides always agree on the shape of the game.

// ----- Resources -----

/** The five tradeable resources. Desert produces nothing (see TileResource). */
export type ResourceType = 'brick' | 'wood' | 'sheep' | 'wheat' | 'ore';

export const RESOURCE_TYPES: ResourceType[] = ['brick', 'wood', 'sheep', 'wheat', 'ore'];

/** What a board tile can be — a resource, or the (resource-less) desert. */
export type TileResource = ResourceType | 'desert';

/** A bag of resources keyed by type. Used for hands, costs, and the bank. */
export type ResourceBag = Record<ResourceType, number>;

/** A fresh, empty resource bag. */
export function emptyBag(): ResourceBag {
  return { brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 0 };
}

// ----- Hex board geometry -----

/** Axial hex coordinate. See https://www.redblobgames.com/grids/hexagons/ */
export interface Axial {
  q: number;
  r: number;
}

/** Pixel position for rendering (computed from axial coords). */
export interface Point {
  x: number;
  y: number;
}

export interface Tile {
  id: string;
  coord: Axial;
  center: Point;
  resource: TileResource;
  /** Dice number that triggers production (2–12, never 7). Undefined for desert. */
  numberToken?: number;
  /** The six corner vertex ids, clockwise from the top. */
  vertexIds: string[];
}

export type BuildingType = 'settlement' | 'city';

export interface Building {
  type: BuildingType;
  owner: string; // player id
}

/** A board corner where settlements/cities go. */
export interface Vertex {
  id: string;
  position: Point;
  tileIds: string[]; // 1–3 tiles touching this corner
  vertexIds: string[]; // adjacent corners (for the distance rule)
  edgeIds: string[]; // edges meeting here
  building: Building | null;
  portId?: string;
}

/** A board edge where roads go (connects two vertices). */
export interface Edge {
  id: string;
  vertexIds: [string, string];
  road: string | null; // owning player id, or null
}

export type PortType = 'generic' | ResourceType; // generic = 3:1, resource = 2:1

export interface Port {
  id: string;
  type: PortType;
  vertexIds: string[]; // the two coastal vertices that can use this port
}

export interface Board {
  tiles: Record<string, Tile>;
  vertices: Record<string, Vertex>;
  edges: Record<string, Edge>;
  ports: Record<string, Port>;
  robberTileId: string;
}

// ----- Development cards -----

export type DevCardType =
  | 'knight'
  | 'roadBuilding'
  | 'yearOfPlenty'
  | 'monopoly'
  | 'victoryPoint';

export interface DevCard {
  type: DevCardType;
  /** Turn number it was purchased — can't be played the same turn it was bought. */
  boughtOnTurn: number;
}

// ----- Players -----

export const PLAYER_COLORS = ['red', 'blue', 'orange', 'white'] as const;
export type PlayerColor = (typeof PLAYER_COLORS)[number];

export interface Player {
  id: string;
  name: string;
  color: PlayerColor;
  connected: boolean;
  isHost: boolean;
  resources: ResourceBag;
  devCards: DevCard[];
  playedKnights: number;
  /** Public victory points (from settlements/cities/longest road/largest army). */
  publicVictoryPoints: number;
}

// ----- Game phase / flow -----

export type GamePhase =
  | 'lobby' // waiting for players, host hasn't started
  | 'setupRound1' // each player places 1 settlement + 1 road (forward order)
  | 'setupRound2' // each player places 1 settlement + 1 road (reverse order)
  | 'rollDice' // current player must roll
  | 'discard' // a 7 was rolled; players over the limit must discard
  | 'moveRobber' // current player moves the robber and steals
  | 'main' // current player may trade/build/buy/play, then end turn
  | 'ended'; // someone won

export interface DiceRoll {
  die1: number;
  die2: number;
  total: number;
}

/** A pending trade offer from one player to others. */
export interface TradeOffer {
  id: string;
  from: string; // player id
  give: ResourceBag; // what the proposer gives
  receive: ResourceBag; // what the proposer wants
  /** Player ids who have accepted; the proposer picks one to finalize. */
  acceptedBy: string[];
}

export interface GameState {
  roomCode: string;
  phase: GamePhase;
  players: Player[];
  board: Board;
  bank: ResourceBag;
  devDeck: DevCardType[]; // remaining draw pile (server-only; stripped from client views)
  currentPlayerIndex: number;
  turnNumber: number;
  lastRoll: DiceRoll | null;
  /** True once the current player has rolled this turn (gates building). */
  hasRolledThisTurn: boolean;
  /** True once the current player has played a dev card this turn. */
  hasPlayedDevCardThisTurn: boolean;
  /** During setup, which players still owe placements is implied by order + index. */
  setupQueueIndex: number;
  /** During setup, whether the current player must place a settlement or its road. */
  setupStep: 'settlement' | 'road';
  /** During setup, the vertex of the just-placed settlement (the road must touch it). */
  lastSetupVertex: string | null;
  pendingTrade: TradeOffer | null;
  /** Player ids who still must discard during the 'discard' phase. */
  mustDiscard: string[];
  longestRoadOwner: string | null;
  largestArmyOwner: string | null;
  winnerId: string | null;
  /** Victory points required to win (host-adjustable in the lobby). */
  targetPoints: number;
}
