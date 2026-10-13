/**
 * The `node:fs` watchers of `watch()` (SPEC 6.5, ADR 0010): one per
 * directory, any event of which is reported. A directory that does not
 * exist is watched through its nearest existing ancestor, where its
 * creation is an event. A watcher follows the inode it started on, so one
 * whose directory was replaced is started again, as is one that failed. A
 * directory is known by its device, inode, and birth time: an inode number
 * is unique only among the files that exist, so a new directory can get the
 * number of one just removed. Starting or stopping a watcher is reported as
 * an event: Node on macOS then replaces the one FSEvents stream that serves
 * all of a process's watchers with one that reports from its own creation,
 * so a change made meanwhile, in any watched directory, is never reported.
 * Measured on macOS, a write made just after a second watcher started went
 * unreported 3 times in 500 on Node 24.20, once in 350 on Bun 1.4.2, and
 * never in 350 on Deno 2.9.7.
 * @ref https://github.com/libuv/libuv/blob/v1.52.1/src/unix/fsevents.c#L398-L468 (uv__fsevents_reschedule; the new stream starts at kFSEventStreamEventIdSinceNow, L366)
 * @ref https://nodejs.org/docs/latest-v24.x/api/fs.html#inodes
 * @ref https://man7.org/linux/man-pages/man7/inode.7.html (stat.st_ino)
 * @ref https://nodejs.org/docs/latest-v24.x/api/fs.html#event-error
 * @packageDocumentation
 */
import { dirname } from 'node:path';

import type fs from 'node:fs';

/** What the watchers report to. */
export interface WatcherListener {
  /** Something in a watched directory changed, or a watcher failed. */
  readonly onEvent: () => void;
  /** A watcher could not start or failed. */
  readonly onError: (error: unknown) => void;
}

interface DirectoryWatch {
  readonly watcher: fs.FSWatcher;
  /** The device, inode, and birth time of the directory when its watcher started. */
  readonly identity: string;
}

/** The nearest existing directory at or above `path`, by its identity. */
function nearestDirectory(
  base: typeof fs,
  path: string,
): { readonly path: string; readonly identity: string } {
  try {
    const stats = base.statSync(path);
    if (stats.isDirectory()) {
      return {
        path,
        identity: `${stats.dev}:${stats.ino}:${stats.birthtimeMs}`,
      };
    }
  } catch {
    // Not there: its parent is the nearest candidate.
  }
  const parent = dirname(path);
  if (parent === path) {
    return { path, identity: 'absent' };
  }
  return nearestDirectory(base, parent);
}

/** One watcher per directory, kept to the set it was last given. */
export class DirectoryWatchers {
  private readonly base: typeof fs;
  private readonly listener: WatcherListener;
  private readonly watches = new Map<string, DirectoryWatch>();

  public constructor(base: typeof fs, listener: WatcherListener) {
    this.base = base;
    this.listener = listener;
  }

  /**
   * Watches each of `directories`, or its nearest existing ancestor, and
   * stops watching any other; starts again a watcher whose directory was
   * replaced since it started. Reports one event when it started or
   * stopped a watcher.
   */
  public update(directories: Iterable<string>): void {
    const wanted = new Map<string, string>();
    for (const directory of directories) {
      const nearest = nearestDirectory(this.base, directory);
      wanted.set(nearest.path, nearest.identity);
    }
    let changed = false;
    for (const [path, watch] of this.watches) {
      if (wanted.get(path) !== watch.identity) {
        this.stop(path, watch);
        changed = true;
      }
    }
    for (const [path, identity] of wanted) {
      if (!this.watches.has(path)) {
        changed = this.start(path, identity) || changed;
      }
    }
    if (changed) {
      this.listener.onEvent();
    }
  }

  /** Stops every watcher. */
  public close(): void {
    for (const [path, watch] of this.watches) {
      this.stop(path, watch);
    }
  }

  /** Whether the watcher started; one that cannot is retried on the next update. */
  private start(path: string, identity: string): boolean {
    try {
      const watcher = this.base.watch(path, () => {
        this.listener.onEvent();
      });
      watcher.on('error', (error) => {
        this.stop(path, { watcher, identity });
        this.listener.onError(error);
        this.listener.onEvent();
      });
      this.watches.set(path, { watcher, identity });
      return true;
    } catch (error) {
      this.listener.onError(error);
      return false;
    }
  }

  private stop(path: string, watch: DirectoryWatch): void {
    watch.watcher.close();
    if (this.watches.get(path)?.watcher === watch.watcher) {
      this.watches.delete(path);
    }
  }
}
