import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const webRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@skladnik/shared': resolve(webRoot, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: Number(process.env.WEB_PORT ?? 5176),
    strictPort: true,
    proxy: {
      '/auth': { target: process.env.API_URL ?? 'http://localhost:3003', changeOrigin: true },
      '/tenancy': { target: process.env.API_URL ?? 'http://localhost:3003', changeOrigin: true },
      '/sites': { target: process.env.API_URL ?? 'http://localhost:3003', changeOrigin: true },
      '/users': { target: process.env.API_URL ?? 'http://localhost:3003', changeOrigin: true },
      '/invites': { target: process.env.API_URL ?? 'http://localhost:3003', changeOrigin: true },
      '/product-groups': { target: process.env.API_URL ?? 'http://localhost:3003', changeOrigin: true },
      '/partners': { target: process.env.API_URL ?? 'http://localhost:3003', changeOrigin: true },
      '/products': { target: process.env.API_URL ?? 'http://localhost:3003', changeOrigin: true },
      '/unit-aliases': { target: process.env.API_URL ?? 'http://localhost:3003', changeOrigin: true },
      '/documents': { target: process.env.API_URL ?? 'http://localhost:3003', changeOrigin: true },
      '/health': { target: process.env.API_URL ?? 'http://localhost:3003', changeOrigin: true },
    },
    fs: {
      allow: ['../..'],
    },
  },
  optimizeDeps: {
    exclude: ['@skladnik/shared'],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/, /packages\/shared/],
    },
  },
});
