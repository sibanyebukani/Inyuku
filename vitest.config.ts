import { defineConfig } from 'vitest/config'

// Frontend (Next.js) test scope only — the backend has its own vitest config under server/.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', 'server', '.next', 'dist'],
  },
})
