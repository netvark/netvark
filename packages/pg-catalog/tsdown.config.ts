import type { UserConfig } from 'tsdown';

import { defineConfig } from 'tsdown';

/**
 * Library build. ESM only, for Node.js (the extractor reads files and opens
 * database connections, ADR 0002 of the catalog family), declarations via
 * oxc (isolatedDeclarations). `exports` keeps package.json in sync with the
 * entry map below, as in every other package; publint and attw run as part
 * of the build. The `cli` entry is the `pg-catalog` bin, not an import
 * path, so it stays out of `exports`; tsdown's bin generation is off
 * because with `devExports` it would point the bin at the TypeScript source
 * in the workspace, which Node.js cannot run with extensionless imports, so
 * package.json declares `bin` itself, pointing at the build.
 * @ref https://tsdown.dev/options/config-file
 * @ref https://tsdown.dev/options/package-exports
 */
const config: UserConfig = defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
  },
  format: 'esm',
  platform: 'node',
  target: 'es2023',
  dts: true,
  sourcemap: true,
  clean: true,
  exports: { devExports: 'source', exclude: ['cli'], bin: false },
  publint: true,
  attw: true,
});

export default config;
