import type { PgRemoteDatabase } from 'drizzle-orm/pg-proxy';

/**
 * The Drizzle binding's runtime-neutral checks (SPEC 11.4, 14.4): a keyset
 * defined over a Drizzle schema paginates through Drizzle's `pg-proxy`
 * driver, whose callback stands in for the database and records each
 * statement, so the binding runs with no driver or socket on Bun, Deno,
 * and workerd.
 * @ref https://orm.drizzle.team/docs/connect-drizzle-proxy
 */
import type { QueryEvent } from '@netvark/drizzle-keyset';

import type { Check } from './assert.ts';

import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pg-proxy';

import { createDefineKeyset } from '@netvark/drizzle-keyset';

import { check, equal } from './assert.ts';

const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  age: integer('age'),
});

const keyset = createDefineKeyset(
  { contacts },
  { cursor: { secret: 'smoke-secret-with-at-least-32-bytes!!' } },
)({
  table: 'contacts',
  key: ['id'],
  fields: {
    id: { column: 'id', type: 'uuid' },
    name: { column: 'name', type: 'text', collation: 'insensitive' },
    createdAt: { column: 'createdAt', type: 'timestamptz' },
    age: { column: 'age', type: 'integer', nullable: true },
  },
  search: { columns: ['name'] },
});

const ID = '00000000-0000-4000-8000-00000000000';
const CREATED_AT = '2026-01-01T00:00:00.000Z';

/**
 * The selected rows the proxy answers, positional in the selection's
 * order: the table's columns, then the sort key and the tie-breaker as
 * text. Three rows answer a page of two and tell that another follows.
 */
const ROWS = [
  [`${ID}1`, 'Ada', CREATED_AT, 40, '40', `${ID}1`],
  [`${ID}2`, 'Adam', CREATED_AT, 30, '30', `${ID}2`],
  [`${ID}3`, 'Adele', CREATED_AT, null, null, `${ID}3`],
];
const TOTAL = 3;

interface Recorded {
  readonly db: PgRemoteDatabase;
  readonly statements: Array<{ sql: string; params: Array<unknown> }>;
}

/** A database whose driver records each statement and answers it like a server would. */
function recorded(): Recorded {
  const statements: Recorded['statements'] = [];
  const db = drizzle(async (sql, params) => {
    statements.push({ sql, params });
    // A network driver answers on a later turn.
    await Promise.resolve();
    return { rows: sql.startsWith('select count(*)') ? [[TOTAL]] : ROWS };
  });
  return { db, statements };
}

const REQUEST = { sort: ['-age'], search: 'ada', page: { size: 2 } } as const;

export const DRIZZLE_CHECKS: Readonly<Record<string, Check>> = {
  'paginates a Drizzle keyset over pg-proxy without a database': async () => {
    const { db, statements } = recorded();
    const events: Array<QueryEvent> = [];
    const page = await keyset.paginate(db, REQUEST, {
      total: true,
      onQuery: (event) => {
        events.push(event);
      },
    });
    equal(page.total, TOTAL, 'total');
    equal(page.rows.map((row) => row.name).join(','), 'Ada,Adam', 'rows');
    check(!('keyset0' in (page.rows[0] ?? {})), 'rows without the key values');
    equal(
      page.rows[0]?.createdAt.toISOString(),
      CREATED_AT,
      "rows as Drizzle's columns map them",
    );
    equal(page.hasNext, true, 'hasNext');
    equal(
      events.map((event) => event.sql).join('\n'),
      statements.map((statement) => statement.sql).join('\n'),
      'onQuery reports what the driver ran',
    );
    const sql = statements[1]?.sql ?? '';
    check(
      sql.includes('cast("contacts"."age" as text) as "keyset0"'),
      `key selection: ${sql}`,
    );
    check(
      sql.includes("websearch_to_tsquery('simple', $"),
      `text search: ${sql}`,
    );
    check(
      sql.includes(
        'order by "contacts"."age" desc nulls last, "contacts"."id" asc limit $',
      ),
      `order with the nulls of the nullable key last: ${sql}`,
    );
  },
  'resumes a Drizzle page from its cursor': async () => {
    const first = recorded();
    const page = await keyset.paginate(first.db, REQUEST);
    check(typeof page.next === 'string', 'next cursor');
    const { db, statements } = recorded();
    await keyset.paginate(db, {
      ...REQUEST,
      page: { size: 2, after: page.next },
    });
    const statement = statements[0];
    check(statement !== undefined, 'one statement');
    check(
      statement.sql.includes(
        '((("contacts"."age" < $2 or "contacts"."age" is null) or ("contacts"."age" = $3 and "contacts"."id" > $4)))',
      ),
      `seek past the cursor, its nulls last: ${statement.sql}`,
    );
    equal(
      JSON.stringify(statement.params.slice(1, -1)),
      JSON.stringify(['30', '30', `${ID}2`]),
      "the cursor's values",
    );
  },
};
