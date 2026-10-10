import { describe, expect, it } from 'vitest';

import { PgCatalogError } from './errors';
import { lineAndColumn, replay } from './replay';
import { openPglite } from './target/pglite';
import { useSession } from './target/session';

async function failureOf(sql: string): Promise<PgCatalogError> {
  const error = await useSession(await openPglite(), async (session) =>
    replay(session, [{ name: 'V1__broken.sql', sql }]),
  ).catch((caught: unknown) => caught);
  if (!(error instanceof PgCatalogError)) {
    throw new Error('expected a PgCatalogError');
  }
  return error;
}

describe('replay (SPEC 6.3)', () => {
  it('runs the migrations in order, with the settings pinned again before each file', async () => {
    const rows = await useSession(await openPglite(), async (session) => {
      await replay(session, [
        {
          name: 'V1__drift.sql',
          sql: "set timezone = 'America/New_York'; set datestyle = 'SQL, DMY';",
        },
        {
          name: 'V2__read.sql',
          sql: "create table s as select current_setting('TimeZone') as tz, current_setting('DateStyle') as ds;",
        },
      ]);
      return session.query<{ tz: string; ds: string }>('select tz, ds from s');
    });
    expect(rows).toEqual([{ tz: 'UTC', ds: 'ISO, YMD' }]);
  });

  it('runs each file as one transaction, so a failing file leaves nothing behind', async () => {
    const tables = await useSession(await openPglite(), async (session) => {
      await replay(session, [
        { name: 'V1__ok.sql', sql: 'create table kept (id int);' },
      ]);
      await expect(
        replay(session, [
          {
            name: 'V2__bad.sql',
            sql: 'create table lost (id int);\nselect * from missing;',
          },
        ]),
      ).rejects.toThrow(PgCatalogError);
      return session.query<{ name: string }>(
        "select relname as name from pg_class where relname in ('kept', 'lost') order by relname",
      );
    });
    expect(tables).toEqual([{ name: 'kept' }]);
  });

  it('names the file, the line and column, the message, and the SQLSTATE of a failure', async () => {
    const error = await failureOf(
      'create table a (id int);\ncreate table b (id nonexistent_type);',
    );
    expect(error.code).toBe('migration_failed');
    expect(error.message).toBe(
      'migration V1__broken.sql failed at line 2, column 20: type "nonexistent_type" does not exist (SQLSTATE 42704)',
    );
    expect(error.cause).toMatchObject({ code: '42704' });
  });

  it('reports a failure without a position, such as a missing relation in a function body', async () => {
    const error = await failureOf('do $$ begin perform 1 / 0; end $$;');
    expect(error.message).toBe(
      'migration V1__broken.sql failed: division by zero (SQLSTATE 22012)',
    );
  });
});

describe('lineAndColumn', () => {
  it('counts characters as PostgreSQL does: code points, not UTF-16 units', async () => {
    // The emoji is one character for PostgreSQL and two UTF-16 units in JavaScript.
    const error = await failureOf('-- \u{1F600}\nselect x;');
    expect(error.message).toBe(
      'migration V1__broken.sql failed at line 2, column 8: column "x" does not exist (SQLSTATE 42703)',
    );
    expect(lineAndColumn('-- \u{1F600}\nselect x;', 13)).toEqual({
      line: 2,
      column: 8,
    });
  });

  it('places the first character at line 1, column 1', () => {
    expect(lineAndColumn('select 1;', 1)).toEqual({ line: 1, column: 1 });
  });
});
