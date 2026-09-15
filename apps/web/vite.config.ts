import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5176),
    strictPort: true,
    proxy: {
      '/auth': { target: process.env.API_URL ?? 'http://localhost:3003', changeOrigin: true },
      '/tenancy': { target: process.env.API_URL ?? 'http://localhost:3003', changeOrigin: true },
      '/health': { target: process.env.API_URL ?? 'http://localhost:3003', changeOrigin: true },
    },
    fs: {
      allow: ['../..'],
    },
  },
  optimizeDeps: {
    include: ['@skladnik/shared'],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/, /packages\/shared/],
    },
  },
});
