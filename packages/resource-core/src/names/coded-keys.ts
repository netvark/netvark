/**
 * The rule keys a resource derives a code for (SPEC 9.1): each constraint
 * with a column that is a public field or relationship, the primary key
 * when `clientIds` is true, and the NOT NULL key (SPEC 3.5) of each public
 * member an operation writes. Clients can cause and see exactly these, so
 * no other key takes `code`.
 * @packageDocumentation
 */
import type { PublicConstraint, PublicTable } from '@netvark/catalog-core';

import type { ColumnName, ConstraintName } from '../catalog/types';
import type { MemberColumn, WrittenColumn } from '../declare/members';
import type { Declaration, MemberOf } from '../declare/types';
import type { CodeOf } from './code';

import { notNullKey } from '../catalog/columns';
import { memberColumns, writtenColumns } from '../declare/members';

type CodedConstraint<
  TTableDef extends PublicTable,
  TDecl extends Declaration,
> = {
  [K in ConstraintName<TTableDef>]: [
    Extract<
      TTableDef['constraints'][K]['columns'][number],
      MemberColumn<TDecl>
    >,
  ] extends [never]
    ? TTableDef['constraints'][K]['kind'] extends 'primaryKey'
      ? MemberOf<TDecl, 'clientIds'> extends true
        ? K
        : never
      : never
    : K;
}[ConstraintName<TTableDef>];

type CodedNotNullKey<
  TTableDef extends PublicTable,
  TDecl extends Declaration,
> = {
  [
    C in WrittenColumn<TDecl> & ColumnName<TTableDef>
  ]: TTableDef['columns'][C]['nullable'] extends false
    ? `${TTableDef['name']}_${C}_not_null`
    : never;
}[WrittenColumn<TDecl> & ColumnName<TTableDef>];

/** The rule keys with a code. */
export type CodedKey<
  TTableDef extends PublicTable,
  TDecl extends Declaration,
> = (CodedConstraint<TTableDef, TDecl> | CodedNotNullKey<TTableDef, TDecl>) &
  string;

/**
 * Each code mapped to the keys that take it, the type-level twin of
 * `names.codes`. Remapped keys that coincide merge into a union, so a code
 * two keys take maps to both (`codes-check.ts`).
 * @ref https://www.typescriptlang.org/docs/handbook/2/mapped-types.html#key-remapping-via-as
 */
export type CodeNames<
  TTableDef extends PublicTable,
  TDecl extends Declaration,
> = {
  [K in CodedKey<TTableDef, TDecl> as CodeOf<TDecl, K>]: K;
};

function isCoded(
  constraint: PublicConstraint,
  members: ReadonlySet<string>,
  clientIds: boolean,
): boolean {
  return (
    constraint.columns.some((column) => members.has(column)) ||
    (constraint.kind === 'primaryKey' && clientIds)
  );
}

/** The rule keys with a code: constraints in catalog order, then NOT NULL keys in column order. */
export function codedKeys(
  tableDef: PublicTable,
  declaration: Declaration,
): ReadonlyArray<string> {
  const members = memberColumns(declaration);
  const clientIds = declaration.clientIds === true;
  const constraints = Object.entries(tableDef.constraints)
    .filter(([, constraint]) => isCoded(constraint, members, clientIds))
    .map(([name]) => name);
  const written = writtenColumns(declaration);
  const notNull = Object.entries(tableDef.columns)
    .filter(([column, columnDef]) => written.has(column) && !columnDef.nullable)
    .map(([column]) => notNullKey(tableDef, column));
  return [...constraints, ...notNull];
}
