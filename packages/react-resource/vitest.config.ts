import type { UserWorkspaceConfig } from 'vitest/config';

import { defineProject } from 'vitest/config';

/**
 * The bindings' test project; the root `vitest.config.ts` runs it and owns
 * coverage. `@netvark/resource-core` resolves to its source through the
 * `source` condition (see tsconfig.json), so the tests declare the fixture's
 * resources and messages against the core as it is edited.
 * @ref https://vitest.dev/guide/projects
 * @ref https://vite.dev/config/ssr-options#ssr-resolve-conditions
 */
const config: UserWorkspaceConfig = defineProject({
  // Vitest runs the node environment through Vite's SSR pipeline, whose
  // resolver reads `ssr.resolve.conditions`, not the client-side
  // `resolve.conditions`. `source` is prepended to Vite's server defaults.
  ssr: {
    resolve: {
      conditions: ['source', 'module', 'node', 'development|production'],
    },
  },
  test: {
    name: '@netvark/react-resource',
    include: ['src/**/*.test.ts'],
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
