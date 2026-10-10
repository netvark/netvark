/**
 * The PGlite target (SPEC 6.1, ADR 0003): PostgreSQL in-process, from an
 * optional peer dependency imported only when used.
 * @ref https://pglite.dev/extensions/
 * @packageDocumentation
 */
import type { Extension, PGlite } from '@electric-sql/pglite';

import type { SqlSession } from './session';

import { PgCatalogError } from '../errors';

/** A PGlite extension object, such as the export of `@electric-sql/pglite-pgvector`. */
export interface PgliteExtension {
  readonly name: string;
  readonly setup: (...args: never) => unknown;
}

/** Contrib extension names as PostgreSQL spells them (`pg_trgm`, `uuid-ossp`). */
const CONTRIB_NAME = /^[a-z][a-z0-9_-]*$/u;

function isExtension(value: unknown): value is Extension {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof value.name === 'string' &&
    'setup' in value &&
    typeof value.setup === 'function'
  );
}

async function importPglite(): Promise<typeof PGlite> {
  try {
    const module = await import('@electric-sql/pglite');
    return module.PGlite;
  } catch (error) {
    throw new PgCatalogError(
      'pglite_missing',
      'the PGlite target needs @electric-sql/pglite installed; install it or set database.url',
      { cause: error },
    );
  }
}

/** Imports `@electric-sql/pglite/contrib/<name>`, whose export is the name with `-` as `_`. */
async function importContrib(
  name: string,
): Promise<readonly [string, Extension]> {
  if (!CONTRIB_NAME.test(name)) {
    throw new PgCatalogError(
      'config_invalid',
      `"${name}" is not a PGlite contrib extension name`,
    );
  }
  const exported = name.replaceAll('-', '_');
  const specifier = `@electric-sql/pglite/contrib/${exported}`;
  let module: unknown;
  try {
    module = await import(specifier);
  } catch (error) {
    throw new PgCatalogError(
      'pglite_missing',
      `PGlite has no contrib extension "${name}"`,
      {
        cause: error,
      },
    );
  }
  const extension: unknown =
    typeof module === 'object' && module !== null
      ? Reflect.get(module, exported)
      : undefined;
  if (!isExtension(extension)) {
    throw new PgCatalogError(
      'pglite_missing',
      `PGlite has no contrib extension "${name}"`,
    );
  }
  return [exported, extension];
}

async function resolveExtension(
  entry: string | PgliteExtension,
): Promise<readonly [string, Extension]> {
  if (typeof entry === 'string') {
    return importContrib(entry);
  }
  if (!isExtension(entry)) {
    throw new PgCatalogError(
      'config_invalid',
      'a PGlite extension must have a name and a setup',
    );
  }
  return [entry.name, entry];
}

/**
 * Opens an in-memory PGlite with the given extensions loaded: contrib
 * extensions by name, any other PGlite extension as its object.
 */
export async function openPglite(
  extensions: ReadonlyArray<string | PgliteExtension> = [],
): Promise<SqlSession> {
  const PGliteClass = await importPglite();
  const loaded = await Promise.all(
    extensions.map(async (entry) => resolveExtension(entry)),
  );
  const db = await PGliteClass.create({
    extensions: Object.fromEntries(loaded),
  });
  return {
    exec: async (sql) => {
      await db.exec(sql);
    },
    query: async <TRow extends Record<string, unknown>>(
      sql: string,
      params: ReadonlyArray<unknown> = [],
    ) => (await db.query<TRow>(sql, [...params])).rows,
    close: async () => {
      await db.close();
    },
  };
}
