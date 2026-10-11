/**
 * Runs an installed package's bin in a Node.js process of its own, as a
 * package manager runs it: the file its package.json `bin` names.
 * @ref https://docs.npmjs.com/cli/v11/configuring-npm/package-json#bin
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { PACKAGE_DIR } from './paths';

export interface Run {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

/**
 * The path of `name`'s bin in `packageName`, a dependency of this package,
 * read from the manifest the package manager linked into `node_modules`: an
 * `exports` map need not expose `package.json` (Paraglide's does not).
 */
export async function binPath(
  packageName: string,
  name: string,
): Promise<string> {
  const root = join(PACKAGE_DIR, 'node_modules', packageName);
  const manifest: unknown = JSON.parse(
    await readFile(join(root, 'package.json'), 'utf8'),
  );
  const bins = isRecord(manifest) ? manifest['bin'] : undefined;
  const bin = isRecord(bins) ? bins[name] : undefined;
  if (typeof bin !== 'string') {
    throw new TypeError(`${packageName} has no bin named ${name}`);
  }
  return join(root, bin);
}

/** Runs `bin` with `args` in `cwd` and collects its output. */
export async function runBin(
  bin: string,
  args: ReadonlyArray<string>,
  cwd: string,
): Promise<Run> {
  const child = spawn(process.execPath, [bin, ...args], { cwd });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    stderr += chunk;
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  return { code, stdout, stderr };
}
