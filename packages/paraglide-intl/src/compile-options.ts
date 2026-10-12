/**
 * The options of `compile()` (SPEC 6.1): Paraglide's compiler options plus
 * the locales whose interpolated values are isolated, checked before
 * anything is read, and Paraglide's defaults merged under them as
 * Paraglide's own `compile()` merges them.
 * @ref https://github.com/opral/paraglide-js/blob/0c6cf2c971b667cedf133dea471101897c8c0ade/src/compiler/compile.ts
 * @packageDocumentation
 */
import type { CompilerOptions } from '@inlang/paraglide-js';

import fs from 'node:fs';

import { defaultCompilerOptions } from '@inlang/paraglide-js';

import { isRecord } from './internal/is-record';

/** Paraglide's compiler options, plus the locales to isolate. */
export type CompileOptions = CompilerOptions & {
  /** The previous compile's result: a file whose content is unchanged is not rewritten. */
  readonly previousCompilation?:
    | { readonly outputHashes?: Record<string, string> | undefined }
    | undefined;
  /**
   * The locales whose messages isolate each interpolated value: every
   * locale of the project (`true`, the default), none (`false`), or those
   * listed, which the project must declare.
   */
  readonly isolate?: boolean | ReadonlyArray<string> | undefined;
};

/** What a compile returns. */
export interface CompileResult {
  /** The hash of each file written, for the next compile's `previousCompilation`. */
  readonly outputHashes: Record<string, string>;
  /** The project's errors, such as a plugin that failed to import or a file that failed to parse. */
  readonly warnings: ReadonlyArray<Error>;
}

/** The checked options of one compile. */
export interface CompileConfig {
  readonly project: string;
  readonly outdir: string;
  readonly fs: typeof fs;
  readonly isolate: boolean | ReadonlyArray<string>;
  readonly previousOutputHashes: Record<string, string> | undefined;
  /** Paraglide's options with its defaults under them, as its `compile()` passes them on. */
  readonly compilerOptions: CompilerOptions;
}

const CALLER = 'compile';

function isLocaleList(value: unknown): value is ReadonlyArray<string> {
  return (
    Array.isArray(value) &&
    value.every((locale: unknown) => typeof locale === 'string')
  );
}

function isFileSystem(value: unknown): value is typeof fs {
  return isRecord(value) && isRecord(value['promises']);
}

function isolateOption(value: unknown): boolean | ReadonlyArray<string> {
  if (value === undefined) {
    return true;
  }
  if (typeof value === 'boolean' || isLocaleList(value)) {
    return value;
  }
  throw new TypeError(
    `${CALLER}: isolate is not a boolean or a list of locales`,
  );
}

function fileSystem(value: unknown): typeof fs {
  if (value === undefined) {
    return fs;
  }
  if (!isFileSystem(value)) {
    throw new TypeError(`${CALLER}: fs is not a file system module`);
  }
  return value;
}

/** Checks the options; throws naming the first one a compile cannot use (SPEC 5). */
export function compileConfig(options: CompileOptions): CompileConfig {
  const value: unknown = options;
  if (!isRecord(value)) {
    throw new TypeError(`${CALLER}: options is not an object`);
  }
  for (const name of ['project', 'outdir'] as const) {
    if (typeof value[name] !== 'string') {
      throw new TypeError(`${CALLER}: ${name} is not a string`);
    }
  }
  const { isolate, previousCompilation, ...paraglideOptions } = options;
  return {
    project: options.project,
    outdir: options.outdir,
    fs: fileSystem(value['fs']),
    isolate: isolateOption(isolate),
    previousOutputHashes: previousCompilation?.outputHashes,
    compilerOptions: { ...defaultCompilerOptions, ...paraglideOptions },
  };
}
