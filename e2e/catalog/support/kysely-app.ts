/**
 * What the Kysely tests share: running work as the contacts application's
 * tenant, and reading every column of every table a generated `DB`
 * declares back through node-postgres.
 */
import type { Kysely, Transaction } from 'kysely';

import type { DeclaredTypes } from './declared-types';

import { inspect } from 'node:util';

import { sql } from 'kysely';

import { hasType } from './declared-types';

/** Runs `work` in a transaction as the tenant, as the row security policies of V6 expect. */
export async function asTenant<TDatabase, TResult>(
  db: Kysely<TDatabase>,
  organization: string,
  work: (trx: Transaction<TDatabase>) => Promise<TResult>,
): Promise<TResult> {
  return db.transaction().execute(async (trx) => {
    await sql`select set_config('app.organization_id', ${organization}, true)`.execute(
      trx,
    );
    return work(trx);
  });
}

/**
 * Reads every table the `DB` declares with `select *` and returns what
 * disagrees with it: a table without rows, a row with other keys or keys in
 * another order, and a value that is null or lacks its declared select type.
 * The seeds fill every column, so null would only hide a type.
 */
export async function readEveryColumn<TDatabase>(
  db: Kysely<TDatabase>,
  declared: DeclaredTypes,
): Promise<ReadonlyArray<string>> {
  const failures: Array<string> = [];
  for (const [table, columns] of declared.tables) {
    const { rows } = await sql<
      Record<string, unknown>
    >`select * from ${sql.table(table)}`.execute(db);
    if (rows.length === 0) {
      failures.push(`${table}: no rows`);
    }
    for (const row of rows) {
      const keys = Object.keys(row).join(', ');
      if (keys !== [...columns.keys()].join(', ')) {
        failures.push(`${table}: keys ${keys}`);
      }
      for (const [column, type] of columns) {
        if (row[column] === null || !hasType(row[column], type, declared)) {
          failures.push(
            `${table}.${column}: ${inspect(row[column])} for ${type}`,
          );
        }
      }
    }
  }
  return failures;
}
