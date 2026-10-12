import type { UserConfig } from 'tsdown';

import { defineConfig } from 'tsdown';

/**
 * Library build. ESM only, runtime neutral, declarations via oxc
 * (isolatedDeclarations). `exports` keeps package.json in sync with the
 * entry map below: the published map (`publishConfig.exports`) points at
 * `dist/`, while the in-repo map adds a `source` condition pointing at
 * `src/` for the sibling package's type-checks and tests. publint and attw
 * run as part of the build. The minifier only prints: it neither compresses
 * nor mangles, and keeps whitespace and comments, but writes every
 * non-ASCII character of a literal as an escape, so the published code
 * shows the isolates it inserts instead of hiding them (a raw bidi control
 * is what Trojan Source scanners flag).
 * @ref https://tsdown.dev/options/config-file
 * @ref https://tsdown.dev/options/package-exports
 * @ref https://rolldown.rs/reference/OutputOptions.minify (MinifyOptions; `codegen.asciiOnly` is documented in rolldown's CodegenOptions typings)
 * @ref https://www.cve.org/CVERecord?id=CVE-2021-42574
 */
const config: UserConfig = defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: 'esm',
  platform: 'neutral',
  target: 'es2023',
  dts: true,
  sourcemap: true,
  minify: {
    compress: false,
    mangle: false,
    codegen: { removeWhitespace: false, asciiOnly: true },
  },
  clean: true,
  exports: { devExports: 'source' },
  publint: true,
  attw: true,
});

export default config;
