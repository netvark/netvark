import { describe, expect, it } from 'vitest';

import { paginate } from './paginate';
import { canned } from './test-support/db';
import { contacts } from './test-support/keysets';
import { ID, row } from './test-support/rows';

describe('paginate: the seek and the order (SPEC 10.3, ADR 0008, ADR 0016, ADR 0020)', () => {
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
        query.sql.slice(query.sql.lastIndexOf(') order by ')),
      ),
    ).toEqual([
      ') order by "keyset0v" asc nulls last, "keyset1v" asc limit $7',
      ') order by "keyset0v" desc nulls first, "keyset1v" desc limit $6',
    ]);
  });

  it('runs a seek of several branches as one select each under union all, ordered by the values (ADR 0020)', async () => {
    const keys =
      'cast("contacts"."age" as text) as "keyset0", "contacts"."age" as "keyset0v", cast("contacts"."id" as text) as "keyset1", "contacts"."id" as "keyset1v"';
    const select = `select *, ${keys} from "contacts"`;
    const order =
      'order by "contacts"."age" asc nulls last, "contacts"."id" asc';
    const { db, recorded } = canned([
      [
        row(5, {
          keyset0: '31',
          keyset0v: 31,
          keyset1: `${ID}5`,
          keyset1v: `${ID}5`,
        }),
        row(6, {
          keyset0: null,
          keyset0v: null,
          keyset1: `${ID}6`,
          keyset1v: `${ID}6`,
        }),
      ],
    ]);
    const first = await contacts.plan({ sort: ['age'] });
    const near = await contacts.page(
      first,
      [row(4, { keyset0: '30', keyset1: `${ID}4` })],
      (item) => [String(item['keyset0']), String(item['keyset1'])],
    );
    const page = await paginate(
      contacts,
      db.selectFrom('contacts').selectAll(),
      {
        sort: ['age'],
        page: { size: 2, after: near.cursors[0] },
      },
    );
    expect(recorded.queries[0]).toMatchObject({
      sql: [
        `${select} where false`,
        `union all (${select} where "contacts"."age" > $1 ${order} limit $2)`,
        `union all (${select} where "contacts"."age" is null ${order} limit $3)`,
        `union all (${select} where ("contacts"."age" = $4 and "contacts"."id" > $5) ${order} limit $6)`,
        'order by "keyset0v" asc nulls last, "keyset1v" asc limit $7',
      ].join(' '),
      parameters: ['30', 3, 3, '30', `${ID}4`, 3, 3],
    });
    expect(page.rows).toEqual([
      { id: `${ID}5`, first_name: 'name5' },
      { id: `${ID}6`, first_name: 'name6' },
    ]);
  });

  it("replaces the base query's order by, limit, and offset in a union too (SPEC 10.3)", async () => {
    const { db, recorded } = canned([[], []]);
    const first = await contacts.plan({ sort: ['age'] });
    const near = await contacts.page(
      first,
      [row(4, { keyset0: '30', keyset1: `${ID}4` })],
      (item) => [String(item['keyset0']), String(item['keyset1'])],
    );
    const request = {
      sort: ['age'] as const,
      page: { size: 2, after: near.cursors[0] },
    };
    await paginate(contacts, db.selectFrom('contacts').selectAll(), request);
    // Kysely compiles a set operation's order by and limit after its
    // operands, so the caller's are the union's, and replaced with it.
    await paginate(
      contacts,
      db
        .selectFrom('contacts')
        .selectAll()
        .orderBy('first_name')
        .limit(1)
        .offset(5),
      request,
    );
    const [plain, clausal] = recorded.queries;
    expect(plain?.sql).toContain(' union all ');
    expect(clausal).toEqual(plain);
  });
});
