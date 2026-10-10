/**
 * Resource definition types (SPEC 5). A definition names a resource type,
 * its fields, and how a row of the application's own data becomes a resource
 * object; everything else in the package reads from it.
 * @ref https://jsonapi.org/format/1.1/#document-resource-objects
 * @packageDocumentation
 */
import type {
  Attributes,
  Links,
  Meta,
  ResourceIdentifier,
} from '../document/types';
import type { StandardSchema } from '../internal/standard-schema-types';
import type { ResourceLinks, ResourceLinksInit } from './links';

export type Cardinality = 'one' | 'many';

export interface RelationshipDefinition {
  /** The related resource type, used for identifier objects built from ids. */
  readonly type: string;
  readonly cardinality: Cardinality;
  /**
   * The related definition, read lazily so definitions can reference each
   * other. Required for `include` paths through this relationship and for
   * `fields[type]` on the related type.
   */
  readonly resource?: (() => AnyResource) | undefined;
}

/**
 * Linkage as `serialize` may return it: ids are turned into identifier
 * objects with the relationship's declared type; identifier objects pass
 * through for polymorphic relationships.
 */
export type LinkageInit =
  | string
  | null
  | ReadonlyArray<string>
  | ResourceIdentifier
  | ReadonlyArray<ResourceIdentifier>;

/** The relationship object form, for relationships with links or meta. */
export interface RelationshipInit {
  readonly data?: LinkageInit | undefined;
  readonly links?: Links | undefined;
  readonly meta?: Meta | undefined;
}

export type SerializedRelationship = LinkageInit | RelationshipInit;

/**
 * The attributes `serialize` may return: a subset of the declared names.
 * With no attributes declared the member must be absent, so a definition
 * cannot emit an undeclared field unnoticed.
 */
export type SerializedAttributes<TAttribute extends string> = [
  TAttribute,
] extends [never]
  ? undefined
  : Readonly<Partial<Record<TAttribute, unknown>>> | undefined;

/** The relationships `serialize` may return: a subset of the declared names. */
export type SerializedRelationships<TRelationship extends string> = [
  TRelationship,
] extends [never]
  ? undefined
  :
      | Readonly<Partial<Record<TRelationship, SerializedRelationship>>>
      | undefined;

/** What `serialize` returns: the resource object without its `type`. */
export interface SerializedResource<
  TAttribute extends string,
  TRelationship extends string,
> {
  readonly id: string;
  readonly attributes?: SerializedAttributes<TAttribute>;
  readonly relationships?: SerializedRelationships<TRelationship>;
  readonly links?: Links | undefined;
  readonly meta?: Meta | undefined;
}

export interface PageCapabilitiesInit {
  /** Default page size; default `min(20, max)`. */
  readonly default?: number | undefined;
  /** Max page size; default 100. */
  readonly max?: number | undefined;
  /** Whether `page[after]` and `page[before]` may be combined; default false. */
  readonly range?: boolean | undefined;
}

export interface PageCapabilities {
  readonly default: number;
  readonly max: number;
  readonly range: boolean;
}

export interface QueryCapabilitiesInit<
  TSort extends string,
  TFilter extends string,
> {
  /** Sort field names, with or without a relationship path. */
  readonly sort?: ReadonlyArray<TSort> | undefined;
  /** Filterable field names, each with the operators it accepts. */
  readonly filter?:
    | Readonly<Record<TFilter, ReadonlyArray<string>>>
    | undefined;
  /** Relationship paths clients may include. */
  readonly include?: ReadonlyArray<string> | undefined;
  /** Whether `fields[type]` is accepted; default true. */
  readonly fields?: boolean | undefined;
  /** Cursor pagination; absent or `false` rejects every `page` parameter. */
  readonly page?: PageCapabilitiesInit | false | undefined;
  /** The free-text search parameter, `filter[<member>]` or a custom base name. */
  readonly search?: string | undefined;
  /** Implementation-specific base names, each with a non a-z character. */
  readonly custom?: ReadonlyArray<string> | undefined;
}

export interface SearchParameter {
  /** The parameter name as the client sends it. */
  readonly parameter: string;
  readonly family: string;
  readonly member: string | undefined;
}

