import pg from 'pg';
import { describe, expect, it } from 'vitest';

import { openThrowawayDatabase, throwawayName, withDatabase } from './server';
import { useSession } from './session';

// oxlint-disable-next-line import/no-named-as-default-member -- reason: node-postgres is CommonJS and documents `import pg from 'pg'; const { Client } = pg` for ESM
const { Client } = pg;

const SERVER = process.env['CATALOG_PG_URL'];

describe('throwawayName and withDatabase (SPEC 6.2)', () => {
  it('names the database netvark_catalog_ and 16 lowercase hex digits, different every time', () => {
    const name = throwawayName();
    expect(name).toMatch(/^netvark_catalog_[0-9a-f]{16}$/u);
    expect(throwawayName()).not.toBe(name);
  });

  it('replaces the database of a URL and keeps its credentials, host, and parameters', () => {
    expect(
      withDatabase(
        'postgres://app:secret@db.internal:6543/postgres?sslmode=require',
        'x',
      ),
    ).toBe('postgres://app:secret@db.internal:6543/x?sslmode=require');
    expect(withDatabase('postgresql://localhost', 'x')).toBe(
      'postgresql://localhost/x',
    );
  });

  it('refuses anything but a postgres:// or postgresql:// URL, without echoing it', () => {
    expect(() => withDatabase('mysql://root:secret@host/db', 'x')).toThrow(
      'the database URL must start with postgres:// or postgresql://',
    );
    expect(() => withDatabase('host=db user=app', 'x')).toThrow(
      'the database URL is not a valid URL',
    );
  });
});

describe.skipIf(SERVER === undefined)(
  'openThrowawayDatabase on CATALOG_PG_URL',
  () => {
    const url = SERVER ?? '';

    async function databases(): Promise<ReadonlyArray<string>> {
      const client = new Client({ connectionString: url });
      await client.connect();
      try {
        const result = await client.query<{ datname: string }>(
          "select datname from pg_database where datname like 'netvark_catalog_%'",
        );
        return result.rows.map((row) => row.datname);
      } finally {
        await client.end();
      }
    }

    it('creates a UTF-8 database from template0, connects to it, and drops it on close', async () => {
      const facts = await useSession(
        await openThrowawayDatabase(url),
        async (session) => {
          const rows = await session.query<{ db: string; encoding: string }>(
            'select current_database() as db, pg_encoding_to_char(encoding) as encoding from pg_database where datname = current_database()',
          );
          return { rows, during: await databases() };
        },
      );
      const [row] = facts.rows;
      expect(row?.encoding).toBe('UTF8');
      expect(row?.db).toMatch(/^netvark_catalog_[0-9a-f]{16}$/u);
      expect(facts.during).toContain(row?.db);
      // Other test files may hold throwaway databases of their own meanwhile.
      expect(await databases()).not.toContain(row?.db);
    });

    it('drops the database when the work fails', async () => {
      let created = '';
      await expect(
        useSession(await openThrowawayDatabase(url), async (session) => {
          const [row] = await session.query<{ db: string }>(
            'select current_database() as db',
          );
          created = row?.db ?? '';
          await session.exec('select * from missing_table');
        }),
      ).rejects.toThrow('relation "missing_table" does not exist');
      expect(created).toMatch(/^netvark_catalog_[0-9a-f]{16}$/u);
      expect(await databases()).not.toContain(created);
    });

    it('fails with connection_failed when the server refuses the connection', async () => {
      await expect(
        openThrowawayDatabase(withDatabase(url, 'netvark_no_such_database')),
      ).rejects.toMatchObject({
        code: 'connection_failed',
      });
    });
  },
);
