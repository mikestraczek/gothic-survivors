import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: true,
    open: true,
    // Dev: /api und /ws an den lokalen Server (npm run server, Port 3000) weiterreichen
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
});
