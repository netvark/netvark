import type { UserConfig } from 'tsdown';

import { defineConfig } from 'tsdown';

/**
 * Library build. ESM only, for Node.js (the extractor reads files and opens
 * database connections, ADR 0002 of the catalog family), declarations via
 * oxc (isolatedDeclarations). `exports` keeps package.json in sync with the
 * entry map below, as in every other package; publint and attw run as part
 * of the build.
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
