/**
 * A Drizzle database for the adapter's unit tests, over the `pg-proxy`
 * driver: its callback records each statement and answers it with the
 * next canned result. A select's rows are arrays of values in the order
 * of its selection, as the driver expects them for `all`.
 * @ref https://orm.drizzle.team/docs/connect-drizzle-proxy
 */
import type { PgRemoteDatabase } from 'drizzle-orm/pg-proxy';

import { drizzle } from 'drizzle-orm/pg-proxy';

interface Statement {
  readonly sql: string;
  readonly params: ReadonlyArray<unknown>;
}

export interface Recorded {
  readonly statements: Array<Statement>;
}

/** Answers statements in order with `results`, recording each. */
export function canned(
  results: Array<Array<Array<unknown>>>,
  casing?: 'snake_case',
): { readonly db: PgRemoteDatabase; readonly recorded: Recorded } {
  const recorded: Recorded = { statements: [] };
  const db = drizzle(
    async (sql, params) => {
      recorded.statements.push({ sql, params });
      // Like a network driver, answer on a later turn of the event loop.
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      return { rows: results.shift() ?? [] };
    },
    casing === undefined ? {} : { casing },
  );
  return { db, recorded };
}
