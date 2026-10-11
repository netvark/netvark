import type { ExtractionConfig } from '../config';

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { extract } from './extract';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'pg-catalog-interfaces-'));
  await writeFile(
    join(directory, 'V1__init.sql'),
    'create table people (id int primary key, name text not null);',
  );
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

/** Both modules, with the interfaces `names` gives and the defaults for the others. */
function named(names: {
  readonly catalog?: string;
  readonly public?: string;
}): ExtractionConfig {
  const catalog =
    names.catalog === undefined ? {} : { interface: names.catalog };
  const slice = names.public === undefined ? {} : { interface: names.public };
  return {
    migrations: '.',
    out: {
      catalog: { file: 'catalog.ts', ...catalog },
      public: { file: 'public.ts', tables: ['people'], ...slice },
    },
  };
}

async function lastLine(file: string): Promise<string | undefined> {
  return (await readFile(join(directory, file), 'utf8'))
    .trimEnd()
    .split('\n')
    .at(-1);
}

describe('extract with interface names (SPEC 9.1, 10.1)', () => {
  it('exports each module through the interface the configuration names', async () => {
    const config = named({ catalog: 'PeopleCatalog', public: 'PeoplePublic' });
    await extract(config, { cwd: directory });
    expect(await lastLine('catalog.ts')).toBe(
      'export const catalog: PeopleCatalog = value;',
    );
    expect(await lastLine('public.ts')).toBe(
      'export const publicCatalog: PeoplePublic = value;',
    );
    const check = await extract(config, { cwd: directory, check: true });
    expect(check.files.map((file) => file.status)).toEqual([
      'unchanged',
      'unchanged',
    ]);
  });

  it('defaults each interface, and reports a renamed one as stale', async () => {
    await extract(named({}), { cwd: directory });
    expect(await lastLine('catalog.ts')).toBe(
      'export const catalog: ExtractedCatalog = value;',
    );
    expect(await lastLine('public.ts')).toBe(
      'export const publicCatalog: ExtractedPublicCatalog = value;',
    );
    const renamed = await extract(named({ public: 'PeoplePublic' }), {
      cwd: directory,
      check: true,
    });
    expect(renamed.files.map((file) => file.status)).toEqual([
      'unchanged',
      'stale',
    ]);
  });

  it('throws TypeError for an interface outside INTERFACE_NAME before writing any file', async () => {
    await expect(
      extract(named({ public: 'people' }), { cwd: directory }),
    ).rejects.toThrow(
      new TypeError(
        'renderPublicCatalogModule: options.interface must be an ASCII identifier that starts with an uppercase letter, not "people"',
      ),
    );
    await expect(readFile(join(directory, 'catalog.ts'))).rejects.toThrow(
      expect.objectContaining({ code: 'ENOENT' }),
    );
  });
});
