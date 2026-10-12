import { describe, expect, it } from 'vitest';

import { paginate } from './paginate';
import { canned } from './test-support/db';
import { contacts } from './test-support/keysets';
import { ID, row } from './test-support/rows';
import { schema, selection } from './test-support/schema';

const options = { select: selection };

/** A cursor for `request` after a row whose keys read `values`. */
async function cursorAt(
  request: Parameters<typeof contacts.plan>[0],
  values: ReadonlyArray<string>,
): Promise<string> {
  const plan = await contacts.plan(request);
  const page = await contacts.page(plan, [row(9)], () => values);
  return page.cursors[0]!;
}

describe('paginate: the seek and the order (SPEC 14.3, ADR 0008, ADR 0016, ADR 0020)', () => {
  it('adds the seek after the filter and inverts a backward page', async () => {
    const { db, recorded } = canned([[row(3), row(2), row(1)]]);
    const request = {
      filter: { field: 'active', op: 'eq', value: true },
    } as const;
    const before = await cursorAt(request, [`${ID}9`]);
    const page = await paginate(
      contacts,
      schema,
      db,
      { ...request, page: { size: 2, before } },
      options,
    );
    expect(recorded.statements).toEqual([
      {
        sql: 'select "id", "first_name", cast("contacts"."id" as text) as "keyset0" from "contacts" where ("contacts"."active" = $1) and ("contacts"."id" < $2) order by "contacts"."id" desc limit $3',
        params: [true, `${ID}9`, 3],
      },
    ]);
    expect(page.rows.map((item) => item['id'])).toEqual([`${ID}2`, `${ID}3`]);
    expect(page.hasPrev).toBe(true);
    expect(page.hasNext).toBe(true);
  });

  it('places the nulls of a nullable key last, and first on a backward page, and no others (ADR 0016)', async () => {
    const { db, recorded } = canned([[], [], []]);
    const near = await cursorAt({ sort: ['age'] }, ['30', `${ID}4`]);
    for (const page of [{ after: near }, { before: near }]) {
      await paginate(contacts, schema, db, { sort: ['age'], page }, options);
    }
    await paginate(contacts, schema, db, { sort: ['-score'] }, options);
    expect(
      recorded.statements.map(({ sql }) =>
        sql.slice(sql.lastIndexOf(' order by ')),
      ),
    ).toEqual([
      ' order by "keyset0v" asc nulls last, "keyset1v" asc  limit $7',
      ' order by "keyset0v" desc nulls first, "keyset1v" desc  limit $6',
      ' order by "contacts"."score" desc, "contacts"."id" asc limit $1',
    ]);
  });

  it('runs a seek of several branches as one select each under union all, ordered by the values', async () => {
    const select =
      'select "id", "first_name", cast("contacts"."age" as text) as "keyset0", "contacts"."age" as "keyset0v", cast("contacts"."id" as text) as "keyset1", "contacts"."id" as "keyset1v" from "contacts"';
    const order =
      'order by "contacts"."age" asc nulls last, "contacts"."id" asc';
    const { db, recorded } = canned([
      [
        [`${ID}5`, 'name5', '31', 31, `${ID}5`, `${ID}5`],
        [`${ID}6`, 'name6', null, null, `${ID}6`, `${ID}6`],
      ],
    ]);
    const after = await cursorAt({ sort: ['age'] }, ['30', `${ID}4`]);
    const page = await paginate(
      contacts,
      schema,
      db,
      { sort: ['age'], page: { size: 2, after } },
      options,
    );
    // Drizzle nests every operand after the second in parentheses of its own.
    expect(recorded.statements).toEqual([
      {
        sql: [
          `((${select} where ("contacts"."age" > $1) ${order} limit $2)`,
          `union all (${select} where ("contacts"."age" is null) ${order} limit $3))`,
          `union all (${select} where (("contacts"."age" = $4 and "contacts"."id" > $5)) ${order} limit $6)`,
          'order by "keyset0v" asc nulls last, "keyset1v" asc  limit $7',
        ].join(' '),
        params: ['30', 3, 3, '30', `${ID}4`, 3, 3],
      },
    ]);
    expect(page.rows).toEqual([
      { id: `${ID}5`, firstName: 'name5' },
      { id: `${ID}6`, firstName: 'name6' },
    ]);
  });

  it('orders by a correlated aggregate and selects it with its tables named', async () => {
    const { db, recorded } = canned([[row(1, '2', `${ID}1`)]]);
    const page = await paginate(
      contacts,
      schema,
      db,
      { sort: ['-emailCount'] },
      options,
    );
    const count =
      '(select count(*) as "value" from "contact_emails" where "contact_emails"."contact_id" = "contacts"."id")';
    expect(recorded.statements[0]?.sql).toBe(
      `select "id", "first_name", cast(${count} as text) as "keyset0", cast("contacts"."id" as text) as "keyset1" from "contacts" order by ${count} desc, "contacts"."id" asc limit $1`,
    );
    expect(page.rows).toHaveLength(1);
  });

  it('correlates an aggregate over a table of another PostgreSQL schema', async () => {
    const { db, recorded } = canned([[]]);
    await paginate(contacts, schema, db, { sort: ['eventCount'] }, options);
    expect(recorded.statements[0]?.sql).toContain(
      'order by (select count(*) as "value" from "audit"."events" where "audit"."events"."contact_id" = "contacts"."id") asc, "contacts"."id" asc',
    );
  });
});
