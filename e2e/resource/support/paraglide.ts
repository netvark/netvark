/**
 * The Paraglide side of the localization suite (resource SPEC 15.4): a copy
 * of `localization/project.inlang` with one message changed, compiled by
 * the Paraglide CLI as the package's `build` compiles the original, for the
 * type check that must fail.
 * @ref https://paraglidejs.com/compiling-messages
 * @packageDocumentation
 */

import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { PACKAGE_DIR } from './paths';
import { binPath, runBin } from './run-bin';

const LOCALIZATION_DIR = join(PACKAGE_DIR, 'localization');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readRecord(path: string): Promise<Record<string, unknown>> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!isRecord(value)) {
    throw new TypeError(`${path} does not hold an object`);
  }
  return value;
}

const PLUGIN = join(
  PACKAGE_DIR,
  'node_modules/@inlang/plugin-message-format/dist/index.js',
);

/** Compiles the project in `dir` into `dir/paraglide` with declarations, as the package's `build` does. */
export async function compileMessages(dir: string): Promise<void> {
  const run = await runBin(
    await binPath('@inlang/paraglide-js', 'paraglide-js'),
    [
      'compile',
      '--project',
      join(dir, 'project.inlang'),
      '--outdir',
      join(dir, 'paraglide'),
      '--emit-ts-declarations',
      '--silent',
    ],
    PACKAGE_DIR,
  );
  if (run.code !== 0) {
    throw new Error(`paraglide-js compile failed:\n${run.stderr}`);
  }
}

/** A copy of the localization project in a fresh directory under `.tmp`, with `edit` applied to one locale's messages. */
export async function copyProject(
  locale: string,
  edit: (messages: Record<string, unknown>) => Record<string, unknown>,
): Promise<string> {
  await mkdir(join(PACKAGE_DIR, '.tmp'), { recursive: true });
  const dir = await mkdtemp(join(PACKAGE_DIR, '.tmp', 'paraglide-'));
  await cp(join(LOCALIZATION_DIR, 'messages'), join(dir, 'messages'), {
    recursive: true,
  });
  const settings = await readRecord(
    join(LOCALIZATION_DIR, 'project.inlang', 'settings.json'),
  );
  await mkdir(join(dir, 'project.inlang'));
  await writeFile(
    join(dir, 'project.inlang', 'settings.json'),
    JSON.stringify({ ...settings, modules: [PLUGIN] }),
  );
  const path = join(dir, 'messages', `${locale}.json`);
  await writeFile(path, JSON.stringify(edit(await readRecord(path))));
  return dir;
}
