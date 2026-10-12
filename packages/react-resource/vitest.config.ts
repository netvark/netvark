import type { UserWorkspaceConfig } from 'vitest/config';

import { defineProject } from 'vitest/config';

/**
 * The bindings' test project; the root `vitest.config.ts` runs it and owns
 * coverage. `@netvark/resource-core` resolves to its source through the
 * `source` condition (see tsconfig.json), so the tests declare the fixture's
 * resources and messages against the core as it is edited. The screen
 * tests run in jsdom, each naming it with `@vitest-environment jsdom`.
 * @ref https://vitest.dev/guide/projects
 * @ref https://vitest.dev/guide/environment#environments-for-specific-files
 * @ref https://vite.dev/config/shared-options#resolve-conditions
 * @ref https://vite.dev/config/ssr-options#ssr-resolve-conditions
 */
const config: UserWorkspaceConfig = defineProject({
  // Vitest runs the node environment through Vite's SSR pipeline, whose
  // resolver reads `ssr.resolve.conditions`, and jsdom through its client
  // pipeline, whose resolver reads `resolve.conditions`. `source` is
  // prepended to Vite's defaults for each, so the screen tests too run
  // against the cores' source, which CI's test job never builds.
  resolve: {
    conditions: ['source', 'module', 'browser', 'development|production'],
  },
  ssr: {
    resolve: {
      conditions: ['source', 'module', 'node', 'development|production'],
    },
  },
  test: {
    name: '@netvark/react-resource',
    // The screen tests (`*.test.tsx`) name jsdom in their first line.
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    restoreMocks: true,
    typecheck: {
      enabled: true,
      include: ['src/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
  },
});

export default config;
