import fs from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  compiledMessage,
  filesUnder,
  fixtureProject,
  MESSAGES,
} from './test-support/fixture-project';
import {
  closeWatches,
  compiledProject,
  freshOutput,
  quiet,
  UNTIL,
  watching,
  writeMessages,
} from './test-support/watching';

const EDITED = { ...MESSAGES.en, shared_by: 'Sent by {name} ({count})' };

/** `node:fs`, recording the path of each file written through its `promises`. */
function recordingWrites(outdir: string): {
  readonly files: typeof fs;
  readonly written: Array<string>;
} {
  const written: Array<string> = [];
  const promises = {
    ...fs.promises,
    writeFile: async (path: any, data: any) => {
      written.push(relative(outdir, String(path)));
      return fs.promises.writeFile(path, data);
    },
  };
  return { files: { ...fs, promises }, written };
}

afterEach(closeWatches);

describe('watch() over a changing project (SPEC 6.5)', () => {
  it('leaves a project loaded for the first time compiled and settled', async () => {
    const { dir, project, outdir } = await fixtureProject(MESSAGES);
    const { results, errors } = await watching({ project, outdir });
    expect(errors).toEqual([]);
    const compiles = results.length;
    expect(compiles).toBeGreaterThan(0);
    await quiet();
    expect(results).toHaveLength(compiles);
    expect(await filesUnder(outdir)).toEqual(await freshOutput(dir, project));
  });

  it('compiles a locale added to the settings with its new file', async () => {
    const { dir, project, outdir } = await compiledProject();
    const { results } = await watching({ project, outdir });
    const settingsPath = join(project, 'settings.json');
    const settings: unknown = JSON.parse(await readFile(settingsPath, 'utf8'));
    await writeMessages(dir, 'fr', {
      ...MESSAGES.en,
      shared_by: 'Partagé par {name} ({count})',
    });
    await writeFile(
      settingsPath,
      JSON.stringify({ ...(settings as object), locales: ['en', 'ar', 'fr'] }),
    );
    await vi.waitFor(() => {
      expect(results.length).toBeGreaterThan(1);
    }, UNTIL);
    await quiet();
    expect(await filesUnder(outdir)).toEqual(await freshOutput(dir, project));
    const sharedBy = await compiledMessage(outdir, 'shared_by');
    expect(sharedBy({ name: 'Lina', count: 2 }, { locale: 'fr' })).toMatch(
      /^Partagé par /u,
    );
  });

  it('compiles a messages directory that was replaced, and keeps watching it', async () => {
    const { dir, project, outdir } = await compiledProject();
    const { results } = await watching({ project, outdir });
    await rm(join(dir, 'messages'), { recursive: true });
    await mkdir(join(dir, 'messages'));
    await writeMessages(dir, 'ar', MESSAGES.ar);
    await writeMessages(dir, 'en', EDITED);
    await vi.waitFor(() => {
      expect(results.length).toBeGreaterThan(1);
    }, UNTIL);
    await quiet();
    expect(await filesUnder(outdir)).toEqual(await freshOutput(dir, project));
    const compiles = results.length;
    await writeMessages(dir, 'en', MESSAGES.en);
    await vi.waitFor(() => {
      expect(results.length).toBeGreaterThan(compiles);
    }, UNTIL);
    expect(await filesUnder(outdir)).toEqual(await freshOutput(dir, project));
  });

  it('starts from the output already there: rewrites nothing current, deletes what it no longer writes', async () => {
    const { dir, project, outdir } = await compiledProject();
    await writeFile(join(outdir, 'stale.js'), 'export {};');
    const { files, written } = recordingWrites(outdir);
    await watching({ project, outdir, fs: files });
    expect(written).toEqual([]);
    expect(await filesUnder(outdir)).toEqual(await freshOutput(dir, project));
  });

  it('with cleanOutdir off, writes every file and keeps the others', async () => {
    const { dir, project, outdir } = await compiledProject();
    await writeFile(join(outdir, 'stale.js'), 'export {};');
    const { files, written } = recordingWrites(outdir);
    await watching({ project, outdir, fs: files, cleanOutdir: false });
    const fresh = await freshOutput(dir, project);
    expect(written.toSorted()).toEqual(Object.keys(fresh).toSorted());
    expect(await filesUnder(outdir)).toEqual({
      ...fresh,
      'stale.js': 'export {};',
    });
  });

  it('reports a watcher that fails, and watches its directory again', async () => {
    const watches = vi.spyOn(fs, 'watch');
    const { dir, project, outdir } = await compiledProject();
    const messages = join(dir, 'messages');
    const { results, errors } = await watching({ project, outdir });
    const index = watches.mock.calls.findIndex(([path]) => path === messages);
    const failure = new Error('the watch failed');
    watches.mock.results[index]?.value.emit('error', failure);
    expect(errors).toEqual([failure]);
    await quiet();
    expect(
      watches.mock.calls.filter(([path]) => path === messages),
    ).toHaveLength(2);
    await writeMessages(dir, 'en', EDITED);
    await vi.waitFor(() => {
      expect(results).toHaveLength(2);
    }, UNTIL);
  });

  it('compiles a change made while its watchers start, which Node on macOS can leave unreported', async () => {
    const { dir, project, outdir } = await compiledProject();
    let edited = false;
    const unreported = {
      ...fs,
      watch: () => {
        if (!edited) {
          edited = true;
          setImmediate(() => {
            fs.writeFileSync(
              join(dir, 'messages', 'en.json'),
              JSON.stringify(EDITED),
            );
          });
        }
        return { on: vi.fn(), close: vi.fn() };
      },
    };
    const { results } = await watching({
      project,
      outdir,
      fs: unreported,
    });
    expect(results).toHaveLength(1);
    await vi.waitFor(() => {
      expect(results).toHaveLength(2);
    }, UNTIL);
    expect(await filesUnder(outdir)).toEqual(await freshOutput(dir, project));
  });

  it('reports what onCompile throws, and swallows what onError throws', async () => {
    const { dir, project, outdir } = await compiledProject();
    const reported: Array<unknown> = [];
    await watching({
      project,
      outdir,
      onCompile: () => {
        throw new Error('the sink failed');
      },
      onError: (error) => {
        reported.push(error);
        throw new Error('the reporter failed');
      },
    });
    expect(reported).toEqual([new Error('the sink failed')]);
    await writeMessages(dir, 'en', EDITED);
    await vi.waitFor(() => {
      expect(reported).toHaveLength(2);
    }, UNTIL);
    expect(await filesUnder(outdir)).toEqual(await freshOutput(dir, project));
  });
});
