/**
 * The declaration's options against the catalog (SPEC 3.2 to 3.4, 3.7):
 * the identity, the scope, the operations, search, sort, and page.
 * @packageDocumentation
 */
import type { PublicColumn, PublicTable } from '@netvark/catalog-core';
import type { PageCapabilitiesInit } from '@netvark/jsonapi-core';

import type { DefinerContext } from './check-config';
import type { Declaration, Operation } from './types';

import { isSearchConfig } from '@netvark/keyset-core';

import {
  codecTypeName,
  isIdentifierColumn,
  isSearchColumn,
  primaryKeyColumn,
} from '../catalog/columns';
import { describe, ownValue } from '../internal/object';
import { SEARCH_CONFIG_SYNTAX } from '../jsonapi/keyset-names';
import { checkPageInit, mergePage } from './check-page';

/** The values of `Operation`, in the order the SPEC lists them. */
export const OPERATIONS: ReadonlyArray<Operation> = [
  'list',
  'get',
  'create',
  'update',
  'remove',
];

/** The resource id: the table's single-column primary key. */
export interface Identity {
  readonly id: string;
  readonly column: PublicColumn;
}

/** The table's id column, after the checks of SPEC 3.4. */
export function checkIdentity(
  context: DefinerContext,
  table: string,
  tableDef: PublicTable,
): Identity {
  const id = primaryKeyColumn(tableDef);
  const column = id === undefined ? undefined : ownValue(tableDef.columns, id);
  if (id === undefined || column === undefined) {
    throw new TypeError(
      `${table}: a resource needs a single-column primary key`,
    );
  }
  if (!isIdentifierColumn(context.catalog, column, table)) {
    throw new TypeError(
      `${table}: the primary key's type ${codecTypeName(column)} cannot carry a resource id`,
    );
  }
  return { id, column };
}

/**
 * `clientIds: true` needs a primary key PostgreSQL accepts a value for: it
 * refuses one for a generated column, and for an identity column generated
 * always unless the insert says `OVERRIDING SYSTEM VALUE`, which the server
 * never writes (SPEC 3.4).
 * @ref https://www.postgresql.org/docs/18/sql-createtable.html#SQL-CREATETABLE-PARMS-GENERATED-IDENTITY
 */
export function checkClientIds(
  table: string,
  identity: Identity,
  clientIds: boolean | undefined,
): void {
  if (clientIds !== true) {
    return;
  }
  const { column } = identity;
  if (column.generated !== null) {
    throw new TypeError(
      `${table}.clientIds: the primary key is a generated column, which takes no client value`,
    );
  }
  if (column.identity === 'always') {
    throw new TypeError(
      `${table}.clientIds: the primary key is an identity column generated always, which takes no client value`,
    );
  }
}

/** The scope's column, or `undefined` for an unscoped declaration (SPEC 3.2). */
export function checkScope(
  context: DefinerContext,
  table: string,
  tableDef: PublicTable,
  name: string | undefined,
): string | undefined {
  if (name === undefined) {
    return undefined;
  }
  const scope = ownValue(context.scopes, name);
  if (scope === undefined) {
    throw new TypeError(
      `${table}.scope: "${name}" is not a scope of createDeclareResource`,
    );
  }
  if (!Object.hasOwn(tableDef.columns, scope.column)) {
    throw new TypeError(
      `${table}.scope: scope ${name} names column ${scope.column}, which ${table} does not have`,
    );
  }
  return scope.column;
}

/** The operations as a set, after the checks of SPEC 3.3. */
export function checkOperations(
  table: string,
  declaration: Declaration,
): ReadonlySet<Operation> {
  if (declaration.operations.length === 0) {
    throw new TypeError(`${table}.operations: list at least one operation`);
  }
  const seen = new Set<Operation>();
  for (const [index, value] of declaration.operations.entries()) {
    const operation = OPERATIONS.find((candidate) => candidate === value);
    const path = `${table}.operations[${String(index)}]`;
    if (operation === undefined) {
      throw new TypeError(
        `${path}: ${describe(value)} is not an operation (${OPERATIONS.join(', ')})`,
      );
    }
    if (seen.has(operation)) {
      throw new TypeError(`${path}: "${operation}" is listed twice`);
    }
    seen.add(operation);
  }
  const updatable =
    Object.values(declaration.fields).some(
      (field) => field.access === 'readWrite' || field.access === 'write',
    ) ||
    Object.values(declaration.relationships ?? {}).some(
      (relationship) => relationship.access === 'readWrite',
    );
  if (seen.has('update') && !updatable) {
    throw new TypeError(
      `${table}.operations: update needs a field or relationship writable on update`,
    );
  }
  return seen;
}

/** `search` against the table (SPEC 3.7). */
export function checkSearch(
  table: string,
  tableDef: PublicTable,
  declaration: Declaration,
): void {
  const { search } = declaration;
  if (search === undefined) {
    return;
  }
  const column = ownValue(tableDef.columns, search.column);
  if (column === undefined || !isSearchColumn(column)) {
    throw new TypeError(
      `${table}.search.column: "${search.column}" is not a tsvector column of ${table}`,
    );
  }
  const generated = column.generated?.searchConfig ?? null;
  if (
    generated !== null &&
    search.config !== undefined &&
    search.config !== generated
  ) {
    throw new TypeError(
      `${table}.search.config: the column is generated with config "${generated}"`,
    );
  }
  if (generated === null && search.config === undefined) {
    throw new TypeError(
      `${table}.search.config: required, because ${search.column} is not generated with a configuration`,
    );
  }
  checkSearchConfig(table, search.config, generated);
}

/** The configuration keyset-core receives, declared or generated, keeps to its `regconfig` syntax (SPEC 11.2). */
function checkSearchConfig(
  table: string,
  declared: string | undefined,
  generated: string | null,
): void {
  if (declared !== undefined && !isSearchConfig(declared)) {
    throw new TypeError(
      `${table}.search.config: "${declared}" is not a text search configuration @netvark/keyset-core accepts (${SEARCH_CONFIG_SYNTAX})`,
    );
  }
  if (
    declared === undefined &&
    generated !== null &&
    !isSearchConfig(generated)
  ) {
    throw new TypeError(
      `${table}.search.column: the column is generated with config "${generated}", which @netvark/keyset-core does not accept (${SEARCH_CONFIG_SYNTAX})`,
    );
  }
}

/** `sort.default` names fields declared with `sort: true`, each once, as keyset-core requires (SPEC 3.7). */
export function checkSort(table: string, declaration: Declaration): void {
  const seen = new Set<string>();
  for (const [index, entry] of (declaration.sort?.default ?? []).entries()) {
    const name =
      typeof entry === 'string' ? entry.replace(/^-/u, '') : entry.field;
    const path = `${table}.sort.default[${String(index)}]`;
    const field = ownValue(declaration.fields, name);
    if (field?.sort !== true) {
      throw new TypeError(`${path}: "${name}" is not declared with sort: true`);
    }
    if (seen.has(name)) {
      throw new TypeError(`${path}: "${name}" is listed twice`);
    }
    seen.add(name);
  }
}

/** The declaration's `page` merged over the definer's (SPEC 3.7). */
export function checkPage(
  context: DefinerContext,
  table: string,
  value: unknown,
): PageCapabilitiesInit {
  return mergePage(
    `${table}.page`,
    context.page,
    checkPageInit(`${table}.page`, value),
  );
}
