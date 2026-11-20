import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import process from 'node:process';
export default defineConfig({
  envDir: process.env.KHWAB_NO_ENV_FILES === '1' ? false : undefined,
  plugins: [react()],
  build: { rollupOptions: { output: { manualChunks: { framework: ['react', 'react-dom', 'react-router-dom'], icons: ['lucide-react'] } } } },
  server: {
    strictPort: true,
    // The API binds IPv4; localhost may reach another service on IPv6.
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/health': 'http://127.0.0.1:3000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    clearMocks: true,
    maxWorkers: 4,
    testTimeout: 15000,
  },
});
