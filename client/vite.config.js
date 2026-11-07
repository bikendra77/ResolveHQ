import process from 'node:process';
import {
  backendProxyTarget,
  resolveBackendPort,
} from '../scripts/dev-config.mjs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiProxyTarget =
  process.env.VITE_API_PROXY_TARGET ||
  backendProxyTarget(resolveBackendPort(process.env.PORT));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.VITE_DEV_PORT) || 5173,
    strictPort: Boolean(process.env.VITE_DEV_PORT),
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/healthz': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
