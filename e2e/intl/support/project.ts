/**
 * Paraglide projects for the suite and the smoke (SPEC 7.2, 7.3): catalogs
 * written into a new directory with settings that load the message-format
 * plugin the e2e package installs, and the compiled messages imported back.
 */
import type { Catalogs } from './catalogs.ts';

import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** A compiled message: its inputs, and optionally the locale to render in. */
export type Message = (
  inputs?: Readonly<Record<string, unknown>>,
  options?: { readonly locale?: string },
) => string;

/** The messages a compile exports as `m`, by key. */
export type Messages = Readonly<Record<string, Message>>;

export interface Project {
  /** The new directory that holds the project and its catalogs. */
  readonly dir: string;
  /** The `project.inlang` directory. */
  readonly project: string;
  /** Where a compile writes unless told otherwise, `<dir>/paraglide`. */
  readonly outdir: string;
}

const PLUGIN = createRequire(import.meta.url).resolve(
  '@inlang/plugin-message-format',
);

/**
 * Writes `catalogs` into a new project whose base locale is their first. The
 * directory is a real path: the temporary directory is a symlink on macOS,
 * and Vitest loads a module imported through it and again through its target
 * twice, where Node loads it once, so the compiled messages would read a
 * second copy of Paraglide's runtime, without the server's request scope.
 */
export async function writeProject(catalogs: Catalogs): Promise<Project> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'intl-e2e-')));
  const project = join(dir, 'project.inlang');
  await mkdir(project);
  await mkdir(join(dir, 'messages'));
  const locales = Object.keys(catalogs);
  await writeFile(
    join(project, 'settings.json'),
    JSON.stringify({
      baseLocale: locales[0],
      locales,
      modules: [PLUGIN],
      'plugin.inlang.messageFormat': {
        pathPattern: './messages/{locale}.json',
      },
    }),
  );
  for (const [locale, messages] of Object.entries(catalogs)) {
    await writeFile(
      join(dir, 'messages', `${locale}.json`),
      JSON.stringify(messages),
    );
  }
  return { dir, project, outdir: join(dir, 'paraglide') };
}

function isMessages(value: unknown): value is Messages {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((each) => typeof each === 'function')
  );
}

/** The messages a compile wrote into `outdir`. */
export async function importMessages(outdir: string): Promise<Messages> {
  const module: unknown = await import(
    pathToFileURL(join(outdir, 'messages.js')).href
  );
  const m: unknown =
    typeof module === 'object' && module !== null
      ? Reflect.get(module, 'm')
      : undefined;
  if (!isMessages(m)) {
    throw new TypeError('the compiled messages.js exports no messages as m');
  }
  return m;
}

/** The message `key`; throws when the compile wrote none. */
export function message(messages: Messages, key: string): Message {
  const found = messages[key];
  if (found === undefined) {
    throw new TypeError(`the compiled messages have no ${key}`);
  }
  return found;
}
