/**
 * The generated Kysely types in an application (SPEC 9.2, 13.1): the
 * contacts application writes and reads every table through Kysely and
 * node-postgres with `db.ts` as its `DB`. The typecheck script compiles
 * this file, so the query results must have the types written here and the
 * refused inserts must fail to compile; at runtime, every value read back
 * from every column must have the select type the file declares. Runs on
 * PGlite behind a socket server, and on the server `CATALOG_PG_URL` names.
 */
import type { Insertable } from 'kysely';

import type {
  ContactKind,
  DB,
  JsonValue,
} from './fixtures/contacts/expected/db.ts';
import type { LiveDatabase } from './support/live-database';

import { readFile } from 'node:fs/promises';

import { Kysely, PostgresDialect } from 'kysely';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  expectTypeOf,
  it,
} from 'vitest';

import { EXPECTED_TYPES } from './support/contacts';
import { readDeclaredTypes } from './support/declared-types';
import { asTenant, readEveryColumn } from './support/kysely-app';
import { liveDatabases } from './support/live-database';

/** One row in every table, written through the generated insert types; returns the tenant. */
async function seed(db: Kysely<DB>): Promise<string> {
  const organization = await db
    .insertInto('organizations')
    .values({
      name: 'Analytical Engines',
      slug: 'analytical-engines',
      country: 'GB',
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await asTenant(db, organization.id, async (trx) => {
    const contact = await trx
      .insertInto('contacts')
      .values({
        organization_id: organization.id,
        kind: 'person',
        name: 'Ada Lovelace',
        nickname: 'Ada',
        email: 'ada@example.com',
        website: 'https://ada.example.com',
        priority: 1,
        discount: 12.5,
        tags: ['mathematics', 'engines'],
      })
      .returning(['id', 'name', 'tags'])
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('contact_phones')
      .values({
        contact_id: contact.id,
        position: 0,
        kind: 'landline',
        number: '+44 20 7946 0000',
      })
      .execute();
    await trx
      .insertInto('meetings')
      .values({
        organization_id: organization.id,
        contact_id: contact.id,
        room: 'Babbage',
        during: '[2026-02-03 10:00:00+00,2026-02-03 11:00:00+00)',
        notes: 'Bernoulli numbers',
      })
      .execute();
    // One activity in each quarterly partition.
    const activities = await trx
      .insertInto('activities')
      .values([
        {
          contact_id: contact.id,
          occurred_on: '2026-02-03',
          summary: 'Kick-off',
        },
        {
          contact_id: contact.id,
          occurred_on: '2026-05-04',
          summary: 'Review',
        },
      ])
      .returning(['id', 'occurred_on'])
      .execute();
    await trx
      .insertInto('activity_attachments')
      .values(
        activities.map((activity) => ({
          activity_id: activity.id,
          occurred_on: activity.occurred_on,
          file_name: 'notes.pdf',
        })),
      )
      .execute();
    await trx
      .insertInto('audit.changes')
      .values({
        table_name: 'contacts',
        operation: 'insert',
        row_id: contact.id,
        payload: JSON.stringify({ name: contact.name, tags: contact.tags }),
      })
      .execute();
  });
  return organization.id;
}

describe('the generated insert types', () => {
  it('refuse what PostgreSQL or node-postgres would refuse, at compile time', () => {
    type NewOrganization = Insertable<DB['organizations']>;
    type NewContact = Insertable<DB['contacts']>;
    // organizations.id is GeneratedAlways: PostgreSQL refuses a value for it.
    expectTypeOf<NewOrganization>().not.toHaveProperty('id');
    // jsonb is written as JSON text: node-postgres sends an array as a PostgreSQL array.
    expectTypeOf<Insertable<DB['audit.changes']>['payload']>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<NewContact['kind']>().toEqualTypeOf<ContactKind | undefined>();
    // name is NOT NULL without a default; organization_id takes what int8 accepts.
    expectTypeOf<{ organization_id: string }>().not.toExtend<NewContact>();
    expectTypeOf<{
      organization_id: bigint;
      name: string;
    }>().toExtend<NewContact>();
  });
});

for (const [name, open] of liveDatabases()) {
  describe(`the generated Kysely types on ${name}`, () => {
    let live: LiveDatabase;
    let db: Kysely<DB>;
    let tenant: string;

    beforeAll(async () => {
      live = await open();
      db = new Kysely<DB>({
        dialect: new PostgresDialect({ pool: live.pool }),
      });
      tenant = await seed(db);
    });

    afterAll(async () => {
      await live.close();
    });

    it('types a joined query the way node-postgres returns its values', async () => {
      const row = await asTenant(db, tenant, async (trx) =>
        trx
          .selectFrom('contacts')
          .innerJoin(
            'organizations',
            'organizations.id',
            'contacts.organization_id',
          )
          .select([
            'contacts.id',
            'contacts.kind',
            'contacts.tags',
            'contacts.discount',
            'contacts.created_at',
            'organizations.id as organization',
            'organizations.seats',
          ])
          .executeTakeFirstOrThrow(),
      );
      expectTypeOf(row).toEqualTypeOf<{
        id: string;
        kind: ContactKind;
        tags: Array<string>;
        discount: string | null;
        created_at: Date;
        organization: string;
        seats: number;
      }>();
      expect(row).toMatchObject({
        kind: 'person',
        tags: ['mathematics', 'engines'],
        discount: '12.50',
        organization: tenant,
        seats: 5,
      });
      expect(row.created_at).toBeInstanceOf(Date);
    });

    it('reads jsonb as a parsed value and an enum in another schema as its label', async () => {
      const change = await db
        .selectFrom('audit.changes')
        .select(['operation', 'payload', 'changed_at'])
        .executeTakeFirstOrThrow();
      expectTypeOf(change.payload).toEqualTypeOf<JsonValue>();
      expectTypeOf(change.operation).toEqualTypeOf<
        'insert' | 'update' | 'delete'
      >();
      expect(change.payload).toEqual({
        name: 'Ada Lovelace',
        tags: ['mathematics', 'engines'],
      });
      expect(change.operation).toBe('insert');
    });

    it('reads a value of the declared select type from every column of every table', async () => {
      const declared = readDeclaredTypes(
        await readFile(EXPECTED_TYPES, 'utf8'),
      );
      const failures = await asTenant(db, tenant, async (trx) =>
        readEveryColumn(trx, declared),
      );
      expect(failures).toEqual([]);
      expect([...declared.tables.keys()]).toHaveLength(7);
    });
  });
}
