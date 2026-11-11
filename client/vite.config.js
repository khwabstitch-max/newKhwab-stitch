import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import process from 'node:process';
export default defineConfig({
  envDir: process.env.KHWAB_NO_ENV_FILES === '1' ? false : undefined,
  plugins: [react()],
  build: { rollupOptions: { output: { manualChunks: { framework: ['react', 'react-dom', 'react-router-dom'], icons: ['lucide-react'] } } } },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
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
