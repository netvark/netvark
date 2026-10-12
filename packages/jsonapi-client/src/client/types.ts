/**
 * The clients `createClients` returns (SPEC 15.4): a `ResourceClient` per
 * definition, its calls typed by the definition's client types (SPEC 5.3)
 * and its records by `RecordOf` over the definitions passed, which resolve
 * related types. Nothing here is checked at run time: the server stays the
 * authority and answers what the types would have caught.
 * @ref https://jsonapi.org/format/1.1/#crud
 * @packageDocumentation
 */
import type {
  AnyResource,
  ClientRelationship,
  JsonApiObject,
  Links,
  Meta,
  TypesOf,
} from '@netvark/jsonapi-core';

import type { AnyRecord, Identifier } from '../document/types';
import type { KnownDefinition, Simplify } from '../internal/definition-types';
import type { GetQuery, ListQuery } from '../query/types';
import type { CallOptions } from '../transport/send';
import type { RecordOf } from './record-types';

/** What a read resolves to: the status, the data, and the document's `links`, `meta`, and `jsonapi`. */
export interface ReadResult<TData> {
  readonly status: number;
  readonly data: TData;
  readonly links: Links | undefined;
  readonly meta: Meta | undefined;
  readonly jsonapi: JsonApiObject | undefined;
}

/**
 * What a write resolves to. `data` is `undefined` when the response holds
 * none: a 202, a 204, or a 200 with `meta` alone.
 */
export interface WriteResult<TData> {
  readonly status: number;
  readonly data: TData | undefined;
  readonly links: Links | undefined;
  readonly meta: Meta | undefined;
  readonly jsonapi: JsonApiObject | undefined;
}

/** A resource identifier object as a relationship document holds it: `type`, `id`, and its `meta`. */
export interface IdentifierObject<
  TType extends string = string,
> extends Identifier<TType> {
  readonly meta?: Meta | undefined;
}

type RelationshipsOf<TDefinition> = TypesOf<TDefinition>['relationships'];

type RelationshipName<TDefinition> = keyof RelationshipsOf<TDefinition> &
  string;

/** The to-many relationships: what `addToRelationship` and `removeFromRelationship` take. */
type ToManyName<TDefinition> = {
  readonly [
    K in RelationshipName<TDefinition>
  ]: 'many' extends RelationshipsOf<TDefinition>[K]['cardinality'] ? K : never;
}[RelationshipName<TDefinition>];

/** `TOne` for a to-one, `TMany` for a to-many, either for a relationship typed wide. */
type ByCardinality<TCardinality, TOne, TMany> = TCardinality extends 'one'
  ? TOne
  : TMany;

/**
 * A relationship's value in a write: an id, which becomes an identifier of
 * the relationship's type, or an identifier object; `null` empties a
 * to-one, and a to-many takes a list.
 */
export type LinkageInput<
  TRelationship extends ClientRelationship = ClientRelationship,
> = ByCardinality<
  TRelationship['cardinality'],
  string | Identifier<TRelationship['type']> | null,
  ReadonlyArray<string | Identifier<TRelationship['type']>>
>;

/** A relationship's linkage as a relationship document holds it. */
type LinkageOf<TRelationship extends ClientRelationship> = ByCardinality<
  TRelationship['cardinality'],
  IdentifierObject<TRelationship['type']> | null,
  ReadonlyArray<IdentifierObject<TRelationship['type']>>
>;

/** The related type's definition among those passed; `AnyResource` when none has it. */
type RelatedDefinition<TDefinitions, TDefinition, TName extends string> =
  KnownDefinition<
    TDefinitions[keyof TDefinitions] | TDefinition,
    RelationshipsOf<TDefinition>[TName]['type']
  > extends infer TKnown
    ? [TKnown] extends [never]
      ? AnyResource
      : TKnown
    : never;

/** What `related` resolves to: the related record or `null` for a to-one, the records for a to-many. */
type RelatedData<
  TDefinitions,
  TDefinition,
  TName extends string,
  TQuery,
> = ByCardinality<
  RelationshipsOf<TDefinition>[TName]['cardinality'],
  RecordOf<
    TDefinitions,
    RelatedDefinition<TDefinitions, TDefinition, TName>,
    TQuery
  > | null,
  ReadonlyArray<
    RecordOf<
      TDefinitions,
      RelatedDefinition<TDefinitions, TDefinition, TName>,
      TQuery
    >
  >
>;

/**
 * `attributes`, required when the write's input has a required member;
 * `never` for an operation the definition does not serve, so no input
 * compiles.
 */
type AttributesMember<TAttributes> = [TAttributes] extends [never]
  ? { readonly attributes: never }
  : Partial<TAttributes> extends TAttributes
    ? { readonly attributes?: TAttributes | undefined }
    : { readonly attributes: TAttributes };

/**
 * The relationships a write may carry, by the names its writable list
 * holds; `never` when it holds none, since an object type without members
 * would accept any relationship.
 */
type WritableRelationships<TDefinition, TWritable extends string> = [
  RelationshipName<TDefinition> & TWritable,
] extends [never]
  ? never
  : {
      readonly [K in RelationshipName<TDefinition> & TWritable]?:
        | LinkageInput<RelationshipsOf<TDefinition>[K]>
        | undefined;
    };

/**
 * What `create` sends: the create validator's input as `attributes`, the
 * relationships `creatable` names, and `id` where the definition takes
 * client ids.
 */
