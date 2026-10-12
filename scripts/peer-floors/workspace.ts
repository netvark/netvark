/**
 * The workspace's package manifests, read from the directories the
 * `packages` globs of `pnpm-workspace.yaml` name. Only the forms this
 * repository uses are read, a directory and `<directory>/*`; any other glob
 * is a `TypeError`, so a new form fails here instead of hiding packages from
 * the floor checks.
 * @ref https://pnpm.io/pnpm-workspace_yaml
 * @packageDocumentation
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'yaml';

/** The fields of a `package.json` the floor checks read. */
export interface Manifest {
  readonly name: string;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies: Readonly<Record<string, string>>;
  readonly peerDependencies: Readonly<Record<string, string>>;
}

const DIRECTORY = /^[\w.-]+(?:\/[\w.-]+)*$/u;
const CHILDREN = /^(?<directory>[\w.-]+(?:\/[\w.-]+)*)\/\*$/u;

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ranges(
  value: unknown,
  what: string,
): Readonly<Record<string, string>> {
  if (value === undefined) {
    return {};
  }
  if (!isObject(value)) {
    throw new TypeError(`${what} must be an object`);
  }
  const result: Record<string, string> = {};
  for (const [name, range] of Object.entries(value)) {
    if (typeof range !== 'string') {
      throw new TypeError(`${what}.${name} must be a string`);
    }
    result[name] = range;
  }
  return result;
}

/** The dependency fields of a parsed `package.json`; `file` names it in errors. */
export function manifestOf(json: unknown, file: string): Manifest {
  if (!isObject(json)) {
    throw new TypeError(`${file} must hold an object`);
  }
  const name: unknown = Reflect.get(json, 'name');
  if (typeof name !== 'string') {
    throw new TypeError(`${file} must have a name`);
  }
  return {
    name,
    dependencies: ranges(
      Reflect.get(json, 'dependencies'),
      `${file} dependencies`,
    ),
    devDependencies: ranges(
      Reflect.get(json, 'devDependencies'),
      `${file} devDependencies`,
    ),
    peerDependencies: ranges(
      Reflect.get(json, 'peerDependencies'),
      `${file} peerDependencies`,
    ),
  };
}

/** The package directories, relative to the root, that the `packages` globs name. */
export function packageDirectories(
  globs: unknown,
  root: string,
): Array<string> {
  if (!Array.isArray(globs)) {
    throw new TypeError('pnpm-workspace.yaml must list its packages');
  }
  const directories: Array<string> = [];
  for (const glob of globs) {
    if (typeof glob !== 'string') {
      throw new TypeError('pnpm-workspace.yaml packages must be strings');
    }
    const children = CHILDREN.exec(glob)?.groups?.['directory'];
    if (children !== undefined) {
      const entries = readdirSync(join(root, children), {
        withFileTypes: true,
      });
      for (const entry of entries) {
        const directory = `${children}/${entry.name}`;
        if (
          entry.isDirectory() &&
          existsSync(join(root, directory, 'package.json'))
        ) {
          directories.push(directory);
        }
      }
    } else if (DIRECTORY.test(glob)) {
      directories.push(glob);
    } else {
      throw new TypeError(
        `the packages glob ${glob} is not one the floor checks read`,
      );
    }
  }
  return directories.toSorted();
}

/** Every workspace package's manifest under `root`, in directory order. */
export function readWorkspace(root: string): Array<Manifest> {
  const config: unknown = parse(
    readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8'),
  );
  const globs: unknown = isObject(config)
    ? Reflect.get(config, 'packages')
    : undefined;
  return packageDirectories(globs, root).map((directory) => {
    const file = `${directory}/package.json`;
    const json: unknown = JSON.parse(readFileSync(join(root, file), 'utf8'));
    return manifestOf(json, file);
  });
}
