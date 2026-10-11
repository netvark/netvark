/**
 * Replay (SPEC 6.3): each migration runs as one simple-protocol query
 * after the pinned settings, which PostgreSQL runs as one implicit
 * transaction unless the file controls transactions itself.
 * @ref https://www.postgresql.org/docs/18/protocol-flow.html#PROTOCOL-FLOW-MULTI-STATEMENT
 * @packageDocumentation
 */
import type { Migration } from './migrations/load';
import type { SqlSession } from './target/session';

import { PgCatalogError } from './errors';
import { failureOf } from './target/failure';
import { SESSION_SETTINGS } from './target/session';

/**
 * Line and column of a 1-based position. PostgreSQL counts characters, so
 * the text is walked by code points, not UTF-16 units.
 */
export function lineAndColumn(
  sql: string,
  position: number,
): { readonly line: number; readonly column: number } {
  let line = 1;
  let column = 1;
  let index = 1;
  for (const character of sql) {
    if (index === position) {
      break;
    }
    if (character === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
    index += 1;
  }
  return { line, column };
}

function migrationFailed(migration: Migration, error: unknown): PgCatalogError {
  const failure = failureOf(error);
  const where =
    failure.position === null
      ? ''
      : (({ line, column }) => ` at line ${line}, column ${column}`)(
          lineAndColumn(migration.sql, failure.position),
        );
  const state = failure.code === null ? '' : ` (SQLSTATE ${failure.code})`;
  return new PgCatalogError(
    'migration_failed',
    `migration ${migration.name} failed${where}: ${failure.message}${state}`,
    { cause: error },
  );
}

/** Runs the migrations in order, each after `SESSION_SETTINGS`. */
export async function replay(
  session: SqlSession,
  migrations: ReadonlyArray<Migration>,
): Promise<void> {
  for (const migration of migrations) {
    await session.exec(SESSION_SETTINGS);
    try {
      await session.exec(migration.sql);
    } catch (error) {
      throw migrationFailed(migration, error);
    }
  }
}
