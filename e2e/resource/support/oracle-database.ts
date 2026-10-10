import type { Extensions } from '@electric-sql/pglite';

/**
 * A live database holding the oracle's schema (resource SPEC 15.3), or the
 * contacts application's for the error suite (SPEC 9), its migrations
 * applied in Flyway order: PGlite in process, or a throwaway database on
 * the server `RESOURCE_PG_URL` names, through node-postgres (CI runs
 * PostgreSQL 14 and 18). Both send parameters as UTF-8 text. The
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
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import pg from 'pg';

import { CONTACTS_DIR, ORACLE_DIR, POSTGRES18_DIR } from './paths.ts';

// oxlint-disable-next-line import/no-named-as-default-member -- reason: node-postgres is CommonJS and documents `import pg from 'pg'; const { Client } = pg` for ESM
const { Client } = pg;

const VERSIONED = /^V(\d+)__.+\.sql$/u;
const NAME_BYTES = 8;
const SESSION = "set time zone 'UTC'; set datestyle = 'ISO, YMD'";
/** `server_version_num` of PostgreSQL 18.0, the first major that parses NOT ENFORCED. */
const POSTGRES_18 = 180_000;
/** The errors one PGlite instance takes before the oracle replaces it, well below the leak's limit. */
export const ERROR_BUDGET = 1000;

/** A schema: its migrations' directory and the PGlite extensions they create. */
export interface LiveSchema {
  readonly migrations: string;
  readonly extensions: Extensions;
}

/** The oracle's schema (SPEC 15.3). */
const ORACLE_SCHEMA: LiveSchema = {
  migrations: join(ORACLE_DIR, 'migrations'),
  extensions: { citext },
};

/** The contacts application's schema (SPEC 15.4). */
export const CONTACTS_SCHEMA: LiveSchema = {
  migrations: join(CONTACTS_DIR, 'migrations'),
  extensions: { btree_gist, citext, pg_trgm },
};

/** The PostgreSQL 18 schema (SPEC 15.4): NOT ENFORCED constraints, which PostgreSQL 14 cannot parse. */
const POSTGRES18_SCHEMA: LiveSchema = {
  migrations: join(POSTGRES18_DIR, 'migrations'),
  extensions: {},
};

/** One row of a result, by column name. */
type Row = Readonly<Record<string, unknown>>;

/** A database the oracle writes into, one statement at a time on one session. */
export interface OracleDatabase {
  /** Runs one statement; rejects with an error carrying the SQLSTATE in `code`. */
  query(
    sql: string,
    parameters?: ReadonlyArray<string | null>,
  ): Promise<ReadonlyArray<Row>>;
  close(): Promise<void>;
}

function version(name: string): number {
  return Number(VERSIONED.exec(name)?.[1]);
}

/** The migrations' SQL, then the session settings. */
async function setup(schema: LiveSchema): Promise<ReadonlyArray<string>> {
  const names = await readdir(schema.migrations);
  const versioned = names
    .filter((name) => VERSIONED.test(name))
    .toSorted((left, right) => version(left) - version(right));
  const scripts = await Promise.all(
    versioned.map(async (name) =>
      readFile(join(schema.migrations, name), 'utf8'),
    ),
  );
  return [...scripts, SESSION];
}

async function freshPglite(schema: LiveSchema): Promise<PGlite> {
  const pglite = await PGlite.create({ extensions: schema.extensions });
  for (const script of await setup(schema)) {
    await pglite.exec(script);
  }
  return pglite;
}

/** PGlite (PostgreSQL 18) with the schema's extensions, in process, replaced after `ERROR_BUDGET` errors. */
async function openPglite(schema: LiveSchema): Promise<OracleDatabase> {
  let pglite = await freshPglite(schema);
  let errors = 0;
  return {
    query: async (sql, parameters = []) => {
      try {
        return (await pglite.query<Row>(sql, [...parameters])).rows;
      } catch (error) {
        errors += 1;
        if (errors >= ERROR_BUDGET) {
          await pglite.close();
          pglite = await freshPglite(schema);
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

async function onServer(
  url: string,
  statement: string,
): Promise<ReadonlyArray<Row>> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query<Row>(statement)).rows;
  } finally {
    await client.end();
  }
}

/** The server's `server_version_num`. */
async function serverVersion(url: string): Promise<number> {
  const [row] = await onServer(
    url,
    "select current_setting('server_version_num')::int as version",
  );
  return Number(row?.['version']);
}

/** A database of its own on the server, created from `template0` in UTF-8 and dropped by `close`. */
async function openServer(
  url: string,
  schema: LiveSchema,
): Promise<OracleDatabase> {
  const name = `resource_e2e_${randomBytes(NAME_BYTES).toString('hex')}`;
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
    for (const script of await setup(schema)) {
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

/** Databases holding `schema`: PGlite always, and the server at `url` when there is one. */
function databasesOn(
  schema: LiveSchema,
  url: string | undefined,
): ReadonlyArray<readonly [string, () => Promise<OracleDatabase>]> {
  return [
    ['PGlite', async () => openPglite(schema)],
    ...(url === undefined
      ? []
      : [
          ['a PostgreSQL server', async () => openServer(url, schema)] as const,
        ]),
  ];
}

/** Databases holding `schema`: PGlite always, and the server `RESOURCE_PG_URL` names when it is set. */
export function liveDatabases(
  schema: LiveSchema,
): ReadonlyArray<readonly [string, () => Promise<OracleDatabase>]> {
  return databasesOn(schema, process.env['RESOURCE_PG_URL']);
}

/** Databases holding the PostgreSQL 18 schema: PGlite always, and the server `RESOURCE_PG_URL` names when it runs PostgreSQL 18 or later. */
export async function postgres18Databases(): Promise<
  ReadonlyArray<readonly [string, () => Promise<OracleDatabase>]>
> {
  const url = process.env['RESOURCE_PG_URL'];
  const recent = url !== undefined && (await serverVersion(url)) >= POSTGRES_18;
  return databasesOn(POSTGRES18_SCHEMA, recent ? url : undefined);
}

/** Databases holding the oracle's schema. */
export function oracleDatabases(): ReadonlyArray<
  readonly [string, () => Promise<OracleDatabase>]
> {
  return liveDatabases(ORACLE_SCHEMA);
}
