// Server entry point: HTTP (Express) + Socket.IO. In production it also serves
// the built client. Game/room logic is wired in later milestones; for now this
// boots cleanly and accepts connections.

import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@catan/shared';
import { registerSocketHandlers } from './socket.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const isProd = process.env.NODE_ENV === 'production';

const app = express();
const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: isProd ? undefined : { origin: 'http://localhost:5173' },
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// In production, serve the built client (client/dist is copied next to the server).
if (isProd) {
  const clientDir = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

registerSocketHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
