/**
 * The type of `fields` (SPEC 8), the type-level twin of `field-meta.ts`:
 * each public name to a `FieldMeta` whose facts the declaration and the
 * catalog decide, the fields and then the relationships. Computed only
 * where `fields` is read, so declaring a resource costs nothing here.
 * @packageDocumentation
 */
import type { PublicTable } from '@netvark/catalog-core';
import type { Operator } from '@netvark/keyset-core';

import type { ResolveColumnType } from '../catalog/resolve-type';
import type { DeclareContext } from '../declare/registries';
import type { Declaration, DeclaredMembers, MemberOf } from '../declare/types';
import type { FieldNameOf, RelationshipNameOf } from '../names/public-names';
import type { IsNullable, IsRequired } from '../schema/member-types';
import type {
  ColumnOf,
  ColumnRules,
  Creatable,
  TableDefOf,
  TargetType,
} from '../schema/resource-types';
import type { ColumnOptions } from '../schema/value-types';
import type { FieldFacts, FieldMeta, ItemMeta } from './types';

type Fields<TDecl extends Declaration> = TDecl['fields'];
type Relationships<TDecl extends Declaration> = DeclaredMembers<
  TDecl,
  'relationships'
>;

type Simplify<TValue> = { [K in keyof TValue]: TValue[K] };

/** `FieldMeta` of facts computed from a declaration, which TypeScript relates to `FieldFacts` once instantiated. */
type MetaOf<TFacts> = TFacts extends FieldFacts ? FieldMeta<TFacts> : FieldMeta;

/** Whether a create must carry a member: an access `create` takes, over a column required on insert. */
type RequiredOf<
  TContext extends DeclareContext,
  TTableDef extends PublicTable,
  TColumn extends keyof TTableDef['columns'] & string,
  TAccess,
> = TAccess extends Creatable
  ? IsRequired<TContext['catalog'], TTableDef, TColumn>
  : false;

/** The operators a member declares, or none. */
type FilterOf<TMember> =
  MemberOf<TMember, 'filter'> extends infer TFilter extends
    ReadonlyArray<Operator>
    ? TFilter
    : readonly [];

/** A value's options and elements, from its column's options. */
type ValueFacts<TOptions> = TOptions extends {
  readonly array: false;
  readonly options: infer TValue;
}
  ? { readonly options: TValue; readonly items: null }
  : TOptions extends {
        readonly array: true;
        readonly options: infer TElement extends ReadonlyArray<string> | null;
      }
    ? { readonly options: null; readonly items: ItemMeta<TElement> }
    : {
        readonly options: ReadonlyArray<string> | null;
        readonly items: ItemMeta | null;
      };

type ColumnFacts<
  TContext extends DeclareContext,
  TTableDef extends PublicTable,
  TColumn extends keyof TTableDef['columns'] & string,
> = ValueFacts<
  ColumnOptions<
    TContext['catalog'],
    TTableDef['columns'][TColumn],
    ColumnRules<TTableDef, TColumn>
  >
>;

/** A relationship's id: `true` or `false` for a `bool` key, its key's options otherwise (SPEC 3.4). */
type IdFacts<
  TContext extends DeclareContext,
  TTableDef extends PublicTable,
  TColumn extends keyof TTableDef['columns'] & string,
> =
  ResolveColumnType<
    TContext['catalog'],
    TTableDef['columns'][TColumn]
  > extends { readonly type: 'bool' }
    ? {
        readonly options: ReadonlyArray<'true' | 'false'>;
        readonly items: null;
      }
    : ColumnFacts<TContext, TTableDef, TColumn>;

/** A codec field's value, which its codec's schema describes. */
interface CodecFacts {
  readonly options: null;
  readonly items: null;
}

type AttributeMeta<
  TContext extends DeclareContext,
  TTableDef extends PublicTable,
  TColumn extends keyof TTableDef['columns'] & string,
  TField,
> = MetaOf<
  Simplify<
    {
      readonly name: FieldNameOf<TColumn, TField>;
      readonly column: TColumn;
      readonly kind: 'attribute';
      readonly access: MemberOf<TField, 'access'>;
      readonly nullable: IsNullable<TContext['catalog'], TTableDef, TColumn>;
      readonly required: RequiredOf<
        TContext,
        TTableDef,
        TColumn,
        MemberOf<TField, 'access'>
      >;
      readonly target: null;
      readonly filter: FilterOf<TField>;
      readonly sortable: MemberOf<TField, 'sort'> extends true ? true : false;
      readonly codec: MemberOf<TField, 'codec'> extends infer TCodec extends
        string
        ? TCodec
        : null;
    } & (MemberOf<TField, 'codec'> extends string
      ? CodecFacts
      : ColumnFacts<TContext, TTableDef, TColumn>)
  >
>;

type RelationshipMeta<
  TContext extends DeclareContext,
  TTableDef extends PublicTable,
  TColumn extends keyof TTableDef['columns'] & string,
  TRelationship,
> = MetaOf<
  Simplify<
    {
      readonly name: RelationshipNameOf<TColumn, TRelationship>;
      readonly column: TColumn;
      readonly kind: 'relationship';
      readonly access: MemberOf<TRelationship, 'access'>;
      readonly nullable: IsNullable<TContext['catalog'], TTableDef, TColumn>;
      readonly required: RequiredOf<
        TContext,
        TTableDef,
        TColumn,
        MemberOf<TRelationship, 'access'>
      >;
      readonly target: TargetType<TRelationship>;
      readonly filter: FilterOf<TRelationship>;
      readonly sortable: false;
      readonly codec: null;
    } & IdFacts<TContext, TTableDef, TColumn>
  >
>;

type FieldsOf<
  TContext extends DeclareContext,
  TTableDef extends PublicTable,
  TDecl extends Declaration,
> = Simplify<
  {
    readonly [
      K in keyof Fields<TDecl> & string as FieldNameOf<K, Fields<TDecl>[K]>
    ]: AttributeMeta<
      TContext,
      TTableDef,
      ColumnOf<TTableDef, K>,
      Fields<TDecl>[K]
    >;
  } & {
    readonly [
      K in keyof Relationships<TDecl> & string as RelationshipNameOf<
        K,
        Relationships<TDecl>[K]
      >
    ]: RelationshipMeta<
      TContext,
      TTableDef,
      ColumnOf<TTableDef, K>,
      Relationships<TDecl>[K]
    >;
  }
>;

/** The metadata of each member of the resource `TDecl` declares over `TTable`. */
export type TypedFields<
  TContext extends DeclareContext,
  TTable extends string,
  TDecl extends Declaration,
> = FieldsOf<TContext, TableDefOf<TContext, TTable>, TDecl>;
