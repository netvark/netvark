/**
 * The replay target a configuration names (SPEC 6): PGlite unless
 * `database.url` is set, a throwaway database on that server otherwise.
 * @packageDocumentation
 */
import type { DatabaseConfig } from '../config';
import type { SqlSession } from './session';

import { PgCatalogError } from '../errors';
import { openPglite } from './pglite';
import { openThrowawayDatabase } from './server';

/**
 * Opens the target of `database`. A URL function is called here, so a
 * missing environment variable fails only the command that replays; one
 * that returns nothing fails with `config_invalid`.
 */
export async function openTarget(
  database: DatabaseConfig | undefined,
): Promise<SqlSession> {
  if (database === undefined) {
    return openPglite();
  }
  if ('pglite' in database) {
    return openPglite(database.pglite.extensions);
  }
  const url =
    typeof database.url === 'function' ? database.url() : database.url;
  if (url === undefined || url === '') {
    throw new PgCatalogError(
      'config_invalid',
      'database.url returned no URL; set the environment variable it reads, or use the PGlite target',
    );
  }
  return openThrowawayDatabase(url);
}
