import { defineConfig } from 'vitest/config';
import path from 'path';

// Frontend (Next.js) test scope only — the backend has its own vitest config under server/.
export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', 'server', '.next', 'dist'],
  },
});
