import type { ViteUserConfig } from 'vitest/config';

import { defineConfig } from 'vitest/config';

/**
 * End-to-end suite. Every extraction boots PGlite in-process, or creates a
 * throwaway database on the server named by `CATALOG_PG_URL`; the timeouts
 * allow for that.
 * @ref https://vitest.dev/config/
 */
const config: ViteUserConfig = defineConfig({
  test: {
    include: ['**/*.e2e.test.ts'],
    environment: 'node',
    restoreMocks: true,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});

export default config;
