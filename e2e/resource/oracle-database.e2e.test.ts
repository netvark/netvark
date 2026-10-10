/**
 * The oracle's PGlite database outlives PGlite's error leak: one instance
 * fails every statement after about 1,800 errors (1,873 refused divisions
 * by zero in the report), so the database replaces it after
 * `ERROR_BUDGET` errors and keeps answering.
 * @ref https://github.com/electric-sql/pglite/issues/1115
 */
import { describe, expect, it } from 'vitest';

import { ERROR_BUDGET, oracleDatabases } from './support/oracle-database.ts';

const TIMEOUT = 120_000;

describe('the oracle database on PGlite', () => {
  it(
    'keeps answering after more errors than one PGlite instance survives',
    async () => {
      const pglite = oracleDatabases().find(([name]) => name === 'PGlite');
      if (pglite === undefined) {
        throw new Error('no PGlite oracle database');
      }
      const database = await pglite[1]();
      try {
        for (let index = 0; index < 2 * ERROR_BUDGET; index += 1) {
          await expect(database.query('select 1 / 0')).rejects.toThrow(
            'division by zero',
          );
        }
        expect(await database.query('select 1 as one')).toEqual([{ one: 1 }]);
      } finally {
        await database.close();
      }
    },
    TIMEOUT,
  );
});
