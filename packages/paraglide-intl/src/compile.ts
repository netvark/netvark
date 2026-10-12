/**
 * `compile()` (SPEC 6.1, ADR 0007): Paraglide's `compile()`, which loads
 * the project, compiles it, and writes the output, with the pattern rewrite
 * between the load and the compile, and the bidi controls of the compiled
 * code written as escapes before the write. The project is loaded with the inlang
 * SDK Paraglide depends on, and its catalogs on disk stay as they are: the
 * project is loaded without a `syncInterval`, so the SDK writes nothing
 * back.
 * @ref https://github.com/opral/paraglide-js/blob/0c6cf2c971b667cedf133dea471101897c8c0ade/src/compiler/compile.ts
 * @packageDocumentation
 */
import type {
  CompileConfig,
  CompileOptions,
  CompileResult,
} from './compile-options';
import type { InlangProject, InlangSdk } from './paraglide-sdk';

import { resolve } from 'node:path';
import process from 'node:process';

import { compileProject, writeOutput } from '@inlang/paraglide-js';

import { compileConfig } from './compile-options';
import { escapeBidiControls } from './escape-bidi-controls';
import { isBundle, isolateBundle } from './isolate-patterns';
import { paraglideSdk } from './paraglide-sdk';

const CALLER = 'compile';

/** The locales `isolate` names, each of which the project must declare. */
function isolatedLocales(
  isolate: boolean | ReadonlyArray<string>,
  declared: ReadonlyArray<string>,
): ReadonlySet<string> {
  if (typeof isolate === 'boolean') {
    return new Set(isolate ? declared : []);
  }
  const undeclared = isolate.find((locale) => !declared.includes(locale));
  if (undeclared !== undefined) {
    throw new TypeError(
      `${CALLER}: isolate lists ${undeclared}, a locale the project does not declare`,
    );
  }
  return new Set(isolate);
}

/** Rewrites the patterns of `locales` in the project's database, one bundle at a time. */
async function isolateProject(
  sdk: InlangSdk,
  project: InlangProject,
  locales: ReadonlySet<string>,
): Promise<void> {
  if (locales.size === 0) {
    return;
  }
  for (const bundle of await sdk.selectBundleNested(project.db).execute()) {
    if (!isBundle(bundle)) {
      throw new TypeError(
        `${CALLER}: @inlang/sdk returned a bundle without messages, variants, and patterns`,
      );
    }
    const isolated = isolateBundle(bundle, locales);
    if (isolated !== undefined) {
      // One bundle at a time: the SDK writes each in a batch or a
      // transaction of its own.
      await sdk.upsertBundleNested(project.db, isolated);
    }
  }
}

/** One compile with `sdk`; closes the project whether or not a step throws. */
export async function compileWith(
  sdk: InlangSdk,
  config: CompileConfig,
): Promise<CompileResult> {
  const project = await sdk.loadProjectFromDirectory({
    path: config.project,
    fs: config.fs,
  });
  try {
    const { locales } = await project.settings.get();
    await isolateProject(
      sdk,
      project,
      isolatedLocales(config.isolate, locales),
    );
    const output = escapeBidiControls(
      await compileProject({
        project,
        projectPath: config.project,
        compilerOptions: config.compilerOptions,
      }),
    );
    const outputHashes = await writeOutput({
      directory: resolve(process.cwd(), config.outdir),
      output,
      // As Paraglide's compile(): writeOutput() cleans when the option is truthy.
      cleanDirectory: Boolean(config.compilerOptions.cleanOutdir),
      fs: config.fs.promises,
      ...(config.previousOutputHashes === undefined
        ? {}
        : { previousOutputHashes: config.previousOutputHashes }),
    });
    return { outputHashes, warnings: await project.errors.get() };
  } finally {
    await project.close();
  }
}

/** The compile that runs or last ran; each compile waits for it. */
let pending: Promise<unknown> = Promise.resolve();

/**
 * Loads the project, isolates every interpolated value of the messages of
 * the `isolate` locales, compiles the project with Paraglide, and writes
 * the output, as Paraglide's `compile()` does. Compiles run one at a time,
 * as Paraglide's do, so two never write the same output directory at once.
 * Throws `TypeError` for an option it cannot use before reading anything.
 * @ref https://github.com/opral/paraglide-js/issues/320#issuecomment-2596951222 (two compiles in one process, which Paraglide's compile() locks against)
 */
export async function compile(options: CompileOptions): Promise<CompileResult> {
  const config = compileConfig(options);
  const result = pending.then(async () =>
    compileWith(await paraglideSdk(), config),
  );
  pending = result.catch(() => null);
  return result;
}
