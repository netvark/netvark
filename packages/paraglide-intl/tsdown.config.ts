import type { UserConfig } from 'tsdown';

import { defineConfig } from 'tsdown';

/**
 * Library build. ESM only, for Node-compatible runtimes: the binding is a
 * build-time tool that reads and writes files (ADR 0002). Declarations via
 * oxc (isolatedDeclarations). `exports` keeps package.json in sync with the
 * entry map below: the published map (`publishConfig.exports`) points at
 * `dist/`, while the in-repo map adds a `source` condition pointing at
 * `src/` for the e2e suite's type-checks. publint and attw run as part of
 * the build.
 * @ref https://tsdown.dev/options/config-file
 * @ref https://tsdown.dev/options/package-exports
 */
const config: UserConfig = defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: 'esm',
  platform: 'node',
  target: 'es2023',
  dts: true,
  sourcemap: true,
  clean: true,
  exports: { devExports: 'source' },
  publint: true,
  attw: true,
});

export default config;
