import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 3000
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 0
  }
});
