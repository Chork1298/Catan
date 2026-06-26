// In-memory room/lobby management. Each room owns one authoritative GameState.
// Players are identified by a stable playerId; a secret token lets them rejoin
// after a refresh or disconnect (mapped to a fresh socket).

import { randomBytes, randomUUID } from 'node:crypto';
import type { GameState } from '@catan/shared';
import { createInitialGame, createPlayer } from './game.js';

interface Room {
  code: string;
  game: GameState;
  /** playerId -> rejoin token. */
  tokens: Map<string, string>;
  /** playerId -> current socket id (null if disconnected). */
  sockets: Map<string, string | null>;
}

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
const rooms = new Map<string, Room>();

function generateRoomCode(): string {
  let code: string;
  do {
    const bytes = randomBytes(4);
    code = Array.from({ length: 4 }, (_, i) => ROOM_CODE_CHARS[bytes[i] % ROOM_CODE_CHARS.length]).join('');
  } while (rooms.has(code));
  return code;
}

export interface JoinResult {
  roomCode: string;
  playerId: string;
  token: string;
}

export function createRoom(name: string, socketId: string): JoinResult {
  const code = generateRoomCode();
  const playerId = randomUUID();
  const host = createPlayer(playerId, name.trim() || 'Host', true, 0);
  const game = createInitialGame(code, host);

  const room: Room = {
    code,
    game,
    tokens: new Map([[playerId, randomToken()]]),
    sockets: new Map([[playerId, socketId]]),
  };
  rooms.set(code, room);
  return { roomCode: code, playerId, token: room.tokens.get(playerId)! };
}

export function joinRoom(rawCode: string, name: string, socketId: string): JoinResult {
  const code = rawCode.trim().toUpperCase();
  const room = rooms.get(code);
  if (!room) throw new Error('Room not found');
  if (room.game.phase !== 'lobby') throw new Error('Game already started');
  if (room.game.players.length >= 4) throw new Error('Room is full (max 4)');
  if (room.game.players.some((p) => p.name === name.trim())) throw new Error('Name already taken');

  const playerId = randomUUID();
  const player = createPlayer(playerId, name.trim() || 'Player', false, room.game.players.length);
  room.game.players.push(player);
  const token = randomToken();
  room.tokens.set(playerId, token);
  room.sockets.set(playerId, socketId);

  return { roomCode: code, playerId, token };
}

/** Reconnect an existing player to a new socket. Returns the playerId on success. */
export function rejoin(rawCode: string, token: string, socketId: string): string {
  const code = rawCode.trim().toUpperCase();
  const room = rooms.get(code);
  if (!room) throw new Error('Room not found');
  const entry = [...room.tokens.entries()].find(([, t]) => t === token);
  if (!entry) throw new Error('Invalid session token');
  const [playerId] = entry;
  room.sockets.set(playerId, socketId);
  const player = room.game.players.find((p) => p.id === playerId);
  if (player) player.connected = true;
  return playerId;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.trim().toUpperCase());
}

/** Find the room a socket currently belongs to (for disconnect handling). */
export function findRoomBySocket(socketId: string): { room: Room; playerId: string } | undefined {
  for (const room of rooms.values()) {
    for (const [playerId, sId] of room.sockets) {
      if (sId === socketId) return { room, playerId };
    }
  }
  return undefined;
}

export function markDisconnected(socketId: string): { room: Room; playerId: string } | undefined {
  const found = findRoomBySocket(socketId);
  if (!found) return undefined;
  found.room.sockets.set(found.playerId, null);
  const player = found.room.game.players.find((p) => p.id === found.playerId);
  if (player) player.connected = false;

  // If the room is now empty and still in the lobby, clean it up.
  const anyConnected = [...found.room.sockets.values()].some((s) => s !== null);
  if (!anyConnected && found.room.game.phase === 'lobby') {
    rooms.delete(found.room.code);
  }
  return found;
}

/** All currently-connected socket ids for a room, with their playerIds. */
export function roomSockets(room: Room): Array<{ playerId: string; socketId: string }> {
  const out: Array<{ playerId: string; socketId: string }> = [];
  for (const [playerId, socketId] of room.sockets) {
    if (socketId) out.push({ playerId, socketId });
  }
  return out;
}

function randomToken(): string {
  return randomBytes(24).toString('hex');
}

export type { Room };
