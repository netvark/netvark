import type { ViteUserConfig } from 'vitest/config';

import { defineConfig } from 'vitest/config';

/**
 * End-to-end suite: every file imports the built packages through their
 * published `exports` maps, as an installed copy would.
 * @ref https://vitest.dev/config/
 */
const config: ViteUserConfig = defineConfig({
  test: {
    include: ['**/*.e2e.test.ts'],
    environment: 'node',
    restoreMocks: true,
  },
});

export default config;
