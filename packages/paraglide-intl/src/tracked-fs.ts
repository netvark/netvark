/**
 * A file system that records what loading a project reads through it
 * (SPEC 6.5, ADR 0010): each file read and each directory listed, by
 * absolute path, with the state of the path just before its first read.
 * A change made after that read changes the state, so `watch()` sees it
 * even when no watcher ran yet. Paraglide's `compile --watch` records the
 * files read the same way, through the callback, synchronous, and promise
 * forms of `readFile`; the listings are recorded too, since a file added to
 * a listed directory can change what a load reads.
 * @ref https://github.com/opral/paraglide-js/blob/0c6cf2c971b667cedf133dea471101897c8c0ade/src/services/file-watching/tracked-fs.ts
 * @packageDocumentation
 */
import { Buffer } from 'node:buffer';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type fs from 'node:fs';

/** A path a load read: a file, or a directory it listed. */
export interface Read {
  readonly kind: 'file' | 'directory';
  /** `pathState()` just before the first read. */
  readonly state: string;
}

/** A file system that records the reads made through it and its `promises`. */
export interface TrackedFileSystem {
  readonly fs: typeof fs;
  /** Each path read or listed, by absolute path. */
  readonly reads: ReadonlyMap<string, Read>;
}

/** The reading functions of `node:fs` and of its `promises`, by what they read. */
const READERS: ReadonlyMap<string | symbol, Read['kind']> = new Map([
  ['readFile', 'file'],
  ['readFileSync', 'file'],
  ['readdir', 'directory'],
  ['readdirSync', 'directory'],
]);

/**
 * The state of `path`: its device, inode, size, and birth, modification,
 * and status change times, or `absent` when it cannot be read. Writing a
 * file changes its status change time, which no call can set back, and a
 * file that replaces another has its own birth time, even where it gets
 * the inode number just freed.
 * @ref https://man7.org/linux/man-pages/man3/stat.3type.html (st_ctim)
 * @ref https://man7.org/linux/man-pages/man2/statx.2.html (stx_btime)
 */
export function pathState(base: typeof fs, path: string): string {
  try {
    const stats = base.statSync(path);
    return [
      stats.dev,
      stats.ino,
      stats.size,
      stats.birthtimeMs,
      stats.mtimeMs,
      stats.ctimeMs,
    ].join(':');
  } catch {
    return 'absent';
  }
}

/** The absolute path a read names; none for a file descriptor or handle. */
function absolutePath(path: unknown): string | undefined {
  if (typeof path === 'string' || Buffer.isBuffer(path)) {
    return resolve(path.toString());
  }
  return path instanceof URL ? fileURLToPath(path) : undefined;
}

/** `module`, calling `record` before each of its reading functions. */
function tracking<TModule extends object>(
  module: TModule,
  record: (path: unknown, kind: Read['kind']) => void,
  promises?: object,
): TModule {
  return new Proxy(module, {
    get(target, property): unknown {
      if (property === 'promises' && promises !== undefined) {
        return promises;
      }
      const value: unknown = Reflect.get(target, property);
      const kind = READERS.get(property);
      if (kind === undefined || typeof value !== 'function') {
        return value;
      }
      return (...args: Array<unknown>): unknown => {
        record(args[0], kind);
        return Reflect.apply(value, target, args);
      };
    },
  });
}

/** `base`, recording each path read or listed through it. */
export function trackedFileSystem(base: typeof fs): TrackedFileSystem {
  const reads = new Map<string, Read>();
  const record = (path: unknown, kind: Read['kind']): void => {
    const absolute = absolutePath(path);
    if (absolute !== undefined && !reads.has(absolute)) {
      reads.set(absolute, { kind, state: pathState(base, absolute) });
    }
  };
  return {
    fs: tracking(base, record, tracking(base.promises, record)),
    reads,
  };
}
