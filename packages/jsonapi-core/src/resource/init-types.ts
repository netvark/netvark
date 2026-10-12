/**
 * What `defineResource` takes (SPEC 5.1): the init whose literal types the
 * definition's names and its client types (SPEC 5.3) are inferred from.
 * @packageDocumentation
 */
import type { Links, Meta } from '../document/types';
import type {
  InferStandardOutput,
  StandardSchema,
} from '../internal/standard-schema-types';
import type { Empty, InferredTypes, MemberOf } from './client-types';
import type { ResourceLinksInit } from './links';
import type {
  QueryCapabilitiesInit,
  RelationshipDefinition,
  ResourceDefinition,
  SerializedRelationships,
} from './types';
import type { ResourceValidators, WritableFieldsInit } from './write-types';

/** The relationships an init declares, by name. */
export type RelationshipsInit = Readonly<
  Record<string, RelationshipDefinition>
>;

/**
 * The attributes `serialize` returns, as typed: a member beyond the
 * declared names must be `never`, so returning one is an error.
 */
type DeclaredAttributes<
  TAttributes,
  TAttribute extends string,
> = TAttributes & {
  readonly [K in Exclude<keyof TAttributes, TAttribute>]: never;
};

/** What an init's `serialize` returns: `SerializedResource` with the attributes' own types kept. */
interface SerializedResourceInit<
  TAttribute extends string,
  TRelationship extends string,
  TAttributes,
> {
  readonly id: string;
  readonly attributes?: DeclaredAttributes<TAttributes, TAttribute> | undefined;
  readonly relationships?: SerializedRelationships<TRelationship>;
  readonly links?: Links | undefined;
  readonly meta?: Meta | undefined;
}

export interface ResourceDefinitionInit<
  TType extends string,
  TAttribute extends string,
  TRelationships extends RelationshipsInit,
  TRow,
  TAttributes,
  TQuery extends QueryCapabilitiesInit<string, string>,
  TValidate extends ResourceValidators<unknown, unknown>,
  TWritable extends WritableFieldsInit<string>,
  TClientIds extends boolean,
> {
  readonly type: TType;
  readonly attributes: ReadonlyArray<TAttribute>;
  readonly relationships?: TRelationships | undefined;
  /**
   * `NoInfer` keeps the field names flowing from `attributes` and
   * `relationships` into `serialize`, never the other way round, so a name
   * used only in `serialize` is an error instead of a silent declaration.
   * The attributes' types are inferred from it, for the client (SPEC 5.3).
   */
  readonly serialize: (
    row: TRow,
  ) => SerializedResourceInit<
    NoInfer<TAttribute>,
    NoInfer<keyof TRelationships & string>,
    TAttributes
  >;
  readonly links?: ResourceLinksInit | undefined;
  readonly query?: TQuery | undefined;
  readonly validate?: TValidate | undefined;
  /** The fields a create and an update may carry; default every field (403 otherwise). */
  readonly writable?: TWritable | undefined;
  /** Accept client-generated ids on create; default false (403). */
  readonly clientIds?: TClientIds | undefined;
}

/**
 * The sort names an init's query declares; `never` without a `sort`. The
 * fallback is the empty tuple, whose element type is `never`: inferring
 * from `never` itself would give the constraint, `string`.
 */
type SortOf<TQuery> =
  MemberOf<TQuery, 'sort', readonly []> extends ReadonlyArray<
    infer TName extends string
  >
    ? TName
    : never;

/** The filter names an init's query declares. */
type FilterOf<TQuery> = keyof MemberOf<TQuery, 'filter', Empty> & string;

/** A write validator's output, `unknown` without one. */
type ValidatedOf<TValidate, TOperation extends 'create' | 'update'> =
  MemberOf<TValidate, TOperation, undefined> extends infer TSchema extends
    StandardSchema
    ? InferStandardOutput<TSchema>
    : unknown;

/** The definition `defineResource` returns for an init of these types. */
export type DefinitionOf<
  TType extends string,
  TAttribute extends string,
  TRelationships extends RelationshipsInit,
  TRow,
  TAttributes,
  TQuery extends QueryCapabilitiesInit<string, string>,
  TValidate extends ResourceValidators<unknown, unknown>,
  TWritable extends WritableFieldsInit<string>,
  TClientIds extends boolean,
> = ResourceDefinition<
  TType,
  TAttribute,
  keyof TRelationships & string,
  TRow,
  SortOf<TQuery>,
  FilterOf<TQuery>,
  ValidatedOf<TValidate, 'create'>,
  ValidatedOf<TValidate, 'update'>,
  InferredTypes<
    TAttribute,
    TRelationships,
    TAttributes,
    TQuery,
    TValidate,
    TWritable,
    TClientIds
  >
>;
