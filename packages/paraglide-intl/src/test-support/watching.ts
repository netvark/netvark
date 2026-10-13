/**
 * Watches over fixture projects for the watch tests (SPEC 7.1): each one
 * records its results and errors, and `closeWatches()` closes them after a
 * test. A watched output is compared with a fresh compile of the same
 * project.
 */
import type { CompileResult } from '../compile-options';
import type { Watcher, WatchOptions } from '../watch';

import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { compile } from '../compile';
import { watch } from '../watch';
import { filesUnder, fixtureProject, MESSAGES } from './fixture-project';

/** Longer than a change takes to be reported and settle, on macOS and Linux. */
const QUIET_MS = 600;

/** How long a test waits for a compile a change starts. */
export const UNTIL = { timeout: 15_000 } as const;

/** A watch with what it has reported so far. */
export interface Watching {
  readonly watcher: Watcher;
  readonly results: Array<CompileResult>;
  readonly errors: Array<unknown>;
}

const watches: Array<Watcher> = [];

/** Watches with `options`, recording each result and error. */
export async function watching(options: WatchOptions): Promise<Watching> {
  const results: Array<CompileResult> = [];
  const errors: Array<unknown> = [];
  const watcher = await watch({
    onCompile: (result) => {
      results.push(result);
    },
    onError: (error) => {
      errors.push(error);
    },
    ...options,
  });
  watches.push(watcher);
  return { watcher, results, errors };
}

/** Closes every watch the test started. */
export async function closeWatches(): Promise<void> {
  for (const watcher of watches.splice(0)) {
    await watcher.close();
  }
}

/** Waits `QUIET_MS`, for whatever a change would have started. */
export async function quiet(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, QUIET_MS);
  });
}

/** A promise and the function that resolves it. */
export function gate(): {
  readonly opened: Promise<void>;
  readonly open: () => void;
} {
  const resolvers: Array<() => void> = [];
  const opened = new Promise<void>((resolve) => {
    resolvers.push(resolve);
  });
  return {
    opened,
    open: () => {
      for (const resolve of resolvers) {
        resolve();
      }
    },
  };
}

/** A fixture project compiled once, as a project is before its watch starts. */
export async function compiledProject(): Promise<
  Awaited<ReturnType<typeof fixtureProject>>
> {
  const fixture = await fixtureProject(MESSAGES);
  await compile({ project: fixture.project, outdir: fixture.outdir });
  return fixture;
}

/** Rewrites the catalog of `locale` in the project in `dir`. */
export async function writeMessages(
  dir: string,
  locale: string,
  entries: Readonly<Record<string, unknown>>,
): Promise<void> {
  await writeFile(
    join(dir, 'messages', `${locale}.json`),
    JSON.stringify(entries),
  );
}

/** The files a fresh compile of `project` writes. */
export async function freshOutput(
  dir: string,
  project: string,
): Promise<Record<string, string>> {
  const outdir = await mkdtemp(join(dir, 'fresh-'));
  await compile({ project, outdir });
  return filesUnder(outdir);
}
