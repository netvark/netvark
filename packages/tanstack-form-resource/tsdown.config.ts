import type { UserConfig } from 'tsdown';

import { defineConfig } from 'tsdown';

/**
 * Library build. ESM only, runtime neutral, declarations via oxc
 * (isolatedDeclarations). Of `@tanstack/form-core` the JavaScript imports
 * `revalidateLogic` alone, the one value the binding hands a form, and the
 * declarations name its types; it is a peer, so the build leaves it
 * external and the application's copy runs (root ADR 0011). `exports`
 * keeps package.json in sync with the entry map below: the published map
 * (`publishConfig.exports`) points at `dist/`, while the in-repo map adds
 * a `source` condition pointing at `src/`. publint and attw run as part of
 * the build.
 * @ref https://tsdown.dev/options/config-file
 * @ref https://tsdown.dev/options/package-exports
 * @ref https://tsdown.dev/options/dependencies
 */
const config: UserConfig = defineConfig({
  entry: { index: 'src/index.ts' },
  format: 'esm',
  platform: 'neutral',
  target: 'es2023',
  dts: true,
  sourcemap: true,
  clean: true,
  exports: { devExports: 'source' },
  publint: true,
  attw: true,
});

export default config;
