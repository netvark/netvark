import type { UserWorkspaceConfig } from 'vitest/config';

import { defineProject } from 'vitest/config';

/**
 * The binding's test project; the root `vitest.config.ts` runs it and owns
 * coverage.
 * @ref https://vitest.dev/guide/projects
 */
const config: UserWorkspaceConfig = defineProject({
  test: {
    name: '@netvark/paraglide-intl',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    testTimeout: 60_000,
    typecheck: {
      enabled: true,
      include: ['src/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
  },
});

export default config;
