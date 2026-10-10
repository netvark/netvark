import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { describe, expect, it } from 'vitest';

import { openPglite } from './pglite';
import { useSession } from './session';

describe('openPglite (SPEC 6.1)', () => {
  it('runs several statements through exec and parameterized queries through query', async () => {
    const rows = await useSession(await openPglite(), async (session) => {
      await session.exec(
        'create table t (n int); insert into t values (1), (2);',
      );
      return session.query<{ total: number }>(
        'select sum(n)::int as total from t where n > $1',
        [0],
      );
    });
    expect(rows).toEqual([{ total: 3 }]);
  });

  it('loads a contrib extension by its PostgreSQL name, uuid-ossp included', async () => {
    const rows = await useSession(
      await openPglite(['pgcrypto', 'uuid-ossp']),
      async (session) => {
        await session.exec(
          'create extension pgcrypto; create extension "uuid-ossp";',
        );
        return session.query<{ hex: string; nil: string }>(
          "select encode(digest('abc', 'sha256'), 'hex') as hex, uuid_nil()::text as nil",
        );
      },
    );
    expect(rows).toEqual([
      {
        hex: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        nil: '00000000-0000-0000-0000-000000000000',
      },
    ]);
  });

  it('passes an extension object through, as for packages outside contrib', async () => {
    const rows = await useSession(
      await openPglite([pg_trgm]),
      async (session) => {
        await session.exec('create extension pg_trgm;');
        return session.query<{ score: number }>(
          "select similarity('word', 'word') as score",
        );
      },
    );
    expect(rows).toEqual([{ score: 1 }]);
  });

  it('fails with pglite_missing for a contrib extension PGlite does not ship', async () => {
    await expect(openPglite(['postgis'])).rejects.toMatchObject({
      code: 'pglite_missing',
      message: 'PGlite has no contrib extension "postgis"',
    });
  });

  it('refuses a name that is not an extension name before importing anything', async () => {
    await expect(openPglite(['../pglite'])).rejects.toMatchObject({
      code: 'config_invalid',
      message: '"../pglite" is not a PGlite contrib extension name',
    });
  });

  it('refuses an object that is not a PGlite extension', async () => {
    await expect(openPglite([{ name: 'x' } as never])).rejects.toMatchObject({
      code: 'config_invalid',
    });
  });
});
