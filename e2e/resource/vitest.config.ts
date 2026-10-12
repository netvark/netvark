import type { ViteUserConfig } from 'vitest/config';

import { defineConfig } from 'vitest/config';

/**
 * End-to-end suite. `extract --check` boots PGlite in a child process and
 * `tsc` compiles the `fails/` declarations; the timeouts allow for both.
 * The screens' tests (`*.e2e.test.tsx`) run in jsdom beside the contacts
 * application they call (`support/screen-environment.ts`).
 * @ref https://vitest.dev/config/
 * @ref https://vitest.dev/guide/projects
 */
const config: ViteUserConfig = defineConfig({
  test: {
    restoreMocks: true,
    testTimeout: 120_000,
    hookTimeout: 60_000,
    projects: [
      {
        extends: true,
        test: {
          name: 'resource',
          include: ['**/*.e2e.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'screens',
          include: ['**/*.e2e.test.tsx'],
          environment: './support/screen-environment.ts',
        },
      },
    ],
  },
});

export default config;
