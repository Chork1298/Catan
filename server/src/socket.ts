// Socket.IO wiring: connection lifecycle + action handling. The server is the
// single source of truth — clients send actions, the server validates/applies
// and broadcasts a fresh per-player view to everyone in the room.

import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@catan/shared';
import { garrisonAt } from '@catan/shared';
import { applyAction, forceTurnTimeout, toPlayerView } from './game.js';
import {
  createRoom,
  findRoomBySocket,
  getRoom,
  joinRoom,
  markDisconnected,
  rejoin,
  roomSockets,
  type Room,
} from './rooms.js';

type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/** Push the current state to every connected player in a room, each personalized. */
function broadcastState(io: GameServer, room: Room): void {
  for (const { playerId, socketId } of roomSockets(room)) {
    io.to(socketId).emit('stateUpdate', toPlayerView(room.game, playerId));
  }
}

function broadcastLog(io: GameServer, room: Room, message: string): void {
  for (const { socketId } of roomSockets(room)) {
    io.to(socketId).emit('gameLog', message);
  }
}

function broadcastAnnounce(io: GameServer, room: Room, message: string): void {
  for (const { socketId } of roomSockets(room)) {
    io.to(socketId).emit('announce', message);
  }
}

/** Send private log lines only to the specific players they're addressed to. */
function sendPrivateLogs(io: GameServer, room: Room, privateLogs: Record<string, string[]>): void {
  for (const { playerId, socketId } of roomSockets(room)) {
    for (const line of privateLogs[playerId] ?? []) io.to(socketId).emit('gameLog', line);
  }
}

const ROLL_MS = 5_000; // auto-roll nudge at the start of a turn
const WAR_MS = 30_000; // war responder deadline

/** Actions that buy the active player +15 seconds. */
const EXTEND_ACTIONS = new Set(['buildRoad', 'buildSettlement', 'buildCity', 'bankTrade', 'finalizeTrade']);

function clear(room: Room, which: 'turnTimer' | 'rollTimer' | 'warTimer'): void {
  if (room[which]) clearTimeout(room[which]!);
  room[which] = null;
}

function turnKeyOf(room: Room): string | null {
  const g = room.game;
  if (g.phase === 'lobby' || g.phase === 'ended') return null;
  return `${g.turnNumber}:${g.currentPlayerIndex}`;
}

function setTurnDeadline(io: GameServer, room: Room, ms: number): void {
  clear(room, 'turnTimer');
  room.game.turnEndsAt = Date.now() + ms;
  room.turnTimer = setTimeout(() => onTurnTimeout(io, room), ms);
}

/** Arm a 5s auto-roll while the current player hasn't rolled; else clear it. */
function armRollTimer(io: GameServer, room: Room): void {
  const g = room.game;
  if (g.phase === 'rollDice' && !g.hasRolledThisTurn && !g.pendingWar) {
    if (!room.rollTimer) room.rollTimer = setTimeout(() => onRollTimeout(io, room), ROLL_MS);
  } else {
    clear(room, 'rollTimer');
  }
}

/**
 * Single source of timer truth. Manages the turn timer, the 5s roll nudge, and
 * the war timer (which pauses the turn timer). Must run BEFORE broadcasting state.
 */
function syncTimers(io: GameServer, room: Room): void {
  const g = room.game;
  if (g.phase === 'lobby' || g.phase === 'ended') {
    clear(room, 'turnTimer'); clear(room, 'rollTimer'); clear(room, 'warTimer');
    g.turnEndsAt = null; g.warEndsAt = null;
    room.turnKey = turnKeyOf(room); room.warActive = false; room.turnRemainingMs = null;
    return;
  }

  const key = turnKeyOf(room);
  if (key !== room.turnKey) {
    // New turn: fresh turn timer + roll nudge; clear any war leftovers.
    room.turnKey = key;
    clear(room, 'warTimer'); g.warEndsAt = null; room.warActive = false; room.turnRemainingMs = null;
    setTurnDeadline(io, room, g.turnSeconds * 1000);
    armRollTimer(io, room);
    return;
  }

  if (g.pendingWar && !room.warActive) {
    // War just started → pause the turn timer, start the war timer.
    room.warActive = true;
    room.turnRemainingMs = Math.max(1000, (g.turnEndsAt ?? Date.now()) - Date.now());
    g.turnEndsAt = null;
    clear(room, 'turnTimer'); clear(room, 'rollTimer');
    g.warEndsAt = Date.now() + WAR_MS;
    room.warTimer = setTimeout(() => onWarTimeout(io, room), WAR_MS);
    return;
  }

  if (!g.pendingWar && room.warActive) {
    // War just ended → resume the turn timer where it left off.
    room.warActive = false;
    clear(room, 'warTimer'); g.warEndsAt = null;
    setTurnDeadline(io, room, room.turnRemainingMs ?? g.turnSeconds * 1000);
    room.turnRemainingMs = null;
    armRollTimer(io, room);
    return;
  }

  if (!g.pendingWar) armRollTimer(io, room);
}

