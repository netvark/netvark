/**
 * Loading migrations (SPEC 5): a directory walked recursively, or a
 * function returning them in the order to run.
 * @packageDocumentation
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

import { PgCatalogError } from '../errors';
import { orderMigrations } from './order';

/** One migration: a name for messages and the SQL to run. */
export interface Migration {
  readonly name: string;
  readonly sql: string;
}

/** Migrations computed by the application, in the order to run. */
export type MigrationSource = () =>
  | ReadonlyArray<Migration>
  | Promise<ReadonlyArray<Migration>>;

async function listFiles(directory: string): Promise<ReadonlyArray<string>> {
  try {
    const entries = await readdir(directory, {
      recursive: true,
      withFileTypes: true,
    });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) =>
        relative(directory, join(entry.parentPath, entry.name))
          .split(sep)
          .join('/'),
      );
  } catch (error) {
    throw new PgCatalogError(
      'migrations_invalid',
      `cannot read the migrations directory ${directory}`,
      { cause: error },
    );
  }
}

function checkComputed(
  migrations: ReadonlyArray<Migration>,
): ReadonlyArray<Migration> {
  for (const migration of migrations) {
    if (
      typeof migration.name !== 'string' ||
      typeof migration.sql !== 'string'
    ) {
      throw new PgCatalogError(
        'migrations_invalid',
        'the migrations function must return { name, sql } entries with string members',
      );
    }
  }
  return migrations;
}

/**
 * The migrations to replay, in order. A directory path resolves against
 * `cwd`; files are read as UTF-8. An empty result fails with
 * `migrations_invalid`.
 */
export async function loadMigrations(
  source: string | MigrationSource,
  cwd: string,
): Promise<ReadonlyArray<Migration>> {
  let migrations: ReadonlyArray<Migration>;
  let where: string;
  if (typeof source === 'function') {
    migrations = checkComputed(await source());
    where = 'the migrations function';
  } else {
    const directory = resolve(cwd, source);
    const names = orderMigrations(await listFiles(directory));
    migrations = await Promise.all(
      names.map(async (name) => ({
        name,
        sql: await readFile(join(directory, name), 'utf8'),
      })),
    );
    where = directory;
  }
  if (migrations.length === 0) {
    throw new PgCatalogError(
      'migrations_invalid',
      `no migrations found in ${where}`,
    );
  }
  return migrations;
}
