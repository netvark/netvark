import type { ViteUserConfig } from 'vitest/config';

import { configDefaults, defineConfig } from 'vitest/config';

/**
 * End-to-end suite. `extract --check` boots PGlite in a child process and
 * `tsc` compiles the `fails/` declarations; the timeouts allow for both.
 * The screens' tests, React's (`*.e2e.test.tsx`) and Vue's (`vue/`), run in
 * jsdom beside the contacts application they call
 * (`support/screen-environment.ts`). A project's `exclude` replaces
 * Vitest's own, so it spreads `configDefaults.exclude`.
 * @ref https://vitest.dev/config/
 * @ref https://vitest.dev/config/exclude
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
          exclude: [...configDefaults.exclude, 'vue/**'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'screens',
          include: ['**/*.e2e.test.tsx', 'vue/**/*.e2e.test.ts'],
          environment: './support/screen-environment.ts',
        },
      },
    ],
  },
});

export default config;
