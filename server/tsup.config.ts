import { defineConfig } from 'tsup';

// Bundle the workspace `@catan/shared` package INTO the server output so the
// production build (`node dist/index.js`) has no unresolved TypeScript imports.
// Real node_modules (express, socket.io) stay external.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  noExternal: [/@catan\/shared/],
});
