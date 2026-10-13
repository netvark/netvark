import fs from 'node:fs';
import { mkdtemp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from './compile';
import { outputHashes } from './output-hashes';
import { fixtureProject, MESSAGES } from './test-support/fixture-project';

describe('outputHashes() (SPEC 6.5)', () => {
  it.each(['message-modules', 'locale-modules'] as const)(
    'equals what a compile returns for its output, with %s',
    async (outputStructure) => {
      const { project, outdir } = await fixtureProject(MESSAGES);
      const result = await compile({ project, outdir, outputStructure });
      expect(await outputHashes(fs.promises, outdir)).toEqual(
        result.outputHashes,
      );
    },
  );

  it('is empty for a directory that does not exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'paraglide-intl-'));
    expect(await outputHashes(fs.promises, join(dir, 'paraglide'))).toEqual({});
  });

  it('leaves out what is neither a file nor a directory', async () => {
    const { project, outdir } = await fixtureProject(MESSAGES);
    const result = await compile({ project, outdir });
    await symlink(join(outdir, 'runtime.js'), join(outdir, 'linked.js'));
    expect(await outputHashes(fs.promises, outdir)).toEqual(
      result.outputHashes,
    );
  });

  it('leaves out a file it cannot read, so the compile rewrites it', async () => {
    const { project, outdir } = await fixtureProject(MESSAGES);
    const result = await compile({ project, outdir });
    const runtime = join(outdir, 'runtime.js');
    const promises = {
      ...fs.promises,
      readFile: async (path: any, options: any) =>
        path === runtime
          ? Promise.reject(new Error('EBUSY: resource busy or locked'))
          : fs.promises.readFile(path, options),
    };
    const expected = Object.fromEntries(
      Object.entries(result.outputHashes).filter(
        ([file]) => file !== 'runtime.js',
      ),
    );
    expect(Object.keys(result.outputHashes)).toContain('runtime.js');
    expect(await outputHashes(promises as any, outdir)).toEqual(expected);
  });
});
