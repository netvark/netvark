/**
 * The type-level check of `fields` (SPEC 3.1, 3.6, 5.1, 7.1). Each valid
 * key maps to the requirements its column and the operations impose, and
 * each invalid key to a message type, so `tsc` reports the mistake at the
 * key with its reason. The runtime twin is `checkField` in
 * `check-columns.ts`.
 * @packageDocumentation
 */
import type { PublicColumn, PublicTable } from '@netvark/catalog-core';

import type {
  CodecTypeName,
  HasWireForm,
  ResolveColumnType,
} from '../catalog/resolve-type';
import type {
  ColumnName,
  ForeignKeyColumn,
  PrimaryKeyColumn,
  SearchColumn,
} from '../catalog/types';
import type { AccessRequirement, OperationOf } from './access-check';
import type { DeclareContext } from './registries';
import type { KnownMembers, Requirement, RequireWhen } from './requirement';
import type { Declaration, FieldDeclaration } from './types';

type CodecRequirement<
  TContext extends DeclareContext,
  TColumn extends PublicColumn,
  TCodec,
> = TCodec extends string
  ? TCodec extends keyof TContext['codecs']
    ? RequireWhen<
        CodecTypeName<TColumn> extends TContext['codecs'][TCodec]['types'][number]
          ? false
          : true,
        `codec: codec "${TCodec}" does not accept type ${CodecTypeName<TColumn>}`
      >
    : Requirement<`codec: "${TCodec}" is not a codec of createDeclareResource`>
  : HasWireForm<TContext['catalog'], TColumn> extends true
    ? unknown
    : Requirement<`type ${CodecTypeName<TColumn>} has no wire form; name a codec`>;

type UncoveredIn<
  TContext extends DeclareContext,
  TDomain extends string,
> = TDomain extends keyof TContext['catalog']['domains']
  ? {
      [
        K in keyof TContext['catalog']['domains'][TDomain]['constraints']
      ]: TContext['catalog']['domains'][TDomain]['constraints'][K] extends {
        readonly rule: null;
      }
        ? TDomain extends keyof TContext['domains']
          ? K extends keyof TContext['domains'][TDomain]
            ? never
            : `${TDomain}'s CHECK ${K & string}`
          : `${TDomain}'s CHECK ${K & string}`
        : never;
    }[keyof TContext['catalog']['domains'][TDomain]['constraints']]
  : never;

/** The domain CHECKs without a rule on a column's chain that the definer does not cover (SPEC 3.6). */
type UncoveredDomainCheck<
  TContext extends DeclareContext,
  TColumn extends PublicColumn,
> =
  ResolveColumnType<TContext['catalog'], TColumn> extends {
    readonly domains: infer TDomains extends ReadonlyArray<string>;
  }
    ? UncoveredIn<TContext, TDomains[number]>
    : never;

type DomainRequirement<
  TContext extends DeclareContext,
  TColumn extends PublicColumn,
  TAccess,
> = TAccess extends 'read'
  ? unknown
  : TColumn['typeKind'] extends 'domain'
    ? [UncoveredDomainCheck<TContext, TColumn>] extends [never]
      ? unknown
      : Requirement<`domain ${UncoveredDomainCheck<TContext, TColumn>} has no rule; give it a validator in createDeclareResource domains`>
    : unknown;

type FieldMember = keyof FieldDeclaration;

type FieldRequirements<
  TContext extends DeclareContext,
  TColumn extends PublicColumn,
  TOps,
  TField extends FieldDeclaration,
> = KnownMembers<TField, FieldMember, 'a field declaration'> &
  AccessRequirement<TColumn, TOps, TField['access']> &
  CodecRequirement<TContext, TColumn, TField['codec']> &
  DomainRequirement<TContext, TColumn, TField['access']>;

type FieldKeyError<
  TTable extends string,
  TTableDef extends PublicTable,
  TScopeColumn,
  K extends string,
> =
  K extends PrimaryKeyColumn<TTableDef>
    ? `${K} is the primary key, which is the resource id`
    : K extends ForeignKeyColumn<TTableDef>
      ? `${K} is a foreign-key column: declare it under relationships`
      : K extends TScopeColumn
        ? `${K} is the scope column, which the server writes`
        : K extends SearchColumn<TTableDef>
          ? `${K} is a tsvector column: name it in search.column`
          : K extends ColumnName<TTableDef>
            ? never
            : `"${K}" is not a column of ${TTable}`;

/**
 * The columns a field may name: any but the id, a single-column foreign
 * key, the scope column, and a tsvector. One union per declaration, so a
 * valid key costs one comparison and `FieldKeyError` runs only for a
 * mistake.
 */
type FieldColumn<TTableDef extends PublicTable, TScopeColumn> = Exclude<
  ColumnName<TTableDef>,
  | PrimaryKeyColumn<TTableDef>
  | ForeignKeyColumn<TTableDef>
  | TScopeColumn
  | SearchColumn<TTableDef>
>;

/**
 * `fields`, key by key. Valid keys map to their requirements; invalid keys
 * get their message from `FieldKeyErrors`, a separate mapped type built
 * only when there is one. An error branch inside this template costs types
 * for every key even when no key takes it (README, performance notes).
 */
export type FieldsCheck<
  TContext extends DeclareContext,
  TTable extends string,
  TTableDef extends PublicTable,
  TDecl extends Declaration,
  TScopeColumn,
> = {
  readonly [K in keyof TDecl['fields']]: K extends FieldColumn<
    TTableDef,
    TScopeColumn
  >
    ? FieldRequirements<
        TContext,
        TTableDef['columns'][K],
        OperationOf<TDecl>,
        TDecl['fields'][K]
      >
    : unknown;
} & FieldKeyErrors<
  TTable,
  TTableDef,
  TScopeColumn,
  Exclude<keyof TDecl['fields'], FieldColumn<TTableDef, TScopeColumn>>
>;

/** The keys `fields` may not hold, each mapped to why; `unknown` when there is none. */
type FieldKeyErrors<
  TTable extends string,
  TTableDef extends PublicTable,
  TScopeColumn,
  TInvalid,
> = [TInvalid] extends [never]
  ? unknown
  : {
      readonly [K in TInvalid & string]: FieldKeyError<
        TTable,
        TTableDef,
        TScopeColumn,
        K
      >;
    };
