/**
 * The inlang SDK that Paraglide itself depends on (SPEC 6.1, ADR 0002).
 * Paraglide compiles a project through its own copy of the SDK, and a
 * project loaded by another SDK major does not compile (root ADR 0009), so
 * the binding loads the project with that same copy: it resolves
 * `@inlang/sdk` from Paraglide's package, where Paraglide's own imports
 * resolve it.
 * @ref https://nodejs.org/api/module.html#modulecreaterequirefilename
 * @packageDocumentation
 */
import type { compileProject } from '@inlang/paraglide-js';

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { isRecord } from './internal/is-record';

/** The project Paraglide's `compileProject()` compiles. */
export type InlangProject = Parameters<typeof compileProject>[0]['project'];

/** The part of the inlang SDK the binding calls, exported by SDK 2 to 4. */
export interface InlangSdk {
  readonly loadProjectFromDirectory: (args: {
    readonly path: string;
    readonly fs: unknown;
  }) => Promise<InlangProject>;
  readonly selectBundleNested: (db: InlangProject['db']) => {
    execute(): Promise<ReadonlyArray<unknown>>;
  };
  readonly upsertBundleNested: (
    db: InlangProject['db'],
    bundle: unknown,
  ) => Promise<void>;
}

const SDK_FUNCTIONS = [
  'loadProjectFromDirectory',
  'selectBundleNested',
  'upsertBundleNested',
] as const;

function missingFunctions(value: unknown): ReadonlyArray<string> {
  return SDK_FUNCTIONS.filter(
    (name) => !isRecord(value) || typeof value[name] !== 'function',
  );
}

function isInlangSdk(value: unknown): value is InlangSdk {
  return missingFunctions(value).length === 0;
}

/** `sdk` as the SDK the binding calls; a `TypeError` naming each function it lacks. */
export function toInlangSdk(sdk: unknown): InlangSdk {
  if (isInlangSdk(sdk)) {
    return sdk;
  }
  throw new TypeError(
    `compile: the @inlang/sdk that @inlang/paraglide-js depends on lacks ${missingFunctions(sdk).join(', ')}`,
  );
}

/** The path of the `@inlang/sdk` entry that Paraglide's modules import. */
export function paraglideSdkPath(): string {
  const paraglide = createRequire(import.meta.url).resolve(
    '@inlang/paraglide-js',
  );
  return createRequire(paraglide).resolve('@inlang/sdk');
}

/** Imports the inlang SDK that Paraglide depends on. */
export async function paraglideSdk(): Promise<InlangSdk> {
  const sdk: unknown = await import(pathToFileURL(paraglideSdkPath()).href);
  return toInlangSdk(sdk);
}
