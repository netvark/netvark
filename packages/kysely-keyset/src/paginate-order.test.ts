import { describe, expect, it } from 'vitest';

import { paginate } from './paginate';
import { canned } from './test-support/db';
import { contacts } from './test-support/keysets';
import { ID, row } from './test-support/rows';

describe('paginate: the seek and the order (SPEC 10.3, ADR 0008, ADR 0016)', () => {
  it('adds the seek after the filter and inverts a backward page', async () => {
    const { db, recorded } = canned([[row(3), row(2), row(1)]]);
    const first = await contacts.plan({});
    const before = await contacts.page(first, [row(9)], (item) => [
      String(item['keyset0']),
    ]);
    const page = await paginate(
      contacts,
      db.selectFrom('contacts').selectAll(),
      {
        page: { size: 2, before: before.cursors[0] },
      },
    );
    expect(recorded.queries[0]).toMatchObject({
      sql: 'select *, cast("contacts"."id" as text) as "keyset0" from "contacts" where "contacts"."id" < $1 order by "contacts"."id" desc limit $2',
      parameters: [`${ID}9`, 3],
    });
    expect(page.rows.map((item) => item.id)).toEqual([`${ID}2`, `${ID}3`]);
    expect(page.hasPrev).toBe(true);
    expect(page.hasNext).toBe(true);
  });

  it('places the nulls of a nullable key last, and first on a backward page (ADR 0016)', async () => {
    const { db, recorded } = canned([[], []]);
    const first = await contacts.plan({ sort: ['age'] });
    const near = await contacts.page(
      first,
      [row(4, { keyset0: '30', keyset1: `${ID}4` })],
      (item) => [String(item['keyset0']), String(item['keyset1'])],
    );
    for (const page of [
      { after: near.cursors[0] },
      { before: near.cursors[0] },
    ]) {
      await paginate(contacts, db.selectFrom('contacts').selectAll(), {
        sort: ['age'],
        page,
      });
    }
    expect(
      recorded.queries.map((query) =>
        query.sql.slice(query.sql.indexOf(' order by ')),
      ),
    ).toEqual([
      // After a value of a nullable key no range leads (SPEC 6.2): one parameter fewer.
      ' order by "contacts"."age" asc nulls last, "contacts"."id" asc limit $4',
      ' order by "contacts"."age" desc nulls first, "contacts"."id" desc limit $5',
    ]);
  });
});
