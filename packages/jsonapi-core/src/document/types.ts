/**
 * JSON:API 1.1 document types (SPEC 2). These describe documents on the wire;
 * builders in `document/` produce them and request parsers in `request/`
 * narrow client input to them.
 * @ref https://jsonapi.org/format/1.1/#document-structure
 * @packageDocumentation
 */

/**
 * A meta object: any members.
 * @ref https://jsonapi.org/format/1.1/#document-meta
 */
export type Meta = Readonly<Record<string, unknown>>;

/**
 * A link object.
 * @ref https://jsonapi.org/format/1.1/#document-links-link-object
 */
export interface LinkObject {
  readonly href: string;
  readonly rel?: string | undefined;
  readonly describedby?: Link | undefined;
  readonly title?: string | undefined;
  readonly type?: string | undefined;
  readonly hreflang?: string | ReadonlyArray<string> | undefined;
  readonly meta?: Meta | undefined;
}

/**
 * A link: a URI-reference string, a link object, or `null` when the link
 * does not exist.
 * @ref https://jsonapi.org/format/1.1/#document-links-link
 */
export type Link = string | LinkObject | null;

/** @ref https://jsonapi.org/format/1.1/#document-links */
export type Links = Readonly<Record<string, Link>>;

/**
 * A resource identifier object for an existing resource.
 * @ref https://jsonapi.org/format/1.1/#document-resource-identifier-objects
 */
export interface ResourceIdentifier {
  readonly type: string;
  readonly id: string;
  readonly meta?: Meta | undefined;
}

/**
 * A resource identifier object for a resource created in the same document,
 * identified by `lid` instead of `id`.
 * @ref https://jsonapi.org/format/1.1/#document-resource-identifier-objects
 */
export interface LocalResourceIdentifier {
  readonly type: string;
  readonly lid: string;
  readonly meta?: Meta | undefined;
}

export type AnyResourceIdentifier =
  | ResourceIdentifier
  | LocalResourceIdentifier;

/**
 * Resource linkage: `null` or `[]` when empty, otherwise one identifier or an
 * array of identifiers.
 * @ref https://jsonapi.org/format/1.1/#document-resource-object-linkage
 */
export type ResourceLinkage =
  | null
  | ResourceIdentifier
  | ReadonlyArray<ResourceIdentifier>;

export type ToOneLinkage = ResourceIdentifier | null;
export type ToManyLinkage = ReadonlyArray<ResourceIdentifier>;

/**
 * A relationship object: at least one of `links`, `data`, `meta`.
 * @ref https://jsonapi.org/format/1.1/#document-resource-object-relationships
 */
export interface Relationship {
  readonly links?: Links | undefined;
  readonly data?: ResourceLinkage | undefined;
  readonly meta?: Meta | undefined;
}

export type Attributes = Readonly<Record<string, unknown>>;
export type Relationships = Readonly<Record<string, Relationship>>;

/**
 * A resource object as a server sends it: `type` and `id` are always present.
 * @ref https://jsonapi.org/format/1.1/#document-resource-objects
 */
export interface ResourceObject {
  readonly type: string;
  readonly id: string;
  readonly attributes?: Attributes | undefined;
  readonly relationships?: Relationships | undefined;
  readonly links?: Links | undefined;
  readonly meta?: Meta | undefined;
}

/**
 * The `jsonapi` object.
 * @ref https://jsonapi.org/format/1.1/#document-jsonapi-object
 */
export interface JsonApiObject {
  readonly version?: string | undefined;
  readonly ext?: ReadonlyArray<string> | undefined;
  readonly profile?: ReadonlyArray<string> | undefined;
  readonly meta?: Meta | undefined;
}

/**
 * The `source` member of an error object. It SHOULD carry one of the three.
 * @ref https://jsonapi.org/format/1.1/#error-objects
 */
export interface ErrorSource {
  readonly pointer?: string | undefined;
  readonly parameter?: string | undefined;
  readonly header?: string | undefined;
}

export interface ErrorLinks {
  readonly about?: Link | undefined;
  readonly type?: Link | undefined;
}

/**
 * An error object. Every member is optional on the wire but an object MUST
 * carry at least one; `status` is a string.
 * @ref https://jsonapi.org/format/1.1/#error-objects
 */
export interface ErrorObject {
  readonly id?: string | undefined;
  readonly links?: ErrorLinks | undefined;
  readonly status?: string | undefined;
  readonly code?: string | undefined;
  readonly title?: string | undefined;
  readonly detail?: string | undefined;
  readonly source?: ErrorSource | undefined;
  readonly meta?: Meta | undefined;
}

/** Members every top-level document may carry. */
export interface DocumentBase {
  readonly jsonapi?: JsonApiObject | undefined;
  readonly links?: Links | undefined;
  readonly meta?: Meta | undefined;
}

/**
 * Primary data: one resource object, one identifier, or `null` for single
 * resource requests; arrays for collections.
 * @ref https://jsonapi.org/format/1.1/#document-top-level
 */
export type PrimaryData =
  | ResourceObject
  | ReadonlyArray<ResourceObject>
  | ResourceIdentifier
  | ReadonlyArray<ResourceIdentifier>
  | null;

/** A document whose top level carries `data` (and so may carry `included`). */
export interface DataDocument<
  TData extends PrimaryData = PrimaryData,
> extends DocumentBase {
  readonly data: TData;
  readonly included?: ReadonlyArray<ResourceObject> | undefined;
}

/** A document whose top level carries `errors`; never `data` or `included`. */
export interface ErrorDocument extends DocumentBase {
  readonly errors: ReadonlyArray<ErrorObject>;
}

/** A document carrying only `meta` (plus `links` and `jsonapi`). */
export interface MetaDocument extends DocumentBase {
  readonly meta: Meta;
}

/**
 * A document whose only members besides the base ones are extension
 * members (`namespace:name`), such as `atomic:results`.
 * @ref https://jsonapi.org/format/1.1/#extension-members
 */
export interface ExtensionDocument extends DocumentBase {
  readonly [member: `${string}:${string}`]: unknown;
}

export type Document =
  | DataDocument
  | ErrorDocument
  | MetaDocument
  | ExtensionDocument;

export type ResourceDocument = DataDocument<ResourceObject | null>;
export type CollectionDocument = DataDocument<ReadonlyArray<ResourceObject>>;
export type ToOneRelationshipDocument = DataDocument<ToOneLinkage>;
export type ToManyRelationshipDocument = DataDocument<ToManyLinkage>;
