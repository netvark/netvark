/**
 * The type-level check of `relationships` (SPEC 3.1, 3.2, 3.4). A key must
 * be a single-column foreign key, other than the id, to the primary key of
 * a public table, and that column must be able to carry a resource id.
 * Nothing here reads the target (SPEC 3.8). The runtime twin is
 * `checkRelationship` in `check-columns.ts`.
 * @packageDocumentation
 */
import type { PublicColumn, PublicTable } from '@netvark/catalog-core';

import type {
  CodecTypeName,
  IsIdentifierColumn,
} from '../catalog/resolve-type';
import type {
  ColumnName,
  ForeignKeyColumn,
  ForeignKeyReference,
  PrimaryKeyColumn,
  TableName,
} from '../catalog/types';
import type { AccessRequirement, OperationOf } from './access-check';
import type { DeclareContext } from './registries';
import type { KnownMembers, Requirement, RequireWhen } from './requirement';
import type {
  Declaration,
  DeclaredMembers,
  MemberOf,
  RelationshipDeclaration,
} from './types';

type RelationshipMember = keyof RelationshipDeclaration;

/** The foreign key must reference the primary key of a public table (SPEC 3.1). */
type ReferenceError<
  TContext extends DeclareContext,
  K extends string,
  TReference,
> = TReference extends {
  readonly table: infer TTarget extends string;
  readonly column: infer TTargetColumn extends string;
}
  ? TTarget extends TableName<TContext['catalog']>
    ? TTargetColumn extends PrimaryKeyColumn<
        TContext['catalog']['tables'][TTarget]
      >
      ? never
      : `${K} references ${TTarget}.${TTargetColumn}, which is not its primary key`
    : `${K} references ${TTarget}, which is not a table of the public catalog`
  : never;

/** Why a key outside `RelationshipColumn` cannot be a relationship. */
type RelationshipKeyError<
  TContext extends DeclareContext,
  TTable extends string,
  TTableDef extends PublicTable,
  K extends string,
> =
  K extends PrimaryKeyColumn<TTableDef>
    ? `${K} is the primary key, which is the resource id`
    : K extends ForeignKeyColumn<TTableDef>
      ? ReferenceError<TContext, K, ForeignKeyReference<TTableDef, K>>
      : K extends ColumnName<TTableDef>
        ? `"${K}" is not the column of a single-column foreign key`
        : `"${K}" is not a column of ${TTable}`;

type RelationshipRequirements<
  TContext extends DeclareContext,
  TColumn extends PublicColumn,
  TOps,
  TRelationship,
  TScope extends boolean,
> = KnownMembers<
  TRelationship,
  RelationshipMember,
  'a relationship declaration'
> &
  (IsIdentifierColumn<TContext['catalog'], TColumn> extends true
    ? unknown
    : Requirement<`type ${CodecTypeName<TColumn>} cannot carry a resource id`>) &
  (TScope extends true
    ? RequireWhen<
        MemberOf<TRelationship, 'access'> extends 'read' ? false : true,
        'access: the scope column is read-only'
      >
    : AccessRequirement<TColumn, TOps, MemberOf<TRelationship, 'access'>>);

/**
 * The columns a relationship may name: a single-column foreign key, other
 * than the id, that references the primary key of a public table. One
 * union per declaration, as `FieldColumn`.
 */
type RelationshipColumn<
  TContext extends DeclareContext,
  TTableDef extends PublicTable,
> = Exclude<
  {
    [K in keyof TTableDef['constraints']]: TTableDef['constraints'][K] extends {
      readonly kind: 'foreignKey';
      readonly columns: readonly [infer TColumn extends string];
      readonly references: {
        readonly table: infer TTarget extends string;
        readonly columns: readonly [infer TTargetColumn extends string];
      };
    }
      ? TTarget extends TableName<TContext['catalog']>
        ? TTargetColumn extends PrimaryKeyColumn<
            TContext['catalog']['tables'][TTarget]
          >
          ? TColumn
          : never
        : never
      : never;
  }[keyof TTableDef['constraints']],
  PrimaryKeyColumn<TTableDef>
>;

/** The keys `relationships` may not hold, each mapped to why; `unknown` when there is none. */
type RelationshipKeyErrors<
  TContext extends DeclareContext,
  TTable extends string,
  TTableDef extends PublicTable,
  TInvalid,
> = [TInvalid] extends [never]
  ? unknown
  : {
      readonly [K in TInvalid & string]: RelationshipKeyError<
        TContext,
        TTable,
        TTableDef,
        K
      >;
    };

/** `relationships`, key by key, split as `FieldsCheck`. */
export type RelationshipsCheck<
  TContext extends DeclareContext,
  TTable extends string,
  TTableDef extends PublicTable,
  TDecl extends Declaration,
  TScopeColumn,
> = {
  readonly [
    K in keyof DeclaredMembers<TDecl, 'relationships'>
  ]: K extends RelationshipColumn<TContext, TTableDef>
    ? RelationshipRequirements<
        TContext,
        TTableDef['columns'][K],
        OperationOf<TDecl>,
        DeclaredMembers<TDecl, 'relationships'>[K],
        K extends TScopeColumn ? true : false
      >
    : unknown;
} & RelationshipKeyErrors<
  TContext,
  TTable,
  TTableDef,
  Exclude<
    keyof DeclaredMembers<TDecl, 'relationships'>,
    RelationshipColumn<TContext, TTableDef>
  >
>;
