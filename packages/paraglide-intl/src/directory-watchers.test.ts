import fs from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { DirectoryWatchers } from './directory-watchers';

import type { FSWatcher } from 'node:fs';

/** Longer than macOS takes to report a write made just before a watch started. */
const QUIET_MS = 300;

const open: Array<DirectoryWatchers> = [];

afterEach(() => {
  for (const watchers of open.splice(0)) {
    watchers.close();
  }
});

async function quiet(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, QUIET_MS);
  });
}

/** Watchers over the real file system, counting what they report. */
function watching(): {
  readonly watchers: DirectoryWatchers;
  readonly events: { count: number };
  readonly errors: Array<unknown>;
  readonly started: () => Array<string>;
  readonly watcherOf: (index: number) => FSWatcher;
} {
  const spy = vi.spyOn(fs, 'watch');
  const events = { count: 0 };
  const errors: Array<unknown> = [];
  const watchers = new DirectoryWatchers(fs, {
    onEvent: () => {
      events.count += 1;
    },
    onError: (error) => {
      errors.push(error);
    },
  });
  open.push(watchers);
  return {
    watchers,
    events,
    errors,
    started: () => spy.mock.calls.map(([path]) => String(path)),
    watcherOf: (index) => spy.mock.results[index]?.value,
  };
}

async function closed(watcher: FSWatcher): Promise<void> {
  await new Promise<void>((resolve) => {
    watcher.once('close', () => {
      resolve();
    });
  });
}

describe('DirectoryWatchers (SPEC 6.5)', () => {
  it('reports a change in each watched directory, and none once closed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'paraglide-intl-'));
    await mkdir(join(dir, 'a'));
    await mkdir(join(dir, 'b'));
    const { watchers, events, started } = watching();
    watchers.update([join(dir, 'a'), join(dir, 'b'), join(dir, 'b')]);
    expect(started()).toEqual([join(dir, 'a'), join(dir, 'b')]);
    await quiet();
    events.count = 0;
    await writeFile(join(dir, 'b', 'en.json'), '{}');
    await vi.waitFor(() => {
      expect(events.count).toBeGreaterThan(0);
    });
    watchers.close();
    events.count = 0;
    await writeFile(join(dir, 'a', 'en.json'), '{}');
    await quiet();
    expect(events.count).toBe(0);
  });

  it('watches the nearest existing ancestor of a missing directory, then the directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'paraglide-intl-'));
    const fr = join(dir, 'messages', 'fr');
    const { watchers, events, started, watcherOf } = watching();
    watchers.update([fr]);
    expect(started()).toEqual([dir]);
    await quiet();
    events.count = 0;
    await mkdir(fr, { recursive: true });
    await vi.waitFor(() => {
      expect(events.count).toBeGreaterThan(0);
    });
    const stopped = closed(watcherOf(0));
    watchers.update([fr]);
    await stopped;
    expect(started()).toEqual([dir, fr]);
  });

  it('keeps an unchanged directory watched and stops one no longer given', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'paraglide-intl-'));
    await mkdir(join(dir, 'a'));
    await mkdir(join(dir, 'b'));
    const { watchers, started, watcherOf } = watching();
    watchers.update([join(dir, 'a'), join(dir, 'b')]);
    const stopped = closed(watcherOf(1));
    watchers.update([join(dir, 'a')]);
    await stopped;
    expect(started()).toEqual([join(dir, 'a'), join(dir, 'b')]);
  });

  it('starts again a watcher whose directory was replaced', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'paraglide-intl-'));
    const messages = join(dir, 'messages');
    await mkdir(messages);
    const { watchers, events, started, watcherOf } = watching();
    watchers.update([messages]);
    await rm(messages, { recursive: true });
    await mkdir(messages);
    const stopped = closed(watcherOf(0));
    watchers.update([messages]);
    await stopped;
    expect(started()).toEqual([messages, messages]);
    await quiet();
    events.count = 0;
    await writeFile(join(messages, 'en.json'), '{}');
    await vi.waitFor(() => {
      expect(events.count).toBeGreaterThan(0);
    });
  });

  it('reports a watcher that fails, then starts it again; a late error leaves its replacement', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'paraglide-intl-'));
    const { watchers, events, errors, started, watcherOf } = watching();
    watchers.update([dir]);
    const failure = new Error('watch failed');
    const stopped = closed(watcherOf(0));
    watcherOf(0).emit('error', failure);
    await stopped;
    expect(errors).toEqual([failure]);
    expect(events.count).toBeGreaterThan(0);
    watchers.update([dir]);
    expect(started()).toEqual([dir, dir]);
    let replacementClosed = false;
    watcherOf(1).once('close', () => {
      replacementClosed = true;
    });
    watcherOf(0).emit('error', failure);
    expect(errors).toEqual([failure, failure]);
    expect(replacementClosed).toBe(false);
    const replacementStopped = closed(watcherOf(1));
    watchers.close();
    await replacementStopped;
  });

  it('watches the root of a path none of whose directories it can stat', () => {
    const started: Array<string> = [];
    const unreadable = {
      ...fs,
      statSync: () => {
        throw new Error('EACCES: permission denied, stat');
      },
      watch: (path: string) => {
        started.push(path);
        return { on: vi.fn(), close: vi.fn() };
      },
    };
    const watchers = new DirectoryWatchers(unreadable as any, {
      onEvent: () => {},
      onError: () => {},
    });
    watchers.update([join(sep, 'srv', 'app', 'messages')]);
    expect(started).toEqual([sep]);
  });

  it('reports a watcher that cannot start, and starts it on the next update', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'paraglide-intl-'));
    const { watchers, errors, started } = watching();
    const failure = new Error('EMFILE: too many open files, watch');
    vi.mocked(fs.watch).mockImplementationOnce(() => {
      throw failure;
    });
    watchers.update([dir]);
    expect(errors).toEqual([failure]);
    watchers.update([dir]);
    expect(started()).toEqual([dir, dir]);
  });

  it('reports one event for an update that starts or stops a watcher, none for one that changes nothing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'paraglide-intl-'));
    await mkdir(join(dir, 'a'));
    await mkdir(join(dir, 'b'));
    const silent = {
      ...fs,
      watch: () => ({ on: vi.fn(), close: vi.fn() }),
    };
    let events = 0;
    const watchers = new DirectoryWatchers(silent as any, {
      onEvent: () => {
        events += 1;
      },
      onError: () => {},
    });
    open.push(watchers);
    watchers.update([join(dir, 'a'), join(dir, 'b')]);
    expect(events).toBe(1);
    watchers.update([join(dir, 'b'), join(dir, 'a')]);
    expect(events).toBe(1);
    watchers.update([join(dir, 'a')]);
    expect(events).toBe(2);
    silent.watch = () => {
      throw new Error('EMFILE: too many open files, watch');
    };
    watchers.update([join(dir, 'a'), join(dir, 'b')]);
    expect(events).toBe(2);
  });
});
