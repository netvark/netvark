import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { columnOf, tableOf } from './schema';
import { schema } from './test-support/schema';

describe('tableOf (SPEC 14.1: a table is an own member that is a Drizzle table)', () => {
  it('finds a table by its key in the schema, not by its SQL name', () => {
    expect(getTableName(tableOf(schema, 'contactEmails')!)).toBe(
      'contact_emails',
    );
    expect(tableOf(schema, 'contact_emails')).toBeUndefined();
  });

  it('finds a table of another PostgreSQL schema by its key', () => {
    expect(getTableName(tableOf(schema, 'events')!)).toBe('events');
  });

  it('ignores a member that is not a table', () => {
    expect(Object.hasOwn(schema, 'contactsRelations')).toBe(true);
    expect(tableOf(schema, 'contactsRelations')).toBeUndefined();
  });

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
    'never resolves %s through the prototype',
    (key) => {
      expect(tableOf(schema, key)).toBeUndefined();
    },
  );
});

describe('columnOf (SPEC 14.1: a column is an own member of its table columns)', () => {
  const contacts = tableOf(schema, 'contacts')!;

  it('finds a column by its property name, not by its SQL name', () => {
    expect(columnOf(contacts, 'firstName')?.name).toBe('first_name');
    expect(columnOf(contacts, 'first_name')).toBeUndefined();
  });

  it.each(['__proto__', 'constructor', 'toString', 'enableRLS'])(
    'never resolves %s, which is not a declared column',
    (key) => {
      expect(columnOf(contacts, key)).toBeUndefined();
    },
  );
});
