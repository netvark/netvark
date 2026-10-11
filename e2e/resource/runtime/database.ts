/**
 * The contacts application's database for the runtime (resource SPEC 12):
 * PGlite with the application's migrations and an outbox. Every runtime
 * transaction runs as `contacts_app`, a role without superuser rights, as
 * an application's connections would, so the row security policy of
 * `V6__row_security.sql` applies to each statement the adapter runs, on
 * top of the adapter's own scope predicate; the checks of the tests run
 * as the superuser, past it. Acme (organization 1) has Ada, who has a
 * meeting, and an archived contact; Globex (organization 2) has Grace.
 * @ref https://www.postgresql.org/docs/18/ddl-rowsecurity.html
 * @ref https://pglite.dev/docs/api#transaction
 */
import type { DomainEvent } from '@netvark/resource-core/server';

import type { Transact } from '../support/reference-adapter.ts';
import type { Row } from '../support/reference-sql.ts';

import { CONTACTS_SCHEMA, migratedPglite } from '../support/oracle-database.ts';

/** The reference adapter's outbox table. */
export const OUTBOX = 'outbox';

export const ADA = '00000000-0000-4000-8000-000000000001';
export const GRACE = '00000000-0000-4000-8000-000000000002';
export const ARCHIVED = '00000000-0000-4000-8000-000000000003';

const SETUP = [
  `create table ${OUTBOX} (
    position int8 generated always as identity primary key,
    name text not null,
    version int4 not null,
    payload jsonb not null
  )`,
  'create role contacts_app',
  'grant select, insert, update, delete on all tables in schema public to contacts_app',
  'grant usage on all sequences in schema public to contacts_app',
];
const SEED = [
  `truncate table organizations, ${OUTBOX} restart identity cascade`,
  "insert into organizations (name, slug, handle) values ('Acme', 'acme', 'acme'), ('Globex', 'globex', 'globex')",
  `insert into contacts (id, organization_id, name, email, status) values
    ('${ADA}', 1, 'Ada', 'ada@example.com', 'active'),
    ('${GRACE}', 2, 'Grace', 'grace@example.com', 'active'),
    ('${ARCHIVED}', 1, 'Old Name', null, 'archived')`,
  `insert into meetings (organization_id, contact_id, room, during)
    values (1, '${ADA}', 'a-1', '[2026-01-05 09:00+00,2026-01-05 10:00+00)')`,
];
const EVENTS = `select name, version, payload::text as payload from ${OUTBOX} order by position`;
const COUNT =
  'select count(*)::int as "count" from contacts where organization_id = $1::int8';

/** The database, and what the tests read from it as the superuser. */
export interface RuntimeDatabase {
  /** A transaction of the application's role. */
  readonly transact: Transact;
  readonly reset: () => Promise<void>;
  /** The committed outbox, in order. */
  readonly events: () => Promise<ReadonlyArray<DomainEvent>>;
  /** An organization's contacts, counted past row security. */
  readonly contacts: (organization: number) => Promise<number>;
  readonly close: () => Promise<void>;
}

function eventOf(row: Row): DomainEvent {
  const { name, version, payload } = row;
  if (
    typeof name !== 'string' ||
    typeof version !== 'number' ||
    typeof payload !== 'string'
  ) {
    throw new TypeError('the outbox returned a row of another shape');
  }
  const parsed: unknown = JSON.parse(payload);
  return { name, version, payload: parsed };
}

/** PGlite with the contacts schema, the outbox, the role, and the seed. */
export async function openRuntimeDatabase(): Promise<RuntimeDatabase> {
  const pglite = await migratedPglite(CONTACTS_SCHEMA);
  for (const sql of SETUP) {
    await pglite.exec(sql);
  }
  const reset = async () => {
    for (const sql of SEED) {
      await pglite.exec(sql);
    }
  };
  await reset();
  return {
    transact: async (run) =>
      pglite.transaction(async (tx) => {
        await tx.query('set local role contacts_app');
        return run({
          query: async (sql, parameters) =>
            (await tx.query<Row>(sql, [...parameters])).rows,
        });
      }),
    reset,
    events: async () =>
      (await pglite.query<Row>(EVENTS)).rows.map((row) => eventOf(row)),
    contacts: async (organization) => {
      const [row] = (await pglite.query<Row>(COUNT, [String(organization)]))
        .rows;
      return Number(row?.['count']);
    },
    close: async () => {
      await pglite.close();
    },
  };
}
