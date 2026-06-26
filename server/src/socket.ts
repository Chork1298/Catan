// Socket.IO wiring: connection lifecycle + action handling. The server is the
// single source of truth — clients send actions, the server validates/applies
// and broadcasts a fresh per-player view to everyone in the room.

import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@catan/shared';
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

const TURN_MS = 90_000;

/** Identifies the current turn; changes when the active player/turn changes. */
function turnKeyOf(room: Room): string | null {
  const g = room.game;
  if (g.phase === 'lobby' || g.phase === 'ended') return null;
  return `${g.turnNumber}:${g.currentPlayerIndex}`;
}

/** Arm/clear the 90s turn timer when the turn changes. Sets game.turnEndsAt so
 *  clients can show a countdown. Must run BEFORE broadcasting state. */
function syncTurnTimer(io: GameServer, room: Room): void {
  const key = turnKeyOf(room);
  if (key === room.turnKey) return; // same turn — let the running timer continue
  if (room.turnTimer) clearTimeout(room.turnTimer);
  room.turnTimer = null;
  room.turnKey = key;
  if (key === null) {
    room.game.turnEndsAt = null;
    return;
  }
  room.game.turnEndsAt = Date.now() + TURN_MS;
  room.turnTimer = setTimeout(() => onTurnTimeout(io, room), TURN_MS);
}

/** Fired when a turn runs out of time: auto-resolve and broadcast. */
function onTurnTimeout(io: GameServer, room: Room): void {
  room.turnTimer = null;
  if (!getRoom(room.code)) return; // room gone
  const result = forceTurnTimeout(room.game);
  if (!result.ok) return;
  for (const line of result.logs) broadcastLog(io, room, line);
  if (result.privateLogs) sendPrivateLogs(io, room, result.privateLogs);
  for (const msg of result.announcements ?? []) broadcastAnnounce(io, room, msg);
  syncTurnTimer(io, room); // re-arm for the next player
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
      for (const line of result.logs) broadcastLog(io, room, line);
      if (result.privateLogs) sendPrivateLogs(io, room, result.privateLogs);
      for (const msg of result.announcements ?? []) broadcastAnnounce(io, room, msg);
      syncTurnTimer(io, room); // update turnEndsAt + (re)arm before broadcasting
      broadcastState(io, room);
    });

    socket.on('disconnect', () => {
      const found = markDisconnected(socket.id);
      if (!found) return;
      if (getRoom(found.room.code)) {
        broadcastLog(io, found.room, `A player disconnected.`);
        broadcastState(io, found.room);
      } else if (found.room.turnTimer) {
        clearTimeout(found.room.turnTimer); // room was cleaned up; stop its timer
        found.room.turnTimer = null;
      }
    });
  });
}
