import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies Socket.IO traffic to the game server on :3001 so the
// client can connect to a same-origin URL in both dev and production.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
});
