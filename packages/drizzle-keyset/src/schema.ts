import type { PgColumn } from 'drizzle-orm/pg-core';

/**
 * Names resolved in the application's schema object (SPEC 14.1, 14.2). A
 * table is an own member that is a Drizzle PostgreSQL table, a column an own
 * member of its table's columns, keyed by property name. Only own members
 * count, so `__proto__` or `constructor` never resolve to something
 * inherited. `is()` recognizes a table made by another copy of drizzle-orm,
 * which `instanceof` would not.
 * @ref https://orm.drizzle.team/docs/goodies (is() in place of instanceof)
 * @packageDocumentation
 */
import type { KeysetSchema } from './types';

import { getTableColumns, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';

/** The table `key` names in `schema`, or `undefined` when it names none. */
export function tableOf(
  schema: KeysetSchema,
  key: string,
): PgTable | undefined {
  if (!Object.hasOwn(schema, key)) {
    return undefined;
  }
  const member = schema[key];
  return is(member, PgTable) ? member : undefined;
}

/** The column the property `key` of `table` holds, or `undefined` when it holds none. */
export function columnOf(table: PgTable, key: string): PgColumn | undefined {
  const columns: Readonly<Record<string, PgColumn>> = getTableColumns(table);
  return Object.hasOwn(columns, key) ? columns[key] : undefined;
}
