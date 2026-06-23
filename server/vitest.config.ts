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
    // Integration tests share a single Postgres database with cross-cutting tables
    // (auditLog, settings, and null-businessId WhatsApp inbound events) that cannot
    // be tenant-scoped. Several suites assert on global table state (e.g. exact
    // inbound-event counts) and reset with unscoped deletes, which is only safe under
    // exclusive DB access. Run test files serially so they never race on shared rows.
    fileParallelism: false,
  },
});
