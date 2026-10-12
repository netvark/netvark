/**
 * The Drizzle schema of the adapter's unit tests, as an application
 * declares one: the keyset family's contacts with their emails and work
 * history under explicit SQL names, an `audit` schema's events, a table
 * declared without SQL names for the database's `casing`, and a relations
 * object, which is not a table. The tables are exported as `PgTable`:
 * `isolatedDeclarations` cannot infer a Drizzle table's type, and the
 * renderers read names, not types. Tests whose types depend on the schema
 * declare their own tables.
 * @ref https://orm.drizzle.team/docs/sql-schema-declaration
 * @ref https://orm.drizzle.team/docs/custom-types
 */
import type { SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

import { relations } from 'drizzle-orm';
import {
  boolean,
  customType,
  date,
  integer,
  numeric,
  PgDialect,
  pgSchema,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const tsvector = customType<{ data: string }>({
  dataType: () => 'tsvector',
});

const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name'),
  age: integer('age'),
  score: numeric('score').notNull(),
  active: boolean('active').notNull(),
  status: text('status', { enum: ['lead', 'customer'] }).notNull(),
  tags: text('tags').array().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  birthday: date('birthday'),
  bio: text('bio').notNull(),
  searchVector: tsvector('search_vector').notNull(),
});

const contactEmails = pgTable('contact_emails', {
  id: integer('id').primaryKey(),
  contactId: uuid('contact_id').notNull(),
  email: text('email').notNull(),
  isPrimary: boolean('is_primary').notNull(),
});

const workHistory = pgTable('work_history', {
  id: integer('id').primaryKey(),
  contactId: uuid('contact_id').notNull(),
  company: text('company').notNull(),
  startDate: date('start_date').notNull(),
});

const audit = pgSchema('audit');

/** A table of another PostgreSQL schema, printed as `"audit"."events"`. */
const events = audit.table('events', {
  id: integer('id').primaryKey(),
  contactId: uuid('contact_id').notNull(),
  kind: text('kind').notNull(),
});

/** Declared without SQL names: the database's `casing` names its columns. */
const people = pgTable('people', {
  id: uuid().primaryKey(),
  givenName: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull(),
});

const contactsRelations = relations(contacts, ({ many }) => ({
  emails: many(contactEmails),
}));

export type TestSchema = {
  readonly contacts: PgTable;
  readonly contactEmails: PgTable;
  readonly workHistory: PgTable;
  readonly events: PgTable;
  readonly people: PgTable;
  readonly contactsRelations: unknown;
};

export const schema: TestSchema = {
  contacts,
  contactEmails,
  workHistory,
  events,
  people,
  contactsRelations,
};

/** The caller's selection of the paginate tests: two columns of contacts. */
export const selection: {
  readonly id: PgColumn;
  readonly firstName: PgColumn;
} = { id: contacts.id, firstName: contacts.firstName };

/** The statement Drizzle's PostgreSQL dialect prints for a fragment. */
export function compile(
  fragment: SQL,
  casing?: 'snake_case',
): { readonly sql: string; readonly params: Array<unknown> } {
  const dialect = new PgDialect(casing === undefined ? {} : { casing });
  const { sql, params } = dialect.sqlToQuery(fragment);
  return { sql, params };
}
