import type { ExtractionConfig } from '../config';

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { renderCatalogModule } from '../render/catalog-module';
import { extract, extractCatalog } from './extract';

const MIGRATION = `create type mood as enum ('happy', 'sad');
create table people (id int primary key, name text not null, mood mood);
create table secrets (id int primary key, value text);`;

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'pg-catalog-extract-'));
  await writeFile(join(directory, 'V1__init.sql'), MIGRATION);
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const config: ExtractionConfig = {
  migrations: '.',
  out: {
    catalog: 'generated/catalog.ts',
    public: { file: 'generated/public-catalog.ts', tables: ['people'] },
  },
};

describe('extract (SPEC 10.1)', () => {
  it('writes the catalog and public modules, creating directories, and reports each as written', async () => {
    const report = await extract(config, { cwd: directory });
    expect(report.files).toEqual([
      {
        kind: 'catalog',
        path: join(directory, 'generated/catalog.ts'),
        status: 'written',
      },
      {
        kind: 'public',
        path: join(directory, 'generated/public-catalog.ts'),
        status: 'written',
      },
    ]);
    expect(
      await readFile(join(directory, 'generated/catalog.ts'), 'utf8'),
    ).toBe(renderCatalogModule(report.catalog));
    const publicText = await readFile(
      join(directory, 'generated/public-catalog.ts'),
      'utf8',
    );
    expect(publicText).toContain('export const publicCatalog = {');
    expect(publicText).toContain('"people"');
    expect(publicText).not.toContain('"secrets"');
  });

  it('reports unchanged files on a second run and leaves them untouched', async () => {
    await extract(config, { cwd: directory });
    const report = await extract(config, { cwd: directory });
    expect(report.files.map((file) => file.status)).toEqual([
      'unchanged',
      'unchanged',
    ]);
  });

  it('with check, writes nothing and reports missing, then stale after a migration changes', async () => {
    const missing = await extract(config, { cwd: directory, check: true });
    expect(missing.files.map((file) => file.status)).toEqual([
      'missing',
      'missing',
    ]);
    await expect(
      readFile(join(directory, 'generated/catalog.ts')),
    ).rejects.toThrow();

    await extract(config, { cwd: directory });
    expect(
      (await extract(config, { cwd: directory, check: true })).files.map(
        (file) => file.status,
      ),
    ).toEqual(['unchanged', 'unchanged']);

    await writeFile(
      join(directory, 'V2__email.sql'),
      'alter table people add column email text;',
    );
    const stale = await extract(config, { cwd: directory, check: true });
    expect(stale.files.map((file) => file.status)).toEqual(['stale', 'stale']);
    expect(stale.catalog.tables['people']?.columns['email']).toBeDefined();
  });

  it('rewrites a file edited by hand', async () => {
    await extract(config, { cwd: directory });
    await writeFile(join(directory, 'generated/catalog.ts'), '// edited\n');
    const report = await extract(config, { cwd: directory });
    expect(report.files.map((file) => file.status)).toEqual([
      'written',
      'unchanged',
    ]);
  });

  it('reports an output path it cannot read, such as a directory, instead of overwriting it', async () => {
    await mkdir(join(directory, 'generated/catalog.ts'), { recursive: true });
    await expect(extract(config, { cwd: directory })).rejects.toThrow(
      expect.objectContaining({ code: 'EISDIR' }),
    );
  });

  it('fails with public_table_unknown for a public table the catalog does not hold', async () => {
    await expect(
      extract(
        {
          migrations: '.',
          out: {
            catalog: 'c.ts',
            public: { file: 'p.ts', tables: ['people', 'ghosts'] },
          },
        },
        { cwd: directory },
      ),
    ).rejects.toThrow(
      expect.objectContaining({
        code: 'public_table_unknown',
        message:
          'out.public.tables: public table "ghosts" is not in the catalog',
      }),
    );
  });
});

describe('extractCatalog (SPEC 10.1)', () => {
  it('reads migrations from a function, in the order it returns them', async () => {
    const catalog = await extractCatalog({
      migrations: () => [
        { name: 'first', sql: 'create table a (id int);' },
        { name: 'second', sql: 'alter table a add column b text;' },
      ],
    });
    expect(Object.keys(catalog.tables['a']?.columns ?? {})).toEqual([
      'id',
      'b',
    ]);
    expect(catalog.schemas).toEqual(['public']);
  });

  it('loads the configured PGlite contrib extensions before replay', async () => {
    const catalog = await extractCatalog({
      migrations: () => [{ name: 'trgm', sql: 'create extension pg_trgm;' }],
      database: { pglite: { extensions: ['pg_trgm'] } },
    });
    expect(catalog.extensions).toEqual(['pg_trgm']);
  });

  it('fails with config_invalid when a database URL function finds no environment variable', async () => {
    await expect(
      extractCatalog({
        migrations: '.',
        cwd: directory,
        database: { url: () => process.env['PG_CATALOG_UNSET_URL'] },
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'config_invalid' }));
  });

  it('fails with migrations_invalid for a missing directory, before opening a database', async () => {
    await expect(
      extractCatalog({ migrations: 'nowhere', cwd: directory }),
    ).rejects.toThrow(expect.objectContaining({ code: 'migrations_invalid' }));
  });
});

describe.skipIf(process.env['CATALOG_PG_URL'] === undefined)(
  'extractCatalog on a PostgreSQL server',
  () => {
    it('extracts the same catalog through a URL function as through PGlite', async () => {
      const url = process.env['CATALOG_PG_URL'];
      const server = await extractCatalog({
        migrations: '.',
        cwd: directory,
        database: { url: () => url },
      });
      const pglite = await extractCatalog({ migrations: '.', cwd: directory });
      expect(server).toEqual(pglite);
    });
  },
);
