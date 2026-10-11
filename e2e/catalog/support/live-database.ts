/**
 * A live database holding the contacts application, its migrations applied
 * in Flyway order the way a deploy applies them: on PGlite behind a socket
 * server, which node-postgres reaches over the wire protocol with its stock
 * type parsers, or in a throwaway database on the server `CATALOG_PG_URL`
 * names.
 * @ref https://pglite.dev/docs/pglite-socket
 * @ref https://documentation.red-gate.com/fd/migrations-271585107.html (versioned migrations, then repeatable ones)
 */
import { randomBytes } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import pg from 'pg';

import { MIGRATIONS_DIR } from './contacts.ts';
import { endPool } from './pool-closed.ts';

// oxlint-disable-next-line import/no-named-as-default-member -- reason: node-postgres is CommonJS and documents `import pg from 'pg'; const { Pool } = pg` for ESM
const { Client, Pool } = pg;

const VERSIONED = /^V(\d+)__.+\.sql$/u;
const REPEATABLE = /^R__.+\.sql$/u;
const NAME_BYTES = 8;
/**
 * The pool's connection and one more for drift. The socket server
 * multiplexes its connections over PGlite's one session, so the tests
 * never use both at once.
 */
const PGLITE_CONNECTIONS = 2;

export interface LiveDatabase {
  /** The URL of the database, as its owner. */
  readonly url: string;
  /** The database's name. */
  readonly name: string;
  /** A node-postgres pool with the default type parsers; `close` ends it. */
  readonly pool: pg.Pool;
  close(): Promise<void>;
}

function version(name: string): number {
  return Number(VERSIONED.exec(name)?.[1]);
}

/** The migrations' SQL in Flyway order: versioned by version, then repeatable by name. */
async function migrations(): Promise<ReadonlyArray<string>> {
  const names = await readdir(MIGRATIONS_DIR);
  const versioned = names
    .filter((name) => VERSIONED.test(name))
    .toSorted((left, right) => version(left) - version(right));
  const repeatable = names.filter((name) => REPEATABLE.test(name)).toSorted();
  return Promise.all(
    [...versioned, ...repeatable].map(async (name) =>
      readFile(join(MIGRATIONS_DIR, name), 'utf8'),
    ),
  );
}

async function migrate(database: LiveDatabase): Promise<LiveDatabase> {
  try {
    for (const sql of await migrations()) {
      await database.pool.query(sql);
    }
  } catch (error) {
    await database.close();
    throw error;
  }
  return database;
}

/** PGlite (PostgreSQL 18) with the contrib extensions the migrations create, behind a socket server. */
export async function openPgliteDatabase(): Promise<LiveDatabase> {
  const pglite = await PGlite.create({
    extensions: { btree_gist, citext, pg_trgm },
  });
  // Port 0 lets the system pick a free port, which getServerConn reports.
  const server = new PGLiteSocketServer({
    db: pglite,
    port: 0,
    host: '127.0.0.1',
    maxConnections: PGLITE_CONNECTIONS,
  });
  await server.start();
  const url = `postgres://postgres@${server.getServerConn()}/postgres`;
  const pool = new Pool({ connectionString: url, max: 1 });
  return migrate({
    url,
    name: 'postgres',
    pool,
    close: async () => {
      await pool.end();
      await server.stop();
      await pglite.close();
    },
  });
}

/** Runs one statement on the server the URL names, on a connection of its own. */
export async function onServer(url: string, statement: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}

/** A database of its own on the server, created from `template0` and dropped by `close`. */
export async function openServerDatabase(url: string): Promise<LiveDatabase> {
  const name = `catalog_e2e_${randomBytes(NAME_BYTES).toString('hex')}`;
  await onServer(
    url,
    `create database ${name} template template0 encoding 'UTF8'`,
  );
  const target = new URL(url);
  target.pathname = `/${name}`;
  const pool = new Pool({ connectionString: target.toString(), max: 2 });
  return migrate({
    url: target.toString(),
    name,
    pool,
    close: async () => {
      await endPool(pool);
      await onServer(url, `drop database ${name} with (force)`);
    },
  });
}

/** PGlite always, and the server `CATALOG_PG_URL` names when it is set (CI runs PostgreSQL 14 and 18). */
export function liveDatabases(): ReadonlyArray<
  readonly [string, () => Promise<LiveDatabase>]
> {
  const url = process.env['CATALOG_PG_URL'];
  return [
    ['PGlite over a socket', openPgliteDatabase],
    ...(url === undefined
      ? []
      : [
          ['a PostgreSQL server', async () => openServerDatabase(url)] as const,
        ]),
  ];
}
