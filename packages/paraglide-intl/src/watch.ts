/**
 * `watch(options)` (SPEC 6.5, ADR 0010): `compile()`, then again whenever a
 * path the project load read has changed since it was read. Paraglide's
 * `compile --watch` and bundler plugins recompile on change the same way,
 * with Paraglide's own compile, which does not isolate. Each load reads
 * through a file system that records what it reads (`tracked-fs.ts`), the
 * directories of those paths are watched (`directory-watchers.ts`), and an
 * event, once events settle, compares each path with its state before it
 * was read: only a change compiles, so an editor's swap file or a late
 * event costs a few `stat` calls. The comparison also runs after each
 * compile, which catches a change made while it ran, before any watcher
 * saw the path.
 * @ref https://github.com/opral/paraglide-js/blob/0c6cf2c971b667cedf133dea471101897c8c0ade/src/cli/commands/compile/command.ts
 * @packageDocumentation
 */
import type {
  CompileConfig,
  CompileOptions,
  CompileResult,
} from './compile-options';
import type { InlangSdk } from './paraglide-sdk';
import type { Read } from './tracked-fs';

import { dirname, resolve } from 'node:path';
import process from 'node:process';

import { compileWith, enqueue } from './compile';
import { compileConfig } from './compile-options';
import { DirectoryWatchers } from './directory-watchers';
import { isRecord } from './internal/is-record';
import { outputHashes } from './output-hashes';
import { paraglideSdk } from './paraglide-sdk';
import { pathState, trackedFileSystem } from './tracked-fs';

import type fs from 'node:fs';

/** The options of `compile()`, and what to call after each compile. */
export type WatchOptions = CompileOptions & {
  /** Called with the result of each compile. */
  readonly onCompile?: ((result: CompileResult) => void) | undefined;
  /**
   * Called with what a compile threw, or with a watcher's error; the watch
   * goes on. Defaults to `console.error`.
   */
  readonly onError?: ((error: unknown) => void) | undefined;
};

/** A running watch. */
export interface Watcher {
  /** Stops watching; resolves once the compile that runs, if one does, has finished. */
  close(): Promise<void>;
}

/** How long events settle before a check, as Paraglide's `compile --watch` waits (SPEC 9). */
const SETTLE_MS = 100;

const CALLER = 'watch';

interface WatchConfig {
  readonly compile: CompileConfig;
  readonly onCompile: ((result: CompileResult) => void) | undefined;
  readonly onError: (error: unknown) => void;
}

function logError(error: unknown): void {
  console.error(error);
}

/** Checks the options; throws naming the first one a watch cannot use (SPEC 5). */
function watchConfig(options: WatchOptions): WatchConfig {
  const value: unknown = options;
  if (!isRecord(value)) {
    throw new TypeError(`${CALLER}: options is not an object`);
  }
  for (const name of ['onCompile', 'onError'] as const) {
    if (value[name] !== undefined && typeof value[name] !== 'function') {
      throw new TypeError(`${CALLER}: ${name} is not a function`);
    }
  }
  const { onCompile, onError, ...compileOptions } = options;
  return {
    compile: compileConfig(compileOptions, CALLER),
    onCompile,
    onError: onError ?? logError,
  };
}

/** `sdk`, loading projects through `files`. */
function loadingThrough(sdk: InlangSdk, files: typeof fs): InlangSdk {
  return {
    loadProjectFromDirectory: async (args) =>
      sdk.loadProjectFromDirectory({ ...args, fs: files }),
    selectBundleNested: sdk.selectBundleNested,
    upsertBundleNested: sdk.upsertBundleNested,
  };
}

/** One watch: what its last compile read, and the watchers of it. */
class ProjectWatch {
  private readonly config: WatchConfig;
  private readonly watchers: DirectoryWatchers;
  /** What the last load read; after a failed one, what the one before read too. */
  private reads: ReadonlyMap<string, Read> = new Map();
  /** The last compile's output hashes; none after a failure, so the next reads the output. */
  private hashes: Record<string, string> | undefined;
  /** The check or compile that runs or last ran. */
  private running: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private closed = false;

