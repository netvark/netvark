/**
 * Databases the Kysely runtime's suites run on (resource SPEC 18.7),
 * holding the storage contract's schema (SPEC 12.9): PGlite through
 * Kysely's PGlite dialect, and a throwaway database on the server
 * `RESOURCE_PG_URL` names through Kysely's PostgreSQL dialect over a
 * node-postgres pool of several connections. The server's sessions start
 * with defaults unlike the adapter's settings, SERIALIZABLE, Asia/Tokyo,
 * and SQL dates, as a role's or a database's settings might set them, so
 * a suite sees each setting the adapter makes and that none outlives its
 * transaction. PGlite keeps its own defaults: it runs one transaction at
 * a time, and Kysely's PGlite dialect passes no isolation level on.
 * @ref https://node-postgres.com/apis/client (`options`: command-line options sent to the server at startup)
 * @ref https://www.postgresql.org/docs/18/config-setting.html#CONFIG-SETTING-SHELL
 * @ref https://kysely-org.github.io/kysely-apidoc/classes/PostgresDialect.html
 */
import { PGlite } from '@electric-sql/pglite';
import { Kysely, PGliteDialect, PostgresDialect } from 'kysely';
import pg from 'pg';

import { contractFixture } from '@netvark/resource-core/testing';

import { throwawayDatabase } from './oracle-database.ts';

// oxlint-disable-next-line import/no-named-as-default-member -- reason: node-postgres is CommonJS and documents `import pg from 'pg'; const { Pool } = pg` for ESM
const { Pool } = pg;

/** Connections of the server's pool: enough for transactions to run side by side. */
export const POOL_SIZE = 4;
/** The server sessions' defaults, each unlike the adapter's setting. */
export const SESSION_DEFAULTS = {
  transaction_isolation: 'serializable',
  TimeZone: 'Asia/Tokyo',
  DateStyle: 'SQL, DMY',
} as const;
const STARTUP_OPTIONS =
  '-c default_transaction_isolation=serializable -c TimeZone=Asia/Tokyo -c DateStyle=SQL,DMY';

type Row = Readonly<Record<string, unknown>>;

/** A database holding the contract's schema, through Kysely. */
export interface KyselyDatabase {
  readonly db: Kysely<unknown>;
  /** Whether each session starts with `SESSION_DEFAULTS`; PGlite's do not. */
  readonly defaults: boolean;
  /** Runs `query` on every connection at once, outside any transaction: the pool's, or PGlite's one. */
  readonly onEachConnection: (query: string) => Promise<ReadonlyArray<Row>>;
  readonly close: () => Promise<void>;
}

async function openPglite(): Promise<KyselyDatabase> {
  const pglite = await PGlite.create();
  for (const script of contractFixture.migrations) {
    await pglite.exec(script);
  }
  const db = new Kysely<unknown>({ dialect: new PGliteDialect({ pglite }) });
  return {
    db,
    defaults: false,
    onEachConnection: async (query) => (await pglite.query<Row>(query)).rows,
    close: async () => {
      await db.destroy();
    },
  };
}

async function openServer(url: string): Promise<KyselyDatabase> {
  const database = await throwawayDatabase(url);
  const pool = new Pool({
    connectionString: database.url,
    max: POOL_SIZE,
    options: STARTUP_OPTIONS,
  });
  const db = new Kysely<unknown>({ dialect: new PostgresDialect({ pool }) });
  const close = async () => {
    await db.destroy();
    await database.drop();
  };
  try {
    for (const script of contractFixture.migrations) {
      await pool.query(script);
    }
  } catch (error) {
    await close();
    throw error;
  }
  return {
    db,
    defaults: true,
    onEachConnection: async (query) => {
      const clients = await Promise.all(
        Array.from({ length: POOL_SIZE }, async () => pool.connect()),
      );
      try {
        return await Promise.all(
          clients.map(async (client) => (await client.query<Row>(query)).rows),
        ).then((results) => results.flat());
      } finally {
        for (const client of clients) {
          client.release();
        }
      }
    },
    close,
  };
}

/** The databases: PGlite always, and the server `RESOURCE_PG_URL` names when it is set. */
export function kyselyDatabases(): ReadonlyArray<
  readonly [string, () => Promise<KyselyDatabase>]
> {
  const url = process.env['RESOURCE_PG_URL'];
  return [
    ['PGlite', openPglite],
    ...(url === undefined
      ? []
      : [['a PostgreSQL server', async () => openServer(url)] as const]),
  ];
}
