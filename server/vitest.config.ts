import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Inline (empty) PostCSS config disables Vite's upward config search, which otherwise
  // finds the root Next.js postcss.config.js (tailwindcss) — not installed in the backend.
  css: { postcss: { plugins: [] } },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
