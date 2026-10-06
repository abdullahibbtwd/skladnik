import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { API_NESTED_PATH_PREFIXES, API_PATH_PREFIXES } from './src/lib/pwa-constants';

const webRoot = dirname(fileURLToPath(import.meta.url));
const apiTarget = process.env.API_URL ?? 'http://localhost:3003';

const proxy = Object.fromEntries([
  ...API_PATH_PREFIXES.map((prefix): [string, ProxyOptions] => [
    `/${prefix}`,
    { target: apiTarget, changeOrigin: true, ...(prefix === 'auth' || prefix === 'platform-auth' ? { xfwd: true } : {}) },
  ]),
  ...API_NESTED_PATH_PREFIXES.map((prefix): [string, ProxyOptions] => [
    `/${prefix}`,
    {
      target: apiTarget,
      changeOrigin: true,
      // Browser document navigations to /platform/subscriptions/* must hit the SPA.
      bypass(req) {
        if (req.headers.accept?.includes('text/html')) return '/index.html';
      },
    },
  ]),
]);

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'pwa-icon.svg'],
      manifest: {
        id: '/',
        lang: 'bg',
        name: 'Skladnik — Smart Retail & Stock Management',
        short_name: 'Skladnik',
        description: 'Stock, invoices, till and reports for grocery stores, cafés and retail outlets.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#0d9488',
        background_color: '#f1f5f9',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png', purpose: 'any' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      /** A custom worker (src/sw.ts) so it can also upload photos queued offline on the Background Sync event. */
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        /** The main bundle is a single chunk; above this size Workbox silently leaves it out and the app no longer opens offline. */
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: {
      '@skladnik/shared': resolve(webRoot, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: Number(process.env.WEB_PORT ?? 5176),
    strictPort: true,
    proxy,
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
