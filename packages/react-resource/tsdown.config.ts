import type { UserConfig } from 'tsdown';

import { defineConfig } from 'tsdown';

/**
 * Library build. ESM only, runtime neutral, declarations via oxc
 * (isolatedDeclarations). `exports` keeps package.json in sync with the
 * entry map below: the published map (`publishConfig.exports`) points at
 * `dist/`, while the in-repo map adds a `source` condition pointing at
 * `src/`. publint and attw run as part of the build.
 * @ref https://tsdown.dev/options/config-file
 * @ref https://tsdown.dev/options/package-exports
 */

/**
 * The binding's one entry at `./form`, its documented subpath: tsdown
 * exports a package's only entry as `.`, whatever its name (0.23.0's
 * `generateExports`).
 * @ref https://tsdown.dev/options/package-exports ("customExports")
 */
function formSubpath(
  exports: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const { '.': form, ...rest } = exports;
  return { './form': form, ...rest };
}

const config: UserConfig = defineConfig({
  entry: { form: 'src/tanstack-form/index.ts' },
  format: 'esm',
  platform: 'neutral',
  target: 'es2023',
  dts: true,
  sourcemap: true,
  clean: true,
  exports: { devExports: 'source', customExports: formSubpath },
  publint: true,
  attw: true,
});

export default config;
