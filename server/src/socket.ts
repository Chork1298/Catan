// Socket.IO wiring: connection lifecycle + action handling. The server is the
// single source of truth — clients send actions, the server validates/applies
// and broadcasts a fresh per-player view to everyone in the room.

import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@catan/shared';
import { applyAction, toPlayerView } from './game.js';
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
      broadcastState(io, room);
    });

    socket.on('disconnect', () => {
      const found = markDisconnected(socket.id);
      if (found && getRoom(found.room.code)) {
        broadcastLog(io, found.room, `A player disconnected.`);
        broadcastState(io, found.room);
      }
    });
  });
}
