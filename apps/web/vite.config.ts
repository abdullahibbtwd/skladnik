import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
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
