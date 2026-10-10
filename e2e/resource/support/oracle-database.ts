/**
 * A live database holding the oracle's schema (resource SPEC 15.3), its
 * migrations applied in Flyway order: PGlite in process, or a throwaway
 * database on the server `RESOURCE_PG_URL` names, through node-postgres
 * (CI runs PostgreSQL 14 and 18). Both send parameters as UTF-8 text. The
 * session runs in UTC with ISO dates, so every value prints one way.
 * PGlite is queried directly: behind its socket server, node-postgres lost
 * protocol sync after a refused parameter. PGlite 0.5.8 never gives back
 * the stack an error used, and after about 1,800 errors on one instance
 * fails every statement with "stack depth limit exceeded", so the oracle
 * opens a fresh instance after `ERROR_BUDGET` errors; the transaction it
 * drops would have been rolled back.
 * @ref https://pglite.dev/docs/api#query
 * @ref https://github.com/electric-sql/pglite/issues/1115
 * @ref https://www.postgresql.org/docs/18/runtime-config-client.html#GUC-TIMEZONE
 */
import { randomBytes } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import pg from 'pg';

import { ORACLE_DIR } from './paths.ts';

// oxlint-disable-next-line import/no-named-as-default-member -- reason: node-postgres is CommonJS and documents `import pg from 'pg'; const { Client } = pg` for ESM
const { Client } = pg;

const MIGRATIONS_DIR = join(ORACLE_DIR, 'migrations');
const VERSIONED = /^V(\d+)__.+\.sql$/u;
const NAME_BYTES = 8;
const SESSION = "set time zone 'UTC'; set datestyle = 'ISO, YMD'";
/** The errors one PGlite instance takes before the oracle replaces it, well below the leak's limit. */
export const ERROR_BUDGET = 1000;

/** One row of a result, by column name. */
type Row = Readonly<Record<string, unknown>>;

/** A database the oracle writes into, one statement at a time on one session. */
export interface OracleDatabase {
  /** Runs one statement; rejects with an error carrying the SQLSTATE in `code`. */
  query(
    sql: string,
    parameters?: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<Row>>;
  close(): Promise<void>;
}

function version(name: string): number {
  return Number(VERSIONED.exec(name)?.[1]);
}

/** The migrations' SQL, then the session settings. */
async function setup(): Promise<ReadonlyArray<string>> {
  const names = await readdir(MIGRATIONS_DIR);
  const versioned = names
    .filter((name) => VERSIONED.test(name))
    .toSorted((left, right) => version(left) - version(right));
  const scripts = await Promise.all(
    versioned.map(async (name) => readFile(join(MIGRATIONS_DIR, name), 'utf8')),
  );
  return [...scripts, SESSION];
}

async function freshPglite(): Promise<PGlite> {
  const pglite = await PGlite.create({ extensions: { citext } });
  for (const script of await setup()) {
    await pglite.exec(script);
  }
  return pglite;
}

/** PGlite (PostgreSQL 18) with `citext`, in process, replaced after `ERROR_BUDGET` errors. */
async function openPglite(): Promise<OracleDatabase> {
  let pglite = await freshPglite();
  let errors = 0;
  return {
    query: async (sql, parameters = []) => {
      try {
        return (await pglite.query<Row>(sql, [...parameters])).rows;
      } catch (error) {
        errors += 1;
        if (errors >= ERROR_BUDGET) {
          await pglite.close();
          pglite = await freshPglite();
          errors = 0;
        }
        throw error;
      }
    },
    close: async () => {
      await pglite.close();
    },
  };
}

async function onServer(url: string, statement: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}

/** A database of its own on the server, created from `template0` in UTF-8 and dropped by `close`. */
async function openServer(url: string): Promise<OracleDatabase> {
  const name = `resource_oracle_${randomBytes(NAME_BYTES).toString('hex')}`;
  await onServer(
    url,
    `create database ${name} template template0 encoding 'UTF8'`,
  );
  const target = new URL(url);
  target.pathname = `/${name}`;
  const client = new Client({ connectionString: target.toString() });
  const close = async () => {
    await client.end();
    await onServer(url, `drop database ${name} with (force)`);
  };
  try {
    await client.connect();
    for (const script of await setup()) {
      await client.query(script);
    }
  } catch (error) {
    await close();
    throw error;
  }
  return {
    query: async (sql, parameters = []) =>
      (await client.query<Row>(sql, [...parameters])).rows,
    close,
  };
}

/** PGlite always, and the server `RESOURCE_PG_URL` names when it is set. */
export function oracleDatabases(): ReadonlyArray<
  readonly [string, () => Promise<OracleDatabase>]
> {
  const url = process.env['RESOURCE_PG_URL'];
  return [
    ['PGlite', openPglite],
    ...(url === undefined
      ? []
      : [['a PostgreSQL server', async () => openServer(url)] as const]),
  ];
}