/** Add time to the active turn (e.g. +15s after a build/trade). */
function extendTurn(io: GameServer, room: Room, ms: number): void {
  const g = room.game;
  if (room.warActive || g.turnEndsAt == null) return;
  const remaining = Math.max(0, g.turnEndsAt - Date.now()) + ms;
  setTurnDeadline(io, room, remaining);
}

function broadcastResult(io: GameServer, room: Room, result: ReturnType<typeof forceTurnTimeout>): void {
  for (const line of result.logs) broadcastLog(io, room, line);
  if (result.privateLogs) sendPrivateLogs(io, room, result.privateLogs);
  for (const msg of result.announcements ?? []) broadcastAnnounce(io, room, msg);
}

function onTurnTimeout(io: GameServer, room: Room): void {
  room.turnTimer = null;
  if (!getRoom(room.code)) return;
  const result = forceTurnTimeout(room.game);
  if (result.ok) broadcastResult(io, room, result);
  syncTimers(io, room);
  broadcastState(io, room);
}

function onRollTimeout(io: GameServer, room: Room): void {
  room.rollTimer = null;
  if (!getRoom(room.code)) return;
  const g = room.game;
  if (g.phase !== 'rollDice' || g.hasRolledThisTurn) return;
  const cur = g.players[g.currentPlayerIndex];
  const result = applyAction(g, cur.id, { type: 'rollDice' });
  if (result.ok) broadcastResult(io, room, result);
  syncTimers(io, room);
  broadcastState(io, room);
}

function onWarTimeout(io: GameServer, room: Room): void {
  room.warTimer = null;
  if (!getRoom(room.code)) return;
  const g = room.game;
  if (!g.pendingWar) { syncTimers(io, room); return; }
  // Auto-resolve: reject any peace, then the defender fights (or retreats if undefended).
  if (g.pendingWar.awaiting === 'attacker')
    broadcastResult(io, room, applyAction(g, g.pendingWar.attackerId, { type: 'respondToPeace', accept: false }));
  if (g.pendingWar?.awaiting === 'defender') {
    const w = g.pendingWar;
    const resp = garrisonAt(g.board, w.targetVertexId) > 0 ? 'fight' : 'retreat';
    broadcastResult(io, room, applyAction(g, w.defenderId, { type: 'respondToWar', response: resp }));
  }
  syncTimers(io, room);
  broadcastState(io, room);
}

export function registerSocketHandlers(io: GameServer): void {
  io.on('connection', (socket: GameSocket) => {
    socket.on('createRoom', ({ name }, ack) => {
      try {
        const res = createRoom(name, socket.id);
        socket.join(res.roomCode);
        ack({ ok: true, ...res });
        const room = getRoom(res.roomCode)!;
        broadcastState(io, room);
      } catch (err) {
        ack({ ok: false, error: (err as Error).message });
      }
    });

    socket.on('joinRoom', ({ roomCode, name }, ack) => {
      try {
        const res = joinRoom(roomCode, name, socket.id);
        socket.join(res.roomCode);
        ack({ ok: true, ...res });
        const room = getRoom(res.roomCode)!;
        broadcastLog(io, room, `${name} joined.`);
        broadcastState(io, room);
      } catch (err) {
        ack({ ok: false, error: (err as Error).message });
      }
    });

    socket.on('rejoin', ({ roomCode, token }, ack) => {
      try {
        const playerId = rejoin(roomCode, token, socket.id);
        socket.join(roomCode.trim().toUpperCase());
        ack({ ok: true, playerId });
        const room = getRoom(roomCode)!;
        broadcastState(io, room);
      } catch (err) {
        ack({ ok: false, error: (err as Error).message });
      }
    });

    socket.on('action', ({ action }, ack) => {
      const found = findRoomBySocket(socket.id);
      if (!found) {
        ack({ ok: false, error: 'Not in a room' });
        return;
      }
      const { room, playerId } = found;
      const result = applyAction(room.game, playerId, action);
      if (!result.ok) {
        ack({ ok: false, error: result.error ?? 'Invalid action' });
        return;
      }
      ack({ ok: true });
      broadcastResult(io, room, result);
      syncTimers(io, room);
      if (EXTEND_ACTIONS.has(action.type)) extendTurn(io, room, 15_000); // +15s for building/trading
      broadcastState(io, room);
    });

    socket.on('disconnect', () => {
      const found = markDisconnected(socket.id);
      if (!found) return;
      if (getRoom(found.room.code)) {
        broadcastLog(io, found.room, `A player disconnected.`);
        broadcastState(io, found.room);
      } else {
        clear(found.room, 'turnTimer'); // room was cleaned up; stop its timers
        clear(found.room, 'rollTimer');
        clear(found.room, 'warTimer');
      }
    });
  });
}
