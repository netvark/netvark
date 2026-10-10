import type { SqlSession } from './session';

import { describe, expect, it } from 'vitest';

import { openPglite } from './pglite';
import { SESSION_SETTINGS, useSession } from './session';

/** A real PGlite session whose close fails after closing, as a failed drop would. */
async function failingClose(): Promise<{
  session: SqlSession;
  closed: () => boolean;
}> {
  const real = await openPglite();
  let closed = false;
  const session: SqlSession = {
    ...real,
    close: async () => {
      await real.close();
      closed = true;
      throw new Error('drop failed');
    },
  };
  return { session, closed: () => closed };
}

async function one(session: SqlSession): Promise<number> {
  const [row] = await session.query<{ one: number }>('select 1 as one');
  return row?.one ?? 0;
}

describe('useSession (SPEC 6.2)', () => {
  it('closes the session after the work and returns its result', async () => {
    const session = await openPglite();
    expect(await useSession(session, one)).toBe(1);
    await expect(one(session)).rejects.toThrow();
  });

  it('reports the error of the work, not a failure to close after it', async () => {
    const { session, closed } = await failingClose();
    await expect(
      useSession(session, async (open) => open.exec('select * from missing')),
    ).rejects.toThrow('relation "missing" does not exist');
    expect(closed()).toBe(true);
  });

  it('fails an otherwise successful run when closing fails', async () => {
    const { session } = await failingClose();
    await expect(useSession(session, one)).rejects.toThrow('drop failed');
  });
});

describe('SESSION_SETTINGS (SPEC 7.1)', () => {
  it('pins the six settings that change stored or printed constants', () => {
    expect(SESSION_SETTINGS).toBe(
      "SET TimeZone = 'UTC'; SET DateStyle = 'ISO, YMD'; SET IntervalStyle = 'postgres'; " +
        "SET extra_float_digits = 1; SET bytea_output = 'hex'; SET standard_conforming_strings = on;",
    );
  });

  it('is accepted by PostgreSQL as one simple query', async () => {
    const rows = await useSession(await openPglite(), async (session) => {
      await session.exec(SESSION_SETTINGS);
      return session.query<{ name: string; setting: string }>(
        "select name, setting from pg_settings where name in ('TimeZone', 'extra_float_digits', 'bytea_output') order by name",
      );
    });
    // `name` sorts in the C collation: upper case first.
    expect(rows).toEqual([
      { name: 'TimeZone', setting: 'UTC' },
      { name: 'bytea_output', setting: 'hex' },
      { name: 'extra_float_digits', setting: '1' },
    ]);
  });
});
