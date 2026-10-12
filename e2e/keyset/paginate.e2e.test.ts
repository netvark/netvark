import type { Harness } from './support/db.ts';

/**
 * The pagination invariants over PGlite (SPEC 11.1, 14.4): every sort in
 * `SORTS`, every page size in `SIZES`, forward, backward, from item
 * cursors, and back again, through each binding; then the page shape each
 * binding returns.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BINDINGS } from './support/bindings.ts';
import { openPglite } from './support/db.ts';
import { runInvariants } from './support/invariants.ts';
import { composite, contacts } from './support/keysets.ts';
import { expectedIds } from './support/schema.ts';

runInvariants('PGlite', openPglite);

describe('PGlite: page shape', () => {
  let harness: Harness;
  beforeAll(async () => {
    harness = await openPglite();
  });
  afterAll(async () => {
    await harness.close();
  });

  describe.each(BINDINGS)('through $name', (binding) => {
    it('uses the definition defaults and strips the private aliases from rows', async () => {
      const page = await binding.contacts(harness, {});
      expect(page.size).toBe(5);
      expect(page.rows).toHaveLength(5);
      expect(Object.keys(page.rows[0] ?? {})).toEqual(['id', 'first_name']);
      expect(page.rows.map((row) => row.id)).toEqual(
        expectedIds(['id']).slice(0, 5),
      );
      expect(page.total).toBeUndefined();
    });

    it('counts the filtered rows when asked, independent of the cursor', async () => {
      const filter = { field: 'active', op: 'eq', value: true } as const;
      const first = await binding.contacts(
        harness,
        { filter, page: { size: 2 } },
        { total: true },
      );
      expect(first.total).toBe(8);
      const second = await binding.contacts(
        harness,
        { filter, page: { size: 2, after: first.next ?? '' } },
        { total: true },
      );
      expect(second.total).toBe(8);
      expect(second.rows.map((row) => row.id)).not.toEqual(
        first.rows.map((row) => row.id),
      );
    });

    it('reports each query with its SQL, parameters, and timing', async () => {
      const events: Array<{
        kind: string;
        sql: string;
        rowCount: number;
        durationMs: number;
      }> = [];
      await binding.contacts(
        harness,
        { page: { size: 3 } },
        {
          total: true,
          onQuery: (event) => {
            events.push(event);
          },
        },
      );
      expect(events.map((event) => event.kind)).toEqual(['total', 'page']);
      expect(events[0]?.sql).toContain('count(*)');
      expect(events[1]?.sql).toContain('order by "contacts"."id" asc limit');
      expect(events[1]?.rowCount).toBe(4);
      expect(events[1]?.durationMs).toBeGreaterThan(0);
    });

    it('keeps a composite key total through equal timestamps', async () => {
      const seen: Array<string> = [];
      let page = await binding.composite(harness, {});
      for (;;) {
        seen.push(...page.rows.map((row) => row.id));
        if (page.next === null) {
          break;
        }
        page = await binding.composite(harness, {
          page: { after: page.next },
        });
      }
      expect(seen).toEqual(expectedIds(['-createdAt', '-id']));
    });
  });

  it('appends the rest of a composite key to every sort', async () => {
    const plan = await composite.plan({ sort: ['age'] });
    expect(plan.keys.map((key) => key.field)).toEqual([
      'age',
      'createdAt',
      'id',
    ]);
  });

  it("keeps a Kysely base query's own where and selection", async () => {
    const page = await contacts.paginate(
      harness.db
        .selectFrom('contacts')
        .select(['id', 'first_name'])
        .where('status', '=', 'customer'),
      { sort: ['-score'], page: { size: 10 } },
    );
    // Judy and Mallory share a score; the key breaks the tie.
    expect(page.rows.map((row) => row.first_name)).toEqual([
      'Grace',
      'Ada',
      'Eve',
      'Mallory',
      'Judy',
      'Carol',
    ]);
  });
});
