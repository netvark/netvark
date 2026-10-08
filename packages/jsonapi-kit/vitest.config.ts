import type { UserWorkspaceConfig } from 'vitest/config';

import { defineProject } from 'vitest/config';

/**
 * The core's test project; the root `vitest.config.ts` runs it and owns
 * coverage.
 * @ref https://vitest.dev/guide/projects
 */
const config: UserWorkspaceConfig = defineProject({
  test: {
    name: 'jsonapi-kit',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    // The conformance tests compile the vendored JSON:API schema with Ajv on
    // first use; on a two-core CI runner with coverage instrumentation and one
    // worker per file that can pass Vitest's 5 s default. Same headroom as e2e/.
    testTimeout: 20_000,
    typecheck: {
      enabled: true,
      include: ['src/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
  },
});

export default config;
