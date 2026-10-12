import type { Harness } from './support/db.ts';

/**
 * A PostgreSQL server (SPEC 11.3, 14.4): the invariants, filters,
 * relations, and search on the planner and executor production uses,
 * through each binding. Runs only when `KEYSET_PG_URL` names a server; CI
 * provides one per supported major.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BINDINGS } from './support/bindings.ts';
import { openPostgres } from './support/db.ts';
import { runInvariants } from './support/invariants.ts';
import { expectedIds } from './support/schema.ts';

const URL = process.env['KEYSET_PG_URL'];

if (URL === undefined) {
  describe.skip('PostgreSQL server (KEYSET_PG_URL unset)', () => {
    it('is skipped', () => {
      expect(URL).toBeUndefined();
    });
  });
} else {
  const url = URL;
  runInvariants('PostgreSQL server', async () => openPostgres(url));

  describe('PostgreSQL server: features', () => {
    let harness: Harness;
    beforeAll(async () => {
      harness = await openPostgres(url);
    });
    afterAll(async () => {
      await harness.close();
    });

    describe.each(BINDINGS)('through $name', (binding) => {
      it('filters, searches, aggregates, and counts', async () => {
        const page = await binding.contacts(
          harness,
          {
            sort: ['-emailCount', 'lastName'],
            filter: {
              and: [
                {
                  field: 'tags',
                  op: 'overlaps',
                  value: ['ops', 'math', 'sec', 'music'],
                },
                { field: 'emails.email', op: 'containsi', value: 'X.IO' },
                { not: { field: 'age', op: 'isNull' } },
              ],
            },
            search: 'a',
            page: { size: 10 },
          },
          { total: true },
        );
        // Two emails each for Carol and Mallory, one each for Ivan and Dan;
        // within a tie the insensitive last name ascends with nulls last, so
        // Dan (no last name) closes the page.
        expect(page.rows.map((row) => row.first_name)).toEqual([
          'Carol',
          'Mallory',
          'Ivan',
          'Dan',
        ]);
        expect(page.total).toBe(4);
      });

      it('runs text search over the stored vector', async () => {
        const page = await binding.searchable(harness, {
          search: 'lovelace -ada',
          sort: ['createdAt'],
        });
        expect(page.rows.map((row) => row.first_name)).toEqual([
          'Carol',
          'Judy',
        ]);
      });

      it('walks a range', async () => {
        const all = await binding.contacts(harness, {
          sort: ['-score'],
          page: { size: 50 },
        });
        const range = await binding.contacts(harness, {
          sort: ['-score'],
          page: { after: all.cursors[2], before: all.cursors[8], size: 3 },
        });
        expect(range.rows.map((row) => row.id)).toEqual(
          expectedIds(['-score']).slice(3, 6),
        );
        expect(range.rangeTruncated).toBe(true);
      });
    });
  });
}
