import type { ViteUserConfig } from 'vitest/config';

import { defineConfig } from 'vitest/config';

/**
 * End-to-end suite. `extract --check` boots PGlite in a child process and
 * `tsc` compiles the `fails/` declarations; the timeouts allow for both.
 * @ref https://vitest.dev/config/
 */
const config: ViteUserConfig = defineConfig({
  test: {
    include: ['**/*.e2e.test.ts'],
    environment: 'node',
    restoreMocks: true,
    testTimeout: 120_000,
    hookTimeout: 60_000,
  },
});

export default config;
