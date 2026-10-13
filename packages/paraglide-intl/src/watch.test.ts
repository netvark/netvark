import fs from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { MessageFormattingError } from './formatting-annotations';
import { filesUnder, MESSAGES } from './test-support/fixture-project';
import {
  closeWatches,
  compiledProject,
  freshOutput,
  gate,
  quiet,
  UNTIL,
  watching,
  writeMessages,
} from './test-support/watching';
import { watch } from './watch';

const EDITED = { ...MESSAGES.en, shared_by: 'Sent by {name} ({count})' };

/** `node:fs` with `readFile` of its `promises` replaced by `read`. */
function readingWith(
  read: (path: string, options: unknown) => Promise<unknown>,
): typeof fs {
  return { ...fs, promises: { ...fs.promises, readFile: read as any } };
}

afterEach(closeWatches);

describe('watch() (SPEC 6.5)', () => {
  it('compiles before it resolves, as compile() does', async () => {
    const { dir, project, outdir } = await compiledProject();
    const { results, errors } = await watching({ project, outdir });
    expect(results).toHaveLength(1);
    expect(errors).toEqual([]);
    expect(await filesUnder(outdir)).toEqual(await freshOutput(dir, project));
  });

  it('compiles again once per change to a message file', async () => {
    const { dir, project, outdir } = await compiledProject();
    const { results } = await watching({ project, outdir });
    await writeMessages(dir, 'en', EDITED);
    await vi.waitFor(() => {
      expect(results).toHaveLength(2);
    }, UNTIL);
    await quiet();
    expect(results).toHaveLength(2);
    expect(await filesUnder(outdir)).toEqual(await freshOutput(dir, project));
  });

  it('compiles again when a file changes after the compile read it', async () => {
    const { dir, project, outdir } = await compiledProject();
    const en = join(dir, 'messages', 'en.json');
    let edited = false;
    const files = readingWith(async (path, options) => {
      const text = await fs.promises.readFile(path, options as any);
      if (!edited && resolve(path) === en) {
        edited = true;
        await writeMessages(dir, 'en', EDITED);
      }
      return text;
    });
    const { results } = await watching({ project, outdir, fs: files });
    expect(edited).toBe(true);
    expect(results).toHaveLength(2);
    expect(await filesUnder(outdir)).toEqual(await freshOutput(dir, project));
  });

  it('reports a compile that throws, once, and compiles again once the cause is fixed', async () => {
    const { dir, project, outdir } = await compiledProject();
    const { results, errors } = await watching({ project, outdir });
    await writeMessages(dir, 'en', {
      ...MESSAGES.en,
      shared_by: 'Total: {count: number}',
    });
    await vi.waitFor(() => {
      expect(errors).toHaveLength(1);
    }, UNTIL);
    expect(errors[0]).toBeInstanceOf(MessageFormattingError);
    await quiet();
    expect(errors).toHaveLength(1);
    await writeMessages(dir, 'en', EDITED);
    await vi.waitFor(() => {
      expect(results).toHaveLength(2);
    }, UNTIL);
    expect(await filesUnder(outdir)).toEqual(await freshOutput(dir, project));
  });

  it('resolves after a first compile that throws, and compiles once the project loads', async () => {
    const { project, outdir } = await compiledProject();
    const settings = join(project, 'settings.json');
    const valid = await readFile(settings, 'utf8');
    await writeFile(settings, '{');
    const { results, errors } = await watching({ project, outdir });
    expect(results).toEqual([]);
    expect(errors).toHaveLength(1);
    await writeFile(settings, valid);
    await vi.waitFor(() => {
      expect(results).toHaveLength(1);
    }, UNTIL);
    expect(errors).toHaveLength(1);
  });

  it('closes once the compile that runs has finished, and compiles nothing after', async () => {
    const { dir, project, outdir } = await compiledProject();
    const en = join(dir, 'messages', 'en.json');
    const reading = gate();
    const release = gate();
    let held = false;
    const files = readingWith(async (path, options) => {
      if (held && resolve(path) === en) {
        reading.open();
        await release.opened;
      }
      return fs.promises.readFile(path, options as any);
    });
    const { watcher, results } = await watching({ project, outdir, fs: files });
    held = true;
    await writeMessages(dir, 'en', EDITED);
    await reading.opened;
    let closed = false;
    const closing = (async () => {
      await watcher.close();
      closed = true;
    })();
    await quiet();
    expect(closed).toBe(false);
    release.open();
    await closing;
    expect(results).toHaveLength(2);
    held = false;
    await writeMessages(dir, 'en', MESSAGES.en);
    await quiet();
    expect(results).toHaveLength(2);
  });

  it('compiles nothing for a file no load reads, next to the ones it does', async () => {
    const { dir, project, outdir } = await compiledProject();
    const { results } = await watching({ project, outdir });
    await writeFile(join(dir, 'messages', '.en.json.swp'), 'b0VIM');
    await quiet();
    expect(results).toHaveLength(1);
  });

  it('compiles again for a file added to the project directory, which a load lists and reads', async () => {
    const { project, outdir } = await compiledProject();
    const { results } = await watching({ project, outdir });
    await writeFile(join(project, 'notes.md'), '# notes');
    await vi.waitFor(() => {
      expect(results).toHaveLength(2);
    }, UNTIL);
  });

  it('writes what a compile throws to the console without onError', async () => {
    const { project, outdir } = await compiledProject();
    const settings = join(project, 'settings.json');
    await writeFile(settings, '{');
    const logged = vi.spyOn(console, 'error').mockReturnValue();
    const watcher = await watch({ project, outdir });
    await watcher.close();
    expect(logged).toHaveBeenCalledOnce();
    expect(logged.mock.calls[0]?.[0]).toBeInstanceOf(SyntaxError);
  });

  it('starts no watcher for a check that waited behind the compile close() waits for', async () => {
    const watchCalls = vi.spyOn(fs, 'watch');
    const { dir, project, outdir } = await compiledProject();
    const en = join(dir, 'messages', 'en.json');
    const reading = gate();
    const release = gate();
    let held = false;
    const files = readingWith(async (path, options) => {
      if (held && resolve(path) === en) {
        reading.open();
        await release.opened;
      }
      return fs.promises.readFile(path, options as any);
    });
    const { watcher } = await watching({ project, outdir, fs: files });
    held = true;
    await writeMessages(dir, 'en', EDITED);
    await reading.opened;
    await writeMessages(dir, 'ar', MESSAGES.ar);
    await quiet();
    const started = watchCalls.mock.calls.length;
    const closing = watcher.close();
    release.open();
    await closing;
    await quiet();
    expect(watchCalls.mock.calls).toHaveLength(started);
  });

  it('throws naming the first option it cannot use, before reading anything', async () => {
    const BASE = { project: './project.inlang', outdir: './src/paraglide' };
    const cases: Array<[unknown, string]> = [
      [undefined, 'watch: options is not an object'],
      [{ ...BASE, onCompile: true }, 'watch: onCompile is not a function'],
      [{ ...BASE, onError: 'log' }, 'watch: onError is not a function'],
      [{ outdir: BASE.outdir }, 'watch: project is not a string'],
      [
        { ...BASE, isolate: 'ar' },
        'watch: isolate is not a boolean or a list of locales',
      ],
    ];
    for (const [options, message] of cases) {
      await expect(watch(options as never)).rejects.toThrow(
        new TypeError(message),
      );
    }
  });
});
