// Client -> server action intents, and the typed Socket.IO event maps.
// The client never mutates game state directly; it sends an Action and the
// server (authoritative) validates, applies, and broadcasts the result.

import type { ResourceBag, ResourceType, GameState, PlayerColor } from './types.js';

export type Action =
  // lobby
  | { type: 'setColor'; color: PlayerColor }
  | { type: 'setTargetPoints'; points: number }
  | { type: 'startGame' }
  // setup phase
  | { type: 'placeSetupSettlement'; vertexId: string }
  | { type: 'placeSetupRoad'; edgeId: string }
  // main turn
  | { type: 'rollDice' }
  | { type: 'buildRoad'; edgeId: string }
  | { type: 'buildSettlement'; vertexId: string }
  | { type: 'buildCity'; vertexId: string }
  | { type: 'buyDevCard' }
  | { type: 'playKnight' }
  | { type: 'playRoadBuilding'; edgeIds: string[] }
  | { type: 'playYearOfPlenty'; resources: ResourceType[] }
  | { type: 'playMonopoly'; resource: ResourceType }
  | { type: 'endTurn' }
  // trading
  | { type: 'bankTrade'; give: ResourceType; receive: ResourceType }
  | { type: 'proposeTrade'; give: ResourceBag; receive: ResourceBag }
  | { type: 'acceptTrade'; tradeId: string }
  | { type: 'counterTrade'; tradeId: string; give: ResourceBag; receive: ResourceBag }
  | { type: 'finalizeTrade'; tradeId: string; withPlayerId: string }
  | { type: 'cancelTrade' }
  // robber / discard
  | { type: 'discard'; resources: ResourceBag }
  | { type: 'moveRobber'; tileId: string; stealFromPlayerId: string | null };

/** A personalized, client-safe view of the game (opponents' hands hidden). */
export interface PlayerView {
  /** The full game state, with secret fields (devDeck, opponents' cards) redacted. */
  game: GameState;
  /** The id of the player this view is for. */
  youId: string;
  /** Per-opponent counts only (so you can't see their exact cards). */
  opponentSecrets: Record<string, { resourceCount: number; devCardCount: number }>;
}

// ----- Socket.IO typed events -----

export interface ClientToServerEvents {
  createRoom: (
    payload: { name: string },
    ack: (res: { ok: true; roomCode: string; playerId: string; token: string } | { ok: false; error: string }) => void
  ) => void;
  joinRoom: (
    payload: { roomCode: string; name: string },
    ack: (res: { ok: true; roomCode: string; playerId: string; token: string } | { ok: false; error: string }) => void
  ) => void;
  rejoin: (
    payload: { roomCode: string; token: string },
    ack: (res: { ok: true; playerId: string } | { ok: false; error: string }) => void
  ) => void;
  action: (
    payload: { action: Action },
    ack: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;
}

export interface ServerToClientEvents {
  /** Pushed whenever the game state changes; each client gets its own view. */
  stateUpdate: (view: PlayerView) => void;
  /** Lightweight log line for the in-game event feed. */
  gameLog: (message: string) => void;
  /** A big moment everyone should see as a centered banner (award, winner). */
  announce: (message: string) => void;
  /** Sent when a fatal room error occurs (e.g. room closed). */
  roomError: (message: string) => void;
}
