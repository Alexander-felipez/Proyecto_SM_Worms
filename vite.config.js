import { defineConfig } from 'vite';

export default defineConfig({
   base: '/WORMS-2D/',
  server: {
    port: 3000
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 0
  }
});
