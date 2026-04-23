import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies /cases and /ws/debate to the FastAPI backend on :8000,
// so the frontend can use same-origin URLs in dev.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/health': 'http://localhost:8000',
      '/cases': 'http://localhost:8000',
      '/ws/debate': {
        target: 'ws://localhost:8000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
