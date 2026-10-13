/**
 * The hashes of the files in an output directory (SPEC 6.5, ADR 0010), in
 * the form Paraglide's `writeOutput()` returns them from 2.11 to 2.27: the
 * hexadecimal SHA-256 of each file's text followed by its absolute path,
 * keyed by its path relative to the directory with `/` separators. Given
 * as the previous compilation, they let a compile rewrite only the files
 * that changed and delete the ones it no longer writes, where a clean would
 * first remove the directory from under a dev server that reads it.
 * Paraglide's CLI and bundler plugins seed their first compile the same way.
 * @ref https://github.com/opral/paraglide-js/blob/0c6cf2c971b667cedf133dea471101897c8c0ade/src/services/file-handling/write-output.ts (hashOutput, hashDirectory)
 * @ref https://github.com/opral/paraglide-js/blob/0c6cf2c971b667cedf133dea471101897c8c0ade/src/cli/commands/compile/command.ts (seedPreviousCompilationFromOutdir)
 * @packageDocumentation
 */
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import type fs from 'node:fs';

/** The entries of `path`; none when it cannot be listed, such as when it does not exist. */
async function entriesOf(
  promises: typeof fs.promises,
  path: string,
): Promise<Array<fs.Dirent>> {
  try {
    return await promises.readdir(path, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** The hash of the file at `path`; none when it cannot be read, such as while another compile replaces it. */
async function fileHash(
  promises: typeof fs.promises,
  path: string,
): Promise<string | undefined> {
  try {
    const text = await promises.readFile(path, 'utf8');
    return createHash('sha256')
      .update(text + path)
      .digest('hex');
  } catch {
    return undefined;
  }
}

async function hashedFiles(
  promises: typeof fs.promises,
  root: string,
  relative: string,
): Promise<Array<readonly [string, string]>> {
  const hashed: Array<readonly [string, string]> = [];
  for (const entry of await entriesOf(promises, resolve(root, relative))) {
    const path = relative === '' ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) {
      hashed.push(...(await hashedFiles(promises, root, path)));
    } else if (entry.isFile()) {
      const hash = await fileHash(promises, resolve(root, path));
      if (hash !== undefined) {
        hashed.push([path, hash]);
      }
    }
  }
  return hashed;
}

/**
 * The hashes of the files under `directory`, none for one that does not
 * exist. A file that cannot be read has no hash, so the compile rewrites
 * it, as Paraglide's seed does.
 */
export async function outputHashes(
  promises: typeof fs.promises,
  directory: string,
): Promise<Record<string, string>> {
  return Object.fromEntries(await hashedFiles(promises, directory, ''));
}
