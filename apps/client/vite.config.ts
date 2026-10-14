import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin API in development, so the HttpOnly session cookie just works.
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/api/, ''),
        ws: true,
      },
    },
  },
});
