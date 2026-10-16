import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Maps, tilesets and sprite manifests are served straight from the repo's assets/ folder.
  publicDir: fileURLToPath(new URL('../../assets', import.meta.url)),
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 2000 },
});
