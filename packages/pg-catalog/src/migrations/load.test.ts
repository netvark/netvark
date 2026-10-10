import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PgCatalogError } from '../errors';
import { loadMigrations } from './load';

let root: string;

/** A migrations function that forgot the SQL. */
function withoutSql(): ReadonlyArray<never> {
  return [{ name: 'x' } as never];
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'pg-catalog-load-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function write(path: string, text: string): Promise<void> {
  await mkdir(join(root, path, '..'), { recursive: true });
  await writeFile(join(root, path), text);
}

describe('loadMigrations (SPEC 5)', () => {
  it('walks a directory recursively and reads each file as UTF-8, in replay order', async () => {
    await write('db/V2__contacts.sql', 'create table contacts ();');
    await write('db/core/V1__init.sql', '-- café\ncreate schema app;');
    await write('db/notes.txt', 'ignored');
    expect(await loadMigrations('db', root)).toEqual([
      { name: 'core/V1__init.sql', sql: '-- café\ncreate schema app;' },
      { name: 'V2__contacts.sql', sql: 'create table contacts ();' },
    ]);
  });

  it('resolves the directory against the given working directory, or takes an absolute path', async () => {
    await write('migrations/1_a.sql', 'select 1;');
    expect(await loadMigrations(join(root, 'migrations'), '/')).toHaveLength(1);
  });

  it('takes a function, synchronous or asynchronous, and keeps the order it returns', async () => {
    const migrations = [
      { name: 'second', sql: 'select 2;' },
      { name: 'first', sql: 'select 1;' },
    ];
    expect(await loadMigrations(() => migrations, root)).toEqual(migrations);
    const later = async (): Promise<typeof migrations> => {
      await delay(1);
      return migrations;
    };
    expect(await loadMigrations(later, root)).toEqual(migrations);
  });

  it('rejects a function result whose entries are not { name, sql } strings', async () => {
    await expect(loadMigrations(withoutSql, root)).rejects.toThrow(
      new PgCatalogError(
        'migrations_invalid',
        'the migrations function must return { name, sql } entries with string members',
      ),
    );
  });

  it('fails with migrations_invalid for a missing directory, naming it', async () => {
    const error = await loadMigrations('missing', root).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(PgCatalogError);
    expect(error).toMatchObject({
      code: 'migrations_invalid',
      message: `cannot read the migrations directory ${join(root, 'missing')}`,
    });
  });

  it('fails with migrations_invalid when nothing is left to run', async () => {
    await write('db/2_x.down.sql', 'drop table x;');
    await expect(loadMigrations('db', root)).rejects.toMatchObject({
      code: 'migrations_invalid',
      message: `no migrations found in ${join(root, 'db')}`,
    });
    await expect(loadMigrations(() => [], root)).rejects.toMatchObject({
      message: 'no migrations found in the migrations function',
    });
  });
});
