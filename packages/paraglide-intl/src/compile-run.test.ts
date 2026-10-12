import fs from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { compile, compileWith } from './compile';
import { compileConfig } from './compile-options';
import {
  filesUnder,
  fixtureProject,
  MESSAGE_FORMAT_PLUGIN,
  MESSAGES,
} from './test-support/fixture-project';

const BY_HAND = '// changed by hand\n';

describe('compile runs (SPEC 6.1)', () => {
  it('rewrites nothing unchanged when given the previous compilation', async () => {
    const { project, outdir } = await fixtureProject(MESSAGES);
    const first = await compile({ project, outdir });
    const runtime = join(outdir, 'runtime.js');
    await writeFile(runtime, BY_HAND);
    const second = await compile({
      project,
      outdir,
      previousCompilation: first,
    });
    expect(second.outputHashes).toEqual(first.outputHashes);
    expect(await readFile(runtime, 'utf8')).toBe(BY_HAND);
    await compile({ project, outdir });
    expect(await readFile(runtime, 'utf8')).not.toBe(BY_HAND);
  });

  it('cleans the output directory first unless cleanOutdir is false', async () => {
    const { project, outdir } = await fixtureProject(MESSAGES);
    const stray = join(outdir, 'stray.js');
    await mkdir(outdir);
    await writeFile(stray, BY_HAND);
    await compile({ project, outdir, cleanOutdir: false });
    expect(await readFile(stray, 'utf8')).toBe(BY_HAND);
    await compile({ project, outdir });
    await expect(readFile(stray, 'utf8')).rejects.toThrow(/ENOENT/u);
  });

  it("returns the project's errors as warnings and compiles the rest", async () => {
    const { project, outdir } = await fixtureProject(MESSAGES, [
      MESSAGE_FORMAT_PLUGIN,
      './no-such-plugin.js',
    ]);
    const { warnings } = await compile({ project, outdir });
    expect(warnings.map((warning) => warning.name)).toEqual([
      'PluginImportError',
    ]);
    expect(warnings[0]).toBeInstanceOf(Error);
    expect(Object.keys(await filesUnder(outdir))).toContain('messages.js');
  });

  it('reads and writes through the fs it is given', async () => {
    const { project, outdir } = await fixtureProject(MESSAGES);
    const read: Array<string> = [];
    const written: Array<string> = [];
    const promises = {
      ...fs.promises,
      readFile: async (path: any, options?: any) => {
        read.push(String(path));
        return fs.promises.readFile(path, options);
      },
      writeFile: async (path: any, data: any) => {
        written.push(String(path));
        return fs.promises.writeFile(path, data);
      },
    };
    await compile({ project, outdir, fs: { ...fs, promises } });
    expect(read).toContain(join(project, 'settings.json'));
    expect(written).toContain(join(outdir, 'messages.js'));
  });

  it('compiles one at a time, so concurrent compiles leave the whole output', async () => {
    const { dir, project, outdir } = await fixtureProject(MESSAGES);
    const [first, second] = await Promise.all([
      compile({ project, outdir }),
      compile({ project, outdir }),
    ]);
    expect(second.outputHashes).toEqual(first.outputHashes);
    const alone = join(dir, 'alone');
    await compile({ project, outdir: alone });
    expect(await filesUnder(outdir)).toEqual(await filesUnder(alone));
  });
});

/** An SDK whose project declares `en` and holds `bundles`. */
function fakeSdk(bundles: Array<unknown>) {
  const project = {
    db: {},
    settings: { get: vi.fn().mockResolvedValue({ locales: ['en'] }) },
    errors: { get: vi.fn().mockResolvedValue([]) },
    close: vi.fn().mockResolvedValue(null),
  };
  const sdk = {
    loadProjectFromDirectory: vi.fn().mockResolvedValue(project),
    selectBundleNested: vi
      .fn()
      .mockReturnValue({ execute: vi.fn().mockResolvedValue(bundles) }),
    upsertBundleNested: vi.fn().mockResolvedValue(null),
  };
  return { project, sdk: sdk as never };
}

describe('compileWith', () => {
  it('closes the project when a step throws', async () => {
    const options = { project: '/project.inlang', outdir: '/out' };
    const undeclared = fakeSdk([]);
    await expect(
      compileWith(
        undeclared.sdk,
        compileConfig({ ...options, isolate: ['fr'] }),
      ),
    ).rejects.toThrow(TypeError);
    expect(undeclared.project.close).toHaveBeenCalledOnce();

    const unreadable = fakeSdk([{ id: 'b' }]);
    await expect(
      compileWith(unreadable.sdk, compileConfig(options)),
    ).rejects.toThrow(
      new TypeError(
        'compile: @inlang/sdk returned a bundle without messages, variants, and patterns',
      ),
    );
    expect(unreadable.project.close).toHaveBeenCalledOnce();
  });
});
