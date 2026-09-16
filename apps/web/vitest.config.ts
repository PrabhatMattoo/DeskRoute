import { defineConfig } from 'vitest/config'

/** Node rather than jsdom: the design-token contract reads `index.css` off disk
 *  and resolves it, and a browser reports `lch()` back verbatim. */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
