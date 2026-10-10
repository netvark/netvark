import type { SqlSession } from './session';

/**
 * The server target (SPEC 6.2, ADR 0003): a throwaway database on a
 * PostgreSQL server, created from `template0` with UTF-8 encoding and
 * dropped afterwards.
 * @ref https://www.postgresql.org/docs/18/sql-createdatabase.html
 * @ref https://www.postgresql.org/docs/18/sql-dropdatabase.html
 * @packageDocumentation
 */
import pg from 'pg';

import { PgCatalogError } from '../errors';

// oxlint-disable-next-line import/no-named-as-default-member -- reason: node-postgres is CommonJS and documents `import pg from 'pg'; const { Client } = pg` for ESM
const { Client } = pg;

const NAME_PREFIX = 'netvark_catalog_';
const NAME_BYTES = 8;
const HEX = 16;
const BYTE_DIGITS = 2;

/** `netvark_catalog_` followed by 16 lowercase hex digits from a CSPRNG. */
export function throwawayName(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NAME_BYTES));
  return (
    NAME_PREFIX +
    [...bytes]
      .map((byte) => byte.toString(HEX).padStart(BYTE_DIGITS, '0'))
      .join('')
  );
}

/** The URL with its database replaced; it must be a `postgres://` or `postgresql://` URL. */
export function withDatabase(url: string, database: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (error) {
    throw new PgCatalogError(
      'config_invalid',
      'the database URL is not a valid URL',
      {
        cause: error,
      },
    );
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new PgCatalogError(
      'config_invalid',
      'the database URL must start with postgres:// or postgresql://',
    );
  }
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

function reportedByNextQuery(): void {
  // The failed connection rejects the next query, which reports it.
}

async function connect(url: string): Promise<pg.Client> {
  const client = new Client({ connectionString: url });
  // A connection the server ends is reported by the next query; without a
  // listener the 'error' event would end the process instead.
  client.on('error', reportedByNextQuery);
  try {
    await client.connect();
  } catch (error) {
    throw new PgCatalogError(
      'connection_failed',
      'cannot connect to the PostgreSQL server',
      {
        cause: error,
      },
    );
  }
  return client;
}

/** A session over a connected client; `onClose` runs after the client ends. */
function clientSession(
  client: pg.Client,
  onClose: () => Promise<void>,
): SqlSession {
  return {
    exec: async (sql) => {
      await client.query(sql);
    },
    query: async <TRow extends Record<string, unknown>>(
      sql: string,
      params: ReadonlyArray<unknown> = [],
    ) => (await client.query<TRow>(sql, [...params])).rows,
    close: async () => {
      await client.end();
      await onClose();
    },
  };
}

async function dropDatabase(admin: pg.Client, name: string): Promise<void> {
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  } catch (error) {
    throw new PgCatalogError(
      'connection_failed',
      `cannot drop the database ${name}`,
      {
        cause: error,
      },
    );
  } finally {
    await admin.end();
  }
}

/**
 * Creates `netvark_catalog_<random>` on the server the URL names and
 * returns a session connected to it; closing the session drops it. The
 * role needs `CREATEDB`.
 */
export async function openThrowawayDatabase(url: string): Promise<SqlSession> {
  const name = throwawayName();
  const target = withDatabase(url, name);
  const admin = await connect(url);
  try {
    await admin.query(
      `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8'`,
    );
  } catch (error) {
    await admin.end();
    throw new PgCatalogError(
      'connection_failed',
      `cannot create the database ${name}`,
      {
        cause: error,
      },
    );
  }
  let client: pg.Client;
  try {
    client = await connect(target);
  } catch (error) {
    await dropDatabase(admin, name);
    throw error;
  }
  return clientSession(client, async () => dropDatabase(admin, name));
}
