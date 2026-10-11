# @netvark/jsonapi-core: implementation specification

- Status: normative for the 0.x line of `@netvark/jsonapi-core` and `@netvark/hono-jsonapi`;
  `docs/jsonapi/DESIGN.md` explains the why

The key words MUST, MUST NOT, SHOULD, and MAY are used as in RFC 2119. Every section names the
source file that implements it and the tests that prove it. When this document and the code
disagree, fix one of them in the same pull request. Clause references are to
[JSON:API 1.1](https://jsonapi.org/format/1.1/) unless a profile, extension, or RFC is named.

Contents

1. Public surface and module map
2. Documents
3. Media types and negotiation
4. Errors
5. Resource definitions
6. Query parsing
7. Document building
8. Cursor pagination
9. Request documents
10. Hono integration (`@netvark/hono-jsonapi`)
11. Atomic operations
12. Packaging
13. Constants
14. Test plan

---

## 1. Public surface and module map

Two packages, one repository (ADR 0013). `@netvark/jsonapi-core` is the framework-free core: every
module is a function over plain values (strings, parsed JSON, `URL`s) and none imports a web
framework or a runtime API beyond web standards. `@netvark/hono-jsonapi` is the Hono adapter: it
depends on `@netvark/jsonapi-core`, re-exports all of it (one import for a Hono application), and
adds the middleware, validators, response helpers, error handlers, and the operations endpoint
(sections 10 and 11.1). Errors are [@netvark/ban-core](https://github.com/netvark/netvark) errors
(ADR 0014): `@netvark/jsonapi-core` depends on `@netvark/ban-core` and on nothing else;
`@netvark/hono-jsonapi` has two peer dependencies, `hono` and `@netvark/hono-ban`,
@netvark/ban-core's Hono adapter, through which its error handler renders (ADR 0002). Validators are
consumed through Standard Schema V1, whose interfaces are vendored in
`packages/jsonapi-core/src/internal/standard-schema-types.ts`, so installing either package never
pulls in Zod, Valibot, ArkType, or Ajv.

| Subpath                        | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@netvark/jsonapi-core`        | Values: `defineResource`, `createDefineResource`, `relatedResource`, `serializeResource`, `applyFields`, `identify`, `resourceDocument`, `collectionDocument`, `toOneRelationshipDocument`, `toManyRelationshipDocument`, `include`, `jsonApiObject`, `assertFullLinkage`, `isMemberName`, `isMemberPath`, `isAtMember`, `isExtensionMemberName`, `assertMemberName`, `BanError`, `isBanError`, `jsonApiBan`, `jsonApiError`, `errorItem`, `errorObjects`, `errorDocument`, `ERROR_CATALOG`, `ERROR_CODES`, `parseMediaType`, `parseAccept`, `isJsonApiMediaType`, `jsonApiParameters`, `formatJsonApiMediaType`, `negotiate`, `parseQuery`, `paginatedDocument`, `paginationLinks`, `pageMeta`, `itemCursorMeta`, `maxPageSizeExceededError`, `unsupportedSortError`, `unsupportedSort`, `rangePaginationNotSupportedError`, `invalidCursorError`, `invalidCursor`, `UNSUPPORTED_SORT_TYPE`, `MAX_SIZE_EXCEEDED_TYPE`, `RANGE_PAGINATION_NOT_SUPPORTED_TYPE`, `parseIdentifier`, `parseLinkage`, `parseResourceObject`, `parseCreateDocument`, `parseUpdateDocument`, `primaryData`, `parseToOneRelationshipDocument`, `parseToManyRelationshipDocument`, `toOneLinkage`, `toManyLinkage`, `JSON_API_MEDIA_TYPE`, `JSON_API_VERSION`, `ATOMIC_OPERATIONS_EXTENSION`, `CURSOR_PAGINATION_PROFILE`; and every type in sections 2, 3, 4, 5, 6.1, 7.2, 8, 9, with `Ban`, `BanError`, `ErrorItem`, and `ErrorStatusCode` re-exported from `@netvark/ban-core` |
| `@netvark/jsonapi-core/atomic` | `operationsProcessor`, `assertOperationsContentType`, `parseOperationsDocument`, and the types `AtomicOptions`, `ResourceHandlers`, `AnyResourceHandlers`, `RelationshipHandlers`, `OperationContext`, `OperationTarget`, `OperationCode`, `OperationResult`, `OperationsOutcome`, `OperationsProcessor`, `OperationsResultDocument`, `ResolvedResourceObject`, `RawOperation`, `MaybePromise`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `@netvark/hono-jsonapi`        | Everything of `@netvark/jsonapi-core` (the same bindings), plus `jsonApi`, `respond`, `respondError`, `isJsonApiResponse`, `varyAccept`, `readDocument`, `queryValidator`, `bodyValidator`, `relationshipValidator`, `errorHandler`, `notFoundHandler`; and every type in section 10                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `@netvark/hono-jsonapi/atomic` | Everything of `@netvark/jsonapi-core/atomic`, plus `atomicOperations`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

`e2e/jsonapi/package-surface.e2e.test.ts` asserts the exact value export list of all four subpaths
against the built packages, and that the adapter's re-exports are the core's own bindings.

Source layout. Every module with behavior has a sibling `*.test.ts`; contract types have
`*.test-d.ts`. Type-only modules (`types.ts` files, `standard-schema-types.ts`) and modules reached
only through their consumers (`input.ts`, `registry.ts`, `identifiers.ts`, `resource-members.ts`,
`format.ts`, `linkage.ts`, `query-capabilities.ts`, the atomic executors) are covered through those
consumers; coverage thresholds apply to all of `packages/*/src/`. Imports form a DAG
(`import/no-cycle` is enforced, type-only imports included); nothing under `packages/jsonapi-core`
imports `hono`, and `packages/hono-jsonapi` imports the core only through its package name.

```
packages/jsonapi-core/src/
  index.ts                       root entry
  internal/
    constants.ts                 section 13
    object.ts                    isRecord(), ownMember(), hasOwnMember(), ownEntry(), ownKeys(), compact(): prototype-safe reads
    pointer.ts                   pointer(), escapePointerToken(), pathFromPointer(): RFC 6901
    standard-schema-types.ts     vendored Standard Schema V1 interfaces
  media-type/
    parse.ts                     parseMediaType(), parseAccept() (3.1)
    format.ts                    formatMediaType(), quoteParameterValue() (3.1)
    json-api.ts                  isJsonApiMediaType(), jsonApiParameters(), formatJsonApiMediaType() (3.2)
  negotiate/negotiate.ts         negotiate() (3.3)
  errors/
    catalog.ts                   ERROR_CATALOG, ERROR_CODES (4.1)
    json-api-error.ts            jsonApiBan, jsonApiError(), errorItem(), errorObjects(), errorDocument() (4.2)
  document/
    types.ts                     section 2
    member-name.ts               2.1
    serialize.ts                 serializeResource(), applyFields(), identify() (7.1)
    build.ts                     resourceDocument(), collectionDocument(), relationship documents, include(), jsonApiObject() (7.2)
    linkage.ts                   assertFullLinkage() (7.3)
  resource/
    types.ts                     section 5
    write-types.ts               ResourceValidators, WritableFieldsInit, WritableFields (5)
    define-resource.ts           defineResource(), relatedResource() (5.1)
    links.ts                     resolveLinks(): the links convention and its types (5.1)
    create-define-resource.ts    createDefineResource() (5.1)
    query-capabilities.ts        query capability resolution (5.2)
  query/
    types.ts                     ParsedQuery and friends (6.1)
    input.ts                     toPairs(), groupByName() (6.1)
    parameter-name.ts            parseParameterName() (6.2)
    registry.ts                  registryOf(), resolveIncludePath() (6.3)
    parse-families.ts            include, fields, sort, page (6.4 to 6.7)
    parse-filter.ts              filter (6.8)
    parse-query.ts               parseQuery() (6)
  pagination/
    paginated.ts                 paginatedDocument() (8.1)
    links.ts                     paginationLinks(), pageMeta(), itemCursorMeta() (8.2, 8.3)
    errors.ts                    the profile's error objects (8.4)
  request/
    types.ts                     RequestDocument, RequestResourceObject, ParseResourceOptions (9.2)
    identifiers.ts               parseIdentifier(), parseLinkage() (9.1)
    resource-members.ts          identity, attribute names, relationships of a request resource object (9.2)
    resource-document.ts         parseResourceObject(), parseCreateDocument(), parseUpdateDocument(), primaryData() (9.2)
    relationship-document.ts     parseToOneRelationshipDocument(), parseToManyRelationshipDocument() (9.3)
    cardinality.ts               toOneLinkage(), toManyLinkage() (9.4)
  atomic/
    index.ts                     subpath entry
    types.ts                     section 11
    process.ts                   operationsProcessor() (11.1)
    content-type.ts              assertOperationsContentType() (11.1)
    parse-document.ts            parseOperationsDocument() (11.2)
    parse-target.ts              ref and href (11.2)
    parse-support.ts             ParseDocumentOptions, unknownMembers()
    lids.ts                      Lids (11.3)
    execute.ts                   executeOperation() (11.4)
    execute-resource.ts          create(), update(), remove() (11.4)
    execute-relationship.ts      relationship() (11.4)
    execute-support.ts           shared lookups and checks (11.4)
    test-fixtures.ts             the store and handlers the atomic tests share; not published
    test-run.ts                  the outcome runner the atomic tests share; not published
  test-support/
    jsonapi-schema-1-0.ts        the official JSON:API 1.0 JSON Schema, vendored; not published
    conformance.ts               schemaErrors(): Ajv over the schema with the 1.1 deltas; not published
packages/hono-jsonapi/src/
  index.ts                       root entry: re-exports @netvark/jsonapi-core, adds section 10
  internal/object.ts             isRecord(), ownMember(): the two prototype-safe reads respond() needs
  types.ts                       JsonApiEnv, JsonApiContext (10.1)
  middleware.ts                  jsonApi() (10.1)
  respond.ts                     respond(), respondError(), isJsonApiResponse(), varyAccept() (10.2)
  body.ts                        readDocument() (10.3)
  validators.ts                  queryValidator(), bodyValidator(), relationshipValidator() (10.4)
  handlers.ts                    errorHandler(), notFoundHandler() (10.5)
  atomic/
    index.ts                     subpath entry: re-exports @netvark/jsonapi-core/atomic, adds atomicOperations
    handler.ts                   atomicOperations() (11.1)
```

---

## 2. Documents (`document/types.ts`)

Types mirror the specification's document structure (`#document-structure`). All members are
`readonly`; optional members are `?: T | undefined` so a builder can pass `undefined` and
`compact()` removes it before serialization.

- `Meta = Readonly<Record<string, unknown>>`; `Link = string | LinkObject | null`;
  `LinkObject { href; rel?; describedby?; title?; type?; hreflang?: string | ReadonlyArray<string>; meta? }`;
  `Links = Readonly<Record<string, Link>>` (`#document-links`).
- `ResourceIdentifier { type; id; meta? }`; `LocalResourceIdentifier { type; lid; meta? }`;
  `AnyResourceIdentifier` is their union (`#document-resource-identifier-objects`).
- `ResourceLinkage = null | ResourceIdentifier | ReadonlyArray<ResourceIdentifier>`;
  `ToOneLinkage = ResourceIdentifier | null`; `ToManyLinkage = ReadonlyArray<ResourceIdentifier>`
  (`#document-resource-object-linkage`).
- `Relationship { links?; data?; meta? }`; `Relationships`; `Attributes`;
  `ResourceObject { type; id; attributes?; relationships?; links?; meta? }` with `id: string` always
  present: the package builds server-side resource objects only (`#document-resource-objects`).
- `JsonApiObject { version?; ext?; profile?; meta? }` (`#document-jsonapi-object`).
- `ErrorSource { pointer?; parameter?; header? }`, `ErrorLinks { about?; type? }`,
  `ErrorObject { id?; links?; status?: string; code?; title?; detail?; source?; meta? }`
  (`#error-objects`). `status` is a string on the wire.
- `DocumentBase { jsonapi?; links?; meta? }`;
  `DataDocument<TData> extends DocumentBase { data: TData; included? }`; `ErrorDocument { errors }`;
  `MetaDocument { meta }`; `ExtensionDocument { [member: \`${string}:${string}\`]: unknown
  }` for documents whose primary member is an extension member (`atomic:results`); `Document =
  DataDocument | ErrorDocument | MetaDocument |
  ExtensionDocument`; `PrimaryData`, `ResourceDocument`, `CollectionDocument`, `ToOneRelationshipDocument`, `ToManyRelationshipDocument`are the`DataDocument` instantiations (`#document-top-level`).

### 2.1 Member names (`member-name.ts`)

- `isMemberName(name)`: at least one character; first and last characters are `A-Z`, `a-z`, `0-9`,
  or U+0080 and above; inside, additionally `-`, `_`, and U+0020 SPACE
  (`#document-member-names-allowed-characters`). Prototype keys (`__proto__`, `constructor`,
  `prototype`) are excluded by `assertMemberName` and by every parser that turns a name into a key.
- `isMemberPath(path)`: one or more member names joined by `.` (`#fetching-includes`,
  `#fetching-sorting`).
- `isAtMember(name)`: starts with `@`. @-Members are ignored by every processing rule in this
  package: a request parser skips them, never reports them (`#document-member-names-at-members`).
- `isExtensionMemberName(name)`: `namespace:name` where the namespace matches `[A-Za-z0-9]+` and the
  rest is a member name (`#extension-members`).
- `assertMemberName(what, name)` throws `TypeError` naming `what` for an invalid or prototype name.

Tests: `member-name.test.ts` covers the grammar edge characters, @-Members, extension names, and
prototype keys.

---

## 3. Media types and negotiation

### 3.1 RFC 9110 parsing and serialization (`media-type/parse.ts`, `format.ts`)

- `parseMediaType(value): MediaType | undefined`: `type/subtype` then `*( OWS ";" OWS parameter )`.
  Type, subtype, and parameter names are lowercased (case-insensitive per RFC 9110 8.3.1 and 5.6.6);
  parameter values keep their case, with quoted-strings unquoted and quoted-pairs resolved (5.6.4).
  Anything that is not a valid media type returns `undefined`; nothing throws.
- `parseAccept(value): ReadonlyArray<MediaRange>`: a comma-separated list of media ranges, each with
  `weight` from `q` (12.4.2; default 1; `q` is not reported as a parameter). Malformed elements are
  skipped so one bad element cannot hide the rest.
- `formatMediaType`, `formatParameterValue` (token as is, otherwise quoted-string),
  `quoteParameterValue` (throws `TypeError` for a value no quoted-string can carry).

Tests: `parse.test.ts` (grammar, case, quoting, weights, malformed input), `json-api.test.ts`.

### 3.2 The JSON:API media type (`media-type/json-api.ts`)

- `isJsonApiMediaType(mediaType)`: `application/vnd.api+json`, parameters aside.
- `jsonApiParameters(mediaType): { ext, profile, other }`: `ext` and `profile` values are split on
  U+0020 SPACE, deduplicated, order kept; `other` lists the names of every other parameter
  (`#media-type-parameter-rules`).
- `formatJsonApiMediaType({ ext?, profile? })`: the media type followed by `ext` and `profile`
  parameters only when their lists are non-empty; values are always quoted-strings so one URI and
  several serialize the same way (`#media-type-parameter-rules`, the HTTP quoting note).

### 3.3 Negotiation (`negotiate/negotiate.ts`)

`negotiate({ contentType, accept }, { extensions?, profiles? })` applies
`#content-negotiation-servers` in order and returns `{ ok: true, request, extensions, profiles }` or
`{ ok: false, error }` where `error` is a 415 or 406 `BanError` (4.2) carrying `Vary: Accept` in its
headers.

Content-Type:

1. Absent or unparseable: the request declares no body (`request.jsonApi === false`).
2. Not JSON:API: `request.mediaType` is kept, `jsonApi` is `false`. Whether such a body is
   acceptable is the endpoint's call (`readDocument` rejects it, section 10.3).
3. JSON:API with any parameter other than `ext` and `profile`: 415 (`source.header` is
   `Content-Type`).
4. JSON:API with an `ext` URI not in `extensions`: 415.
5. Otherwise `request = { mediaType, jsonApi: true, extensions, profiles }` as sent.

Accept:

1. Absent, or no JSON:API instance with `q > 0`: no extensions or profiles are required.
2. Every JSON:API instance carries a parameter other than `ext` and `profile`: 406 (`source.header`
   is `Accept`).
3. Every remaining instance requires an extension not in `extensions`: 406.
4. Otherwise the instance with the highest weight wins; among equal weights the one with the most
   extensions, then the first in field order. `extensions` are that instance's `ext` URIs;
   `profiles` are its `profile` URIs filtered to `profiles` (unrecognized profiles MUST be ignored,
   `#profile-rules`).

`q=0` instances are "not acceptable" by RFC 9110 12.4.2 and are not JSON:API instances for rule 2.

Tests: `negotiate.test.ts` names each rule.

---

## 4. Errors

### 4.1 Catalog (`errors/catalog.ts`)

Every error the package emits is a @netvark/ban-core `BanError` (ADR 0014) carrying one of
`ERROR_CODES`. `ERROR_CATALOG` holds the entries @netvark/ban-core's built-in catalog does not have,
in @netvark/ban-core's `ErrorDefinition` shape
(`JsonApiCatalog = Record<JsonApiCatalogKey, ErrorDefinition>`), so an application spreads them into
its own `createBan({ errors })` next to its own entries; the other codes are @netvark/ban-core
built-ins with the same `status` and `title`. `ErrorCode` is the union of all sixteen, `ERROR_CODES`
lists them in status order, and each fixes `status` and `title`; `detail` and `source` vary per
occurrence (`#error-objects`: `title` SHOULD NOT change from occurrence to occurrence). The three
profile entries carry the profile's error `type` URI (8.4).

| Code                                | Status | Title                             | Defined by        |
| ----------------------------------- | ------ | --------------------------------- | ----------------- |
| `INVALID_QUERY_PARAMETER`           | 400    | Invalid Query Parameter           | this package      |
| `UNKNOWN_QUERY_PARAMETER`           | 400    | Unknown Query Parameter           | this package      |
| `INVALID_DOCUMENT`                  | 400    | Invalid Document                  | this package      |
| `MALFORMED_JSON`                    | 400    | Malformed JSON                    | @netvark/ban-core |
| `UNSUPPORTED_SORT`                  | 400    | Unsupported Sort                  | this package      |
| `MAX_PAGE_SIZE_EXCEEDED`            | 400    | Max Page Size Exceeded            | this package      |
| `RANGE_PAGINATION_NOT_SUPPORTED`    | 400    | Range Pagination Not Supported    | this package      |
| `FORBIDDEN`                         | 403    | Forbidden                         | @netvark/ban-core |
| `CLIENT_GENERATED_ID_NOT_SUPPORTED` | 403    | Client-Generated ID Not Supported | this package      |
| `NOT_FOUND`                         | 404    | Not Found                         | @netvark/ban-core |
| `METHOD_NOT_ALLOWED`                | 405    | Method Not Allowed                | @netvark/ban-core |
| `NOT_ACCEPTABLE`                    | 406    | Not Acceptable                    | @netvark/ban-core |
| `CONFLICT`                          | 409    | Conflict                          | @netvark/ban-core |
| `UNSUPPORTED_MEDIA_TYPE`            | 415    | Unsupported Media Type            | @netvark/ban-core |
| `VALIDATION_FAILED`                 | 422    | Validation Failed                 | @netvark/ban-core |
| `INTERNAL_SERVER_ERROR`             | 500    | Internal Server Error             | @netvark/ban-core |

### 4.2 Errors on @netvark/ban-core (`errors/json-api-error.ts`)

`jsonApiBan` is the @netvark/ban-core instance behind every error the package builds:
`createBan({ errors: ERROR_CATALOG, format: jsonApi({ mixedEntries: true }) })`. Its catalog is
`ERROR_CATALOG` over @netvark/ban-core's built-ins (`JsonApiErrorCode = ErrorKey<JsonApiCatalog>`),
and its format is @netvark/ban-core's JSON:API format with `mixedEntries` on, so one document can
combine entries (@netvark/ban-core SPEC 7.2.4). Any @netvark/ban-core instance renders any
`BanError`, so an application with entries of its own builds its own instance with `ERROR_CATALOG`
spread into `errors` and renders this package's errors the same way;
`e2e/jsonapi/custom-catalog.e2e.test.ts` drives that over HTTP.

An error object is an `ErrorItem` on `error.errors`:

- `errorItem(code, { detail, source?, meta?, reason?, expected? })`: the entry's `status`, `code`,
  `title`, and `type` (when it declares one), then the occurrence's `detail`, address, `meta`, and a
  validator's `reason` and `expected` (rendered as `meta.code` and `meta.expected`). The address is
  the `source` as @netvark/ban-core locates it: `pointer` is a path with no location
  (`pathFromPointer`, RFC 6901 unescaping), `parameter` is a one-segment path in `query`, `header`
  one in `header`; one item addresses one part of the request, with that precedence when several are
  given. The format renders them back as `source.pointer`, `source.parameter`, and `source.header`
  (@netvark/ban-core SPEC 7.2.2); a parameter or header item also carries `meta.location`.
- `jsonApiError(code, { detail?, source?, meta?, cause?, headers? })`: one error object from the
  catalog. With no `source` and no `meta` it is
  `jsonApiBan.error(code, { detail, cause, headers })`; otherwise the error carries one item, and a
  `source` or `meta` without a `detail` is a `TypeError`.
- `jsonApiError(items, { cause?, headers? })`: one error over one item or a non-empty list (empty:
  `TypeError`). When every item carries the same catalog code the error is that entry; otherwise it
  is the primary entry for the response status, `responseStatus(items)` from
  `@netvark/ban-core/formats/json-api` (the common status; 400 when the items differ and are all
  4xx; else 500; 500 when no item has a status) through `jsonApiBan.fromStatus`
  (`#errors-processing`: "the most generally applicable HTTP error code"). A single item's `detail`
  becomes the error's, so logs and the other formats show it.
- `headers` are the error's own (`error.headers`): `Allow` on a 405, `Vary: Accept` on a 415 or 406.
  Every handler and `respondError` send them.
- `errorObjects(error)`: the error objects the JSON:API format renders for any `BanError`, in
  document order: one per item, or one for the error itself when it has no list, each with the
  error's `id`. `errorDocument(error, base?)` is `{ jsonapi?, links?, meta?, errors }` for callers
  that build a response by hand; handlers (10.5) render through @netvark/ban-core instead.
- `BanError` and `isBanError` are re-exported from `@netvark/ban-core` so a consumer narrows a
  caught error without a second import. `error.status` is the response status, `error.getResponse()`
  a bare rendering, `error.cause` the underlying failure.

### 4.3 Status codes

`ErrorStatusCode` is @netvark/ban-core's union of the registered 4xx and 5xx codes, re-exported; an
unregistered status is a `TypeError` in @netvark/ban-core at construction (ADR 0009). The adapter
hands `error.status` to `c.json` without assertions.

Tests: `json-api-error.test.ts` (catalog closure and spreading into `createBan`, item mapping and
precedence, both call forms, status derivation for mixed lists), `error-document.test.ts` (document
order, a foreign @netvark/ban-core validation error, `getResponse` with the error's headers).

---

## 5. Resource definitions (`resource/types.ts`)

`ResourceDefinition<TType, TAttribute, TRelationship, TRow, TSort, TFilter, TCreate, TUpdate>`:

| Member          | Meaning                                                                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `type`          | The resource type; a member name                                                                                                                                                                                                           |
| `attributes`    | Declared attribute names                                                                                                                                                                                                                   |
| `relationships` | By name: `{ type, cardinality: 'one' \| 'many', resource?: () => AnyResource }`                                                                                                                                                            |
| `fields`        | `ReadonlySet` of attribute and relationship names                                                                                                                                                                                          |
| `serialize`     | `(row: TRow) => { id; attributes?; relationships?; links?; meta? }`; attributes and relationships are restricted to the declared names                                                                                                     |
| `links`         | `{ self?: (id) => string; relationship?: (id, name) => { self?; related? } }`, resolved from `ResourceLinksInit` (5.1)                                                                                                                     |
| `query`         | Resolved capabilities (5.2)                                                                                                                                                                                                                |
| `validate`      | `{ create?: StandardSchema<unknown, TCreate>; update?: StandardSchema<unknown, TUpdate>; id?: StandardSchema<unknown, string> }`: the attributes of each write, and the resource id, a create's client-generated one and an update's (9.2) |
| `clientIds`     | Whether `POST` may carry a client-generated `id`; default `false` (`#crud-creating-client-ids`)                                                                                                                                            |
| `writable`      | `WritableFields = { create; update }`: each a `ReadonlySet` of the fields that operation accepts; every field when the init lists none (9.2)                                                                                               |

`serialize` may return relationships as an id, `null`, an array of ids, an identifier object, an
array of identifier objects, or `{ data?, links?, meta? }`. `AnyResource` erases every parameter;
`RowOf`, `RelationshipNameOf`, `CreateAttributesOf`, `UpdateAttributesOf` recover them.
`CreateAttributesOf` is `Attributes` when the definition has no create validator.

`RelationshipLinks` is an object type (not an interface) so a built value is assignable to `Links`.

### 5.1 `defineResource(init)` (`define-resource.ts`, ADR 0012)

Validates once and throws `TypeError` naming the option for: a `type` that is not a member name; an
attribute or relationship name that is not a member name, is `type` or `id` (fields share a
namespace with them, `#document-resource-object-fields`), or is declared twice or in both lists; a
relationship whose `type` is not a member name or whose `cardinality` is not `one` or `many`; a
`serialize` that is not a function; a validator that is not a Standard Schema V1 object (`~standard`
read with `in`, since zod 4, Valibot, and ArkType expose it as a prototype getter; `version` 1 and a
`validate` function); a `writable.create` or `writable.update` name that is not a declared field or
is listed twice. Fills `links`, `query`, `validate`, `clientIds`, and `writable` (each operation
without a list accepts every field) with defaults. The literal types of `type`, the field names, and
the sort and filter names are inferred (`const` type parameters) and `NoInfer` keeps names flowing
from the declarations into `serialize` and `writable`, never the other way.

Writable fields. `writable: WritableFieldsInit = { create?, update? }` lists, typed as the declared
names, the fields each operation accepts, so a read-only field (`createdAt`, a counter) or one set
once (a slug, an author) is declared, served, filterable, and sortable while a request that writes
it is refused with 403 (9.2, 10.4, 11.4). The specification makes the update's refusal a MUST and
the create's a MAY ("A server MUST return 403 Forbidden in response to an unsupported request to
update a resource or relationship"; `#crud-updating-responses-403`, `#crud-creating-responses-403`);
refusing beats a validator that strips the unknown key, which answers success for a write that never
happened.

Links (`links.ts`, ADR 0015). `links` is `ResourceLinksInit = { base?, self?, relationship? }`.
Without `base`, the resolved `links` holds the builders given and nothing else. With `base`, a
builder not given is derived by the URL design of the specification's recommendations: `self(id)` is
`<base>/<type>/<id>` and `relationship(id, name)` is
`{ self: <base>/<type>/<id>/relationships/<name>, related: <base>/<type>/<id>/<name> }`, with
`type`, `id`, and `name` percent-encoded (`encodeURIComponent`); a builder given wins over its
derived one. `base` MUST be `''`, a path starting with `/`, or an absolute URL (a scheme followed by
`//`), and MUST NOT end with `/` or contain `?` or `#`; otherwise `TypeError` naming `links.base`. A
link is a URI-reference (`#document-links-link`), so root-relative links are valid; `respond`
derives the 201 `Location` from `self` (10.2).

`createDefineResource(defaults)` (`create-define-resource.ts`) returns a function with
`defineResource`'s signature (`DefineResource`) that defines every resource with
`links: { ...defaults.links, ...init.links }`: a member the definition sets, even to `undefined`,
replaces the default. A default `links.base` the convention rejects throws when the definer is
created. `ResourceDefaults = { links?: ResourceLinksInit }`.

`relatedResource(resource, name)` follows a relationship to its definition and throws when the
relationship is undeclared, declares no `resource`, or the definition's `type` differs from the
relationship's.

Tests: `define-resource.test.ts` (every rejection), `define-resource.test-d.ts` (inference and the
`serialize` field restriction), `links.test.ts` (derivation, encoding, precedence, rejected bases),
`create-define-resource.test.ts` and `create-define-resource.test-d.ts` (merging, the default's
validation, inference through the configured definer).

### 5.2 Query capabilities (`query-capabilities.ts`)

`query` resolves to `{ sort, filter, include, fields, page, search, custom }`:

- `sort`: declared names, each a member path; default none.
- `filter`: by field (a member path), the operators it accepts, each non-empty; `or` and the search
  member are reserved; default none.
- `include`: declared relationship paths; default none. Each path is validated against the
  definitions it traverses when the registry is first built (6.3).
- `fields`: whether `fields[type]` is accepted; default `true`.
- `page`: `false` or absent rejects every `page` parameter. Otherwise `{ default, max, range }` with
  `max` default 100, `default` default `min(20, max)`, both positive integers, `default <= max`,
  `range` default `false`. The profile has no implicit maximum; this package chooses 100 so an
  endpoint never returns an unbounded page by omission (ADR 0008).
- `search`: `filter[<member>]`, or a custom base name; default none.
- `custom`: implementation-specific base names. A custom name MUST be a member name containing at
  least one character outside `a-z` (`#query-parameters-custom`); the same rule applies to a custom
  search name.

---

## 6. Query parsing (`query/parse-query.ts`)

`parseQuery(resource, input): ParsedQuery<TSort, TFilter>` parses every parameter against the
definition and throws one 400 `BanError` listing every problem, each with `source.parameter` set to
the parameter name as sent. Nothing is dropped silently: a parameter the endpoint does not know how
to process is `UNKNOWN_QUERY_PARAMETER` (`#query-parameters`: "MUST return 400 Bad Request").

Dispatch per parameter name (6.2 gives the grammar; `member` is the first bracket member):

| Name                                             | Rule                      |
| ------------------------------------------------ | ------------------------- |
| `include`                                        | 6.4                       |
| `fields[type]`                                   | 6.5                       |
| `sort`                                           | 6.6                       |
| `page[member]`                                   | 6.7                       |
| `filter[...]` naming the search member           | the search value          |
| `filter[...]`                                    | 6.8                       |
| the custom search base name, no members          | the search value          |
| a declared custom base name, any members         | `custom[name] = value`    |
| anything else, including a name 6.2 cannot parse | `UNKNOWN_QUERY_PARAMETER` |

`include`, `fields[type]`, `sort`, `page[member]`, and the search parameter MAY appear once; a
repeated occurrence is `INVALID_QUERY_PARAMETER` ("specified more than once"), since a second value
has no defined meaning. A repeated custom parameter is kept as an array of its values.

### 6.1 Input and result (`input.ts`, `types.ts`)

`QueryInput` is a query string (with or without `?`), a `URLSearchParams`, or a record of string or
string-array values (the shape of `c.req.queries()`). A string is parsed with `URLSearchParams`, the
`application/x-www-form-urlencoded` parser the specification names
(`#appendix-query-details-parsing`); the record form expands arrays to repeated pairs. Order is
preserved.

`ParsedQuery`:

| Member    | Value                                                                                                                                  |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `include` | `undefined` when absent; `[]` for `include=` (which still requires `included` in the response); otherwise segment arrays, deduplicated |
| `fields`  | by type: the field names, deduplicated; an empty array means no fields; absent types get all fields                                    |
| `sort`    | `{ field, direction }` in order; `direction` is `desc` for a `-` prefix                                                                |
| `filter`  | `{ conditions, anyOf }` (6.8)                                                                                                          |
| `page`    | `undefined` when the definition does not paginate; otherwise `{ size, after, before, sizeRequested, range }` (6.7)                     |
| `search`  | the search value, or `undefined`                                                                                                       |
| `custom`  | declared custom parameters by full name, as sent                                                                                       |
| `params`  | a `URLSearchParams` of every pair as sent, for links that must reproduce them                                                          |

### 6.2 Parameter names (`parameter-name.ts`)

`parseParameterName(name)` splits `base`, `base[]`, `base[member]`, `base[a.b]`, and nested groups
into `{ base, members }`, or returns `undefined` when the base is neither a member name nor an
extension member name, brackets are unbalanced or nested inside a group, or a member is neither
empty, a member name, nor a member path (`#query-parameters-families`). Brackets arrive decoded
(`%5B`) or bare; both are the same name (`#appendix-query-details-square-brackets`).

### 6.3 Registry (`registry.ts`)

`registryOf(resource)` builds once per definition (memoized in a `WeakMap`): the trie of declared
include paths, each segment resolved through `relatedResource`, and the map of every type reachable
that way, including the primary type. Two different definitions declaring the same type throw.
`resolveIncludePath(registry, segments)` returns the definition at the end of a declared path or a
declared prefix of one.

### 6.4 `include` (`parse-families.ts`)

A comma-separated list of relationship paths (`#fetching-includes`); an empty value is an empty
list. Duplicates are dropped. A path that is not a member path, or that the registry does not
resolve, is `INVALID_QUERY_PARAMETER` on `include` ("MUST respond with 400 Bad Request").

### 6.5 `fields[type]`

Rejected as unknown when the definition sets `fields: false`. The type MUST be one the registry
knows (the primary type or one reachable through declared include paths); each name MUST be a field
of that type; otherwise `INVALID_QUERY_PARAMETER` on `fields[type]`. An empty value is an empty
fieldset (`#fetching-sparse-fieldsets`: "an empty value indicates that no fields should be
returned"). Duplicates are dropped.

### 6.6 `sort`

A comma-separated list of declared sort names, each optionally prefixed with `-` for descending
(`#fetching-sorting`). An undeclared name is the profile's `UNSUPPORTED_SORT` error (8.4), chosen
over the generic 400 because it carries a `type` link clients can key on; a repeated name is
`INVALID_QUERY_PARAMETER`.

### 6.7 `page[member]`

When the definition does not paginate, every `page` parameter is unknown. Otherwise the members are
those of the Cursor Pagination profile: `size`, `after`, `before`; any other member is unknown.

- `page[size]` MUST match `^[0-9]+$` and be positive (profile: "MUST match `^[0-9]+$`"); a value
  above `max` is `MAX_PAGE_SIZE_EXCEEDED` with `meta.page.maxSize` (8.4).
- `page[after]` and `page[before]` MUST be non-empty; their content is opaque here and decoded by
  the application's pagination engine (which throws `invalidCursor`, 8.4).
- Both cursors together is a range request; on a definition without `range` it is
  `RANGE_PAGINATION_NOT_SUPPORTED` (8.4).
- The used size is `page[size]` when sent, else `default`, or `max` on a range request (profile:
  "the max page size SHOULD be used" on range requests). `sizeRequested` says whether the client
  sent `page[size]`.

### 6.8 `filter` (`parse-filter.ts`, ADR 0007)

The grammar is the package's choice; JSON:API reserves the family and leaves the strategy open
(`#fetching-filtering`).

| Parameter                    | Meaning                                                   |
| ---------------------------- | --------------------------------------------------------- |
| `filter[field]=v`            | condition `{ field, operator: 'eq', value }`              |
| `filter[field][op]=v`        | condition with a declared operator                        |
| `filter[or][n][field]=v`     | `eq` condition in disjunction group `n` (`n` is `[0-9]+`) |
| `filter[or][n][field][op]=v` | condition in group `n`                                    |

`conditions` all hold; within a group any condition may hold; every group holds. Groups are returned
in ascending index order. An undeclared field or operator is `INVALID_QUERY_PARAMETER` on the
parameter; `filter`, `filter[]`, more than four members, or an `or` without a numeric index and a
field is `UNKNOWN_QUERY_PARAMETER`. A repeated parameter yields an array `value`.

Tests: `parse-query.test.ts` (dispatch, aggregation, single-occurrence rule, custom and search
parameters), `parse-families.test.ts`, `parse-filter.test.ts`, `parameter-name.test.ts`.

---

## 7. Document building

### 7.1 Serialization (`document/serialize.ts`)

`serializeResource(resource, row)` returns a complete resource object in member order `type`, `id`,
`attributes`, `relationships`, `links`, `meta`:

- `id` MUST be a string; anything else throws `TypeError`
  (`#document-resource-object-identification`).
- `attributes` keeps only declared names with a defined value; the member is omitted when empty.
- Each relationship becomes a relationship object: linkage from the shorthand (ids become
  identifiers of the declared type; identifier objects pass through), plus `links.self` and
  `links.related` from `links.relationship` when they are defined. The declared cardinality is
  enforced: an array for to-one or a non-array for to-many throws. An undeclared relationship name
  throws; a relationship object with none of `links`, `data`, `meta` throws
  (`#document-resource-object-relationships`). A `null` to-one and an empty to-many stay as
  `data: null` and `data: []`.
- `links.self` from `links.self(id)`; `meta` as returned.

`applyFields(resource, fields)` keeps only the named attributes and relationships; an empty list
drops both members; `type`, `id`, `links`, `meta` are not fields and stay
(`#fetching-sparse-fieldsets`). `identify(resource, row)` returns `{ type, id }`.

### 7.2 Builders (`document/build.ts`)

All take `DocumentOptions = DocumentBase & { query?, included? }`.

- `jsonApiObject(init?)`: `{ version: '1.1', ...init }`, `undefined` members removed.
- `resourceDocument(resource, row | null, options?)`,
  `collectionDocument(resource, rows, options?)`: serialize, apply `query.fields[resource.type]`,
  build `included` (below), and emit `jsonapi`, `links`, `meta`, `data`, `included` in that order.
- `toOneRelationshipDocument(resource, row | null, base?)`,
  `toManyRelationshipDocument(resource, rows, base?)`: `data` is identifiers only
  (`#fetching-relationships-responses-200`).
- `include(resource, rows)` pairs rows with their definition for `options.included`; the row type is
  checked against the definition at the call.

`included`:

1. Absent when `options.included` and `query.include` are both `undefined`.
2. Each included row is serialized completely and deduplicated by type and id, first wins; a
   resource present in the primary data is never repeated (`#document-compound-documents`: "MUST NOT
   include more than one resource object for each type and id pair").
3. Full linkage is asserted over the complete objects (7.3); a violation throws `TypeError`.
4. `query.fields[type]` is applied per included type.
5. The member is omitted when nothing remains and the client sent no `include`; it is `[]` when the
   client sent `include` (even `include=`) and nothing qualifies (`#fetching-includes`).

### 7.3 Full linkage (`document/linkage.ts`)

`assertFullLinkage(primary, included, requested?)` walks from every primary resource along
relationship `data` and throws for an included resource the walk never reaches. With `requested`
(the parsed include paths) the walk is confined to those paths, so an included resource the client
did not ask for is reported too. Linkage is checked over the complete objects, before sparse
fieldsets: the specification's one exception is linkage a fieldset removed from the output
(`#document-compound-documents`).

Tests: `serialize.test.ts`, `build.test.ts`, and `conformance.test.ts`, which validates every
builder's output against the JSON:API JSON Schema (ADR 0011).

---

## 8. Cursor pagination (`pagination/`)

The profile is `http://jsonapi.org/profiles/ethanresnick/cursor-pagination/` exactly as its page
states it, `http` and trailing slash included (ADR 0008).

### 8.1 `paginatedDocument(resource, page, options)` (`paginated.ts`)

`page = { rows, next, prev, last?, first?, total?, estimatedTotal?, rangeTruncated?, cursor? }`;
`options = DocumentOptions & { url, relative? }`. Builds `collectionDocument` with:

- `jsonapi.profile`: any profiles passed, then the cursor profile once;
- `links`: any links passed, overridden by `paginationLinks(url, page)` (8.2);
- `meta`: any meta passed, with `pageMeta(page)` merged in (8.3);
- each item's `meta.page.cursor` from `cursor(row)` when `cursor` is given, keeping other `meta` and
  `meta.page` members of the item.

### 8.2 Links (`links.ts`)

`paginationLinks(url, { next, prev, last?, first? }, { relative? })` derives every link from the
request URL so each parameter the client sent survives (`#document-top-level`: `self` is "the link
that generated the current response document"; profile: links "MUST" reproduce the query).

- The query is re-serialized once through `URLSearchParams`, so square brackets a client left bare
  come out percent-encoded, which the serialization rules prescribe
  (`#appendix-query-details-square-brackets`).
- `self`: the URL as is. `first`: without `page[after]` and `page[before]`; omitted for
  `first: false`. `prev`: `page[before]=prev` without `page[after]`, or `null`. `next`:
  `page[after]=next` without `page[before]`, or `null`. `last`: `page[before]=last` or `null`, only
  when `last` is given. `prev` and `next` are always present (profile: "MUST be present").
- `relative: true` renders path and query only.

### 8.3 Meta (`links.ts`)

`pageMeta({ total?, estimatedTotal?, rangeTruncated? })` emits only the members the profile
recognizes under `meta.page`: `total`, `estimatedTotal: { bestGuess }`, and `rangeTruncated: true`
only when true (the profile defines it as a flag to add). `itemCursorMeta(cursor)` is
`{ page: { cursor } }`.

### 8.4 Errors (`errors.ts`)

Each is a 400 `ErrorItem` (4.2) with `source.parameter` and, where the profile defines one, a `type`
link under `https://jsonapi.org/profiles/ethanresnick/cursor-pagination/`, the catalog entry's
`type` (4.1), exported as `UNSUPPORTED_SORT_TYPE`, `MAX_SIZE_EXCEEDED_TYPE`, and
`RANGE_PAGINATION_NOT_SUPPORTED_TYPE`:

| Builder                                    | Code                             | `type` link suffix               | Extra                                 |
| ------------------------------------------ | -------------------------------- | -------------------------------- | ------------------------------------- |
| `unsupportedSortError(field)`              | `UNSUPPORTED_SORT`               | `unsupported-sort`               | `source.parameter: 'sort'`            |
| `maxPageSizeExceededError(requested, max)` | `MAX_PAGE_SIZE_EXCEEDED`         | `max-size-exceeded`              | `meta.page.maxSize`                   |
| `rangePaginationNotSupportedError()`       | `RANGE_PAGINATION_NOT_SUPPORTED` | `range-pagination-not-supported` | `source.parameter: 'page[before]'`    |
| `invalidCursorError(parameter, detail?)`   | `INVALID_QUERY_PARAMETER`        | none                             | for a cursor the engine cannot decode |

`unsupportedSort(field)` and `invalidCursor(parameter, detail?)` wrap them in a `BanError` for
throwing from an engine. The `type` link is a string, since the profile says "has a `type` link of"
and a link may be a string (`#document-links-link`).

Tests: `links.test.ts`, `paginated.test.ts`, `errors.test.ts`; `pagination.e2e.test.ts` walks pages
over HTTP.

---

## 9. Request documents (`request/`)

Every parser accumulates error items, each with `source.pointer` (RFC 6901, `~` and `/` escaped in
names), and throws one `BanError` whose status follows 4.2.

### 9.1 Identifiers and linkage (`identifiers.ts`)

- `parseIdentifier(value, pointer, { lids?, type? }, errors)`: an object with a string `type` (400
  at `pointer/type` otherwise); `type` MUST equal `options.type` when given (409 `CONFLICT` at
  `pointer/type`); `meta`, when present, MUST be an object; a string `id`, or a string `lid` when
  `lids` is true; otherwise 400 (`#document-resource-identifier-objects`).
- `parseLinkage(value, pointer, cardinality, options, errors)`: to-one accepts `null` or one
  identifier; to-many accepts an array (possibly empty), each item parsed at `pointer/<index>`. The
  result type is `ResourceLinkage` without `lids` and `RequestLinkage` (identifiers that may carry
  `lid`) with it.

### 9.2 Resource documents (`resource-document.ts`, `resource-members.ts`)

`parseResourceObject(resource, value, { operation, id?, lids?, pointer? })` parses the resource
object at `pointer` (default `/data`):

1. `value` MUST be an object (400).
2. Members other than `type`, `id`, `lid`, `attributes`, `relationships`, `links`, `meta` are 400 at
   their pointer; @-Members are skipped. `links` is ignored (clients MAY send it); `meta` MUST be an
   object when present.
3. `type` MUST be a string and MUST equal the definition's type (409 `CONFLICT` at `pointer/type`,
   `#crud-creating-responses-409`, `#crud-updating-responses-409`).
4. `id`, when present, MUST be a string. On `create`, an `id` is `CLIENT_GENERATED_ID_NOT_SUPPORTED`
   (403) unless the definition sets `clientIds` (`#crud-creating-client-ids`). On `update`, `id`
   MUST be present (400) and MUST name the resource `options.id` names, when given (409,
   `#crud-updating-responses-409`): the same text, or two texts `validate.id` takes with one output,
   the server's spelling of the key, so a client that requests a key in its own spelling (a UUID in
   upper case, RFC 9562 section 4) and repeats the one the server sent is no conflict. The id is the
   URL's, which the host resolves (a missing resource is its 404), so the validator's issues are
   never reported and the parsed id is the document's text.
5. `lid` is a 400 unless `lids` is true; with `lids`, an update MAY identify the resource by `lid`
   instead of `id`.
6. `attributes`, when present, MUST be an object; each name MUST be a declared attribute (400 at
   `pointer/attributes/<name>`) that the operation writes (`writable`, 5.1; 403 `FORBIDDEN` at the
   same pointer, `#crud-creating-responses-403`, `#crud-updating-responses-403`); @-Members are
   skipped.
7. `relationships`, when present, MUST be an object; each name MUST be a declared relationship (400)
   that the operation writes (403 at `pointer/relationships/<name>`), and each value a relationship
   object with a `data` member (400); `data` is parsed with 9.1 for the declared cardinality and
   type, `lids` passed through (`#crud-updating-resource-relationships`). The 403 items join the
   others in one error: a document refused only for the fields it writes answers 403, and one with
   any other refusal answers 400 with every item (4.3).
8. With no structural errors, a create's client-generated id is validated by `validate.id`, when the
   definition has it, and the attributes (an empty object when absent) by the definition's `create`
   or `update` Standard Schema; each issue becomes a `VALIDATION_FAILED` (422) object whose pointer
   is `pointer/id` or `pointer/attributes` plus the issue path, the id's first. JSON:API asks a
   client-generated id to be "a universally unique identifier" and leaves its spelling to the
   server, whose keys decide it (`#crud-creating-client-ids`); the parsed `id` and `attributes` are
   the validators' output. The issue's `code` and `expected`, when they are strings, become the
   item's `reason` and `expected`, which `@netvark/ban-core`'s JSON:API format renders as
   `meta.code` and `meta.expected`; nothing else of a vendor's issue is kept, so no value from the
   request reaches the response. Without a validator the attributes pass through.

Returns
`ParsedResourceObject<TAttributes, TLinkage> = { type, id, lid, attributes, relationships, meta }`
with `relationships` keyed by the names the document carried.

`parseCreateDocument(resource, body, options?)` and
`parseUpdateDocument(resource, body, id, options?)` take `primaryData(body)` (400 unless `body` is
an object with a `data` member) and type `attributes` as `CreateAttributesOf` / `UpdateAttributesOf`
and `relationships` as `ResourceLinkage`, or `RequestLinkage` when `options.lids` is `true`.

`RequestResourceObject` and `RequestDocument` type a request as a client sends it.

### 9.3 Relationship documents (`relationship-document.ts`)

`parseToOneRelationshipDocument(body, { type })` returns an identifier of `type` or `null`;
`parseToManyRelationshipDocument(body, { type })` returns an array of identifiers of `type`,
possibly empty. The body MUST have `data` (400 at `""`); a wrong shape is 400 at `/data`; a wrong
type is 409 at `/data/type` or `/data/<index>/type` (`#crud-updating-to-one-relationships`,
`#crud-updating-to-many-relationships`).

### 9.4 Cardinality helpers (`cardinality.ts`)

`toOneLinkage(linkage)` and `toManyLinkage(linkage)` narrow a `ResourceLinkage | undefined` by the
cardinality the caller knows, passing `undefined` through for a relationship the document did not
carry. A mismatch is a programming error and throws `TypeError`.

Tests: `resource-document.test.ts`, `resource-update.test.ts` (an update's id matched to the
request's by text and by `validate.id`'s output), `resource-client-id.test.ts` (a create's client
id, and an atomic update's id matched to its target's), `relationship-document.test.ts`,
`cardinality.test.ts`.

---

## 10. Hono integration (`@netvark/hono-jsonapi`, `packages/hono-jsonapi/src/`)

`@netvark/hono-jsonapi` depends on `@netvark/jsonapi-core`, re-exports everything of both its
subpaths (`export *`, so the bindings are the core's own), and adds the functions of this section
and 11.1. Its peer dependencies are `hono` and `@netvark/hono-ban` (ADR 0014).

### 10.1 `jsonApi(options?)` and types (`middleware.ts`, `types.ts`)

`jsonApi({ extensions?, profiles? })` runs 3.3 over the request headers. A failure is thrown: its
415 or 406 carries `Vary: Accept` in the error's headers, and `app.onError` renders it (10.5). On
success the result is stored as the `jsonApi` context variable
(`JsonApiContext = { request, extensions, profiles }`, typed through `JsonApiEnv`), downstream runs,
and when the response is a JSON:API response `Vary: Accept` is added without duplicating an existing
`Accept` or `*` (`#content-negotiation-servers`: servers that support `ext` or `profile` SHOULD send
`Vary: Accept`; RFC 9110 12.5.5).

### 10.2 `respond` (`respond.ts`, ADR 0005)

- `respond(c, document)` (200) and `respond(c, document, status, headers?)`: `c.json` with
  `Content-Type` from
  `formatJsonApiMediaType({ ext: document.jsonapi?.ext, profile: document.jsonapi?.profile })`, so
  the header and the body cannot disagree (`#content-negotiation-servers`: the response MUST specify
  the extensions and profiles applied). A 201 gets `Location` from the resource's `links.self`
  (string or link object `href`) unless `headers` carries one (`#crud-creating-responses-201`:
  `Location` MUST match `links.self` when both are present). A caller header whose name matches a
  fixed one case-insensitively is dropped: Hono applies header records in key order, and a lowercase
  `content-type` would otherwise win. The return type is `JsonApiResponse<TDocument, TStatus>` for
  Hono's RPC inference.
- `respondError(c, error, base?, headers?)`: `errorDocument(error, base)` with `error.status`, the
  error's own headers (`Allow`, `Vary`), which win over `headers`, and the bare media type: no
  extension or profile applies to an error document. A bare rendering: no error id header, no
  report; `errorHandler` does those for errors that are thrown.
- `isJsonApiResponse(response)`, `varyAccept(current)`.

### 10.3 `readDocument(c)` (`body.ts`)

415 unless the request `Content-Type` parses as the JSON:API media type (`#content-negotiation-all`:
clients MUST send documents with it); 400 `MALFORMED_JSON` when the body is not JSON. Media type
parameters were already checked by `jsonApi()`.

### 10.4 Validators (`validators.ts`)

Each is a `MiddlewareHandler` in the shape of Hono's `validator` and stores its result for
`c.req.valid()`. A rejected request throws the parser's `BanError` for `app.onError` to render
(10.5); Hono's default error handler answers a thrown `BanError` through its `getResponse()`, so the
rejection is a JSON:API document even on an app without `errorHandler()`, without the handler's id
header and report.

| Validator                                                  | Target  | Stored value                                                                                                                                                                         |
| ---------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `queryValidator(resource)`                                 | `query` | `ParsedQuery<TSort, TFilter>` from `parseQuery(resource, <query string of c.req.url>)`                                                                                               |
| `bodyValidator(resource, { operation: 'create' })`         | `json`  | `ParsedResourceObject<CreateAttributesOf<TResource>>`                                                                                                                                |
| `bodyValidator(resource, { operation: 'update', param? })` | `json`  | `ParsedResourceObject<UpdateAttributesOf<TResource>>`; `data.id` MUST equal the `:id` route parameter (`param`, default `id`); a route without it throws `TypeError` at request time |
| `relationshipValidator(resource, name, 'one')`             | `json`  | `ResourceIdentifier \| null`                                                                                                                                                         |
| `relationshipValidator(resource, name, 'many')`            | `json`  | `ReadonlyArray<ResourceIdentifier>`                                                                                                                                                  |

`relationshipValidator` throws `TypeError` at setup for an undeclared relationship or a cardinality
that disagrees with the definition; `name` is typed as `RelationshipNameOf<TResource>`. A
relationship that `writable.update` leaves out is refused with 403 `FORBIDDEN` before the body is
read, whatever the method ("A server MUST return 403 Forbidden in response to an unsupported request
to update a relationship", `#crud-updating-relationship-responses-403`), so an application may mount
every relationship's route and let the definition decide.

### 10.5 Handlers (`handlers.ts`, ADR 0014)

- `errorHandler(options?)` for `app.onError` is a @netvark/hono-ban handler:
  `createBan({ errors: ERROR_CATALOG, format: jsonApi({ ...format, mixedEntries: true, document }) }).onError(handlerOptions)`,
  where `document` and `format` are this package's options and the rest (`ErrorHandlerOptions<E>`
  extends @netvark/hono-ban's `HandlerOptions<E, JsonApiCatalog>`) are @netvark/hono-ban's:
  `onReport(report, c)` (called exactly once, anything it throws is swallowed), `headers` (error
  headers and `Content-Type` win), `map` (receives the handler's instance, whose catalog is
  `ERROR_CATALOG` over the built-ins), `includeStack`, `transform`, `requestIdHeader`, `requestId`,
  `traceId`, `errorIdHeader`, `maxBodyBytes` (@netvark/ban-core SPEC 6 and 6.11). `document` adds
  top-level `jsonapi`, `links`, and `meta` members to every error document; `format` is the JSON:API
  format's own options (`typeLinkBaseUrl`, `aboutLink`, `includeId`, `traceIdMetaKey`),
  `mixedEntries` being always on since this package's errors combine entries.
- What it renders: a `BanError` as is (this package's, the application's own instance's, or any
  other library's on @netvark/ban-core); Hono's `HTTPException` with a 4xx or 5xx status adopted by
  status (@netvark/ban-core's primary entry for that status, `detail` from the message unless empty,
  its response headers kept except the body-describing ones, the exception as `cause`); an
  `HTTPException` outside those classes passed through as its own `getResponse()` (a thrown
  redirect); anything else as a constant 500 whose `detail` is "An unexpected error occurred", the
  thrown value on `cause` for the report. Every response carries
  `Content-Type: application/vnd.api+json`, `Cache-Control: no-store` unless `headers` sets one, the
  error id in `X-Error-Id` and in each error object's `id`, and `meta.traceId` when the request
  carried a W3C `traceparent`.
- `notFoundHandler({ document?, headers? })` for `app.notFound`: a 404 `NOT_FOUND` document with
  detail "No resource exists at the requested URL" through `respondError`.

Tests: `middleware.test.ts`, `respond.test.ts`, `body.test.ts`, `validators.test.ts`,
`validators.test-d.ts`, `handlers.test.ts`.

---

## 11. Atomic operations (`@netvark/jsonapi-core/atomic`, `@netvark/hono-jsonapi/atomic`, ADR 0010, ADR 0013)

Types (`types.ts`):

- `OperationCode = 'add' | 'update' | 'remove'`;
  `OperationTarget = { type; id?; lid?; relationship? }`.
- `ResolvedResourceObject<TAttributes> = { type; id; lid; attributes; relationships: Record<string, ResourceLinkage>; meta }`:
  the operation's `data` with every `lid` reference replaced by the id the earlier operation
  produced.
- `OperationContext<TTransaction, TContext = unknown> = { ctx, tx, index, pointer, meta }`: `ctx` is
  what the host handed the processor for this request (Hono's `Context` under
  `@netvark/hono-jsonapi`).
- `ResourceHandlers<TResource, TTransaction, TContext> = { resource; create?; update?; remove?; relationships? }`
  where `create({ data })` and `update({ id, data })` return a row (the result's `data`) or
  `undefined` (an empty result), `remove({ id })` returns nothing, and `relationships[name]` is
  `{ update?, add?, remove? }` over linkage. Handlers MAY be synchronous (`MaybePromise`).
- `AnyResourceHandlers` is the erased form the processor stores; its handler members are declared
  through method signatures so typed handlers are assignable (bivariant parameters).
- `AtomicOptions<TTransaction, TContext> = { resources; transaction(ctx, run); resolveHref?; maxOperations? }`.
  `transaction` MUST call `run` once and MUST roll back whatever `run` did when it rejects.
- `OperationsOutcome = { results, document }` and `OperationsProcessor<TContext>` (11.1);
  `OperationsResultDocument` is the `atomic:results` document.

### 11.1 `operationsProcessor(options)` (`process.ts`), `assertOperationsContentType` (`content-type.ts`), and `atomicOperations(options)` (`@netvark/hono-jsonapi/atomic`, `handler.ts`)

The core processes; the host (an HTTP adapter) does what needs the request and the response.
`operationsProcessor(options)` returns
`OperationsProcessor<TContext> = (body, ctx) => Promise<OperationsOutcome>`; listing a resource type
twice throws `TypeError` at setup. Per call, in order:

1. `parseOperationsDocument(body, { maxOperations, resolveHref })` (11.2), `maxOperations`
   defaulting to 10.
2. `options.transaction(ctx, run)`; `run` executes every operation in document order (11.4) with one
   `Lids` registry (11.3) and `OperationContext = { ctx, tx, index, pointer, meta }`. A `BanError`
   from an operation is rebuilt with the operation's pointer as the path of every item without one
   (an error without items becomes one item with the error's `message` as `detail`), so each error
   object gets `source.pointer` set to the operation's pointer (extension: errors SHOULD point at
   the operation); any error aborts `run`, so the transaction rolls back, and escapes the processor
   as it is.
3. The outcome is `{ results, document }`: `results` holds one result per operation, in order;
   `document` is `{ jsonapi: { version: '1.1', ext: [extension] }, 'atomic:results': results }` when
   at least one result carries `data`, and `undefined` when none does (extension: "MUST include the
   `atomic:results` array"; `204 No Content` allowed "if all results are empty").

`assertOperationsContentType(value)` throws a 415 unless `value` parses as the JSON:API media type
with the extension in `ext` (extension: the request "MUST ... specify the extension in the `ext`
media type parameter"). Other parameters are the negotiation layer's concern (3.3).

`atomicOperations(options)` in `@netvark/hono-jsonapi/atomic` is a Hono `Handler` built on the two;
`ctx` is Hono's `Context<E>` (`AtomicOptions<TTransaction, Context<E>>`). Per request, in order:

1. A method other than `POST` is 405 with `Allow: POST` (extension: "MUST be sent via POST").
2. `assertOperationsContentType(c.req.header('content-type'))`.
3. `readDocument` (10.3), then the processor with `c` as `ctx`.
4. No document: `204 No Content`. Otherwise `200` with the document through `respond`, which puts
   the extension on `Content-Type`.

Every failure in 1 to 4 is thrown for `app.onError` to render (10.5): the 405 carries `Allow: POST`
in the error's headers; a handler's error propagates after the rollback.

### 11.2 Document and targets (`parse-document.ts`, `parse-target.ts`)

`parseOperationsDocument(body, { maxOperations, resolveHref? })` throws one 400 listing every
problem, each pointing into the request:

- The document MUST be an object whose top-level members are among `atomic:operations`, `jsonapi`,
  `links`, `meta`, and @-Members.
- `atomic:operations` MUST be a non-empty array with at most `maxOperations` entries.
- Each operation (`/atomic:operations/<i>`) MUST be an object with members among `op`, `ref`,
  `href`, `data`, `meta`; `op` MUST be `add`, `update`, or `remove`; `meta` MUST be an object when
  present.
- An operation MAY carry `ref` or `href`, not both. `ref` MUST be an object with a string `type`,
  exactly one of string `id` and string `lid`, an optional string `relationship`, and no other
  members. `href` is accepted only when `resolveHref` is given and returns a target; otherwise 400
  at `/atomic:operations/<i>/href`.

The result is `RawOperation = { index, pointer, op, target, hasData, data, meta }` in order, with
`data` untouched: it is parsed against the targeted definition during execution.

### 11.3 Local identities (`lids.ts`)

`Lids` maps `(type, lid)` to the id an earlier `add` produced. `define` rejects a repeated `lid` for
a type (400); `resolve` rejects a `lid` no earlier operation created (400, at the pointer of the
reference). `identifier`, `identifiers`, and `linkage` replace `lid` identifiers with `id`
identifiers, keeping `meta`.

### 11.4 Execution (`execute*.ts`)

`executeOperation` classifies by `op` and target:

| Operation                        | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `add`, no relationship target    | The target, when given, MAY only name a collection (no `id` or `lid`). The type comes from the target or from `data.type`. Unknown type: 404 at `.../ref/type` or `.../data/type`. No `create` handler: 403. `data` is parsed with 9.2 (`create`, `lids` on, pointer `.../data`), `lid` references resolved, the handler called, the returned row serialized as the result's `data`. A `data.lid` is defined from the result's id or the client-generated id; a handler that returns nothing for an operation with a `lid` is a `TypeError`. |
| `update`, no relationship target | Type from the target or `data.type`; 404 and 403 as above. The id is the target's (`lid` resolved), else `data.id`, else `data.lid` resolved; a `data.lid` that disagrees with the target's `lid` is 409 at `.../data/lid`. `data` is parsed as an `update` with that id.                                                                                                                                                                                                                                                                    |
| `remove`, no relationship target | A target is required (400). 404 and 403 as above. `remove({ id })`; the result is empty.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| any `op` with `ref.relationship` | The relationship MUST be declared (400 at `.../ref/relationship`). `add` and `remove` apply only to to-many relationships (400 at `.../op` for to-one). `data` is required and parsed as linkage of the declared cardinality and type with `lids` on (`add` and `remove`: always an array). No handler for the `op`, or a relationship that `writable.update` leaves out: 403. The result is empty.                                                                                                                                          |

Results carry `data` only when a handler returned a row (extension: results for `remove` and
relationship operations MUST NOT contain `data`).

Tests: `parse-document.test.ts`, `lids.test.ts`, `content-type.test.ts`, `process.test.ts` (the
extension's examples, lid flow, the empty outcome, the host context, rollback, pointers),
`process-semantics.test.ts` (every rule above), `writable.test.ts` (the fields an `add` or an
`update` writes, a relationship operation on a relationship updates do not write, no handler run),
and `process-coverage.test.ts` in the core; `atomic/handler.test.ts` in `@netvark/hono-jsonapi`
(405, 415, malformed JSON, 200 with the extension on `Content-Type`, 204, rendering and propagation
after the rollback); `atomic.e2e.test.ts` over HTTP.

---

## 12. Packaging

Two packages under `packages/`, both ESM only with `type: module`, `sideEffects: false`, `files` of
`dist`, `CHANGELOG.md`, `LICENSE`, `README.md`, `engines.node >= 22.12.0`, and
`publishConfig.provenance` (ADR 0013).

- `@netvark/jsonapi-core`: `dependencies.ban-kit` (a caret range), no `peerDependencies`.
  `@netvark/hono-jsonapi`: `dependencies.jsonapi-kit` (`workspace:^`, a caret range when published)
  and `peerDependencies.hono >= 4.12.34` and `@netvark/hono-ban >= 2.0.0` (ADR 0014); one copy of
  `@netvark/ban-core` and of `hono` in the graph is what keeps `instanceof` true across the
  packages.
- Each `exports` map has `.`, `./atomic`, and `./package.json`, with declarations next to the
  `dist/*.js` files. tsdown rewrites both maps from its entry map on every build
  (`exports.devExports: 'source'`): the in-repo map resolves each subpath to `./dist/*.js` by
  default and to `./src/**/index.ts` under the `source` condition, which only
  `packages/hono-jsonapi/tsconfig.json` (`customConditions`) and its Vitest project
  (`ssr.resolve.conditions`) enable; `publishConfig.exports` holds the dist-only map that
  `pnpm publish` and `pnpm pack` apply. CI fails on a diff of either `package.json`.
- Built with `platform: 'neutral'`, `target: es2023`, source maps, declarations from
  `isolatedDeclarations` (ADR 0004); `@netvark/jsonapi-core`'s build leaves `@netvark/ban-core`
  external and `@netvark/hono-jsonapi`'s leaves `@netvark/jsonapi-core`, `hono`, and
  `@netvark/hono-ban` external. `publint --strict` and `attw --profile esm-only` run on every build
  and in `check:pkg`.
- Versions are independent; Changesets patch-bumps `@netvark/hono-jsonapi` when its
  `@netvark/jsonapi-core` range moves. Both are published with npm provenance through trusted
  publishing (`release.yml`), one trusted publisher per package.

---

## 13. Constants (`packages/jsonapi-core/src/internal/constants.ts`)

| Name                                  | Value                                                                                        | Exported |
| ------------------------------------- | -------------------------------------------------------------------------------------------- | -------- |
| `JSON_API_MEDIA_TYPE`                 | `application/vnd.api+json`                                                                   | yes      |
| `JSON_API_VERSION`                    | `1.1`                                                                                        | yes      |
| `ATOMIC_OPERATIONS_EXTENSION`         | `https://jsonapi.org/ext/atomic`                                                             | yes      |
| `CURSOR_PAGINATION_PROFILE`           | `http://jsonapi.org/profiles/ethanresnick/cursor-pagination/`                                | yes      |
| `UNSUPPORTED_SORT_TYPE`               | `https://jsonapi.org/profiles/ethanresnick/cursor-pagination/unsupported-sort`               | yes      |
| `MAX_SIZE_EXCEEDED_TYPE`              | `https://jsonapi.org/profiles/ethanresnick/cursor-pagination/max-size-exceeded`              | yes      |
| `RANGE_PAGINATION_NOT_SUPPORTED_TYPE` | `https://jsonapi.org/profiles/ethanresnick/cursor-pagination/range-pagination-not-supported` | yes      |
| `MEMBER_NAME_PATTERN`                 | section 2.1                                                                                  | no       |
| `EXTENSION_NAMESPACE_PATTERN`         | `^[A-Za-z0-9]+$`                                                                             | no       |
| `PAGE_SIZE_PATTERN`                   | `^[0-9]+$`                                                                                   | no       |
| `PROTO_KEYS`                          | `__proto__`, `constructor`, `prototype`                                                      | no       |
| `RESERVED_QUERY_FAMILIES`             | `include`, `fields`, `sort`, `page`, `filter`                                                | no       |
| `CURSOR_PAGE_MEMBERS`                 | `size`, `after`, `before`                                                                    | no       |
| `DEFAULT_PAGE_SIZE`                   | 20                                                                                           | no       |
| `DEFAULT_MAX_PAGE_SIZE`               | 100                                                                                          | no       |
| `DEFAULT_MAX_OPERATIONS`              | 10                                                                                           | no       |

---

## 14. Test plan

One Vitest run over two projects (`packages/*/vitest.config.ts`), each with `typecheck` enabled for
its `*.test-d.ts`; `@netvark/hono-jsonapi`'s project resolves `@netvark/jsonapi-core` from source
(section 12). V8 coverage thresholds of 90% for statements, branches, functions, and lines over
`packages/*/src/` combined (the `index.ts` barrels excluded). Every test names the clause or server
choice it pins. Fixtures with IO (`test-fixtures.ts`) are real in-memory stores, not mocks of the
packages' own modules.

| Area                           | Files                                                                                                                                                                     | What is pinned                                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Internal                       | `object.test.ts`, `pointer.test.ts`                                                                                                                                       | prototype-safe reads, RFC 6901 escaping and unescaping                                                                                                                                           |
| Media types                    | `parse.test.ts`, `json-api.test.ts`                                                                                                                                       | RFC 9110 grammar, case rules, quoting, `q`, `ext` and `profile` lists                                                                                                                            |
| Negotiation                    | `negotiate.test.ts`                                                                                                                                                       | each rule of 3.3                                                                                                                                                                                 |
| Errors                         | `json-api-error.test.ts`, `error-document.test.ts`                                                                                                                        | catalog closure and spreading, item mapping, both call forms, status derivation, document order                                                                                                  |
| Documents                      | `member-name.test.ts`, `serialize.test.ts`, `build.test.ts`, `conformance.test.ts`                                                                                        | member grammar, serialization rules, sparse fieldsets, `included` rules, full linkage, JSON Schema conformance                                                                                   |
| Resources                      | `define-resource.test.ts`, `define-resource.test-d.ts`, `links.test.ts`, `create-define-resource.test.ts`, `create-define-resource.test-d.ts`                             | every definition-time rejection, inference, the links convention, configured defaults, the resolved `writable` sets                                                                              |
| Query                          | `parse-query.test.ts`, `parse-families.test.ts`, `parse-filter.test.ts`, `parameter-name.test.ts`                                                                         | dispatch, aggregation, each family, the filter grammar                                                                                                                                           |
| Pagination                     | `links.test.ts`, `paginated.test.ts`, `errors.test.ts`                                                                                                                    | link rebuilding, meta members, the profile's error objects                                                                                                                                       |
| Requests                       | `resource-document.test.ts`, `resource-update.test.ts`, `resource-writable.test.ts`, `resource-client-id.test.ts`, `relationship-document.test.ts`, `cardinality.test.ts` | pointers for every structural error, 403/409/422 cases, the fields each operation writes, a client id's validation, an update's id in another spelling, lids                                     |
| Hono (`@netvark/hono-jsonapi`) | `middleware.test.ts`, `respond.test.ts`, `body.test.ts`, `validators.test.ts`, `validators.test-d.ts`, `handlers.test.ts`, `atomic/handler.test.ts`                       | `Vary`, `Content-Type` derivation, `Location`, validator storage and typing, the @netvark/hono-ban handler's rendering, ids, and reports, the operations endpoint's 405, 415, 204, and rendering |
| Atomic                         | `parse-document.test.ts`, `lids.test.ts`, `content-type.test.ts`, `process.test.ts`, `process-semantics.test.ts`, `writable.test.ts`, `process-coverage.test.ts`          | the extension's examples, the host context, and every processing rule                                                                                                                            |

### 14.1 End-to-end suite (`e2e/jsonapi/`)

A private workspace package that depends on `@netvark/jsonapi-core` and `@netvark/hono-jsonapi`
through `workspace:*`, so imports resolve through the published `exports` maps into each `dist/`
(never the `source` condition) and `tsc` checks the emitted declarations. `e2e/jsonapi/support/`
holds a blog API (people, articles, tags; a keyset pagination engine over an in-memory store; a
snapshot transaction) built only from the packages: `store.ts` and `resources.ts` import
`@netvark/jsonapi-core`, the routes and handlers `@netvark/hono-jsonapi`. Each file starts it on
`@hono/node-server` and asserts over `fetch`.

| File                          | Covers                                                                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `package-surface.e2e.test.ts` | the exact export lists of all four subpaths, and that `@netvark/hono-jsonapi` re-exports the core's own bindings                                                                                       |
| `fetch.e2e.test.ts`           | resources, compound documents, sparse fieldsets, sort, filter, 400 and 404 documents, constant 500                                                                                                     |
| `pagination.e2e.test.ts`      | profile on `Content-Type`, default and max size, walking `next` and `prev`, the profile's errors                                                                                                       |
| `mutations.e2e.test.ts`       | create with 201 and `Location`, pointers for bad documents, 403 for a field a write does not accept, alone and beside a 400, update, relationship endpoints and a read-only relationship's 403, delete |
| `negotiation.e2e.test.ts`     | 415, 406, usable instances, requested profiles, the atomic extension on both headers                                                                                                                   |
| `atomic.e2e.test.ts`          | lid flow, positional results, 204, rollback with pointers, a field an operation does not write, 415 and 400 for bad requests                                                                           |
| `custom-catalog.e2e.test.ts`  | an application's own @netvark/hono-ban instance rendering the packages' errors, its entries, and `HTTPException`                                                                                       |

### 14.2 Runtime smoke test (`e2e/jsonapi/smoke/`)

`app.ts` is the same blog API, so both packages load in each runtime; `checks.ts` holds
runtime-neutral assertions over every feature area; `run.ts` drives it in-process on Bun and Deno;
`worker.ts` is the Workers module and `workerd.ts` bundles it with tsdown (`platform: 'neutral'`)
and runs it in Miniflare's workerd. `pnpm test:runtimes` runs all three; CI runs them on every push.