export type CreateInput<TDefinition> = Simplify<
  AttributesMember<TypesOf<TDefinition>['create']> & {
    readonly id?:
      | (TypesOf<TDefinition>['clientIds'] extends false ? never : string)
      | undefined;
    readonly relationships?:
      | WritableRelationships<TDefinition, TypesOf<TDefinition>['creatable']>
      | undefined;
  }
>;

/** What `update` sends: the update validator's input as `attributes`, and the relationships `updatable` names. */
export type UpdateInput<TDefinition> = Simplify<
  AttributesMember<TypesOf<TDefinition>['update']> & {
    readonly relationships?:
      | WritableRelationships<TDefinition, TypesOf<TDefinition>['updatable']>
      | undefined;
  }
>;

/** A call's query left out: no members, so nothing is included and every field is there. */
// oxlint-disable-next-line typescript/no-generated-empty-object-type -- reason: a query left out must have no members at all, so it names no include path and no fieldset; `undefined` does not satisfy the query constraint a type parameter's default must meet
type NoQuery = Readonly<Record<never, never>>;

/**
 * The calls of one resource (SPEC 15.4). A literal query passed to `list`,
 * `get`, or `related` is read as a constant, so its include paths and
 * fieldsets type the records exactly.
 */
export interface ResourceClient<TDefinitions, TDefinition> {
  /** `GET <collection>?<query>`: a page of records. */
  list<const TQuery extends ListQuery<TDefinitions, TDefinition> = NoQuery>(
    query?: TQuery,
    options?: CallOptions,
  ): Promise<
    ReadResult<ReadonlyArray<RecordOf<TDefinitions, TDefinition, TQuery>>>
  >;
  /** `GET <resource>?<query>`, sending `include` and `fields`: one record. */
  get<const TQuery extends GetQuery<TDefinitions, TDefinition> = NoQuery>(
    id: string,
    query?: TQuery,
    options?: CallOptions,
  ): Promise<ReadResult<RecordOf<TDefinitions, TDefinition, TQuery>>>;
  /** `POST <collection>`: the record the server stored, `undefined` without one. */
  create(
    input: CreateInput<TDefinition>,
    options?: CallOptions,
  ): Promise<WriteResult<RecordOf<TDefinitions, TDefinition>>>;
  /** `PATCH <resource>`: the record as updated, `undefined` without one. */
  update(
    id: string,
    input: UpdateInput<TDefinition>,
    options?: CallOptions,
  ): Promise<WriteResult<RecordOf<TDefinitions, TDefinition>>>;
  /** `DELETE <resource>`. */
  remove(id: string, options?: CallOptions): Promise<WriteResult<undefined>>;
  /** `GET <relationship link>`: the linkage. */
  relationship<TName extends RelationshipName<TDefinition>>(
    id: string,
    name: TName,
    options?: CallOptions,
  ): Promise<ReadResult<LinkageOf<RelationshipsOf<TDefinition>[TName]>>>;
  /** `GET <related link>?<query>`, sending `include` and `fields`: the related record, `null`, or records. */
  related<
    TName extends RelationshipName<TDefinition>,
    const TQuery extends GetQuery<
      TDefinitions,
      RelatedDefinition<TDefinitions, TDefinition, TName>
    > = NoQuery,
  >(
    id: string,
    name: TName,
    query?: TQuery,
    options?: CallOptions,
  ): Promise<ReadResult<RelatedData<TDefinitions, TDefinition, TName, TQuery>>>;
  /** `PATCH <relationship link>`: replaces the linkage. */
  setRelationship<TName extends RelationshipName<TDefinition>>(
    id: string,
    name: TName,
    linkage: LinkageInput<RelationshipsOf<TDefinition>[TName]>,
    options?: CallOptions,
  ): Promise<WriteResult<LinkageOf<RelationshipsOf<TDefinition>[TName]>>>;
  /** `POST <relationship link>`: adds to a to-many's linkage. */
  addToRelationship<TName extends ToManyName<TDefinition>>(
    id: string,
    name: TName,
    linkage: LinkageInput<RelationshipsOf<TDefinition>[TName]>,
    options?: CallOptions,
  ): Promise<WriteResult<LinkageOf<RelationshipsOf<TDefinition>[TName]>>>;
  /** `DELETE <relationship link>`: removes from a to-many's linkage. */
  removeFromRelationship<TName extends ToManyName<TDefinition>>(
    id: string,
    name: TName,
    linkage: LinkageInput<RelationshipsOf<TDefinition>[TName]>,
    options?: CallOptions,
  ): Promise<WriteResult<LinkageOf<RelationshipsOf<TDefinition>[TName]>>>;
  /** `GET` of a page's `links.next`; `undefined` when it has none. */
  next<TRecord extends AnyRecord>(
    result: ReadResult<ReadonlyArray<TRecord>>,
    options?: CallOptions,
  ): Promise<ReadResult<ReadonlyArray<TRecord>> | undefined>;
  /** `GET` of a page's `links.prev`; `undefined` when it has none. */
  prev<TRecord extends AnyRecord>(
    result: ReadResult<ReadonlyArray<TRecord>>,
    options?: CallOptions,
  ): Promise<ReadResult<ReadonlyArray<TRecord>> | undefined>;
}

/** A client per definition, by the name it was passed under. */
export type Clients<TDefinitions> = {
  readonly [K in keyof TDefinitions]: ResourceClient<
    TDefinitions,
    TDefinitions[K]
  >;
};
