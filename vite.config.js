import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'static_assets',
  server: {
    watch: {
      ignored: [
        '**/server/storage/**',
        '**/server/**',
        '**/.git/**',
        '**/node_modules/**'
      ]
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true
      }
    }
  },
  test: {
    environment: 'node',
    globals: true
  }
});
