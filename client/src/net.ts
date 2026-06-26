// Client networking: a single Socket.IO connection plus a React hook that holds
// the latest per-player view, the game log, and helpers to create/join/act.

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  Action,
  ClientToServerEvents,
  PlayerView,
  ServerToClientEvents,
} from '@catan/shared';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface Session {
  roomCode: string;
  playerId: string;
  token: string;
}

const SESSION_KEY = 'catan.session';

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function saveSession(s: Session | null): void {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
}

// Connect same-origin; Vite proxies /socket.io to the game server in dev.
function connect(): GameSocket {
  return io({ autoConnect: true });
}

export interface Announcement {
  id: number;
  text: string;
}

export interface UseGame {
  view: PlayerView | null;
  logs: string[];
  announcements: Announcement[];
  error: string | null;
  connected: boolean;
  createRoom: (name: string) => Promise<void>;
  joinRoom: (roomCode: string, name: string) => Promise<void>;
  sendAction: (action: Action) => Promise<void>;
  leave: () => void;
}

export function useGame(): UseGame {
  const socketRef = useRef<GameSocket | null>(null);
  const announceId = useRef(0);
  const [view, setView] = useState<PlayerView | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = connect();
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      // Attempt to rejoin a prior session after a refresh/reconnect.
      const session = loadSession();
      if (session) {
        socket.emit('rejoin', { roomCode: session.roomCode, token: session.token }, (res) => {
          if (!res.ok) saveSession(null);
        });
      }
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('stateUpdate', (v) => setView(v));
    socket.on('gameLog', (msg) => setLogs((prev) => [...prev.slice(-49), msg]));
    socket.on('announce', (msg) => {
      const id = ++announceId.current;
      setAnnouncements((prev) => [...prev, { id, text: msg }]);
      setTimeout(() => setAnnouncements((prev) => prev.filter((a) => a.id !== id)), 4500);
    });
    socket.on('roomError', (msg) => setError(msg));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);

  const createRoom = useCallback((name: string) => {
    return new Promise<void>((resolve, reject) => {
      socketRef.current?.emit('createRoom', { name }, (res) => {
        if (res.ok) {
          saveSession({ roomCode: res.roomCode, playerId: res.playerId, token: res.token });
          setError(null);
          resolve();
        } else {
          setError(res.error);
          reject(new Error(res.error));
        }
      });
    });
  }, []);

  const joinRoom = useCallback((roomCode: string, name: string) => {
    return new Promise<void>((resolve, reject) => {
      socketRef.current?.emit('joinRoom', { roomCode, name }, (res) => {
        if (res.ok) {
          saveSession({ roomCode: res.roomCode, playerId: res.playerId, token: res.token });
          setError(null);
          resolve();
        } else {
          setError(res.error);
          reject(new Error(res.error));
        }
      });
    });
  }, []);

  const sendAction = useCallback((action: Action) => {
    return new Promise<void>((resolve, reject) => {
      socketRef.current?.emit('action', { action }, (res) => {
        if (res.ok) {
          resolve();
        } else {
          setError(res.error);
          reject(new Error(res.error));
        }
      });
    });
  }, []);

  const leave = useCallback(() => {
    saveSession(null);
    setView(null);
    setLogs([]);
  }, []);

  return { view, logs, announcements, error, connected, createRoom, joinRoom, sendAction, leave };
}