export interface QueryCapabilities<
  TSort extends string,
  TFilter extends string,
> {
  readonly sort: ReadonlyArray<TSort>;
  readonly filter: Readonly<Record<TFilter, ReadonlyArray<string>>>;
  readonly include: ReadonlyArray<string>;
  readonly fields: boolean;
  readonly page: PageCapabilities | undefined;
  readonly search: SearchParameter | undefined;
  readonly custom: ReadonlyArray<string>;
}

export interface ResourceValidators<TCreate, TUpdate> {
  /** Validates the attributes of a `POST` or atomic `add`. */
  readonly create?: StandardSchema<unknown, TCreate> | undefined;
  /** Validates the attributes of a `PATCH` or atomic `update`. */
  readonly update?: StandardSchema<unknown, TUpdate> | undefined;
}

export interface ResourceDefinitionInit<
  TType extends string,
  TAttribute extends string,
  TRelationship extends string,
  TRow,
  TSort extends string,
  TFilter extends string,
  TCreate,
  TUpdate,
> {
  readonly type: TType;
  readonly attributes: ReadonlyArray<TAttribute>;
  readonly relationships?:
    | Readonly<Record<TRelationship, RelationshipDefinition>>
    | undefined;
  /**
   * `NoInfer` keeps the field names flowing from `attributes` and
   * `relationships` into `serialize`, never the other way round, so a name
   * used only in `serialize` is an error instead of a silent declaration.
   */
  readonly serialize: (
    row: TRow,
  ) => SerializedResource<NoInfer<TAttribute>, NoInfer<TRelationship>>;
  readonly links?: ResourceLinksInit | undefined;
  readonly query?: QueryCapabilitiesInit<TSort, TFilter> | undefined;
  readonly validate?: ResourceValidators<TCreate, TUpdate> | undefined;
  /** Accept client-generated ids on create; default false (403). */
  readonly clientIds?: boolean | undefined;
}

export interface ResourceDefinition<
  TType extends string,
  TAttribute extends string,
  TRelationship extends string,
  TRow,
  TSort extends string,
  TFilter extends string,
  TCreate,
  TUpdate,
> {
  readonly type: TType;
  readonly attributes: ReadonlyArray<TAttribute>;
  readonly relationships: Readonly<
    Record<TRelationship, RelationshipDefinition>
  >;
  /** Attribute and relationship names: the resource's fields. */
  readonly fields: ReadonlySet<string>;
  /**
   * Declared as a method so a definition over a concrete row type is
   * assignable to `AnyResource`; callers pair rows with their definition.
   */
  serialize(row: TRow): SerializedResource<TAttribute, TRelationship>;
  readonly links: ResourceLinks;
  readonly query: QueryCapabilities<TSort, TFilter>;
  readonly validate: ResourceValidators<TCreate, TUpdate>;
  readonly clientIds: boolean;
}

/** Any definition, for registries and generic document code. */
export type AnyResource = ResourceDefinition<
  string,
  string,
  string,
  unknown,
  string,
  string,
  unknown,
  unknown
>;

/** The relationship names a definition declares. */
export type RelationshipNameOf<TResource> =
  TResource extends ResourceDefinition<
    string,
    string,
    infer TRelationship,
    unknown,
    string,
    string,
    unknown,
    unknown
  >
    ? TRelationship
    : never;

/** The row type a definition serializes. */
export type RowOf<TResource> = TResource extends {
  serialize(row: infer TRow): unknown;
}
  ? TRow
  : never;

/** The attributes a definition's create validator produces, else any attributes. */
export type CreateAttributesOf<TResource> =
  TResource extends ResourceDefinition<
    string,
    string,
    string,
    unknown,
    string,
    string,
    infer TCreate,
    unknown
  >
    ? unknown extends TCreate
      ? Attributes
      : TCreate
    : Attributes;

/** The attributes a definition's update validator produces, else any attributes. */
export type UpdateAttributesOf<TResource> =
  TResource extends ResourceDefinition<
    string,
    string,
    string,
    unknown,
    string,
    string,
    unknown,
    infer TUpdate
  >
    ? unknown extends TUpdate
      ? Attributes
      : TUpdate
    : Attributes;