  public constructor(config: WatchConfig) {
    this.config = config;
    this.hashes = config.compile.previousOutputHashes;
    this.watchers = new DirectoryWatchers(config.compile.fs, {
      onEvent: () => {
        this.schedule();
      },
      onError: (error) => {
        this.report(error);
      },
    });
  }

  /** Compiles until nothing the compile read has changed since. */
  public async start(): Promise<void> {
    await this.serialize(async () => this.compileUntilCurrent());
  }

  public async close(): Promise<void> {
    this.closed = true;
    clearTimeout(this.timer);
    this.watchers.close();
    await this.running;
  }

  /** Checks once events have settled for `SETTLE_MS`. */
  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.serialize(async () => this.check());
    }, SETTLE_MS);
  }

  /** Runs `task` after the check or compile that runs. */
  private async serialize(task: () => Promise<void>): Promise<void> {
    this.running = this.running.then(task);
    await this.running;
  }

  /**
   * Watches what the last load read, and compiles if any of it changed;
   * nothing once closed, as a check can wait behind a compile `close()`
   * waits for.
   */
  private async check(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.watch();
    if (this.changed()) {
      await this.compileUntilCurrent();
    }
  }

  private async compileUntilCurrent(): Promise<void> {
    do {
      await this.compileOnce();
      if (this.closed) {
        return;
      }
      this.watch();
    } while (this.changed());
  }

  /** Watches the directory of each file read and each directory listed. */
  private watch(): void {
    this.watchers.update(
      Array.from(this.reads, ([path, read]) =>
        read.kind === 'file' ? dirname(path) : path,
      ),
    );
  }

  /** Whether a path the last load read is no longer as it was before the read. */
  private changed(): boolean {
    return Array.from(this.reads).some(
      ([path, read]) => pathState(this.config.compile.fs, path) !== read.state,
    );
  }

  private async compileOnce(): Promise<void> {
    const files = this.config.compile.fs;
    const tracked = trackedFileSystem(files);
    // A failed load keeps watching what the one before read, as it is now,
    // so the change that broke the load does not compile again on its own.
    const before = new Map(
      Array.from(this.reads, ([path, read]) => [
        path,
        { kind: read.kind, state: pathState(files, path) },
      ]),
    );
    let result: CompileResult;
    try {
      result = await enqueue(async () =>
        compileWith(loadingThrough(await paraglideSdk(), tracked.fs), {
          ...this.config.compile,
          previousOutputHashes: this.hashes ?? (await this.seed()),
        }),
      );
    } catch (error) {
      this.hashes = undefined;
      this.reads = new Map([...before, ...tracked.reads]);
      this.report(error);
      return;
    }
    this.hashes = result.outputHashes;
    this.reads = tracked.reads;
    try {
      this.config.onCompile?.(result);
    } catch (error) {
      this.report(error);
    }
  }

  /**
   * The hashes of the output already there, when `cleanOutdir` is set: the
   * first compile then rewrites what changed and deletes the rest, instead
   * of removing the directory under a dev server that reads it.
   */
  private async seed(): Promise<Record<string, string> | undefined> {
    const { compilerOptions, fs: files, outdir } = this.config.compile;
    return compilerOptions.cleanOutdir === true
      ? outputHashes(files.promises, resolve(process.cwd(), outdir))
      : undefined;
  }

  /** Hands `error` to `onError`, swallowing what that throws: there is nothing left to report to. */
  private report(error: unknown): void {
    try {
      this.config.onError(error);
    } catch {
      // Intentionally ignored; see the doc comment.
    }
  }
}

/**
 * Compiles as `compile()` does, then again whenever a file the project
 * load read, or a directory it listed, changes. Resolves once the first
 * compile has finished, whether or not it threw: each result goes to
 * `onCompile`, and what a compile throws to `onError`. Throws `TypeError`
 * for an option it cannot use, before reading anything.
 */
export async function watch(options: WatchOptions): Promise<Watcher> {
  const project = new ProjectWatch(watchConfig(options));
  await project.start();
  return { close: async () => project.close() };
}
