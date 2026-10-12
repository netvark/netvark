import type { DefineDefaultedKeyset, DefineKeyset } from './define-keyset';

import { relations } from 'drizzle-orm';
import {
  customType,
  date,
  integer,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { describe, expectTypeOf, it } from 'vitest';

import { createDefineKeyset } from './define-keyset';

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey(),
  firstName: text('first_name').notNull(),
  age: integer('age'),
  birthday: date('birthday'),
  tags: text('tags').array().notNull(),
  searchVector: tsvector('search_vector').notNull(),
});

const workHistory = pgTable('work_history', {
  id: integer('id').primaryKey(),
  contactId: uuid('contact_id').notNull(),
  company: text('company').notNull(),
  startDate: date('start_date').notNull(),
});

const contactsRelations = relations(contacts, ({ many }) => ({
  work: many(workHistory),
}));

const schema = { contacts, workHistory, contactsRelations };
const defineKeyset = createDefineKeyset(schema);
const SECRET = 'x'.repeat(32);
const ID = { id: { column: 'id', type: 'uuid' } } as const;

describe('createDefineKeyset types (SPEC 14.1)', () => {
  it('checks the table and the column names against the schema', () => {
    defineKeyset({
      table: 'contacts',
      key: ['id'],
      fields: ID,
      cursor: { secret: SECRET },
    });
    defineKeyset({
      // @ts-expect-error not a member of the schema
      table: 'people',
      key: ['id'],
      fields: ID,
      cursor: { secret: SECRET },
    });
    defineKeyset({
      // @ts-expect-error a member that is not a table
      table: 'contactsRelations',
      key: ['id'],
      fields: ID,
      cursor: { secret: SECRET },
    });
    defineKeyset({
      table: 'contacts',
      key: ['id'],
      // @ts-expect-error the SQL name, not the property the schema declares
      fields: { id: ID.id, firstName: { column: 'first_name', type: 'text' } },
      cursor: { secret: SECRET },
    });
  });

  it('requires nullable: true for a column whose type includes null', () => {
    defineKeyset({
      table: 'contacts',
      key: ['id'],
      fields: {
        ...ID,
        age: { column: 'age', type: 'integer', nullable: true },
        firstName: { column: 'firstName', type: 'text', nullable: true },
      },
      cursor: { secret: SECRET },
    });
    defineKeyset({
      table: 'contacts',
      key: ['id'],
      // @ts-expect-error age is nullable in the schema, so the seek must see its nulls
      fields: { ...ID, age: { column: 'age', type: 'integer' } },
      cursor: { secret: SECRET },
    });
    defineKeyset({
      table: 'contacts',
      key: ['id'],
      fields: {
        ...ID,
        // @ts-expect-error birthday is nullable in the schema
        birthday: { column: 'birthday', type: 'date', nullable: false },
      },
      cursor: { secret: SECRET },
    });
  });

  it('checks relation tables, join columns, relation fields, and aggregate columns', () => {
    defineKeyset({
      table: 'contacts',
      key: ['id'],
      fields: {
        ...ID,
        latest: {
          aggregate: { relation: 'work', fn: 'max', column: 'startDate' },
          type: 'date',
        },
      },
      relations: {
        work: {
          table: 'workHistory',
          on: { contactId: 'id' },
          fields: { company: { column: 'company', type: 'text' } },
        },
      },
      cursor: { secret: SECRET },
    });
    defineKeyset({
      table: 'contacts',
      key: ['id'],
      fields: ID,
      // @ts-expect-error the SQL name of the table
      relations: { work: { table: 'work_history', on: { contactId: 'id' } } },
      cursor: { secret: SECRET },
    });
    defineKeyset({
      table: 'contacts',
      key: ['id'],
      fields: ID,
      // @ts-expect-error not a column of workHistory
      relations: { work: { table: 'workHistory', on: { ownerId: 'id' } } },
      cursor: { secret: SECRET },
    });
    defineKeyset({
      table: 'contacts',
      key: ['id'],
      fields: ID,
      // @ts-expect-error not a column of contacts
      relations: { work: { table: 'workHistory', on: { contactId: 'uuid' } } },
      cursor: { secret: SECRET },
    });
    defineKeyset({
      table: 'contacts',
      key: ['id'],
      fields: {
        ...ID,
        // @ts-expect-error not a column of workHistory
        latest: {
          aggregate: { relation: 'work', fn: 'max', column: 'started' },
          type: 'date',
        },
      },
      relations: { work: { table: 'workHistory', on: { contactId: 'id' } } },
      cursor: { secret: SECRET },
    });
  });

  it('checks search columns and the vector', () => {
    defineKeyset({
      table: 'contacts',
      key: ['id'],
      fields: ID,
      search: { vector: 'searchVector', config: 'english' },
      cursor: { secret: SECRET },
    });
    defineKeyset({
      table: 'contacts',
      key: ['id'],
      fields: ID,
      // @ts-expect-error not a column of contacts
      search: { mode: 'like', columns: ['firstName', 'surname'] },
      cursor: { secret: SECRET },
    });
  });
});

describe('createDefineKeyset with defaults types', () => {
  it('makes the cursor optional when the defaults carry one and still checks names', () => {
    const define = createDefineKeyset(schema, { cursor: { secret: SECRET } });
    expectTypeOf(define).toEqualTypeOf<DefineDefaultedKeyset<typeof schema>>();
    define({ table: 'contacts', key: ['id'], fields: ID });
    define({ table: 'contacts', key: ['id'], fields: ID, cursor: { ttl: 60 } });
    define({
      table: 'contacts',
      key: ['id'],
      // @ts-expect-error not a column of contacts
      fields: { id: { column: 'uuid', type: 'uuid' } },
    });
  });

  it('keeps the cursor required when the defaults carry none', () => {
    const define = createDefineKeyset(schema, { page: { max: 50 } });
    expectTypeOf(define).toEqualTypeOf<DefineKeyset<typeof schema>>();
    // @ts-expect-error the definition must name its cursor
    define({ table: 'contacts', key: ['id'], fields: ID });
  });
});
