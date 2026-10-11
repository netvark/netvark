# resource: implementation specification

- Status: normative for the 0.x line of `@netvark/resource-core`; `docs/resource/DESIGN.md` explains
  the why. The bindings (`@netvark/kysely-resource`, `@netvark/hono-resource`,
  `@netvark/react-resource`) add their sections when their epics start.

The key words MUST, MUST NOT, SHOULD, and MAY are used as in RFC 2119. Every section names the
source files that implement it and the tests that prove it. When this document and the code
disagree, fix one of them in the same pull request. References are to JSON:API 1.1, the PostgreSQL
18 manual (the behavior is the same on every supported major, 14 to 18, unless a section says
otherwise), Zod 4.5 and later, JSON Schema 2020-12, and OpenAPI 3.1. PostgreSQL behavior quoted here
was checked on PostgreSQL 14.19 and on PGlite 0.5.8 (PostgreSQL 18.3) through node-postgres.

Contents

1. Public surface and module map
2. The definer
3. The declaration
4. Derived names
5. Wire forms
6. Schemas
7. Codecs and validators
8. Field metadata
9. Errors
10. Messages and localization
11. The JSON:API resource and the keyset definition
12. The `server` subpath
13. OpenAPI and the API diff
14. Declaration errors
15. Test plan
16. Packaging
17. Constants

---

## 1. Public surface and module map

One package with four entry points (ADR 0008). It depends on `@netvark/catalog-core` (its types and
`CATALOG_FORMAT`), `@netvark/jsonapi-core`, `@netvark/keyset-core`, and `@netvark/ban-core`, and
takes `zod` `^4.5.0` as a peer dependency. Nothing in it imports a framework, a query builder, a
driver, or a Node.js module.

| Entry point                      | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@netvark/resource-core`         | `createDeclareResource`, `defineCodec`, `defineValidator`, `errorCatalog`, `forbiddenMembers`, `defineMessages`, `defaultMessages`, `localizeErrors`, `ISSUE_KINDS`, and the types `DeclareResource`, `DeclareResourceConfig`, `DeclareContext`, `DeclarationCheck`, `CodecRegistry`, `CodecTypes`, `ValidatorRegistry`, `ScopeRegistry`, `ScopeColumn`, `DomainRule`, `DomainRules`, `EmptyRegistry`, `DeclaredResource`, `AnyDeclaredResource`, `ResourceNames`, `Declaration`, `FieldDeclaration`, `RelationshipDeclaration`, `RelationshipOperator`, `RuleDeclaration`, `SearchDeclaration`, `SortDeclaration`, `Access`, `Operation`, `Infer`, `FieldMeta`, `FieldFacts`, `FieldLimits`, `ItemMeta`, `WireType`, `ErrorCatalog`, `ErrorEntry`, `ConstraintKind`, `IssueKind`, `ResourceIssue`, `Codec`, `Validator`, `StorageCodec`, `StorageCodecs`, `Messages`, `MessagesFor`, `Message`, `Label`, `ErrorText`, `CodeInputs`, `ConstraintInputs`, `IssueInputs`, `LocalizeErrorsOptions`, `ErrorTransform` |
| `@netvark/resource-core/server`  | `createDomainDefiners`, `defineScope`, `scopeValues`, `defineQuota`, `quotaExceeded`, `defineEvent`, `reject`, `Rejection`, `rejectionError`, `denyAll`, `constraintError`, and the types `Actor`, `AppCodeOf`, `DomainShape`, `DomainContext`, `DomainDefiners`, `Policy`, `PolicyContexts`, `PolicyInit`, `ResourceBehavior`, `CreateBehavior`, `UpdateBehavior`, `RemoveBehavior`, `Rule`, `RuleContext`, `Effect`, `ValuesContext`, `ServerValuesOf`, `PublicRowOf`, `CreateInputOf`, `UpdateInputOf`, `OperationOf`, `MemberNameOf`, `IncludableOf`, `Scope`, `ScopeBindings`, `ScopeKey`, `ScopeValue`, `Quota`, `QuotaContext`, `DomainEvent`, `EventDefinition`, `Reject`, `RejectOptions`, `RejectionErrorOptions`, `ConstraintErrorOptions`, `StorageAdapter`, `StorageWrite`, `StorageListRequest`, `StoragePage`, `PublicRow`                                                                                                                                                                         |
| `@netvark/resource-core/openapi` | `openapi`, `surfaceOf`, `diffSurfaces`, and the types `OpenApiOptions`, `Surface`, `SurfaceChange`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `@netvark/resource-core/testing` | `storageContract`, `contractFixture`, `boundaryFixtures`, and the types `ContractCase`, `ContractHarness`, `ContractFixture`, `ContractCodecs`, `ContractActor`, `Point`, `BoundaryFixture`, `ResourceBoundaries`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

```
packages/resource-core/src/
  index.ts                  root re-exports
  declare/                  createDeclareResource, declareResource, the declaration types, checks (2, 3, 14)
  catalog/                  type-level and prototype-safe runtime lookups into the public catalog
  names/                    derived names and codes, the reverse maps, their type-level twins and checks (4)
  wire/                     the wire forms and their formats, exact decimal comparison, the JSON Schema of each form (5)
  schema/                   value, read, create, and update schemas; rules; issue mapping; Standard Schema (6)
  codecs/                   defineCodec, defineValidator, StorageCodecs (7)
  meta/                     field metadata (8)
  errors/                   derived codes, errorCatalog, forbiddenMembers (9)
  registry/                 the checks of every list of resources: types, codes, targets (4.2)
  messages/                 defineMessages, defaultMessages, the inputs, localizeErrors (10)
  jsonapi/                  the JSON:API resource definition and the keyset definition (11)
  server/                   the server subpath (12)
  openapi/                  the document, the surface, the diff (13)
  testing/                  the storage contract suite and the boundary fixture generators (12.9, 15)
  internal/                 prototype-safe object helpers
```

The end-to-end package is `@netvark/resource-e2e` in `e2e/resource/` (15.4).

---

## 2. The definer (`declare/create-declare-resource.ts`)

```ts
function createDeclareResource<
  const TCatalog extends PublicCatalog & NotFullCatalog,
  const TCodecs extends CodecRegistry = EmptyRegistry,
  const TValidators extends ValidatorRegistry = EmptyRegistry,
  const TScopes extends ScopeRegistry = EmptyRegistry,
  const TDomains extends DomainRules = EmptyRegistry,
>(
  config: DeclareResourceConfig<TCatalog, TCodecs, TValidators, TScopes, TDomains> &
    DomainsCheck<TCatalog, TValidators, TDomains>, // 3.6
): DeclareResource<DeclareContext<TCatalog, TCodecs, TValidators, TScopes, TDomains>>;

interface DeclareResourceConfig<TCatalog, TCodecs, TValidators, TScopes, TDomains> {
  readonly catalog: TCatalog; // the generated public catalog, `as const`
  readonly codecs?: TCodecs | undefined; // { name: defineCodec(...) }
  readonly validators?: TValidators | undefined; // { name: defineValidator(...) }
  readonly scopes?: TScopes | undefined; // { name: { column } }
  readonly domains?: TDomains | undefined; // { domain: { constraint: { validator } } } (3.6)
  readonly links?: ResourceLinksInit | undefined; // @netvark/jsonapi-core
  readonly page?: PageCapabilitiesInit | undefined; // @netvark/jsonapi-core
}
```

`DeclareContext` bundles the catalog and the four registries into the one type parameter every
type-level check reads.

- `catalog` MUST be a public catalog (`toPublicCatalog`, catalog SPEC 3) of format 3
  (`CATALOG_FORMAT` of `@netvark/catalog-core`); a catalog of another format throws `TypeError`, and
  its literal type fails the `TCatalog` constraint. The full catalog is rejected too, because
  declarations reach browsers (ADR 0002): structurally it comes close to `PublicCatalog`, lacking
  only the `partial` of its unique constraints, so the constraint first requires the absence of its
  `schemas` member (`NotFullCatalog`), whose requirement (3, "How mistakes are reported") reads
  `catalog: a full catalog; pass the public catalog (toPublicCatalog), since declarations reach browsers`,
  and the runtime check tests the same member. `NotFullCatalog` comes first in the intersection
  because TypeScript reports only the first member a type fails. @ref
  https://github.com/microsoft/typescript-go/blob/typescript/v7.0.2/internal/checker/relater.go
  (`typeRelatedToEachType`)
- Registries map a name to a value made by `defineCodec`, `defineValidator`, or
  `{ column: string }`. A codec or validator value that the define function did not produce, a copy
  included, fails `tsc` (the values carry a type-only mark, so the error reads
  `Property '[madeByDefineCodec]' is missing`) and throws `TypeError`
  (`createDeclareResource.codecs.phone: must be made by defineCodec`), since the runtime brand is a
  `WeakSet` membership. Scope names are internal and unconstrained; a scope's `column` is checked
  per declaration (3.2).
- An omitted registry is empty. A registry, or any other optional member, that is present MUST hold
  a value of its kind: `null` is refused
  (`createDeclareResource.codecs: must be an object, received null`), since only `undefined` means
  absent, as for JavaScript default parameters. @ref
  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Default_parameters
- `links` and `page` are the application's defaults, checked here with `@netvark/jsonapi-core`'s own
  rules (`links.base` by its link convention, `page.default` and `page.max` positive integers with
  `default <= max`) and merged under every declaration member by member, as `createDefineResource`
  and `createDefineKeyset` merge theirs (jsonapi ADR 0015, keyset ADR 0014). A message from those
  rules gains the definer's prefix (`createDeclareResource.links.base must not end with "/"`). They
  live in the module that exports the configured definer, never in module-level state.

The result is `declareResource(table, declaration)`, typed by the catalog and the registries. Tests:
`create-declare-resource.test.ts`, `create-declare-resource.test-d.ts`.

---

## 3. The declaration (`declare/types.ts`, `declare/declare-resource.ts`)

```ts
interface Declaration {
  readonly as?: string | undefined; // public type (4)
  readonly operations: ReadonlyArray<Operation>; // 'list' | 'get' | 'create' | 'update' | 'remove'
  readonly scope?: ScopeName | undefined;
  readonly clientIds?: boolean | undefined; // default false
  readonly fields: Readonly<Record<ColumnName, FieldDeclaration>>;
  readonly relationships?: Readonly<Record<ForeignKeyColumn, RelationshipDeclaration>> | undefined;
  readonly search?: SearchDeclaration | undefined;
  readonly sort?:
    | { readonly default?: ReadonlyArray<SortInput<SortableColumn>> | undefined }
    | undefined;
  readonly page?: PageCapabilitiesInit | undefined;
  readonly rules?: Readonly<Record<RuleKey, RuleDeclaration>> | undefined;
  readonly description?: string | undefined;
}

type Access = 'read' | 'readWrite' | 'immutable' | 'write';

interface FieldDeclaration {
  readonly access: Access;
  readonly as?: string | undefined;
  readonly codec?: CodecName | undefined; // a codec whose `types` include the column's type
  readonly filter?: ReadonlyArray<Operator> | undefined; // @netvark/keyset-core operators (11.3)
  readonly sort?: boolean | undefined; // default false
  readonly description?: string | undefined;
  readonly example?: unknown; // a wire value the field schema accepts
}

interface RelationshipDeclaration {
  readonly target: () => void; // returns the target's DeclaredResource, read lazily (3.8)
  readonly access: Exclude<Access, 'write'>;
  readonly as?: string | undefined;
  readonly filter?: ReadonlyArray<'eq' | 'ne' | 'in' | 'nin' | 'isNull'> | undefined;
  readonly include?: boolean | undefined; // default false
  readonly description?: string | undefined;
}

interface SearchDeclaration {
  readonly column: ColumnName; // a tsvector column
  readonly config?: string | undefined; // required unless the column is generated with a config
  readonly mode?: TextSearchMode | undefined; // 'websearch' (default), 'plain', 'phrase'
}

interface RuleDeclaration {
  readonly code?: string | undefined; // the public error code (4.2)
  readonly validator?: ValidatorName | undefined; // only on a CHECK whose rule is null (3.5)
}
```

Every key is a database name (ADR 0002): `table` is a key of `catalog.tables`, `fields` keys are
columns of that table, `relationships` keys are columns of a single-column foreign key, sort entries
are sortable field columns with an optional `-` prefix, and `rules` keys are constraint names or the
NOT NULL keys of 3.5. `declareResource` returns a `DeclaredResource`: `table` (the catalog key),
`declaration` (the declaration as given, frozen), and the members of sections 4 to 11. Its members
are computed once, at declaration, except `linkage`, `fields`, and `resource`, which need the
relationship targets and are computed on first access (3.8). Its type also carries the definer's
`DeclareContext` as the type-only member `'~context'`, always absent at runtime, for type helpers
such as `Infer`.

A type helper constrains its resource by `AnyDeclaredResource`, the members every resource's type
records (`table`, `declaration`, `names`, and `'~context'`), never by the wide `DeclaredResource`.
The typed members are conditional types of the definer context, so TypeScript relates two contexts
invariantly, fails in the wide-to-specific direction, and falls back to comparing the members. A
type argument's constraint check reports errors from the start, and in that mode the failed check is
recomputed on every reference instead of read from the cache, about 45 ms and 23 MB per reference on
stern (15.5). A variable's initializer is checked without reporting first, so a value annotated with
`DeclaredResource` stays cheap. @ref
https://github.com/microsoft/typescript-go/blob/typescript/v7.0.2/internal/checker/relater.go

How mistakes are reported (`declare/requirement.ts`). `declareResource` is
`(table: TTable & IdentityCheck, declaration: TDecl & DeclarationCheck) => DeclaredResource`, with
`const` type parameters: TypeScript infers the literal declaration, then holds it against what the
catalog and the registries allow. A check adds nothing for a valid part. For a mistake it adds one
of two things, so the error sits at the offending option and carries its reason:

- a requirement, a property no value has whose key is the message:
  `Property '"access: immutable needs the create operation"' is missing in type '{ access: "immutable"; }'`;
- for a key that cannot be declared at all, a string-literal type the declared object cannot match:
  `Type '{ access: "read"; }' is not assignable to type '"\"fax\" is not a column of contacts"'`.

A check never intersects a member with a different literal type: TypeScript reduces such an object
to `never` and the message is lost. Each check is built so a valid declaration pays for no error
type: a mapped type of unknown members is built only when a member is unknown, and the messages for
invalid keys come from a separate mapped type built only when there is one; on real catalogs the
first rule alone made the check about six times faster (15.5, and the package README's performance
notes). @ref
https://devblogs.microsoft.com/typescript/announcing-typescript-3-9/#intersections-reduced-by-discriminant-properties

### 3.1 Access

| Access      | Read | Create | Update | OpenAPI     |
| ----------- | ---- | ------ | ------ | ----------- |
| `read`      | yes  | no     | no     | `readOnly`  |
| `readWrite` | yes  | yes    | yes    |             |
| `immutable` | yes  | yes    | no     |             |
| `write`     | no   | yes    | yes    | `writeOnly` |

The column decides which modes are allowed; anything else fails `tsc` and throws `TypeError`:

| Column                                     | Declared as                                                                                    |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| the primary key                            | never: it is the resource `id`; `clientIds` accepts it on create (3.4)                         |
| generated (`generated` set)                | a field with `read`                                                                            |
| identity `always`                          | a field with `read`                                                                            |
| identity `byDefault`                       | a field with `read` or `immutable`                                                             |
| a single-column foreign key                | a relationship only (JSON:API: keys that reference related resources SHOULD NOT be attributes) |
| the scope column                           | never as a field; as a relationship with `read` at most                                        |
| a column of a type without a wire form (5) | a field with a `codec` only                                                                    |
| a `tsvector` column                        | not a field; `search.column` only                                                              |
| any other column                           | a field with any mode                                                                          |

A relationship's foreign key MUST reference the primary key of a table of the public catalog,
because the linkage it produces is that table's resource id (3.4); a foreign key to a unique column
or to a table outside the public catalog is refused. Its column's type MUST be able to carry a
resource id (3.4). A NOT ENFORCED foreign key (`enforced: false`, catalog ADR 0010) declares a
relationship too, since it still relates the two tables; the database lets its column hold an id
that no row of the target has, so a linkage may name a resource that does not exist.

@ref https://jsonapi.org/format/1.1/#document-resource-object-attributes

### 3.2 Scope

`scope` names an entry of the definer's `scopes`. The table MUST have the scope's column. The scope
column is never writable by clients: the server writes it on create from the actor (12.5) and adds
it to every statement. A declaration with no `scope` describes a table every actor with permission
sees in full; `@netvark/kysely-resource` decides at boot whether that is allowed.

### 3.3 Operations

`operations` is a non-empty list without repetition. `update` requires at least one field or
relationship writable on update (`readWrite` or `write`), and a member whose access writes needs an
operation that writes it: `immutable` needs `create`, `readWrite` and `write` need `create` or
`update`. `create` places no requirement on the members themselves: a column that is required on
insert (6.3) and that no client-writable field, relationship, scope, or client id covers is a server
value, and the server definition fails `tsc` until it supplies it (`ServerValuesOf`, 12.3).

### 3.4 Identity

The table MUST have a single-column primary key; it becomes the resource `id`, a string on the wire
in the id column's wire form (5). The column's type MUST have a scalar wire form other than `json`
and `jsonb`, followed through its domains (`isIdentifierColumn`): JSON:API ids are strings, and a
JSON value has no string form to be one. PostgreSQL accepts a `jsonb` primary key and a foreign key
to it, since `jsonb` has a btree operator class, so the definer is what refuses them; the same rule
holds for a relationship's foreign-key column, whose values are the target's ids.

`@netvark/keyset-core` orders every page by the key (11.2), so its column MUST also have a keyset
type. Every scalar form has one except an enum without values, an enum type without labels or a text
key whose `enum` rules leave none; such a key fails `tsc` at the table name and throws
`things: the primary key is an enum without values, which @netvark/keyset-core cannot order`.

JSON:API ids are strings, so an id travels in its key's wire form when that form is a string
(`text`, `uuid`, `int8`, `numeric`, a date, an enum label), and otherwise as one canonical text: an
`int2` or `int4` key as integer text in `int8`'s spelling (5.1) within the type's range, a `real` or
`double precision` key as JavaScript's shortest round-trip text (`String(value)`, what a server
writes when it reads the column as a number), and a `bool` key as `true` or `false`. The key's rules
apply to the value the text names. Other spellings PostgreSQL reads (`+1`, `01`, `1.0`, `1e3`, `-0`,
` 1`, `t`, `TRUE`) are refused, so an id has one spelling and two ids compare as text.

With `clientIds: true` a create MAY carry an `id`, validated by that form; without it a create that
carries one is rejected by `@netvark/jsonapi-core` (403, JSON:API "Client-Generated IDs").
`clientIds` requires a primary key that accepts a client value: a generated column and an identity
column `GENERATED ALWAYS` reject an explicit value on insert ("cannot insert a non-DEFAULT value"),
while an identity column `BY DEFAULT` accepts one. A primary key with no default and no identity,
and no `clientIds`, is a server value on create.

@ref https://jsonapi.org/format/1.1/#document-resource-object-identification @ref
https://jsonapi.org/format/1.1/#crud-creating-client-ids @ref
https://www.postgresql.org/docs/18/sql-createtable.html#SQL-CREATETABLE-PARMS-GENERATED-IDENTITY
@ref https://www.postgresql.org/docs/18/datatype-json.html#JSON-INDEXING

### 3.5 Rules

`rules` keys are the names of the table's constraints (any kind) and, for each column that is NOT
NULL in the catalog (`nullable: false`), the key `<table>_<column>_not_null` (PostgreSQL 18's own
name for that constraint; ADR 0003). `code` renames the derived error code of any key that has one
(9.1). `validator` names a validator for an enforced CHECK whose `rule` is `null`:

- It is REQUIRED for every such CHECK whose `columns` include a column that a declared operation
  writes (a field or relationship whose access is not `read`); the declaration fails `tsc` without
  it.
- It is an error on a CHECK that has a rule (the rule already enforces it, proven by the recognizer)
  and on any other constraint kind.
- It is an error on a NOT ENFORCED CHECK (`enforced: false`, catalog ADR 0010), whatever its rule,
  and such a CHECK never requires one: PostgreSQL never checks it and stores rows that break it, so
  a validator would refuse values the table holds. Its rule, if a catalog carries one, applies
  nowhere (6.1), and it derives no code (9.1).

### 3.6 Domain rules

A domain's CHECK whose `rule` is `null` is covered once for the application, in the definer:
`domains: { email: { email_check: { validator: 'email' } } }`, keyed by the domain's reference name
and its constraint name. It is REQUIRED when a declared writable field's column, or the element of
an array column, has that domain, directly or through a base domain, and it is an error on a CHECK
that has a rule, as in 3.5. TypeScript checks `domains` against the catalog and the validators
(`DomainsCheck`) where the definer is created.

A rule MAY give `code`, which replaces the CHECK's derived code, its constraint name upper-cased
(4.1, `email_check` derives `EMAIL_CHECK`); a given or derived code MUST match `CODE_PATTERN`, so a
constraint name outside A-Z, 0-9, and `_` needs one. The validator's issues carry that code (6.4) on
every column of the domain, as a table CHECK's validator carries the table constraint's code.

A CHECK that has a rule takes no entry, so its code is always its name upper-cased.
`declareResource` refuses a resource where that code is not A-Z, 0-9, and `_`, or repeats another
code of the resource (9.1), and renaming the constraint in a migration is then the only fix.

The validator receives every value the domain holds where it runs (7.2), so its input type MUST
accept: the domain's value, the output type of its base type; the output of each codec whose `types`
name the domain or a domain over it, up to the first array, since a codec field keeps its domains'
validators (6.1); and `null`, unless the domain or a base domain is NOT NULL or has a `notNull`
rule. The definer cannot see which columns use the domain, so a domain that a NOT NULL column alone
uses still needs a validator that accepts `null`; with a nullable column the CHECK passes `NULL` and
so does the validator. TypeScript checks the input where the definer is created
(`validator: "strictEmail" does not accept every value of domain email`); nothing checks it at
runtime, since an input type has no runtime form.

### 3.7 Search, sort, page

- `search.column` MUST be a `tsvector` column of the table. When the column is generated and the
  catalog records its `searchConfig`, that is the configuration; a declared `config` MUST equal it.
  When it is not generated, `config` is REQUIRED. The configuration MUST be a name
  `@netvark/keyset-core` accepts, `^[a-z_][a-z0-9_]{0,62}$` (keyset SPEC 3.4, its `isSearchConfig`):
  keyset-core emits it as a SQL literal, so it is an unqualified name such as `english` or `simple`,
  which PostgreSQL resolves through the session's `search_path`. A declared `pg_catalog.english`
  throws
  `documents.search.config: "pg_catalog.english" is not a text search configuration @netvark/keyset-core accepts (^[a-z_][a-z0-9_]{0,62}$)`,
  and a column generated with a configuration outside the extracted schemas, which the catalog
  records qualified because PostgreSQL prints it so, cannot be searched:
  `documents.search.column: the column is generated with config "app.unaccented", which @netvark/keyset-core does not accept (^[a-z_][a-z0-9_]{0,62}$)`.
  The search parameter is `filter[q]` (`SEARCH_PARAMETER`). @ref
  https://www.postgresql.org/docs/18/datatype-oid.html (a `regconfig` prints schema-qualified when
  the search path would not find it)
- `sort.default` entries name fields declared with `sort: true`, each once, whatever the direction:
  `contacts.sort.default[1]: "name" is listed twice`. The key is appended by `@netvark/keyset-core`
  (keyset SPEC 5), which refuses a repeated field.
- `page` overrides the definer's `page` member by member.

### 3.8 Relationship targets

`target` returns the declared resource of the table the foreign key references, so a declaration
names its targets and declarations may reference each other in either order and across modules. Its
declared type is `() => void`, not `() => DeclaredResource`: TypeScript compares a function against
one returning `void` without resolving the function's return type, so it infers each declaration
without first inferring its targets. With any other return type, two declarations that reference
each other fail with TS7022 ("implicitly has type 'any' because it ... is referenced directly or
indirectly in its own initializer"), as TypeScript 7.0 reports. The declaration's type still records
the function, and with it the target's type, for `Infer` and the linkage schemas. @ref
https://github.com/microsoft/TypeScript/wiki/FAQ#why-are-functions-returning-non-void-assignable-to-function-returning-void

The check that the target is a declared resource of the referenced table therefore runs where the
targets are read: TypeScript checks it where a registry is assembled, at the listed resource whose
relationship fails (4.2), and at runtime the first read of a target, and the registry, throw
`TypeError`
(`contacts.relationships.organization_id.target: the target is a resource of users; the foreign key references organizations`),
and a target that returns anything but a declared resource throws
`... .target: must return the declared resource of organizations`. Nothing reads a target while
modules load, so a target declared later in the module graph is read after it exists: the first read
of `linkage` or `write` (6.2), `fields` (8), or `resource` (11.1), each of which reads every target,
is where a wrong target fails, and a failed read throws again on the next.

Tests: `declare-resource.test.ts`, `declare-fields.test.ts`, `declare-relationships.test.ts`, and
`declare-options.test.ts` (every `TypeError` of 14 a declaration can throw), with
`not-enforced.test.ts` and `not-enforced.test-d.ts` for NOT ENFORCED constraints (3.5, 6.1, 9.1);
`declare-resource.test-d.ts` (the valid forms, two declarations that reference each other among
them); `declare-resource-errors.test-d.ts` and `declare-options-errors.test-d.ts` (every compile
error above, each as a `@ts-expect-error` on the offending option); and `e2e/resource/fails/`, which
pins the compiler's message for each.

---

## 4. Derived names (`names/`, ADR 0003)

### 4.1 The derivations

| Public name  | Derived from                               | Override                 | Example                                            |
| ------------ | ------------------------------------------ | ------------------------ | -------------------------------------------------- |
| type         | the table's `name` (without its schema)    | `as` on the declaration  | `contact_phones`                                   |
| field        | `camelCase(column)`                        | `as` on the field        | `created_at` is `createdAt`                        |
| relationship | `camelCase(column without its _id suffix)` | `as` on the relationship | `organization_id` is `organization`                |
| error code   | the rule key, upper-cased                  | `code` on the rule       | `contacts_email_unique` is `CONTACTS_EMAIL_UNIQUE` |
| `id`         | the primary key column                     | none                     |                                                    |

`camelCase` is CamelCasePlugin's conversion with default options, the one `@netvark/pg-catalog` uses
for `camelCase` Kysely types: the first character is kept, every `_` is dropped, and a character
that follows a `_` is upper-cased with `String.prototype.toUpperCase` (`a__b` is `aB`, `_tmp` is
`_Tmp`, `Mixed Case` is unchanged). Both packages read one implementation, `toCamelCase` of
`@netvark/catalog-core`, and `names/camel-case.ts` holds its type-level twin `CamelCase<S>`.
Upper-casing uses `String.prototype.toUpperCase` at runtime and the intrinsic `Uppercase<S>` in
types, which applies the same function. The two differ in one case: the plugin reads UTF-16 code
units, so it leaves a cased letter outside the Basic Multilingual Plane after `_` as it is (`x_𐐨`),
where `Uppercase` upper-cases it; `deriveNames` refuses such a column without `as`. @ref
https://github.com/kysely-org/kysely/blob/v0.28.17/src/plugin/camel-case/camel-case.ts

A relationship column MUST end in `_id` with at least one character before it; otherwise `as` is
REQUIRED.

### 4.2 Checks

- Types, fields, and relationships MUST be JSON:API member names (`isMemberName` of
  `@netvark/jsonapi-core`): at least one character, only the allowed characters, a globally allowed
  character first and last. JSON:API requires the same of type values. None of them may be
  `constructor` or `prototype`, which `@netvark/jsonapi-core` refuses because their lookup reaches
  `Object.prototype`. @ref https://jsonapi.org/format/1.1/#document-member-names
- Fields and relationships of a resource share one namespace that also holds `type`, `id`, and
  `lid`, the members a resource object carries; a collision (a `foo_id` relationship next to a `foo`
  column, or a column named `type`) needs `as`. @ref
  https://jsonapi.org/format/1.1/#document-resource-object-fields
- Codes MUST match `^[A-Z][A-Z0-9_]*$` (`CODE_PATTERN`), so `CONTACTS_GRÖSSE_CHECK` needs `code`,
  and the codes of one resource MUST be distinct. `code` is accepted only on a key that has a code
  (9.1): a key clients cannot violate has none.
- Across a registry (every place that takes a list of resources: `errorCatalog`, `defineMessages`,
  `openapi`, the server runtime), each resource is listed once and types are unique; every
  relationship's target is a declared resource of the table its foreign key references and is in the
  registry (3.8); and each code comes from one constraint and is distinct from the application's own
  codes, `@netvark/jsonapi-core`'s `ERROR_CODES`, `@netvark/ban-core`'s built-in keys (a derived
  `CONFLICT` would replace the built-in entry), and resource-core's `QUOTA_EXCEEDED`. A code that
  several resources derive from one constraint, a domain they share or a table two of them declare,
  is one code. The application's codes cannot replace `QUOTA_EXCEEDED`.

`declareResource` makes every check of one resource at runtime (`names/derive-names.ts`). TypeScript
makes those it can afford at the declaration (`names/names-check.ts`, `names/codes-check.ts`):

- the type's name, derived or given;
- each member that gives `as`, and each member whose column is in the table's name risk
  (`names/name-risk.ts`): a column that is not lower case, starts or ends with `_`, holds `__`, `_`
  before a digit, or `$`; a reserved name (`type`, `id`, `lid`, `constructor`, `prototype`); a
  foreign key without `_id` or whose base is reserved; and a column `x` next to a foreign key
  `x_id`. Such a member is checked for its name and against every other member;
- each given `code`: its pattern, that its key has a code, and that no other code of the resource,
  given or derived, is the same.

Apart from the cases below, a lower-case column outside the name risk gets a valid name that no
other such column gets, so TypeScript compares it only with the members above. The name risk reads
the catalog alone, so TypeScript computes it once per table. Only the runtime reports:

- a character only a quoted identifier holds, such as `.`, `-`, or a space (`"suite-"`): matching
  every reserved character added about a tenth to the check time on the real catalogs (15.5);
- two lower-case columns that get one name because a letter after `_` has no upper case, shares its
  upper case with another letter, or upper-cases to several letters (`a_ß` and `a_s_s` both give
  `aSS`);
- a cased letter outside the Basic Multilingual Plane after `_` (4.1);
- a derived code that does not match `CODE_PATTERN` or that another code repeats: derived codes come
  from the catalog alone, and checking every rule key of a real catalog in types cost about as much
  as all the other checks together (15.5).

The registry checks (`registry/check-registry.ts`) run where the registry is assembled. A list that
is not an array of resources `declareResource` returned, or application codes that are not
`@netvark/ban-core` error definitions, throw at once. Every conflict is then collected into one
`TypeError`, in the registry's public names:

```
errorCatalog: contacts is listed twice; appErrors.QUOTA_EXCEEDED replaces resource-core's own code; relationship contacts.organization targets organizations, which is not listed
```

A duplicate code names each constraint behind it, so the message says where `code` goes:
`code SHORT_TEXT_CHECK is derived by organizations from domain short_text.short_text_check and by contacts from contacts.contacts_name_check, so all but one need a code`.
TypeScript makes the target checks where the list is passed (`registry/registry-check.ts`), with the
runtime's message at the listed resource whose relationship fails, and skips a resource whose table
it does not know. Code conflicts are runtime-only, like the derived codes they compare.

### 4.3 Reverse maps

`names` on a declared resource holds both directions as `ReadonlyMap`s, so lookups never meet a
prototype:

```ts
interface ResourceNames {
  readonly type: string;
  readonly table: string; // the catalog key
  readonly id: string; // the primary key column
  readonly fields: ReadonlyMap<string, string>; // public name to column
  readonly relationships: ReadonlyMap<string, string>; // public name to foreign-key column
  readonly columns: ReadonlyMap<string, string>; // column to public name, fields and relationships
  readonly codes: ReadonlyMap<string, string>; // code to rule key
  readonly rules: ReadonlyMap<string, string>; // rule key to code
}
```

Storage translates public names to columns through it, and the error mapping translates a constraint
back to a code and its columns to pointers (9.5).

Tests: case tables in `src/test-support/` hold each runtime function and its type-level twin to the
same pairs: `camel-cases.ts` (captured from Kysely's plugin; `@netvark/pg-catalog`'s
`key-names.test.ts` runs the conversion against the plugin itself), `member-name-cases.ts`,
`code-cases.ts`, and `names-cases.ts`, whose declarations `deriveNames` (`derive-names.test.ts`) and
the type-level `TypeNameOf`, `FieldNames`, `RelationshipNames`, and `CodeNames`
(`public-names.test-d.ts`) must name alike. `derive-names-errors.test.ts` covers every runtime
check, and `names-check.test-d.ts` and `codes-check.test-d.ts` every compile-time one, with one
mistake per declaration so none hides another, over the names catalog (`test-support/names.ts`,
extracted by `@netvark/pg-catalog`): `notes` and `addresses`, whose columns fail every check, and
two tables whose names cannot be a type.

---

## 5. Wire forms (`wire/`, ADR 0005)

### 5.1 The table

A column's wire form is chosen by its catalog `type` (the element type for an array) and `typeKind`.
Reads produce exactly the read form; writes accept exactly the values in the "Write" column.

| `type`                                              | Wire            | Write accepts                                                                                                                                                   | Read form                                                  | JSON Schema                                              |
| --------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| `text`, `varchar`, `bpchar`, `citext`               | string          | a well-formed string (no unpaired surrogate) without U+0000; with `maxLength` n, at most n code points                                                          | as stored; `bpchar(n)` padded to n as PostgreSQL prints it | `{ type: 'string', maxLength }`                          |
| `int2`                                              | number          | an integer in [-32768, 32767]                                                                                                                                   | the number                                                 | `{ type: 'integer', format: 'int16', minimum, maximum }` |
| `int4`                                              | number          | an integer in [-2147483648, 2147483647]                                                                                                                         | the number                                                 | `{ type: 'integer', format: 'int32', minimum, maximum }` |
| `int8`                                              | string          | `^(0\|-?[1-9][0-9]*)$` (zero has no sign) within [-9223372036854775808, 9223372036854775807]                                                                    | PostgreSQL's text                                          | `{ type: 'string', format: 'int64', pattern }`           |
| `numeric`                                           | string          | `^-?(0\|[1-9][0-9]*)(\.[0-9]+)?$` without a negative zero (`-0`, `-0.00`); with `(p, s)`, at most s fraction digits and an absolute value below 10^(p-s)        | PostgreSQL's text (`numeric(5,2)` prints `1.00`)           | `{ type: 'string', format: 'decimal', pattern }`         |
| `float4`                                            | number          | a finite number whose `Math.fround` is finite, and nonzero when the number is                                                                                   | the number                                                 | `{ type: 'number', format: 'float' }`                    |
| `float8`                                            | number          | a finite number                                                                                                                                                 | the number                                                 | `{ type: 'number', format: 'double' }`                   |
| `bool`                                              | boolean         | `true`, `false`                                                                                                                                                 | the boolean                                                | `{ type: 'boolean' }`                                    |
| `uuid`                                              | string          | 8-4-4-4-12 hexadecimal digits, either case                                                                                                                      | lower case                                                 | `{ type: 'string', format: 'uuid' }`                     |
| `date`                                              | string          | `YYYY-MM-DD` naming a real calendar day in the years 0001 to 9999                                                                                               | the same                                                   | `{ type: 'string', format: 'date' }`                     |
| `timestamp`                                         | string          | RFC 3339 `full-date "T" full-time` without an offset: seconds required, at most six fraction digits and only zeros past p for `timestamp(p)`, the date as above | the same, fraction as PostgreSQL prints it                 | `{ type: 'string', format: 'date-time-local' }`          |
| `timestamptz`                                       | string          | RFC 3339 `date-time` with `Z` or `±HH:MM`: seconds required, at most six fraction digits and only zeros past p for `timestamptz(p)`, the date as above          | the instant in UTC with `Z`                                | `{ type: 'string', format: 'date-time' }`                |
| `json`, `jsonb`                                     | any             | any JSON value; for `jsonb`, no U+0000 in any string                                                                                                            | the parsed value                                           | `{}`                                                     |
| an enum (`typeKind: 'enum'`)                        | string          | one of the labels, in the catalog's order                                                                                                                       | the label                                                  | `{ type: 'string', enum }`                               |
| a domain (`typeKind: 'domain'`)                     | the base type's | the base type's form, then the domain's rules and NOT NULL                                                                                                      | the base type's                                            | the base type's, with the rules' keywords                |
| an array of any of the above but `json` and `jsonb` | array           | a one-dimensional array of non-null elements in the element's form                                                                                              | the same                                                   | `{ type: 'array', items }`                               |

@ref https://www.postgresql.org/docs/18/datatype.html @ref
https://www.rfc-editor.org/rfc/rfc3339#section-5.6 @ref https://spec.openapis.org/registry/format/

`citext` is an extension type, matched by its reference name in any schema (`extensions.citext` when
the extension lives outside the default schema); it has `text`'s wire form and compares
case-insensitively in the database, which the wire form does not change. @ref
https://www.postgresql.org/docs/18/citext.html

Every other type has no wire form and needs a codec (7): among them `time`, `timetz`, `interval`,
`bytea` (a codec states its encoding, base64 or hex), `money`, `inet`, `cidr`, `macaddr`, `bit`,
`varbit`, `xml`, `tsquery`, the geometric types, ranges, multiranges, composites, the `oid` types,
and extension types such as `vector`, `hstore`, and `ltree`, and arrays of `json` and `jsonb`, whose
`null` element would mean either SQL `NULL` or the JSON value `null`. A `tsvector` column is only
ever a search column (3.7).

### 5.2 Why each restriction exists

Each restriction is a place where PostgreSQL rejects the value or stores a different one (ADR 0005):

- `varchar(n)` and `bpchar(n)` count code points (`varchar(1)` holds `U+1F600`), and silently
  truncate excess characters that are all spaces; the write form rejects them instead of storing
  less than was sent. @ref https://www.postgresql.org/docs/18/datatype-character.html
- U+0000 fails with 22021 in every text type, and an unpaired surrogate reaches the server as U+FFFD
  because the client encodes UTF-8. `String.prototype.isWellFormed` is the check.
- `numeric(p, s)` rounds to s fraction digits (`1.005` becomes `1.01`) and fails with 22003 when the
  rounded value needs more than p - s integer digits; `NaN` and the infinities have no decimal form.
  An unconstrained `numeric` keeps the digits as written (`1.50`). @ref
  https://www.postgresql.org/docs/18/datatype-numeric.html#DATATYPE-NUMERIC-DECIMAL
- `real` fails with 22003 on overflow (`3.5e38`) and on underflow (`1e-50`). JSON has no `NaN` or
  infinity, so neither float type admits them.
- `bigint` and `numeric` exceed JavaScript's exact integers, so they travel as strings in one
  canonical spelling (PostgreSQL also accepts `+5`, `007`, surrounding spaces, and `-0`, which it
  stores and prints as `0`).
- `timestamptz` rounds to microseconds and accepts minute precision; `timestamp` silently ignores an
  offset (`'2020-01-01T06:15:00+02:00'::timestamp` is `06:15:00`); `date` accepts years beyond 9999,
  BC dates, and `infinity`, which RFC 3339 cannot express. @ref
  https://www.postgresql.org/docs/18/datatype-datetime.html
- `timestamp(p)` and `timestamptz(p)` round to p fraction digits, possibly into the next day or year
  (`'9999-12-31 23:59:59.999999'::timestamp(3)` is `10000-01-01 00:00:00`), so a non-zero digit past
  p is refused; zeros past p keep the instant (`12:00:00.000Z`, what `Date.prototype.toISOString`
  writes, fits `timestamptz(0)`). The catalog records p as the column's or domain's `precision`, an
  array column its element's (catalog SPEC 7.3); without one, six. Zod's
  `z.iso.datetime({ precision })` also reports a wrong fraction as a format issue (6.4). @ref
  https://zod.dev/api?id=iso-datetimes
- `jsonb` fails with 22P05 on `\u0000`; `json` stores it.
- `text[]` accepts `NULL` elements and values of any dimension; the wire form admits neither, and a
  column that needs them needs a codec.

A stored value outside the read form (a `date` of `infinity`, a `NaN` in `double precision`, a
two-dimensional array) cannot be represented: the storage adapter MUST fail the read with an error
rather than emit a different value (12.8).

### 5.3 Exact comparison

Range rules and type bounds compare the value PostgreSQL would compare (ADR 0005):

- `int8` and `numeric` values and every decimal bound are compared exactly, digit by digit
  (`wire/decimal.ts`), never through a JavaScript number.
- `float4` values are compared after `Math.fround`, against the bound as a double: `0.1::real > 0.1`
  is true in PostgreSQL, because the comparison promotes the rounded `real` to `double precision`,
  and `Math.fround(0.1) > 0.1` is true in JavaScript. The recognizer emits no rule for a `real`
  column (catalog SPEC 8.1), so only a hand-written catalog reaches this comparison; `real`'s own
  limits are its wire form's (5.2).
- `float8`, `int2`, and `int4` values are compared as numbers against `Number(bound)`, the same
  correctly rounded conversion PostgreSQL applies to the numeric constant.

Tests: `wire-forms.test.ts` and `wire-string-forms.test.ts` hold, per row, the values the write form
accepts and rejects, `datetime-precision.test.ts` the fraction digits of `timestamp(p)` from a
column, a domain, a domain over it, and an array element, and `decimal.test.ts` the exact
comparison; the oracle runs the same values and generated boundaries through PostgreSQL (15.3).

---

## 6. Schemas (`schema/`, ADR 0004)

### 6.1 The value schema of a field

A field's value schema is built in this order, each step narrowing the previous one:

1. The wire form of the column's type (5), or the codec's schema when the field names one (7.1).
2. For a domain, the rules of the domain and of each base domain, and its NOT NULL.
3. The rules of the table's enforced CHECK constraints whose `columns` are exactly this column; a
   NOT ENFORCED one (catalog ADR 0010) contributes nothing, not even `notNull`, so the schema
   accepts every value the database stores.
4. `.nullable()` when the column is effectively nullable: `nullable: true` in the catalog, no
   `notNull` rule on the column or a domain, and no NOT NULL domain.
5. The validator of each such CHECK whose rule is `null` (3.5), and of each such domain CHECK (3.6).
   A validator receives every value the previous steps accepted, `null` included, because a CHECK
   sees `NULL` too.

A field with a codec takes the codec's schema in place of steps 1 to 3: the codec owns its
representation, and the oracle runs the column's generated rule boundaries through the codec's
schema and storage facet to prove it enforces them (15.3).

Rules become checks over the wire value:

| Rule                        | Check                                                                                     | Issue kind (6.4)                                             |
| --------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `length { min, max }`       | `.min(min)`, `.max(max)` on a string: code points, as `char_length` counts (Zod 4.5+)     | `minLength`, `maxLength`                                     |
| `range { min, max }`        | the comparisons of 5.3, inclusive or exclusive per bound                                  | `minimum`, `exclusiveMinimum`, `maximum`, `exclusiveMaximum` |
| `enum { values }`           | membership; the field's TypeScript type narrows to the union of the values                | `enum`                                                       |
| `notNull`                   | the field is not nullable (step 4)                                                        | `required`                                                   |
| `pattern { source, flags }` | `new RegExp(source, 'su').test(value)`, a search like PostgreSQL's `~` (catalog SPEC 8.4) | `pattern`                                                    |

@ref https://www.postgresql.org/docs/18/functions-string.html (`char_length`) @ref
https://github.com/colinhacks/zod/pull/6441 (code points since 4.5.0)

A rule describes non-null values (catalog SPEC 2.9), so every check except `notNull` applies only to
non-null values.

### 6.2 Read, create, and update

`schema` on a declared resource holds three Zod object schemas over the resource's attributes, keyed
by public names:

| Schema   | Members                                       | Required                                             | Unknown keys |
| -------- | --------------------------------------------- | ---------------------------------------------------- | ------------ |
| `read`   | fields with `read`, `readWrite`, `immutable`  | every member                                         | stripped     |
| `create` | fields with `readWrite`, `immutable`, `write` | the members whose column is required on insert (6.3) | rejected     |
| `update` | fields with `readWrite`, `write`              | none                                                 | rejected     |

`linkage` holds the same three for relationships: each member is `{ type, id }` with the target's
type as a literal and the id in the target id's form (3.4), or `null` when the foreign-key column is
effectively nullable. A relationship is required on create when its column is required on insert.

`write.create` and `write.update` are Standard Schema validators (6.5) of a create or an update as
`@netvark/jsonapi-core` parses a resource object: `{ attributes, relationships }`, both members
present (the parser gives `{}` for one the document leaves out), each relationship as its `data`.
Each part is validated by its object schema, and the multi-column CHECKs that span a field and a
relationship run there, the one place both are in view. Issue paths start with `attributes` or
`relationships` (9.3). `schema` and `linkage` are Zod schemas, whose issues are Zod's; `validate`
and `write` report `ResourceIssue`s (6.4).

- `read` strips keys it does not know instead of rejecting them, so a client that validates
  responses keeps working when the server adds a field; a response with a sparse fieldset is
  validated with `schema.read.pick(...)` of the requested members.
- Optional members accept a missing key and `undefined` alike, and the parsed output never holds a
  member whose value is `undefined` (ADR 0004).
- No schema carries `.default()`, `.prefault()`, `.catch()`, or a transform that adds a member; a
  test walks every composed schema and fails on any of them.
- Multi-column validators (3.5) run after the members parse: on `schema` when every column of the
  CHECK is a field, on `linkage` when every column is a relationship, and on `write` when they mix.
  Each runs only when every member of its CHECK is present in the input; otherwise the database
  decides (9.5). A relationship enters the validator as its id (7.2), and a refusal raises one issue
  per member, each carrying the CHECK's code.
- `Infer<typeof Contacts>` is `{ read, create, update, linkage: { read, create, update } }`, each
  the output type of the matching schema. A field whose catalog type is an enum, or whose CHECK is
  an `enum` rule, has the union of its values as its type.

### 6.3 Required on insert

A column is required on insert when all of these hold, and optional otherwise:

- it is effectively NOT NULL: `nullable: false`, a `notNull` rule on the column or a domain in its
  chain, or a NOT NULL domain;
- it has no default: `default` is `null` on the column and on every domain in its chain;
- it is not an identity column and not a generated column.

A required column that no client-writable member covers is a server value (3.3, 12.3).

### 6.4 Issues (`schema/issues.ts`, ADR 0007)

Every issue a composed schema reports is a `ResourceIssue`, which is both a Standard Schema issue
and a `@netvark/ban-core` `ValidationIssue`:

```ts
interface ResourceIssue {
  readonly message: string; // English, constant per kind and parameter, never request data
  readonly path: ReadonlyArray<string | number>; // public names and array indexes
  readonly code: IssueKind | string; // a kind, or a validator's constraint code
  readonly expected?: string | undefined; // the keyword's value as text
}

type IssueKind =
  | 'required'
  | 'type'
  | 'format'
  | 'minLength'
  | 'maxLength'
  | 'minimum'
  | 'maximum'
  | 'exclusiveMinimum'
  | 'exclusiveMaximum'
  | 'multipleOf'
  | 'enum'
  | 'pattern'
  | 'additionalProperties';
```

| Kind                                                         | Raised when                                                             | `expected`                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `required`                                                   | a required member is missing, or `null` where the field is not nullable | absent                                                                                                                                                                                                                                                                                       |
| `type`                                                       | the JSON type is wrong                                                  | `string`, `integer`, `number`, `boolean`, `array`, `object`                                                                                                                                                                                                                                  |
| `format`                                                     | a value is not in its wire form (5.1), a date-time's fraction included  | `uuid`, `date`, `date-time`, `date-time-local`, `int64`, `decimal`, `float` (beyond `real`), `json` (no JSON value), or `text` (U+0000 or an unpaired surrogate); for an id (3.4) also `int16`, `int32`, and `double`; for a codec field, the codec's name, at the path of the codec's issue |
| `minLength`, `maxLength`                                     | a length rule or `varchar(n)` fails                                     | the bound                                                                                                                                                                                                                                                                                    |
| `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum` | a range rule, a type bound, or `numeric(p, s)`'s integer digits fail    | the bound as a decimal                                                                                                                                                                                                                                                                       |
| `multipleOf`                                                 | more fraction digits than `numeric(p, s)`'s scale                       | `10^-s` as a decimal (`0.01`)                                                                                                                                                                                                                                                                |
| `enum`                                                       | a value outside an enum or an `enum` rule                               | the values as a JSON array                                                                                                                                                                                                                                                                   |
| `pattern`                                                    | a `pattern` rule fails                                                  | the pattern's source                                                                                                                                                                                                                                                                         |
| `additionalProperties`                                       | a key the schema does not know, one issue per key                       | absent                                                                                                                                                                                                                                                                                       |
| a constraint code                                            | a validator rejects the value                                           | absent                                                                                                                                                                                                                                                                                       |

The kinds are the JSON Schema validation keywords that express the same constraint, so the OpenAPI
document (13) and the issues name it the same way. Zod's own issue codes never reach a client: the
mapping reads Zod 4's issue data (`origin`, `minimum`, `maximum`, `inclusive`, `values`, `format`)
and the parameters resource-core attaches to its own checks. @ref
https://json-schema.org/draft/2020-12/json-schema-validation#section-6

### 6.5 Standard Schema

`validate.create` and `validate.update` wrap the object schemas as Standard Schema V1 validators
(`vendor: 'netvark'`) whose issues are `ResourceIssue`s and whose `types` carry the input and output
types. They are what the JSON:API definition validates attributes with (11.1). @ref
https://standardschema.dev

Tests: `compose.test.ts` (each step of 6.1 and each rule), `field-values.test.ts` (codec, domain,
and validator members), `object-schemas.test.ts` and `required.test.ts` (6.2, 6.3 over the contacts
fixture), `linkage-schemas.test.ts`, `id-schema.test.ts`, `multi-column.test.ts`, and
`write-schemas.test.ts` (relationships, ids, and the CHECKs over several members), `issues.test.ts`
(one case per row of 6.4), `length.test.ts` (code points under the Zod floor), `no-defaults.test.ts`
(the walk), `examples.test.ts`, and `infer.test-d.ts` (`Infer` over the contacts fixture, enum
narrowing, optional and nullable members); `e2e/resource/schemas.e2e.test.ts` runs the same
contracts through the built package.

---

## 7. Codecs and validators (`codecs/`, ADR 0006)

### 7.1 `defineCodec`

```ts
import type { $ZodType, input, output } from 'zod/v4/core';

type NonEmptyList<T> = readonly [T, ...Array<T>];

function defineCodec<const TTypes extends NonEmptyList<string>, TSchema extends $ZodType>(init: {
  readonly types: TTypes; // type reference names it attaches to: base types, enums, domains, `<type>[]`
  readonly schema: TSchema; // the public schema: what the wire carries
  readonly fixtures: NonEmptyList<input<TSchema>>; // round-trip values
  readonly description?: string | undefined;
}): Codec<TTypes, TSchema>;
```

A codec is the public facet of a value type. A field may name a codec only when the column's type
(`type`, with `[]` appended for an array column) is in `types`. The storage facet, which converts
between the wire value and what the driver reads and writes, lives in the storage adapter, keyed by
the same names: `StorageCodecs<typeof codecs, TStored>` is
`{ readonly [K in keyof TCodecs]: StorageCodec<output<TCodecs[K]['schema']>, TStored> }`, where
`StorageCodec<TValue, TStored>` is
`{ read(stored: TStored): TValue; write(value: TValue): TStored }`, so the two facets cannot
disagree on the key set.

The schema is any Zod 4 schema, from `zod` or `zod/mini`: the package depends on Zod Core
(`zod/v4/core`), the surface both share, tests a schema with `instanceof $ZodType`, and parses with
Core's `safeParse`. It MUST parse synchronously, as the composed schemas do (6). @ref
https://zod.dev/library-authors

`defineCodec` returns the codec frozen, with copies of its lists, and throws `TypeError` when
`types` is empty or holds a non-string
(`defineCodec.types: must be a non-empty list of type names`), when `schema` is not a Zod 4 schema,
when `fixtures` is empty, when the schema rejects a fixture
(`defineCodec.fixtures[1]: the schema rejects this fixture`, with Zod's error as the `cause`), when
the schema accepts `undefined` or `null`, or when the schema parses asynchronously
(`defineCodec.schema: must parse synchronously`). A codec describes present, non-null values: the
column's nullability decides `null` (6.1 step 4), and a member a client leaves out stays out (6.2),
so a schema that accepts `undefined`, through `.optional()`, `.default()`, `.prefault()`, or
`.catch()`, would put a value in place of an omitted member
(`defineCodec.schema: must reject undefined, so a member a client leaves out stays out`), and one
that accepts `null` would let `null` past a NOT NULL column
(`defineCodec.schema: must reject null; the column's nullability decides null`). Without `fixtures`,
or with an empty list or a fixture of another type, the call does not compile.

### 7.2 `defineValidator`

```ts
function defineValidator<TSchema extends $ZodType>(init: {
  readonly schema: TSchema; // input: the field's value, or an object of the CHECK's members by public name
  readonly fixtures: {
    readonly accept: NonEmptyList<input<TSchema>>;
    readonly reject: NonEmptyList<input<TSchema>>;
  };
  readonly description?: string | undefined;
}): Validator<TSchema>;
```

A validator is the request-side twin of a CHECK the recognizer could not translate. Attached to a
single-column CHECK, its input is the member's value (6.1 step 5); attached to a multi-column CHECK,
its input is an object of the CHECK's members keyed by public name (6.2). A relationship enters as
its id, or `null`, the value the CHECK sees in the foreign-key column, never as its linkage: the
validator then reads no target, and its fixtures are the values `pg-catalog rules --check`
substitutes into the expression (7.3). Such CHECKs often span only foreign keys: all six of stern's
CHECKs without a rule tie two relationships together (exactly one of a subject and an entity, or at
least one of a workspace and an offering). A CHECK passes `NULL`, so the validator of a nullable
member accepts `null`. Its issues carry the CHECK's error code as their kind (6.4), whatever the
schema's own codes.

The validator's input type MUST accept what it receives, which `tsc` checks where the rule attaches
it (`AttachmentRequirement`): for a single-column CHECK, the field's output type, `null` included
when the column is nullable, or a relationship's `string | null`; for a multi-column CHECK, an
object of those keyed by public names, `as` respected. A CHECK with a column the declaration leaves
out never runs (6.2), so it is not checked. The messages name the validator and what it misses:
`validator: "lobbyOnly" does not accept every value of room` (the column) and
`validator: "linkageOrNotes" does not accept every object of contact, notes` (the public names).
Nothing checks the input at runtime, since an input type has no runtime form; a validator that
refuses a value its CHECK holds refuses every write of it under the CHECK's code.

`defineValidator` returns the validator frozen and throws `TypeError` when either list is empty,
when the schema rejects an `accept` fixture or accepts a `reject` fixture, naming the list and index
(`defineValidator.fixtures.reject[1]: the schema accepts this fixture`), or for the schema mistakes
of 7.1.

### 7.3 The oracle's inputs

`fixtures` are what `pg-catalog rules --check` runs through the database (catalog SPEC 10.3):

- a codec fixture is written through the storage facet as `SELECT ($1::<type>)::text`, read back
  through it, and must equal the fixture and pass the public schema;
- a validator fixture is substituted into the CHECK expression, `SELECT (<expression>)`, and the
  database's verdict (true or null accepts, false rejects) must match the list it is in.

This package only stores, types, and self-checks them. Tests: `define-codec.test.ts` and
`define-validator.test.ts` (every runtime rule, Zod Mini schemas), `define-codec.test-d.ts` and
`define-validator.test-d.ts` (the fixtures a call needs, typed by the schema's input),
`storage-codecs.test-d.ts`.

---

## 8. Field metadata (`meta/`)

`fields` on a declared resource describes each public field and relationship for forms,
documentation, and clients: a frozen record keyed by public name, the fields and then the
relationships, each in declaration order (`Contacts.fields.name.limits`). Every entry reads the
member spec the schemas are built from (6.1), so a client that follows the metadata sends what the
schemas accept. A relationship's `target` reads the target resource (3.8), so the record is built on
first read and cached.

```ts
interface FieldMeta<TFacts extends FieldFacts = FieldFacts> {
  readonly name: TFacts['name']; // public, the key of `fields`
  readonly column: TFacts['column'];
  readonly kind: TFacts['kind']; // 'attribute' | 'relationship'
  readonly access: TFacts['access'];
  readonly wire: WireType; // 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'any'
  readonly format: string | null; // the OpenAPI format of 5.1
  readonly fractionDigits: number | null; // a date-time's: p of timestamp(p), 6 without one
  readonly nullable: TFacts['nullable'];
  readonly required: TFacts['required']; // a create must carry it (6.3)
  readonly default: PublicColumnDefault | null; // for display, never sent
  readonly limits: FieldLimits;
  readonly options: TFacts['options']; // enum labels or an enum rule's values, in order
  readonly items: TFacts['items']; // an array's elements
  readonly target: TFacts['target']; // a relationship's target type
  readonly filter: TFacts['filter'];
  readonly sortable: TFacts['sortable'];
  readonly codec: TFacts['codec'];
  readonly description: string | null;
  readonly example: unknown; // undefined when none is declared
}

interface FieldLimits {
  readonly minLength: number | null; // code points
  readonly maxLength: number | null;
  readonly minimum: string | null; // numeric bounds are decimal strings
  readonly exclusiveMinimum: string | null;
  readonly maximum: string | null;
  readonly exclusiveMaximum: string | null;
  readonly multipleOf: string | null; // numeric(p, s): 10^-s
  readonly patterns: ReadonlyArray<string>; // each read with the flags `su`
}

interface ItemMeta<TOptions> {
  readonly wire: Exclude<WireType, 'array' | 'any'>;
  readonly format: string | null;
  readonly fractionDigits: number | null;
  readonly limits: FieldLimits;
  readonly options: TOptions;
}
```

- **`wire`, `format`**: the wire form of 5.1. `wire/formats.ts` holds the one table of formats that
  issues (6.4) and the metadata read. `json`, `jsonb`, and a codec's value are `any`, which the JSON
  value or the codec's schema describes (7.1); an array is `array`, with `items`.
- **`fractionDigits`**: for `timestamp` and `timestamptz`, the precision p, six without one; a value
  with more digits is refused (5.2). `null` for every other type.
- **`limits`**: the type's bounds and every rule of 6.1, folded into the tightest value per JSON
  Schema keyword, the fold the schemas use and the OpenAPI document reads: at most one of `minimum`
  and `exclusiveMinimum` is set, and at most one of `maximum` and `exclusiveMaximum`. Numeric bounds
  are decimal strings whatever the wire type, since `int8` and `numeric` values exceed JavaScript's
  numbers. A value contains a match of each pattern, read with the flags `su` (catalog SPEC 8.4);
  JSON Schema's `pattern` holds one, so several join under `allOf` (13.1).
- **`options`**: the enum's labels or an `enum` rule's values, in order, as a frozen copy; with
  several, the values all of them allow. `null` when any value of the type goes.
- **`items`**: an array's element, with the rules of the levels below the array (6.1). `null` for
  any other value.
- **`nullable`**: whether the value may be `null` (6.1 step 4).
- **`required`**: whether `schema.create` or `linkage.create` requires the member: an access
  `create` takes (3.1) over a column required on insert (6.3).
- **`default`**: the column's default, else the nearest domain default above the first array level,
  which PostgreSQL applies when a create leaves the member out. `literal` is a constant's text,
  `null` for an expression such as `now()`. It is for display: a client never sends it, and the
  database decides the value.
- **`description`**, **`example`**: the declaration's own. A declared `example` MUST pass the
  field's value schema; otherwise `declareResource` throws `TypeError`.
- **A relationship** describes its id (3.4): `wire` is `string`, with its key's `format`,
  `fractionDigits`, `limits`, and `options`; a `bool` key's ids are `['true', 'false']`, the two
  texts the linkage schema accepts. `nullable` and `required` are its foreign key's, `target` is the
  target's type, `sortable` is `false`, and `codec` is `null`.
- **Validators are not described** (7.2). What a validator, a multi-column CHECK, a unique
  constraint, or a foreign key refuses, the metadata does not state, so a value the metadata admits
  can still be refused, and the server stays the authority.

For a resource declared over a table of a typed catalog, `fields` is typed: each entry is a
`FieldMeta` with literal `name`, `column`, `kind`, `access`, `nullable`, `required`, `target`,
`sortable`, and `codec`, the declared `filter` tuple, `options` as a `ReadonlyArray` of the literal
labels, and `items` as an `ItemMeta` of the element's labels. The runtime array keeps the order; the
type is the union of every label a rule names, where the runtime array holds only the values all the
rules allow. Without a typed table, `fields` is a record of `FieldMeta`. Declaring a resource never
computes the type; reading `fields` does (15.5).

Tests: `meta/value-meta.test.ts` (one case per row of 5.1, the folds, patterns, fraction digits,
elements, domain defaults), `meta/field-meta.test.ts` (the contacts fixture, `required` against
`schema.create` and `linkage.create`, frozen, built on first read), `meta/id-meta.test.ts` (one case
per key type, the `bool` ids against the linkage schema), `field-meta.test-d.ts` and
`id-meta.test-d.ts`, the NOT ENFORCED case of `declare/not-enforced.test.ts`, and the end-to-end
suites `fields.e2e.test.ts` and `fields-create.e2e.test.ts` (15.4).

---

## 9. Errors (`errors/`, ADR 0007)

### 9.1 Derived codes

A declared resource has one code per constraint a client can cause and see:

- each enforced constraint of the table, unique indexes that no constraint backs among them (catalog
  ADR 0009), with a column, other than the scope column, that is a public field or relationship,
  whatever its access;
- the primary key, when `clientIds` is true;
- the NOT NULL key (3.5) of each public member writable by an operation;
- each CHECK of each domain a member's type passes, directly, through a base domain, or as the
  element of an array.

A table constraint's code is its rule key upper-cased, or its `code` (4.1). A domain CHECK's code is
its constraint name upper-cased, or the `code` of the definer's domain rule (3.6). `declareResource`
refuses a resource whose codes are not distinct or not A-Z, 0-9, and `_`, naming the constraints
behind them (14).

| Constraint   | Kind         | Status | Title                      | Items point at                           | Detail (English, constant)               |
| ------------ | ------------ | ------ | -------------------------- | ---------------------------------------- | ---------------------------------------- |
| CHECK        | `check`      | 422    | Invalid Attribute          | each public member of `columns`          | The value violates a constraint.         |
| domain CHECK | `check`      | 422    | Invalid Attribute          | each member whose type passes the domain | The value violates a constraint.         |
| NOT NULL     | `notNull`    | 422    | Invalid Attribute          | the member                               | A value is required.                     |
| UNIQUE       | `unique`     | 409    | Conflict                   | each public member of `columns`          | Another record already has this value.   |
| unique index | `unique`     | 409    | Conflict                   | each public member of `columns`          | Another record already has this value.   |
| PRIMARY KEY  | `primaryKey` | 409    | Conflict                   | `id`                                     | A record with this id already exists.    |
| EXCLUDE      | `exclusion`  | 409    | Conflict                   | each public member of `columns`          | The value conflicts with another record. |
| FOREIGN KEY  | `foreignKey` | 404    | Related Resource Not Found | the relationship                         | The related resource does not exist.     |

The scope column (3.2) makes no code and no item: the server writes it from the scope, so a client
never sets it. A UNIQUE over `(organization_id, email)` points at `email` alone, and the scope's own
foreign key has no code, so `code` on it is refused as on any key without one. A constraint over the
scope column alone has no code either: stern's `business_profiles_organization_id_key`, one profile
per organization, is violated only by a second create in the same organization, which falls back to
the ban's own mapping, `CONFLICT` for 23505 (9.5). Without a scope the column is a member like any
other.

A NOT ENFORCED CHECK or foreign key (`enforced: false`, catalog ADR 0010) has no code, so `code` on
it is refused: PostgreSQL never raises it, and no client can cause it. Enforcing it in the database,
`ALTER CONSTRAINT ... ENFORCED` for a foreign key or dropping and adding a CHECK again, gives it a
code at the next extraction.

A unique index that no constraint backs is a unique constraint of the public table, keyed by its
name, which is the name PostgreSQL reports (catalog SPEC 3, ADR 0009), so it derives a code by the
rules above, partial or not: stern's partial `tools_org_name_unique (organization_id, name)` points
at `name`. An index with an expression element, or named like a CHECK or FOREIGN KEY constraint of
its table, is not in the public catalog, so it has no code and takes the same fallback;
`postgresMapper`'s `constraints` can map it by name.

JSON:API requires 404 for a request that references a related resource that does not exist and 409
for a client-generated id that exists, and allows 409 for a uniqueness violation on update; 422 with
a pointer is the form its examples use for an invalid attribute. @ref
https://jsonapi.org/format/1.1/#crud-creating-responses @ref
https://jsonapi.org/format/1.1/#crud-updating-responses @ref
https://jsonapi.org/examples/#error-objects

`errors` on a declared resource maps each code to a frozen `{ status, title, kind, fields }` with
literal types, for messages, OpenAPI, clients, and `constraintError`. `kind` is the
`ConstraintKind`: `check`, `notNull`, `unique`, `primaryKey`, `exclusion`, or `foreignKey`. `fields`
lists the public names the items point at, in column order. The codes come in a fixed order: the
table's constraints in catalog order, its NOT NULL keys in column order, then the domain CHECKs,
each domain in the order of its first member and a chain outermost first. A resource whose table
TypeScript does not know has `errors` typed `Readonly<Record<string, ErrorEntry>>`.

Tests: `derive-errors.test.ts` and `domain-codes.test.ts` (each row above, the scope column, the
order, given codes, and the refusals), `error-types.test-d.ts` (the literal types of each entry),
and `e2e/resource/errors.e2e.test.ts` (15.4).

### 9.2 `errorCatalog(resources, appErrors?)`

Returns one frozen `@netvark/ban-core` catalog fragment, `{ [code]: { status, title } }`: the codes
of every listed resource, in list order, each entry frozen; then resource-core's own
`QUOTA_EXCEEDED` (403, Quota Exceeded; 12.6); then `appErrors`, the application's own codes, as
given. A code several resources derive from one constraint appears once. It is spread into
`createBan({ errors })` next to `ERROR_CATALOG` from `@netvark/jsonapi-core`:

```ts
const catalog = errorCatalog([Organizations, Contacts, Meetings], {
  SEAT_LIMIT: { status: 402, title: 'Seat Limit' },
});
const ban = createBan({ errors: { ...ERROR_CATALOG, ...catalog } });
```

It runs the registry checks of 4.2 and throws one `TypeError` listing every conflict, so the list it
takes is the registry the application serves. Its type, `ErrorCatalog<TResources, TApp>`, keeps each
code with its literal status and title, so `ban.error('CONTACTS_EMAIL_UNIQUE')` type-checks; a
module compiled with `isolatedDeclarations` annotates the export with it. A resource whose table
TypeScript does not know gives the type an index signature and no codes, and an object spread keeps
an index signature only when every spread object has one, so next to `ERROR_CATALOG`, `ban.error`
knows the codes of typed resources only; the catalog holds every code at runtime. @ref
https://jsonapi.org/format/1.1/#crud-creating-responses-403 @ref
https://github.com/microsoft/typescript-go/blob/typescript/v7.0.2/internal/checker/checker.go
(`getSpreadType` keeps `getUnionIndexInfos([left, right])`)

Tests: `error-catalog.test.ts`, `error-catalog.test-d.ts`, `check-registry.test.ts`,
`registry-check.test-d.ts`, and `e2e/resource/fails/errors.ts`.

### 9.3 Schema issues on the wire

`@netvark/jsonapi-core` turns each issue of `validate.create` or `validate.update` into a
`VALIDATION_FAILED` item whose pointer is the attributes pointer plus the issue path. With this
family it also keeps the issue's `code` and `expected`, when they are strings, as the item's
`reason` and `expected` (`@netvark/ban-core`'s `ValidationIssue` members; an additive change to
`request/resource-document.ts` with its own changeset). `@netvark/ban-core`'s JSON:API format
renders them under `meta`:

```json
{
  "errors": [
    {
      "status": "422",
      "code": "VALIDATION_FAILED",
      "title": "Validation Failed",
      "detail": "Must be at most 200 characters.",
      "source": { "pointer": "/data/attributes/name" },
      "meta": { "code": "maxLength", "expected": "200" }
    }
  ]
}
```

An issue of `write.create` or `write.update` (6.2) has a path that starts with the part it belongs
to, and the JSON:API definition (11.1) maps it into the document: `attributes/<name>/...` to
`<pointer>/attributes/<name>/...`, and `relationships/<name>/...` to
`<pointer>/relationships/<name>/data/...`, since a relationship object carries its linkage in
`data`. A refused multi-column CHECK points at each of its members this way, one item per member.

### 9.4 Members an operation does not accept (`errors/forbidden-members.ts`)

`forbiddenMembers(resource, operation, { attributes, relationships }, pointer = '/data')` returns
one `@netvark/ban-core` item per member the operation does not accept: a `read` member on create or
update, an `immutable` member on update. A host throws them as `FORBIDDEN` (403), because JSON:API
requires 403 for an unsupported request to update a resource and allows it for create, and runs the
check on the request document before validation, so such a member is a 403 and never an
`additionalProperties` issue. @ref https://jsonapi.org/format/1.1/#crud-updating-responses

### 9.5 Database rejections (`server/constraint-error.ts`)

`constraintError(thrown, { resource, operation, pointer = '/data', partition })` turns a PostgreSQL
error raised inside an operation into the declared error, or returns `undefined`:

1. Recognize the driver error with `findPostgresError` and read
   `{ sqlstate, constraint, table, schema, column, dataType }` with `readPostgresFields`
   (`@netvark/ban-core/postgresql`, which reads `dataType` from field `d`), so node-postgres,
   PGlite, postgres.js, and Bun are covered without a driver import.
2. Any integrity violation (class 23) during `remove`: a remove carries no members, so the violation
   is another row's, a reference that blocks it (23503, or 23001 for `ON DELETE RESTRICT` from
   PostgreSQL 18) or a referential action whose result breaks a constraint of the referencing row
   (`ON DELETE SET NULL` against a CHECK or a NOT NULL). It names the referencing table, which may
   not be a declared resource, so return the built-in `CONFLICT` (409) with the detail "The resource
   is still referenced." and no items. @ref
   https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/utils/adt/ri_triggers.c
   (`ri_ReportViolation`: `ERRCODE_RESTRICT_VIOLATION`)
3. 23502 (not null) carries no constraint name on any supported major: find the NOT NULL key of
   `(table, column)`. A domain's CHECK (23514) names the domain in `dataType` and no table: find the
   code of `(schema, dataType, constraint)` among the operation resource's domain CHECKs. Other
   integrity errors (23505, 23P01, 23514, 23503 on a write): find the rule key of
   `(table, constraint)`, and keep it only when its entry's kind is the one the SQLSTATE reports
   (23505 `unique` or `primaryKey`, 23P01 `exclusion`, 23514 `check`, 23503 `foreignKey`), since a
   unique index may share its name with a CHECK or FOREIGN KEY constraint of its table, which keeps
   the key (catalog ADR 0009). Tables and domains are matched by schema and name, so two schemas'
   objects of one name stay apart. With `partition`, the names `StorageAdapter.partitionRoot`
   resolved for a violation a partition raised (below), the table and the constraint are read from
   it; the SQLSTATE and the column stay the error's.
4. Found: build the error from 9.1 with one item per member of the entry's `fields`, each with
   `path` under `pointer` (`/data/attributes/<field>`, `/data/relationships/<name>`, `/data/id`),
   and the driver error as `cause`. Not found: return `undefined`, and the ban's own `map`
   (typically `postgresMapper()`) handles it with its SQLSTATE table.

The runtime calls it where an adapter's rejection arrives (12.8, obligation 6), because only there
are the operation and the document's base known; inside Atomic Operations the base is the
operation's own `data` (ADR 0007). It throws `TypeError` for options that do not name a declared
resource (`constraintError: options.resource must be a resource declareResource returned`), an
operation, an RFC 6901 pointer, or a `partition` of strings `schema`, `table`, and optionally
`constraint`. Tests: `constraint-error.test.ts` with errors captured from node-postgres, PGlite, and
postgres.js; `e2e/resource/errors.e2e.test.ts`, which runs it over the real violation of every
derived code of the contacts application, and the refusal of a remove a referencing row's
`ON DELETE RESTRICT` or `ON DELETE SET NULL` raises, on PGlite and on a PostgreSQL server;
`localization.e2e.test.ts`, whose localized 409 is what it makes of a real violation; and
`runtime-rows.e2e.test.ts`, whose remove a meeting's `ON DELETE SET NULL` cannot follow is a 409.

What PostgreSQL reports, verified on PostgreSQL 14.19 and 18.3 (PGlite) by
`e2e/resource/errors.e2e.test.ts` for every derived code of the contacts application:

| Violation                                              | SQLSTATE                          | Names                                                                      |
| ------------------------------------------------------ | --------------------------------- | -------------------------------------------------------------------------- |
| NOT NULL column                                        | 23502                             | the table and the column; no constraint, though PostgreSQL 18 catalogs one |
| table CHECK, UNIQUE, PRIMARY KEY, EXCLUDE, FOREIGN KEY | 23514, 23505, 23505, 23P01, 23503 | the table and the constraint                                               |
| domain CHECK                                           | 23514                             | the domain as `dataType`, and the constraint; no table or column           |
| unique index, partial or not                           | 23505                             | the table, and the index as the constraint                                 |
| a remove's referencing row: RESTRICT, SET NULL         | 23001 (18) or 23503 (14), 23514   | the referencing table and its constraint                                   |

A NOT NULL domain's 23502 names only the domain, which has no code (9.1). @ref
https://www.postgresql.org/docs/18/protocol-error-fields.html

**Partitions.** A row written through a partitioned table is stored in one of its partitions, and a
violation names that partition, in whichever schema it lives, as its table. A CHECK keeps the
partitioned table's name, since the partition inherits it, and so does a cloned foreign key unless
its name was taken on the partition; a PRIMARY KEY, UNIQUE, or EXCLUDE violation, and one of a
unique index, names the partition's own index, which PostgreSQL names after the partition.
Partitions are often created after the migrations ran, by pg_partman or by the application, so the
catalog leaves them out and the database resolves them (ADR 0010):

- `partitionViolation(thrown, { resource, operation })` returns the `{ schema, table, constraint? }`
  an integrity violation names when that table is not the resource's, and `undefined` for any other
  error, for the resource's own table, and for a remove, whose violations are all `CONFLICT`. It
  checks its options as `constraintError` does, under its own name.
- `StorageAdapter.partitionRoot(names)` (12.8, obligation 11) answers, after the operation's
  transaction ended, with the partitioned table at the top of the partition's tree
  (`pg_partition_root`) and that table's name for the constraint: the top of the constraint's
  `conparentid` chain, the root of the index it is attached to, or the CHECK it inherits, else none.
  `PARTITION_ROOT_SQL` is the query, which reads only system catalogs; any role may run it.
- The runtime passes the answer to `constraintError` as `partition`:

```ts
const raised = partitionViolation(error, { resource, operation });
const partition = raised === undefined ? undefined : await adapter.partitionRoot(raised);
return constraintError(error, { resource, operation, partition }) ?? error;
```

A partition-local unique index, which no index of the partitioned table is attached to, resolves to
no constraint and keeps no code, and a row that fits no partition names the partitioned table itself
with 23514 and no constraint, which the ban's `map` answers. A declared resource has a single-column
primary key, and PostgreSQL wants the partition key in every unique constraint, so a table a
resource can be declared on is partitioned by its id: what reaches a client is the partition's table
name, for every kind, and the partition's primary key index, for client ids. Verified on PostgreSQL
14.19 and 18.3 for a range partition, a partition attached with its own index, a partition two
levels down, and one in another schema, and against every partition of GitLab 17.11. @ref
https://www.postgresql.org/docs/18/ddl-partitioning.html @ref
https://www.postgresql.org/docs/18/functions-info.html#FUNCTIONS-INFO-PARTITION

Tests: `partition.test.ts` and `constraint-error-options.test.ts` with each driver's error;
`e2e/resource/errors-partitions.e2e.test.ts`, which raises each kind through every partition of the
contacts application's `calls` and resolves it with `PARTITION_ROOT_SQL`, on PGlite and on a
PostgreSQL server; `runtime-partitions.e2e.test.ts`, whose duplicate client id and missing contact
reach the client as the codes of `calls`; and the contract's cases of obligation 11.

---

## 10. Messages and localization (`messages/`, ADR 0009)

resource-core decides which message an error object needs and with which inputs; the application's
i18n library holds the texts and picks the locale. Every message is a function, so a compiled
Paraglide message function fills a slot as it stands, and closures fill it without any library.

### 10.1 `defineMessages(resources, appErrors, messages)`

```ts
type Label = () => string; // a title or a label: no inputs
type Message<TInputs extends object> = (inputs: TInputs) => string;

interface ErrorText<TInputs extends object> {
  readonly title: Label;
  readonly detail: Message<TInputs>;
}

interface MessagesFor<TResources, TApp> {
  readonly errors: { readonly [K in TCodes]: ErrorText<CodeInputs> } & {
    readonly [K in TDerived]?: ErrorText<ConstraintInputs>;
  } & { readonly [K in TBuiltins]?: ErrorText<CodeInputs> };
  readonly constraints: { readonly [K in TKinds]: ErrorText<ConstraintInputs> };
  readonly validation: { readonly [K in IssueKind]: Message<IssueInputs[K]> };
  readonly fields: TFields; // { [type]: { [public member]: Label } }
  readonly options: TOptions; // { [type]: { [field]: { [value]: Label } } } for fields with options
}
```

- `TCodes` is every code a response can carry that no resource derives: `@netvark/jsonapi-core`'s
  `ErrorCode`s, `QUOTA_EXCEEDED`, and the keys of `appErrors` (the application's own
  `@netvark/ban-core` catalog fragment). Each needs a title and a detail.
- `TDerived` is the resources' derived codes (9.1). Each is covered by its constraint kind's texts
  in `constraints` (`check`, `notNull`, `unique`, `primaryKey`, `exclusion`, `foreignKey`, exactly
  those the resources have, as `TKinds`), so the messages need one title and detail per kind, not
  one per constraint; an entry in `errors` overrides them for that code.
- `TBuiltins` is the other `@netvark/ban-core` built-in codes (`TOO_MANY_REQUESTS`, ...). An entry
  is optional; an object whose code has none keeps its catalog title and detail.
- `validation` has a message for each of the thirteen issue kinds (6.4). A validator's issue carries
  its constraint's code, a derived code, so `errors` and `constraints.check` cover it.
- `fields` labels every public member of every resource; `options` labels every option of every
  field that has options, or whose elements have, and is empty when none has.

A title and a label take no inputs: a title is constant per code except for localization (RFC 9457
3.1.3). A detail takes its kind's inputs (10.3). A missing key fails `tsc`, and so do an unknown key
and a message that needs an input its kind does not receive; `messages` takes no part in inference,
so an unknown code is refused rather than read as an application code. A Paraglide message function
is typed with its variables across all locales, so a translation that names a variable its kind does
not have, in any locale, fails the build. Reference each message function directly in the object,
never through a computed key, so the bundler tree-shakes and `inlang check` finds the unused ones.
@ref https://www.rfc-editor.org/rfc/rfc9457#section-3.1.3 @ref
https://paraglidejs.com/basics#dynamic-messages @ref https://paraglidejs.com/checking-translations

At runtime `defineMessages` runs the registry checks (4.2), then throws one `TypeError` listing
every missing key (`defineMessages.messages.errors.NOT_FOUND: missing`), unknown key
(`not a key these messages take`), and value that is not a function or not an object, so JavaScript
callers learn at startup. A function's inputs are left to TypeScript: a Paraglide function also
takes an optional `options`, so its arity says nothing. It returns a frozen copy, which
`localizeErrors` recognizes; a copy of that copy is not recognized until it passes through
`defineMessages` again.

### 10.2 `defaultMessages(resources, appErrors?)`

Complete English messages built mechanically: catalog titles and generic details for the codes no
resource derives, an application code's `description` (or else its title) as its detail, the titles
and details of 9.1 per constraint kind, the English issue messages of 6.4, so a response localized
with them reads as one that was not, labels made from public names (`createdAt` is "Created at"),
and option labels equal to the values. An application without an i18n library uses them as they are;
one with Paraglide maps its own message functions, and may spread the parts it has not translated
yet.

### 10.3 Inputs

| Message                                                                                              | Inputs                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| every detail                                                                                         | `field`: the label of the member the object's item points at, in the request's type; `id` for `/data/id`; empty when it points at no member |
| a constraint kind's detail, a derived code's                                                         | `fields`: the labels of the constraint's members (`ErrorEntry.fields`), joined with `, `                                                    |
| `minLength`, `maxLength`, `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf` | `limit`: `expected`                                                                                                                         |
| `enum`                                                                                               | `values`: the labels of the options `expected` lists, joined with `, `; a value without a label as it is                                    |
| `format`                                                                                             | `format`: `expected`                                                                                                                        |
| `type`                                                                                               | `type`: `expected`                                                                                                                          |

The member is the pointer segment after `data/attributes` or `data/relationships`, with `data` at
the root or under one Atomic Operations operation (`/atomic:operations/0/data/...`). A member the
type does not have is never named, since its name came from the request: an `additionalProperties`
issue names a member the client invented. A `pattern` issue's source is no input. @ref
https://jsonapi.org/ext/atomic/

### 10.4 `localizeErrors(messages, { resource })`

Returns a `transform` for `@netvark/ban-core`'s handler (ban SPEC 6.2), the localization point:

- `messages` is what `defineMessages` or `defaultMessages` returned; anything else is a `TypeError`.
  `resource(ctx)` returns the type of the resource the request addresses, whose labels name the
  members; without it, `field` is empty, except in a derived code's texts, which take the labels of
  the first type that derives the code.
- For a JSON:API document (`errors` and no top-level members besides `jsonapi`, `links`, `meta`, and
  extension members), the objects pair with the error's items by index when there are as many of
  each. The handler re-renders an oversized body as one object but passes the same error, items and
  all (ban SPEC 6.8), so then no object pairs. @ref
  https://jsonapi.org/format/1.1/#document-top-level
- `title` becomes the code's title: its own entry in `errors`, else its constraint kind's for a
  derived code. An application code whose rendered `code` differs from its key is found by key.
- `detail` becomes, for an item whose `reason` is an issue kind, that kind's message; for an item
  whose `reason` is a derived code (a validator's issue, 7.2), that code's detail, else its
  constraint kind's; otherwise the object's code's detail. Each takes its inputs (10.3).
- An object whose code has no texts and a body of another shape pass through untouched. `status`,
  `code`, `source`, `id`, `links`, and `meta` are never changed, and the body is never mutated.
- A message function that throws makes the handler answer 500 through its fallback and report the
  failure (ban SPEC 6.4).

The language is the message functions' own. With Paraglide it is the locale `paraglideMiddleware`
resolved, which holds inside Hono's `onError` when the middleware wraps `next()`. The transform
cannot set headers: the host sets `Content-Language` to that locale (`getLocale()`) and adds `Vary`
for the request fields the choice read (`Accept-Language` for Paraglide's `preferredLanguage`
strategy, `Cookie` for its cookie strategy). @ref https://www.rfc-editor.org/rfc/rfc9110#section-8.5
@ref https://www.rfc-editor.org/rfc/rfc9110#section-12.5.5 @ref
https://paraglidejs.com/server-side-rendering

The transform's context type comes from `resource` alone: written inside `ban.onError({ ... })`, the
handler's context is not inferred yet when the transform's is, and TypeScript would read it as
`never`. So `localizeErrors(messages)` fits any handler, and a `resource` written there annotates
its parameter (`(c: Context) => ...`).

Tests: `define-messages.test-d.ts` (a missing code, constraint kind, issue kind, label, or option
fails; an unknown key fails and is not read as an application code; a derived code needs no entry
and its override receives `fields`; a message needing an input its kind lacks fails; Paraglide's
compiled shape fits), `define-messages.test.ts`, `default-messages.test.ts`, `english.test.ts`,
`error-inputs.test.ts`, `localize-errors.test.ts` (a 422 with two items and a 409 become the
expected German document; the oversized body; what passes through), `localize-errors.test-d.ts`, and
`e2e/resource/localization.e2e.test.ts` (15.4).

---

## 11. The JSON:API resource and the keyset definition (`jsonapi/`)

### 11.1 `resource`

`resource` on a declared resource is a `@netvark/jsonapi-core` definition. The definer makes one
`defineResource` with `createDefineResource({ links })`, so `links` jsonapi-core refuses fail at
startup (14), and each declared resource builds its definition with it on the first read of
`resource` and caches it: the relationships name their targets' types, and targets are read lazily
(3.8).

| Member          | Value                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------- |
| `type`          | the public type                                                                                 |
| `attributes`    | every field's public name, `write` fields included, so requests may carry them                  |
| `relationships` | each relationship: `{ type: target type, cardinality: 'one', resource: () => target.resource }` |
| `serialize`     | a public row (12.8) to `{ id, attributes, relationships }`, as below                            |
| `query.sort`    | the public names of fields with `sort: true`                                                    |
| `query.filter`  | each field and relationship with `filter`, by public name, with its operators                   |
| `query.include` | the public names of relationships with `include: true` (one level)                              |
| `query.page`    | the resolved page below, the same bounds as `keyset.page`                                       |
| `query.search`  | `filter[q]` when the declaration has `search`                                                   |
| `validate`      | `create` and `update` from 6.5, each only when the declaration serves that operation            |
| `clientIds`     | the declaration's `clientIds`                                                                   |

Relationship targets are read lazily (3.8), so `Contacts` and `Users` may reference each other in
either order.

`serialize` reads only the members it names. `attributes` holds each readable field the row holds,
never a `write` field, and is left out when the declaration has no fields; `relationships` holds
each relationship the row holds, as its target's id or `null`, and is left out when the declaration
has none. A member the row lacks stays absent, so a sparse row serializes to a sparse resource
object. A relationship value that is neither a string nor `null` throws `TypeError`
(`contacts.serialize: relationship "organization" must be a target id or null`), which names the
member and never its value.

The resolved page is the declaration's `page` over the definer's, with keyset-core's defaults filled
in: `max` 100, `default` `min(20, max)`, `range` `false` (17). Both definitions get every bound, so
the default page of a server's `createDefineKeyset` never applies and the two cannot disagree about
a page size.

### 11.2 `keyset`

`keyset` is a `@netvark/keyset-core` `DefaultedKeysetInit`: everything but the cursor, whose secret
is server configuration, so the server passes it to its own `createDefineKeyset({ cursor })`. It is
computed when the resource is declared, since it reads no target, and frozen throughout, since every
request shares it.

```ts
const defineKeyset = createDefineKeyset({ cursor: { secret: env.CURSOR_SECRET } });
const contacts = defineKeyset(Contacts.keyset);
await contacts.plan({
  filter: { field: 'status', op: 'in', value: ['active'] },
  sort: ['-createdAt'],
});
```

- `table` is the table's name without its schema, since keyset-core takes an identifier; the plan's
  column targets name the table by it, and an adapter selects from the schema-qualified table
  (`audit.changes`), whose bare name PostgreSQL resolves them against (checked on 14 and 18). @ref
  https://www.postgresql.org/docs/18/sql-expressions.html#SQL-EXPRESSIONS-COLUMN-REFS
- `key` is `['id']`. The `id` field maps the primary key column with its keyset type (3.4),
  `nullable: false`, `sortable: true`, and `operators: []`: the key orders every page, and nothing
  filters it, since the JSON:API resource has no `id` filter.
- Each field with `filter` or `sort: true`, and each relationship with `filter`, becomes a field
  keyed by public name: `column`, the keyset type below, `nullable`, `values` for the `enum` type,
  `of` for arrays, `collation: 'insensitive'` for `citext`, and, always explicit, `sortable` and
  `operators`, the declared `filter` or `[]`, so keyset-core's defaults (every operator of the type,
  scalars sortable) never widen what the declaration states.
- `search` is `{ vector: column, config, mode }`: `config` is the declared one, else the one the
  column is generated with (3.7), and `mode` defaults to `websearch`. `sort.default` maps the
  declared columns to public names, prefixes and directions kept. `page` is the resolved page
  (11.1).

For a typed declaration, `keyset` is typed `KeysetInitOf<TDecl>`, whose `fields` key each member by
its public name with its `sortable` literal, which is all keyset-core's request type reads
(`KeysetRequestOf`), so the request of `defineKeyset(Contacts.keyset).plan` names exactly the
declared sorts and filters. It is spelled out rather than built on `DefaultedKeysetInit<TFields>`,
which `keyof TFields` makes invariant: a typed instance would not be assignable to the wide one.
`resource` is typed `ResourceOf<...>`: the type literal, the attribute and relationship names, the
row type `PublicRowOf` (12), the sort and filter names, and the create and update attributes of
`Infer`.

A list route hands keyset-core what `parseQuery` returns, by the same public names: `sort` as it is,
since a parsed sort field is keyset-core's `{ field, direction }` form, `search` and the page
members as they are, and each condition as `{ field, op: operator, value }`, converting only values:
`parseQuery` yields text, or a list for a repeated parameter (jsonapi SPEC 6.8), while keyset-core
takes `isNull` as a boolean and `in`, `nin`, `between`, and the operators of an array field as lists
(keyset SPEC 4.2, 4.3). Values themselves keyset-core checks against the field's type (keyset SPEC
4.3), so `filter[priority][gte]=high` is its `InvalidFilterValueError`, not the parser's.

Those public names become the request's vocabulary of two definitions, and each refuses some
JSON:API member names. keyset-core takes a field name that matches `^[A-Za-z0-9][A-Za-z0-9_-]*$` and
is not a prototype key (keyset SPEC 3, its `isFieldName`), and jsonapi-core's `filter` reserves `or`
for the disjunction and, with `search`, `q` for the search parameter (jsonapi SPEC 5.2 and 6.8). So
the public name of a member that filters or sorts holds only ASCII letters, digits, `_`, and `-`,
and starts with a letter or a digit; a filtered member is not named `or`, nor `q` when the resource
has `search`. A member that does neither keeps any member name (4.2). Each mistake fails `tsc` at
the member and throws when the resource is declared:
`notes.fields.size.filter: public name "größe" is outside @netvark/keyset-core's field names (^[A-Za-z0-9][A-Za-z0-9_-]*$)`,
`contacts.fields.query.filter: public name "q" is the search parameter, filter[q]`.

The runtime checks every member (`checkName` in `declare/check-filters.ts`). TypeScript checks the
members the names check examines (4.2), those that give `as` or whose column is in the table's name
risk, and the columns that derive a reserved name: `or` and `q`, and `or_id` and `q_id` for a
relationship (`names/keyset-names-check.ts`). camelCase gives every other column a name of ASCII
letters and digits, unless the column holds a letter outside ASCII, which PostgreSQL accepts
unquoted (`größe`), or a character only a quoted identifier holds (`"nick name"`); only the runtime
reports those. A first version that read every public name one character at a time took 26 and 56
percent more instantiations on the real catalogs, about ten for each character, where the checks of
this section add 4 and 2 percent (15.5). @ref
https://jsonapi.org/format/1.1/#document-member-names-allowed-characters (a space and non-ASCII
characters are allowed in member names but "not recommended, not URL safe")

| Catalog `type`                              | Keyset type                                      |
| ------------------------------------------- | ------------------------------------------------ |
| `text`, `varchar`, `bpchar`, `citext`       | `text`                                           |
| `int2`, `int4`                              | `integer`                                        |
| `int8`                                      | `bigint`                                         |
| `numeric`                                   | `decimal`                                        |
| `float4`, `float8`                          | `float`                                          |
| `bool`                                      | `boolean`                                        |
| `uuid`                                      | `uuid`                                           |
| an enum, or a text type with an `enum` rule | `enum`, `values` the labels or the rule's values |
| `date`, `timestamp`, `timestamptz`          | the same name                                    |
| an array                                    | `array`, `of` the element's type                 |
| a domain                                    | its base type's                                  |
| `json`, `jsonb`, a codec field              | none: not filterable, not sortable               |
| an array of an enum or of an `enum` rule    | none: keyset-core's arrays hold no enum          |
| an enum without values                      | none: no labels, or `enum` rules that leave none |

### 11.3 Operators

A member's `filter` and `sort` are checked against its keyset type (11.2); each mistake fails `tsc`
at the member and throws `TypeError` when the resource is declared:

- `filter` MUST be a subset of the operators `@netvark/keyset-core` accepts for the keyset type
  (keyset SPEC 4.2, its `OperatorsOf`), and `isNull` requires an effectively nullable member (6.1
  step 4): `contacts.fields.tags.filter: operator "gt" is not available for array fields`,
  `contacts.fields.name.filter: operator "isNull" is not available for non-null fields`. A text
  column with an `enum` rule filters as an enum, with `eq`, `ne`, `in`, and `nin`.
- `filter` lists at least one operator, each once, since jsonapi-core and keyset-core require a
  non-empty list without repeats: `contacts.fields.name.filter: list at least one operator`,
  `contacts.fields.name.filter[1]: "eq" is listed twice`. The types check a tuple; a list typed as
  an array, whose length they cannot see, is left to the runtime.
- A member without a keyset type takes no `filter` and no `sort: true`:
  `import_rows.fields.payload.filter: type jsonb is not filterable`, and likewise `a codec field`,
  `an array of enum values`, `an enum without values`.
- An array takes no `sort: true` (keyset-core sorts scalars only):
  `contacts.fields.tags.sort: an array field is not sortable`.
- A relationship is checked by its foreign-key column the same way; its operators are `eq`, `ne`,
  `in`, `nin`, and `isNull` (3.1), so a NOT NULL key refuses `isNull` and a `bool` key `in` and
  `nin`.

The operator vocabulary is keyset-core's, so a filter the declaration allows is a filter the planner
executes. The types read an `enum` rule by its presence, as `ColumnValue` does, where the runtime
intersects the rules' values (6.1 steps 2 and 3), so only the runtime refuses a text column whose
rules leave no value.

Tests: `keyset-type.test.ts` (11.2 at runtime); `check-filters.test.ts` and `filter-check.test-d.ts`
(11.3, both twins, the second also pinning `KeysetTypeOf`); `check-filters-names.test.ts` and
`names/keyset-names-check.test-d.ts` (the public names and the primary key of 11.2, both twins);
`keyset-checks.test-d.ts` (the primary key and the search configuration through `declareResource`'s
types); `declare-search-sort.test.ts` (3.7); `jsonapi/keyset-names.test.ts` and `.test-d.ts`, which
hold the type-level grammars to keyset-core's `isFieldName` and `isSearchConfig` over one case table
(`test-support/keyset-name-cases.ts`); `e2e/resource/fails/filters.ts`,
`e2e/resource/fails/definitions.ts`, and `definitions.e2e.test.ts` (15.4);
`resource-definition.test.ts` and `keyset-definition.test.ts` compare both derived definitions with
hand-written ones for the contacts fixture (11.1, 11.2), and keyset-core plans the latter;
`jsonapi/definitions.test-d.ts` pins their types; `derived-definitions.e2e.test.ts` holds the two
definitions of every e2e resource to each other (15.4), and the eleventh record of 15.5 does so on
the real catalogs, with the page queries run in PostgreSQL.

---

## 12. The `server` subpath (`server/`, ADR 0008)

What only a server composes, typed by the application's registries. Nothing here touches a database:
a storage adapter does (12.8), and a runtime runs each operation over one. The runtime is not part
of this package.

### 12.1 `createDomainDefiners<TDomain>()`

```ts
const { definePolicy, defineResource } = createDomainDefiners<{
  actor: AppActor; // extends Actor<Permission>
  permissions: Permission; // a union of permission strings
  quotas: QuotaName; // a union of quota names
  services: Services; // what the runtime hands to policies, values, rules, and effects
  errors: typeof APP_ERRORS; // the application's ban-core catalog fragment
}>();

interface Actor<TPermission extends string> {
  readonly id: string;
  readonly can: (permission: TPermission) => boolean;
}
```

The type argument is the whole input; the function only binds the definers to it, so
`actor.can('contacts:raed')`, `quota: 'contact'`, and `reject('CONTACT_LIMTI')` fail `tsc`. `can` is
a property, not a method: TypeScript compares a method's parameters bivariantly, so a method would
accept an actor whose `can` takes other permissions. The constraint
`TDomain extends DomainOf<TDomain>` checks the actor against `permissions`, and its error is
reported on the type argument. @ref https://www.typescriptlang.org/tsconfig/#strictFunctionTypes

### 12.2 Policies

`definePolicy(Contacts, { list, get, create, update, remove, include })` holds one predicate per
operation, `(context) => boolean | Promise<boolean>`, over these contexts:

| Operation       | Context                                                             |
| --------------- | ------------------------------------------------------------------- |
| `list`          | `actor`, `services`                                                 |
| `get`, `remove` | `actor`, `services`, `row` (the current public row)                 |
| `create`        | `actor`, `services`, `input` (the parsed input)                     |
| `update`        | `actor`, `services`, `row`, `input`                                 |
| `include`       | per relationship declared with `include: true`; `actor`, `services` |

`include` on a resource without an includable relationship fails `tsc`, and so does a predicate for
an operation the resource does not declare. `policy.authorize(operation, context)` resolves when the
operation's predicate answers exactly `true`; any other answer denies, so a predicate that returns a
truthy value by mistake still fails closed, and one that throws rejects with its error.

- An operation without a predicate is denied, and `denyAll`, the policy of a resource that has none,
  has no predicate.
- A denial without a row (`list`, `create`) is `FORBIDDEN` (403). A denial with a row (`get`,
  `update`, `remove`) is `NOT_FOUND` (404), rendered exactly as a missing row is, so a client cannot
  probe for rows it may not see. Neither carries a detail. @ref
  https://www.rfc-editor.org/rfc/rfc9110#section-15.5.4 (an origin server that wishes to hide a
  forbidden resource MAY respond with 404)
- `policy.authorizeInclude(relationship, context)` rejects a denied include with `FORBIDDEN`, the
  detail "The relationship may not be included.", and one item at the query parameter
  (`{ location: 'query', path: ['include'] }`), which the JSON:API format renders as
  `source.parameter: 'include'`. @ref https://jsonapi.org/format/1.1/#error-objects

JavaScript mistakes throw `TypeError`:
`definePolicy: the resource must be a resource declareResource returned`,
`definePolicy: contacts: the policy must be an object`,
`definePolicy: contacts: "lsit" is not a declared operation`,
`definePolicy: contacts: "owner" is not an includable relationship`,
`definePolicy: contacts: include must be an object`, and
`definePolicy: contacts: the predicate of get must be a function`.

### 12.3 Behavior

```ts
defineResource(Contacts, {
  policy, // from definePolicy(Contacts, ...); denyAll when absent
  operations: {
    create: { values, quota, rules, effects }, // each optional, except values (below)
    update: { rules, effects },
    remove: { rules, effects },
  },
});
```

- `values({ actor, services, input })` returns the server values: an object keyed by column, typed
  `ServerValuesOf<typeof Contacts>`, holding exactly the columns required on insert (6.3) that no
  client-writable member, the scope, or a client id covers, each in its column's wire form. When
  that set is not empty, `operations.create.values` is REQUIRED, and a missing column, an extra
  column, or a value of another type fails `tsc`; when it is empty, `values` fails `tsc`.
- `quota` names a quota (12.6) checked on create.
- `rules` run with `{ actor, services, reject }`, plus `input` on create and update and `row` on
  update and remove, and refuse with `reject` (12.4).
- `effects` return the events (12.7) to record with the write: a create's receive `input` and the
  created `row`, an update's `input`, the updated `row`, and the `previous` row, a remove's the
  removed `row`.
- A behavior for an operation the resource does not declare, or for `list` and `get`, fails `tsc`.

`defineResource` returns `{ resource, policy, operations, serverValues }`, frozen, with `denyAll`
for a missing policy, empty `rules` and `effects` lists, and `serverValues` the columns `values`
must supply, in column order. JavaScript mistakes throw `TypeError`, among them
`defineResource: organizations: operations.create.values must supply slug`,
`defineResource: teams: operations: create is not a declared operation`,
`defineResource: contacts: operations.update: "quota" is not one of rules, effects`, and
`defineResource: contacts: policy must come from definePolicy(contacts, ...) or be denyAll`.

Every operation runs the same lifecycle inside one transaction: policy, rules, quota, write,
effects; any failure rolls back everything, effects included. An update and a remove read their row
with `lock` (12.8), so the row the policy and the rules decide on is the row the write changes:
under READ COMMITTED a plain read takes no lock, and another transaction could change or remove the
row between the read and the write. @ref
https://www.postgresql.org/docs/18/transaction-iso.html#XACT-READ-COMMITTED

### 12.4 `reject(code, options?)`

`reject(code, { fields, detail })` throws a `Rejection` carrying one of the application's codes. A
rule receives `reject` typed by the domain's codes and the resource's public member names (`id`
included), so a misspelled code or member fails `tsc`. Rules use it for what needs outside state: a
reference check before `remove`, a limit only a service knows.

`rejectionError(rejection, { resource, errors, pointer = '/data' })` is the runtime's half: the
code's error from `errors` (status, title, `type`, and the definition, with `detail` when the
rejection has one), one item per named member under `pointer`, and the rejection as `cause`. It
throws `TypeError` for a code `errors` does not hold
(`rejectionError: options.errors has no code SEAT_LIMIT`) and for a member the resource does not
have (`rejectionError: SEAT_LIMIT names "emial", which contacts has no member called`).

### 12.5 Scopes

```ts
const SCOPE_BINDINGS = {
  organization: defineScope({
    column: 'organization_id',
    value: (actor: AppActor) => actor.organizationId,
    session: 'app.organization_id',
  }),
} satisfies ScopeBindings<typeof SCOPES>;
```

- `column` MUST equal the column of the same scope in the definer's `scopes`, which `ScopeBindings`
  checks; `satisfies` makes a missing or extra scope a compile error.
- `session` names a custom configuration parameter, two dotted identifiers
  (`^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$`), which row security policies read with
  `current_setting`. @ref https://www.postgresql.org/docs/18/runtime-config-custom.html
- `scopeValues(SCOPE_BINDINGS, actor)` gives each scope's `{ scope, column, session, value }` for
  `StorageAdapter.transaction`, and throws `TypeError` when a binding's value is not a string or a
  finite number, so an actor without a tenant never runs unscoped.
- For every operation on a scoped resource, the adapter sets the parameter for the transaction only
  (`set_config(session, value, true)`), adds `column = value` to every statement as defense in depth
  next to row security, and writes `value` into the column on create. @ref
  https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-ADMIN-SET

### 12.6 Quotas

`defineQuota({ limit })` with `limit(context) => number | Promise<number>`. On create, the runtime
counts the resource's rows in the actor's scope (`StorageAdapter.count`) and refuses with
`quotaExceeded(count, limit)`: `QUOTA_EXCEEDED` (403), a code of resource-core's own catalog
fragment (9.2), with the detail "The quota for this resource is used up.". It fails closed: a limit
that is not a safe integer of at least zero refuses every create. The count and the insert are
atomic per quota and scope value: the adapter serializes them (a transaction-scoped advisory lock),
so two concurrent creates cannot both take the last slot.

### 12.7 Events

`defineEvent(name, version, schema)` declares an event: the name is letters and digits in segments
joined by `.`, `_`, or `-`, the version a positive integer, the schema any Standard Schema.
`Event.of(payload)` validates the payload and returns `{ name, version, payload }`, frozen; it
throws `TypeError` for a payload the schema refuses, with the issues as `cause`, and for a schema
that validates asynchronously, since an effect's events are built inside the transaction. Effects
return events, the adapter writes them to an outbox in the operation's transaction, and delivery
after commit belongs to the runtime. Consumers tell payload shapes apart by version, so a changed
payload is a new version. @ref https://standardschema.dev

### 12.8 The storage adapter contract (`server/storage.ts`)

```ts
interface StorageAdapter<TTransaction> {
  transaction<TResult>(
    scopes: ReadonlyArray<ScopeValue>,
    run: (tx: TTransaction) => Promise<TResult>,
  ): Promise<TResult>;
  list(
    tx: TTransaction,
    resource: DeclaredResource,
    request: StorageListRequest,
  ): Promise<StoragePage>;
  get(tx: TTransaction, resource: DeclaredResource, id: string): Promise<PublicRow | undefined>;
  lock(
    tx: TTransaction,
    resource: DeclaredResource,
    id: string,
    write: 'update' | 'remove',
  ): Promise<PublicRow | undefined>; // the row, locked until the transaction ends
  create(tx: TTransaction, resource: DeclaredResource, input: StorageWrite): Promise<PublicRow>;
  update(
    tx: TTransaction,
    resource: DeclaredResource,
    id: string,
    input: StorageWrite,
  ): Promise<PublicRow | undefined>;
  remove(tx: TTransaction, resource: DeclaredResource, id: string): Promise<boolean>;
  count(tx: TTransaction, resource: DeclaredResource, quota: string): Promise<number>; // under the quota lock
  record(tx: TTransaction, events: ReadonlyArray<DomainEvent>): Promise<void>;
  partitionRoot(names: ViolationNames): Promise<ViolationNames | undefined>; // outside any operation
}

interface ViolationNames {
  readonly schema: string;
  readonly table: string;
  readonly constraint?: string; // a constraint or a unique index of the table
}

interface StorageWrite {
  readonly id?: string; // a create's client id (3.4)
  readonly attributes: Readonly<Record<string, unknown>>; // parsed field values, by public name
  readonly relationships: Readonly<Record<string, string | null>>; // target ids; null clears
  readonly values?: Readonly<Record<string, unknown>>; // a create's server values, by column
}
```

A `PublicRow` is `{ id: string }` with each readable field and relationship by public name, a
relationship as its target's id or `null`; a `write` field is never read. An adapter reads what it
needs from the declared resource's public members, `names` (the table, the key column), `fields`
(each member's column, kind, access, and codec), and `declaration.scope`, from the public catalog
(schemas and types), and from its own storage codecs (7.1).

A `StorageListRequest` is keyset-core's `KeysetRequest` without relation filters,
`KeysetRequest<string, string, NoRelations>`: what the declared resource's keyset definition plans,
since it has no relations (11.2). An adapter defines that keyset once per resource with the server's
configured `createDefineKeyset({ cursor })`, which holds the cursor secret the declaration leaves
out, and pages with it as `@netvark/kysely-keyset` does for Kysely (keyset SPEC 6): `plan(request)`;
one statement over the schema-qualified table with the scope's predicate, the plan's `filter` and
`seek`, each key selected as text under its alias, the keys ordered with their directions and null
placement, and the plan's `limit`; then `page(plan, rows, values)` over the rows read. Every value
of the plan is a parameter of its column's type, a cursor's included: its values are the text each
key was selected as, so a `timestamptz` keeps its microseconds and an `int8` its digits. The plan
orders nulls last on a forward page, where PostgreSQL's default puts them first when descending.
@ref https://www.postgresql.org/docs/18/queries-order.html (NULLS FIRST is the default for DESC
order)

An adapter MUST:

1. Run each operation in one transaction that begins by setting every scope's parameter for that
   transaction only, rolls back when `run` rejects, and rejects with what `run` threw, unchanged, so
   the runtime still sees its `Rejection` (12.4). When a statement failed and `run` went on, the
   transaction rejects with that statement's error, since PostgreSQL turns the COMMIT of an aborted
   transaction into a rollback that reports no error. @ref
   https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/access/transam/xact.c
   (`EndTransactionBlock`: "Since COMMIT may actually do a ROLLBACK")
2. Add each scope's predicate to every statement on a scoped table.
3. Return public rows in the read forms of 5, through the storage codecs for codec fields, and fail
   a read whose stored value has no read form instead of emitting another value.
4. Insert or update exactly the members present in the input, plus the scope columns and the server
   values on create, and nothing else (ADR 0004): a member left out keeps its value, or its default
   on create; `null` clears a member; an update without members changes nothing and returns the row.
5. Page `list` with the declared resource's keyset definition and `@netvark/keyset-core`'s planner,
   filters and sorts addressed by public names, as above: never by counting rows, which shifts every
   later page when a row of an earlier one goes away. @ref
   https://jsonapi.org/profiles/ethanresnick/cursor-pagination/ ("with offset–limit pagination, if
   an item from a prior page is deleted while the client is paginating, all subsequent results will
   be shifted forward by one")
6. Let every PostgreSQL error raised inside an operation reach the runtime with its fields, as
   thrown or as the `cause` of what is thrown, so the runtime's `constraintError` (9.5) maps it;
   never replace it with an error of its own.
7. Treat a row outside the actor's scope as absent for `get`, `lock`, `update`, and `remove`.
8. Make `count` and the following insert atomic per quota and scope value.
9. Write recorded events in the operation's transaction.
10. Hold the row `lock` returns until the transaction ends, locked at least as the write it names
    will lock it: `FOR NO KEY UPDATE` before an update, `FOR UPDATE` before a remove. `FOR UPDATE`
    also blocks the `FOR KEY SHARE` lock a foreign key check takes on the row it references, so no
    other transaction adds a reference to a row about to be removed. @ref
    https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS @ref
    https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/utils/adt/ri_triggers.c
    (`RI_FKey_check`: "FOR KEY SHARE OF x")
11. Answer `partitionRoot` outside any operation's transaction, as `PARTITION_ROOT_SQL` does (9.5):
    for a partition, at any depth and in any schema, the partitioned table at the top of its tree
    and that table's name for `names.constraint`, or no `constraint` when the table has none; for a
    table that is not a partition, the partitioned table itself included, `undefined`. A
    `constraint` is a string or absent, never `null`, so a SQL `NULL` is left out.

### 12.9 The contract suite (`testing/storage-contract.ts`)

`storageContract(harness)` returns `ReadonlyArray<ContractCase>`, each
`{ name, run(): Promise<void> }`, one or more per obligation of 12.8, named after it
(`obligation 7: a row of another scope is absent for get, lock, update, and remove`). Each case
resets the database first, throws a `ContractFailure` that names what it checked with the expected
and the actual value, and imports no test runner, so an adapter package runs the cases under its own
(`for (const c of cases) it(c.name, c.run)`).

```ts
interface ContractHarness<TTransaction> {
  readonly adapter: StorageAdapter<TTransaction>; // over a database holding contractFixture.migrations
  readonly reset: () => Promise<void>; // runs contractFixture.seed and empties the outbox
  readonly events: () => Promise<ReadonlyArray<DomainEvent>>; // the committed outbox, in order
}
```

`contractFixture` is the suite's own fixture: `migrations` as SQL text, the `seed`, the public
`catalog` `pg-catalog extract` reads from the migrations, the `point` codec, the `workspace` scope
(session parameter `contract.workspace_id`), and three declarations: `workspaces`, unscoped with an
identity key; `tasks`, scoped to a workspace, with client ids, the server value `created_by`, a
field of every wire form, an array, JSON, a codec field, generated columns, a `write` field, and a
self-reference; and `logs`, partitioned by its id with client ids, whose ids below 1000 go to
`logs_low` and the rest to `contract_archive.logs_high_rest`, a partition of a table attached with
its own primary key. A third migration adds to tasks what `list` filters and sorts besides: an enum,
which sorts in the order of its labels, an `int4`, and a `tsvector` generated from the title with
`simple`. `tasks` filters with operators of every keyset type, sorts by its scalars, searches that
column, sorts by `['-priority', 'due_on']` by default, and pages two to three rows at a time; `logs`
lists, filtered by its owner. A column default reads
`current_setting('contract.workspace_id', true)`, so a case reads back what the transaction set, and
the schema has no row security, so only the adapter's predicate keeps a row in its scope. The values
are the ones drivers get wrong by default: an `int8` past 2^53, a `numeric` read as a float, a
`timestamptz` at millisecond precision or in the local zone, array elements that need quoting,
`NULL` and the empty string among them. A harness gives its adapter the catalog, a storage codec for
`point`, and a keyset definer with a cursor secret; on a server, it gives the adapter at least two
connections, so the concurrent cases of obligations 8 and 10 run two transactions at once: the first
takes its lock, the second starts, and the first finishes only after the second had time to reach
the database. An adapter that serializes its transactions, as PGlite's does, passes them without a
lock.

The cases of obligation 5 list five tasks of workspace 1, created between two of workspace 2, two
rows a page, each request walked forward with `next` from the first page and back with `prev` from
the last, which must give the same pages: the declared default sort; every sortable field in both
directions, nulls last, ties broken by the key; every declared operator on a value of its keyset
type; search in websearch mode, with a filter; the page flags and each row's cursor; a cursor that
resumes after its row though the row was removed since; the page bounds, a size past the max refused
with keyset-core's `PAGE_SIZE_EXCEEDED`; and logs, which declare no sort, ordered by their `int8`
key past 2^53 across both partitions, and filtered by their owner. A case of obligation 2 walks each
workspace's pages. A `list` that rejects fails its case, with the error as the failure's `cause`.

Tests: `domain.test-d.ts` (permissions, quotas, codes, fields, and server values as compile errors),
`policy.test.ts`, `behavior.test.ts`, `scope.test.ts`, `quota.test.ts`, `event.test.ts`,
`reject.test.ts`, `server-values.test.ts`, and `constraint-error.test.ts`, with
`contract/assert.test.ts`, `contract/concurrency.test.ts`, `contract/fixture.test.ts`, and
`contract/list-requests.test.ts` (a request for every declared operator and sortable field). The
contract suite itself is proven in `e2e/resource` against a reference adapter written in plain SQL,
over PGlite and over PostgreSQL through a node-postgres pool (`contract.e2e.test.ts`), so the
contract is shown implementable before `@netvark/kysely-resource` exists.
`contract-faults.e2e.test.ts` gives the reference adapter one defect at a time, from parameters set
for the session to a missing quota or row lock, a partition resolved to its own names, pages counted
by offset, filters and sorts named by column, PostgreSQL's default null placement, and sort keys
selected as a driver reads them by default, and checks that the cases about it fail, and
`extract.e2e.test.ts` checks that the fixture's catalog is what extraction gives for its migrations.

---

## 13. OpenAPI and the API diff (`openapi/`)

### 13.1 `openapi(resources, options)`

Returns an OpenAPI 3.1 document object for the listed resources:

- **Paths** from each resource's links base: the collection (`GET` list, `POST` create), the
  resource (`GET`, `PATCH`, `DELETE`), and for each relationship the relationship link (`GET`, and
  `PATCH` when it is writable) and the related link (`GET` when the target has `get`), each only for
  declared operations. Requests and responses use `application/vnd.api+json`.
- **Schemas** per resource and operation, from the field metadata (8): the JSON Schema of each wire
  form (5.1) with the folded limits as keywords (several `patterns` as one `pattern` each under
  `allOf`), an array's `items`, `readOnly` and `writeOnly` by access, `required` by 6.2, and enum
  `options`; a codec field takes `z.toJSONSchema(codec.schema)` with `io: 'input'` for requests and
  `'output'` for responses. Validators add no keyword: their constraint appears in the error
  responses.
- **Parameters** from the query capabilities: `filter[<member>][<operator>]` per declared operator,
  `sort` with its allowed values, `page[size]`, `page[after]`, `page[before]`, `include`,
  `fields[<type>]`, and `filter[q]`.
- **Error responses** through `@netvark/ban-core/openapi`'s `errorResponses` for every status an
  operation can produce, each listing its codes: the jsonapi-core codes, the resource's derived
  codes (9.1), `FORBIDDEN` for members and policies, and the application's codes its rules name.
- **Examples**: each declared field `example` composes a resource example, and `options.examples`
  adds business examples per type and operation. Every example MUST pass the matching Zod schema;
  `openapi` throws `TypeError` naming the first that fails, so an invalid example is a failed build,
  not a wrong document.

@ref https://spec.openapis.org/oas/v3.1.1.html @ref
https://jsonapi.org/format/1.1/#content-negotiation

### 13.2 The surface and its diff

`surfaceOf(resources)` returns a deterministic, sorted JSON value of what clients depend on: per
type, the operations; per field its access, wire form, format, fraction digits, nullability,
requiredness on create, limits, options, an array's elements, operators, and sortability; per
relationship its target, access, requiredness, operators, and include; the codes with their
statuses; search; and page bounds. Committed next to the catalog, it is the snapshot of ADR 0003.

`diffSurfaces(before, after)` returns `ReadonlyArray<SurfaceChange>`, each
`{ path, change, breaking, before, after }`:

| Change                                                                           | Breaking |
| -------------------------------------------------------------------------------- | -------- |
| a type, operation, field, relationship, code, operator, or sortable flag removed | yes      |
| a public name renamed (reported as a removal and an addition)                    | yes      |
| a member becoming required on create, or a new member required on create         | yes      |
| a writable member becoming non-nullable, or a readable member becoming nullable  | yes      |
| an option removed, a limit tightened, a pattern added, a code's status changed   | yes      |
| a member, option, operator, code, or operation added; a limit loosened           | no       |

The command that writes the snapshot and fails CI on a breaking change ships with the CLI that loads
the registry, next to `rules --check` (catalog SPEC 10.3, 11.2).

Tests: `openapi.test.ts` validates the contacts document against the OpenAPI 3.1 schema and every
response example against its schema with Ajv (2020-12); `surface.test.ts`; `diff.test.ts` with one
case per row.

---

## 14. Declaration errors

Mistakes TypeScript cannot see, and every mistake made from JavaScript, throw `TypeError` when a
define function, the definer, or the declaration runs, at startup. The message starts with the path,
uses database names for declaration paths and public names for registry conflicts, and never
contains request data. TypeScript reports the mistakes it can see at compile time, at the offending
option, in the two forms of 3; its message names the option relative to the declaration
(`access: immutable needs the create operation`) and states the same reason as the runtime check.

| Condition                                                                                        | Message (example)                                                                                                                                           |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| an unknown configuration or declaration member, or a member of the wrong kind                    | `contacts.fields.name: unknown member "sortable"`                                                                                                           |
| a catalog of another format                                                                      | `createDeclareResource.catalog: format 4 is not supported (expected 3)`                                                                                     |
| the full catalog (2)                                                                             | `createDeclareResource.catalog: a full catalog; pass the public catalog (toPublicCatalog), since declarations reach browsers`                               |
| a registry entry `defineCodec` or `defineValidator` did not make, or `null` for a registry       | `createDeclareResource.codecs.phone: must be made by defineCodec`                                                                                           |
| `types`, `fixtures`, or a fixture list that is empty, or a schema that is not a Zod 4 schema (7) | `defineCodec.types: must be a non-empty list of type names`                                                                                                 |
| a fixture the schema disagrees with (7)                                                          | `defineValidator.fixtures.reject[1]: the schema accepts this fixture`                                                                                       |
| a schema that parses asynchronously (7)                                                          | `defineCodec.schema: must parse synchronously`                                                                                                              |
| a domain rule for an unknown domain or CHECK, or for a CHECK with a rule (3.6)                   | `createDeclareResource.domains.email.email_format: "email_format" is not a CHECK of domain email`                                                           |
| a domain rule's code, given or derived, that does not match `CODE_PATTERN` (3.6)                 | `createDeclareResource.domains.email.email_check.code: "Email" is not A-Z, 0-9, _`                                                                          |
| a codec schema that accepts `undefined` or `null` (7.1)                                          | `defineCodec.schema: must reject null; the column's nullability decides null`                                                                               |
| `links` or `page` that `@netvark/jsonapi-core`'s rules refuse                                    | `createDeclareResource.links.base must not end with "/"`                                                                                                    |
| a table outside the public catalog                                                               | `declareResource: "accounts" is not a table of the public catalog`                                                                                          |
| no single-column primary key                                                                     | `contact_phones: a resource needs a single-column primary key`                                                                                              |
| a primary key whose type cannot carry a resource id (3.4)                                        | `import_batches: the primary key's type jsonb cannot carry a resource id`                                                                                   |
| a primary key keyset-core cannot order (3.4)                                                     | `things: the primary key is an enum without values, which @netvark/keyset-core cannot order`                                                                |
| `clientIds` on a primary key that takes no client value (3.4)                                    | `organizations.clientIds: the primary key is an identity column generated always, which takes no client value`                                              |
| an unknown column, foreign key, constraint, scope, codec, or validator                           | `contacts.fields.nick: "nick" is not a column of contacts`                                                                                                  |
| a column declared against 3.1                                                                    | `contacts.fields.organization_id: a foreign-key column is declared under relationships`                                                                     |
| an access the column does not allow                                                              | `meetings.fields.duration_minutes.access: a generated column is read-only`                                                                                  |
| an access no declared operation writes (3.3)                                                     | `contacts.fields.kind.access: immutable needs the create operation`                                                                                         |
| a foreign key to anything but the primary key of a public table (3.1)                            | `people.relationships.team_slug: the foreign key references teams.slug, which is not its primary key`                                                       |
| a foreign-key column whose type cannot carry a resource id (3.4)                                 | `import_rows.relationships.batch: type jsonb cannot carry a resource id`                                                                                    |
| a `target` that is not a function (3.8)                                                          | `meetings.relationships.organization_id.target: must be a function returning the target's declared resource`                                                |
| a `target` that returns no declared resource, or the resource of another table, on first read    | `contacts.relationships.organization_id.target: must return the declared resource of organizations`                                                         |
| a scope whose column the table does not have (3.2)                                               | `audit.changes.scope: scope organization names column organization_id, which audit.changes does not have`                                                   |
| a codec that does not accept the column's type                                                   | `contacts.fields.tags.codec: codec "phone" does not accept type text[]`                                                                                     |
| a type without a wire form and no codec                                                          | `meetings.fields.during: type tstzrange has no wire form; name a codec`                                                                                     |
| an operator `@netvark/keyset-core` does not have                                                 | `contacts.fields.name.filter[0]: "like" is not an operator of @netvark/keyset-core`                                                                         |
| an operator the keyset type does not accept, or `isNull` on a non-null field                     | `contacts.fields.tags.filter: operator "gt" is not available for array fields`                                                                              |
| `filter` or `sort: true` on a member without a keyset type, or `sort: true` on an array (11.3)   | `import_rows.fields.payload.filter: type jsonb is not filterable`                                                                                           |
| an empty `filter`, or one that lists an operator twice (11.3)                                    | `contacts.fields.name.filter: list at least one operator`                                                                                                   |
| a filtered or sortable member's public name that keyset-core or jsonapi-core refuses (11.2)      | `notes.fields.size.filter: public name "größe" is outside @netvark/keyset-core's field names (^[A-Za-z0-9][A-Za-z0-9_-]*$)`                                 |
| empty or repeated operations, or `update` with no member writable on update                      | `contacts.operations: update needs a field or relationship writable on update`                                                                              |
| a sort entry that is not sortable, or a field listed twice (3.7)                                 | `contacts.sort.default[0]: "kind" is not declared with sort: true`                                                                                          |
| a search column not `tsvector`; a config missing, mismatched, or refused by keyset-core (3.7)    | `contacts.search.config: the column is generated with config "simple"`                                                                                      |
| a page default above the max page size                                                           | `contacts.page.default: 200 exceeds the max page size 100`                                                                                                  |
| a CHECK without a rule over written columns and no validator (3.5)                               | `meetings.rules.meetings_contact_or_notes: a CHECK without a rule needs a validator`                                                                        |
| a validator on a CHECK with a rule, or on another constraint kind                                | `contacts.rules.contacts_name_check.validator: the CHECK has a rule, which enforces it already`                                                             |
| a validator on a NOT ENFORCED CHECK (3.5)                                                        | `imported_contacts.rules.imported_contacts_email_check.validator: PostgreSQL does not enforce this CHECK (NOT ENFORCED), so no validator covers it`         |
| a written field whose domain has an uncovered CHECK without a rule (3.6)                         | `contacts.fields.email: domain email's CHECK email_check has no rule; give it a validator in createDeclareResource domains`                                 |
| a relationship column without the `_id` suffix and no `as`                                       | `notes.relationships.author: the column does not end in _id; set as`                                                                                        |
| a derived name that is not a member name, is reserved, or collides (4.2)                         | `notes.fields.type: public name "type" is a member of every resource object; set as`                                                                        |
| a name given with `as` that is not a member name, is reserved, or collides                       | `notes.fields.contact.as: "body" collides with fields.body`                                                                                                 |
| a type that is not a member name or is a member of `Object.prototype`                            | `notes.as: "notes.v2" is not a JSON:API member name`                                                                                                        |
| a cased letter outside the Basic Multilingual Plane after `_` (4.1)                              | `notes.fields.x_𐐨: a letter outside the Basic Multilingual Plane follows _, which Kysely's CamelCasePlugin leaves as is and TypeScript upper-cases; set as` |
| a code that does not match `CODE_PATTERN`, or that another code repeats                          | `notes.rules.notes_priorität_check: code "NOTES_PRIORITÄT_CHECK" is not A-Z, 0-9, _; set code`                                                              |
| `code` on a key without a code (9.1)                                                             | `notes.rules.notes_pkey.code: the key has no code, since clients cannot violate it`                                                                         |
| an `example` the field schema rejects                                                            | `contacts.fields.name.example: the field schema rejects the example`                                                                                        |
| a domain CHECK code that is not A-Z, 0-9, `_`, or that another code repeats (3.6, 9.1)           | `meetings: domain inner's CHECK value_check derives code VALUE_CHECK, which domain outer's CHECK value_check also takes`                                    |
| a registry list or `appErrors` of the wrong shape (4.2)                                          | `errorCatalog.resources[1]: must be a resource declareResource returned`                                                                                    |
| registry conflicts (4.2)                                                                         | `errorCatalog: relationship contacts.organization targets organizations, which is not listed`                                                               |

Two checks exist only in types, since a Zod schema's input type has no runtime form: a validator
whose input does not accept what its CHECK holds (7.2), and a domain validator whose input does not
accept every value of the domain (3.6). Their messages are
`validator: "<name>" does not accept every value of <column>`,
`validator: "<name>" does not accept every object of <public names>`, and
`validator: "<name>" does not accept every value of domain <domain>`.

Tests: one case per row in the `declare-*.test.ts`, `create-declare-resource.test.ts`,
`check-filters.test.ts`, `check-filters-names.test.ts`, `derive-names-errors.test.ts`,
`define-codec.test.ts`, `define-validator.test.ts`, `derive-errors.test.ts`, `domain-codes.test.ts`,
and `check-registry.test.ts` files; `e2e/resource/fails/` holds each compile-time form, matched by
its text.

---

## 15. Test plan

### 15.1 Unit and type tests

Colocated `*.test.ts` and `*.test-d.ts` per module, as listed in each section. Every compile-time
rule has a `@ts-expect-error` case next to the valid form, and every runtime rule a test asserting
the `TypeError` message. Unit tests read `src/test-support/contacts.ts` (the contacts fixture: a
public catalog literal modeled on the contacts application of `e2e/catalog`), small literals written
for a case, and the generator of 15.2, all typed by `PublicCatalog` so they cannot drift from the
model; the real extraction is exercised end to end (15.4).

### 15.2 Property test over generated catalogs

A seeded generator in `src/test-support/` builds public catalogs: tables with columns of every type
of 5.1, nullable or not, with and without column and domain defaults, identity and generated
columns, every rule kind, and constraints of every kind. For each catalog a declaration exposes
every column it can, and the test asserts:

- `schema.create` requires exactly the columns 6.3 requires, and `schema.update` requires none;
- `schema.read` holds exactly the readable fields, and `resource.attributes` every field;
- `errors` holds one code per constraint 9.1 selects, with the status of its kind;
- `fields[*].limits` equals the fold of the column's type bounds and rules;
- the keyset definition holds exactly the filterable and sortable fields with the types of 11.2.

The seed is printed on failure and fixed seeds run in CI. The generator adds no dependency.

### 15.3 The oracle (`e2e/resource/oracle.e2e.test.ts`)

`boundaryFixtures(resource)`, from the `testing` entry, returns `{ fields, relationships }`: for
each field with a wire form and each relationship, keyed by public name, a frozen list of
`BoundaryFixture`s, `{ value, label }`, the wire values at or next to each limit of the member's
folded value spec (6.1), each value once, the label naming the limit (`maxLength 3, plus one`,
`upper bound 5`, `fraction digits 3, zeros past it`):

- text: the empty string, one character, a trailing space, an astral character, U+0000, and an
  unpaired surrogate; `maxLength` and `minLength` with their neighbors, in ASCII and in astral
  characters; each option, in upper case and with a trailing space, and a value that is no option;
- numbers: zero, a fraction, the type's limits and one past them (`real`'s overflow and underflow
  included), and each bound with its neighbors, the next double or `real` for a float;
- decimals: the spellings PostgreSQL reads and the wire form refuses (`-0`, `+1`, `01`, ` 1`, `.5`,
  `1e3`), `int8`'s limits, `numeric`'s digit limits, half a step and a value that rounds past the
  largest for `numeric(p, s)`, and one step on each side of each bound;
- strings: a uuid in either case, with braces, without hyphens, and one digit short; the date limits
  and leap days, a seventh fraction digit and, at a column's precision p, p digits, one more, zeros
  past p, and the last instant; leap seconds, hour 24, and the offsets PostgreSQL drops or refuses;
- enums: every label of the type, those an `enum` rule leaves out included, with near misses;
  booleans: `true` and `false`; arrays: the empty array and each element fixture in an array of its
  own; JSON: nested values and U+0000 and unpaired surrogates in strings and keys;
- relationships: the target key's fixtures as id text (3.4), with the spellings the id form refuses.

A codec field has no entry, since its codec's fixtures cover it (7.1), and any value
`declareResource` did not return throws `TypeError`
(`boundaryFixtures: the resource must be one declareResource returned`). `boundary-fixtures.test.ts`
and `boundary-forms.test.ts` check, for every form and every key type that carries an id, that each
list straddles its member's own schema: accepted on one side of each limit, refused on the other. A
`bool` or `json` field has no limit inside its JSON type, so the schema accepts all its fixtures.

The oracle declares a schema that covers every row of 5.1 and every rule shape of 6.1, and runs
every fixture of every field through the field's schema and through PostgreSQL; the verdicts MUST
agree. PostgreSQL's verdict comes from writing the value into its column,
`INSERT ... RETURNING <column>::text` in a transaction that is rolled back, so the column's type,
modifier, domains, and CHECKs judge it with assignment semantics, which an explicit cast would not
(`'abcd'::varchar(3)` truncates silently). The session runs in UTC with ISO dates. A value the
schema accepts MUST be stored as the same value: its read form (5.1) compared per type
(`numeric(5,2)` prints `1.50`, `uuid` lower case, `timestamptz` in UTC, `bpchar` padded, `real` at
single precision). A value the schema refuses MUST be refused, or stored as a value whose read form
is outside 5.1 or differs from what was sent, the cases of 5.2. Relationship ids run through the
linkage schema and into the target's key column.

It runs on PGlite always, queried directly, since node-postgres behind PGlite's socket server lost
protocol sync after a refused parameter, and on PostgreSQL 14 and 18 servers when `RESOURCE_PG_URL`
is set, as CI does, each in a throwaway UTF-8 database. PGlite 0.5.8 never gives back the stack an
error used and fails every statement after about 1,800 errors on one instance, so the oracle opens a
fresh one after 1,000, and `oracle-database.e2e.test.ts` crosses that limit. @ref
https://github.com/electric-sql/pglite/issues/1115

### 15.4 End-to-end suite (`e2e/resource/`)

A private workspace package, `@netvark/resource-e2e`, that consumes the built packages through
`workspace:*` and never imports from `src/`. It holds its own fixture migrations (the contacts
application of `e2e/catalog`, extended with a multi-column CHECK, a CHECK the rule translator does
not cover, a domain CHECK without a rule, a codec column, an exclusion constraint, two tables keyed
by `jsonb`, a `notes` table whose columns need `as` and `code`, and a partial unique index), a
PostgreSQL 18 schema of NOT ENFORCED constraints (`fixtures/postgres18`, run on PGlite and on a
server of major 18 or later), the catalogs `@netvark/pg-catalog` extracts from them (checked with
`extract --check`), and declarations over them. It proves: the declarations type-check, and a
`fails/` directory of declarations fails `tsc` with the expected errors, and each one a derived
definition would refuse (`fails/definitions.ts`) throws the same reason from JavaScript
(`definitions.e2e.test.ts`); the derived names, recorded in a reviewed snapshot
(`snapshots/names.json`), and a derived code TypeScript leaves to the runtime; the derived schemas,
metadata, and definitions, and that the two definitions agree: each filter, sort, search, page, and
include request `parseQuery` accepts on a resource's `resource`, keyset-core plans with its
`keyset`, and what `parseQuery` refuses keyset-core refuses too, but a sort by the key
(`derived-definitions.e2e.test.ts`, 11.2); that a client that follows `fields` alone sends values
PostgreSQL stores as sent, while each value one step past a stated bound, outside the stated options
or form, or with a fraction digit too many is refused or changed, and the schemas give the
metadata's verdict on each (`fields.e2e.test.ts`, over every column type of the oracle and the ids
of each key type); that the `required` members of the contacts application are exactly the ones an
insert needs, and a member left out holds its stated `default` (`fields-create.e2e.test.ts`); the
derived error codes, recorded in a reviewed snapshot (`snapshots/errors.json`), each raised by a
real violation (`support/violations.ts`) on PGlite and both servers with the SQLSTATE and fields of
9.5, and the catalog `errorCatalog` assembles from them, rendered by `createBan`; `constraintError`
against the same violations, each mapped to its code's error; localized error documents
(`localization.e2e.test.ts`): messages the Paraglide compiler builds from `localization/messages/`,
mapped with `defineMessages` and served through Hono and `@netvark/hono-ban`, answer a 422 in German
with option labels, in English with its plural forms, in the base locale for a language the project
lacks, in a regional tag's language, and a 409, which `constraintError` makes of a real violation,
with a code's own texts, each with `Content-Language` and `Vary`, while `tsc` accepts the mapping
and refuses a translation that names a variable its kind does not receive; that a row breaking every
NOT ENFORCED constraint is stored by the database and accepted by the schemas, while the enforced
CHECK beside them refuses in both (`not-enforced.e2e.test.ts`); the storage contract, passed by the
reference adapter on PGlite and on the server and failed by each of its defects
(`contract.e2e.test.ts`, `contract-faults.e2e.test.ts`, 12.9); the package surface (every value
export listed); and the runtime smoke test on Bun, Deno, and workerd for the root, `server`,
`testing`, and `openapi` entries.

### 15.5 Real catalogs

Before a release, declarations are compiled against real public catalogs: a production application
(stern, about a hundred tables) and a slice of GitLab 17.11 (dozens of tables, many CHECKs). The
pull request records `tsc --extendedDiagnostics` time and instantiations, the codes that needed
`code` overrides, and any column that needed a codec.

The first record covers sections 2 and 3. A script declared each table whose single-column primary
key can carry a resource id, exposing every column 3.1 allows with the most permissive access the
column takes. The declarations were compiled against the packed tarball installed by npm, with
TypeScript 7.0.2 on one checker (`--checkers 1`):

| Catalog            | Declarations | Fields | Relationships | Types  | Instantiations | Check time | Peak memory |
| ------------------ | ------------ | ------ | ------------- | ------ | -------------- | ---------- | ----------- |
| stern              | 111          | 1,183  | 184           | 30,068 | 350,651        | 0.14 s     | 112 MB      |
| GitLab 17.11 slice | 60           | 1,461  | 26            | 40,294 | 420,912        | 0.20 s     | 140 MB      |

Peak memory is the median of three runs. With the default 4 checkers the check took 0.15 s and 188
MB for stern and 0.21 s and 233 MB for GitLab, since each checker recomputes the declarations its
files reach. Only stern's `vector` columns and GitLab's `bytea` columns needed a codec; stern needed
validators for 6 CHECKs without a rule and GitLab for 73. At runtime every declaration was accepted
and every relationship target resolved to a declared resource. Before the measures of 3 ("How
mistakes are reported"), the same stern check took 1.55 s and 874 MB.

The second record covers section 4. The same declarations, with `as` on the columns named `type` (12
in stern, 1 in GitLab), the only ones that needed it, were compiled as above. The baseline is the
same build with the names checks removed, measured in the same session; times and memory are the
medians of seven runs:

| Catalog            | Names checks | Types  | Instantiations | Check time | Peak memory |
| ------------------ | ------------ | ------ | -------------- | ---------- | ----------- |
| stern              | removed      | 30,075 | 350,651        | 0.150 s    | 113 MB      |
| stern              | on           | 34,915 | 404,356        | 0.173 s    | 125 MB      |
| GitLab 17.11 slice | removed      | 40,301 | 420,912        | 0.221 s    | 133 MB      |
| GitLab 17.11 slice | on           | 44,042 | 460,762        | 0.246 s    | 147 MB      |

No rule needed `code`, and at runtime every declaration derived valid, distinct codes. The first
version, which checked every member and every rule key in types, took 1.05 million instantiations on
stern and 2.76 million on GitLab, 3 and 6.5 times the baseline. Four measures brought it down:

- The name risk of 4.2, computed per table from the catalog alone, so only the members in it or that
  give `as` get the full check.
- Given codes only in types; derived codes at runtime.
- The members that give `as` are listed only when a cheap test, one `Extract` over the union of
  member declarations, finds one.
- Unions of template literal types are named with an alias (`NotAMemberName`, `RiskyName`):
  TypeScript 7 instantiates an inline union in a conditional's `extends` clause again on every
  evaluation, which cost 4 to 7 times as much.

With section 7, the same declarations take real codecs and validators. stern's `vector` codec
carries numbers as a JSON array, and its six CHECKs without a rule share three validators over pairs
of relationships; the GitLab slice's `bytea` codec carries base64, and one stand-in validator covers
its 73 CHECKs. Every fixture passed its own schema at startup, and every one of stern's 12 validator
fixtures and the 4 codec fixtures gave the same verdict, or the same value after a round trip,
through PostgreSQL 18.3 (PGlite with pgvector), as `rules --check` will run them. Zod's types added
0.7 percent instantiations on stern and 0.2 percent on GitLab, and 10 MB and 13 MB of peak memory
for parsing Zod's own declarations; check time did not change.

The third record covers sections 5 and 6 and the `testing` entry. With the validators taking
relationships as ids and the attachment checks of 3.6 and 7.2, the same declarations compiled with
409,913 instantiations, 0.178 s, and 135 MB for stern, and 482,969, 0.246 s, and 156 MB for the
GitLab slice, medians of five runs: 1.4 and 4.8 percent more instantiations than the second record.
The checks fired on all six of stern's validators while they took linkages. At runtime, on Node.js
24:

| Catalog            | Declare | Build every schema | Boundary fixtures | Field fixtures | Id fixtures | Disagreements |
| ------------------ | ------- | ------------------ | ----------------- | -------------- | ----------- | ------------- |
| stern              | 103 ms  | 36 ms              | 6 ms              | 12,288         | 1,104       | 0             |
| GitLab 17.11 slice | 214 ms  | 36 ms              | 30 ms             | 11,623         | 312         | 0             |

Every fixture ran through its member's schema and was written, as 15.3 writes it, into a probe table
holding the column's own type (its `format_type`, so modifiers and domains apply) and its
single-column CHECKs that have a rule, on PostgreSQL 18.3 (PGlite) and on a PostgreSQL 14.19 server
holding each schema; a CHECK without a rule is its validator's, whose fixtures `rules --check` runs
(7.3). Neither schema has a `timestamp(p)` column among the declarations (GitLab 17.11 declares two
`timestamp(6)` columns, outside the slice, and stern none), so the oracle's own `timestamp(3)` and
`timestamptz(0)` columns are what found that the catalog lacked their precision.

The fourth record covers section 9. At runtime every declaration derived its codes, and
`errorCatalog` assembled each catalog's declarations into one fragment that rendered through
`createBan` and the JSON:API format, on Node.js 24:

| Catalog            | Codes | CHECK | NOT NULL | UNIQUE | FOREIGN KEY | `errorCatalog` |
| ------------------ | ----- | ----- | -------- | ------ | ----------- | -------------- |
| stern              | 739   | 6     | 571      | 29     | 133         | 2.6 ms         |
| GitLab 17.11 slice | 1,248 | 448   | 774      | 0      | 26          | 4.2 ms         |

No declared column of either schema passes a domain with a CHECK, and the GitLab slice enforces
uniqueness with 62 unique indexes, which the public catalog did not carry yet (the sixth record);
stern has 7 such indexes besides its 29 codes. The run changed section 9 twice. stern scopes 52 of
its declarations by organization, and the first version gave each scope foreign key a code whose
items pointed at nothing; the scope column now makes no code. And the GitLab slice repeats CHECK
names across tables (`push_rules` and `organization_push_rules`, `application_settings` and
`namespace_settings`), so six codes were derived twice; the registry check named both constraints of
each, and `code` on the six rules of the second table of each pair resolved them.

In types, with those six codes, as medians of five runs; the declarations alone took 0.4 and 2.1
percent more instantiations than the third record:

| Catalog            | File                                         | Instantiations | Check time | Peak memory |
| ------------------ | -------------------------------------------- | -------------- | ---------- | ----------- |
| stern              | the declarations                             | 411,362        | 0.186 s    | 129 MB      |
| stern              | plus `errorCatalog` over all and `createBan` | 1,029,864      | 0.488 s    | 165 MB      |
| GitLab 17.11 slice | the declarations                             | 493,287        | 0.273 s    | 144 MB      |
| GitLab 17.11 slice | plus `errorCatalog` over all and `createBan` | 1,219,669      | 0.538 s    | 184 MB      |

The fifth record removed the cost of naming a resource in a type (3). `Infer` and `ErrorCatalog` had
constrained their resources by the wide `DeclaredResource`; with `AnyDeclaredResource`, medians of
five runs as above:

| Catalog            | File                                            | Before          | After          |
| ------------------ | ----------------------------------------------- | --------------- | -------------- |
| stern              | 20 aliases `Infer<typeof X>['read']`            | 1.05 s, 577 MB  | 0.19 s, 130 MB |
| stern              | `declare const c: ErrorCatalog<[...]>` over all | 5.38 s, 2.36 GB | 0.32 s, 139 MB |
| stern              | `errorCatalog` over all and `createBan`         | 0.46 s, 159 MB  | 0.36 s, 143 MB |
| GitLab 17.11 slice | `errorCatalog` over all and `createBan`         | 0.54 s, 189 MB  | 0.37 s, 171 MB |

`errorCatalog` over stern took 654,409 instantiations instead of 1,029,864, and over the GitLab
slice 764,840 instead of 1,219,669; the declarations alone did not change. Declaring the parameters
of `DeclaredResource` covariant with `out` measured the same, but TypeScript cannot verify the
annotation, since the typed members are not covariant in the context in general, and a consumer that
checks library declarations would see the error.

The sixth record covers unique indexes (9.1, catalog ADR 0009). Extracted again in format 2, the
public catalogs list stern's 7 unique indexes that no constraint backs, 5 of them partial, and 61 of
the GitLab slice's 62, 11 of them partial; the 62nd,
`index_customer_relations_contacts_on_unique_email_per_group (group_id, lower(email), id)`, has an
expression element and stays out. At runtime, on Node.js 24:

| Catalog            | Codes | UNIQUE | Unique indexes without a code | `errorCatalog` |
| ------------------ | ----- | ------ | ----------------------------- | -------------- |
| stern              | 745   | 35     | 1                             | 2.8 ms         |
| GitLab 17.11 slice | 1,302 | 54     | 7                             | 4.1 ms         |

An index without a code has no member in its key: stern's `business_profiles_organization_id_idx`
repeats the scope-only UNIQUE constraint of 9.1, and GitLab's seven cover the scope column, the
primary key column, or columns the generated declarations leave out. A `code` on stern's partial
`tools_org_name_unique` type-checks and renames its code, and a misspelled key fails `tsc`. In
types, as medians of five runs:

| Catalog            | File                                         | Instantiations | Check time | Peak memory |
| ------------------ | -------------------------------------------- | -------------- | ---------- | ----------- |
| stern              | the declarations                             | 411,566        | 0.179 s    | 129 MB      |
| stern              | plus `errorCatalog` over all and `createBan` | 655,758        | 0.370 s    | 145 MB      |
| GitLab 17.11 slice | the declarations                             | 494,950        | 0.257 s    | 152 MB      |
| GitLab 17.11 slice | plus `errorCatalog` over all and `createBan` | 774,833        | 0.379 s    | 169 MB      |

The declarations took 0.05 and 0.3 percent more instantiations than in the fourth record, and
`errorCatalog` 0.2 and 1.3 percent more than in the fifth.

The seventh record covers NOT ENFORCED constraints (3.5, 6.1, 9.1, catalog ADR 0010). Neither
catalog has one. Extracted again in format 3, stern's public catalog gains `enforced: true` on 201
CHECKs and foreign keys and the GitLab slice's on 552, the full catalogs change only in `format`,
and the codes stay 745 and 1,302.

A migration that marks stern's `notes_subject_id_fkey` and `notes_target_check` NOT ENFORCED makes
`tsc` fail once, at the validator the `notes` declaration names for the CHECK. Without it, `notes`
loses those two codes (743 in all) and keeps its `subject` relationship. Its `write.create` accepts
a note with both targets and a subject no row holds, which PGlite stores, while the enforced
`notes_entity_id_fkey` still refuses a missing entity with 23503. A second migration enforces both
again: the foreign key with `ALTER CONSTRAINT ... ENFORCED`, which refuses with 23503 while a row
breaks it, and the CHECK by dropping and adding it. It restores the original public catalog byte for
byte, and `tsc` asks for the validator again. In types, as medians of five runs:

| Catalog            | File                                         | Instantiations | Check time | Peak memory |
| ------------------ | -------------------------------------------- | -------------- | ---------- | ----------- |
| stern              | the declarations                             | 411,577        | 0.175 s    | 129 MB      |
| stern              | plus `errorCatalog` over all and `createBan` | 657,651        | 0.373 s    | 144 MB      |
| GitLab 17.11 slice | the declarations                             | 495,111        | 0.250 s    | 156 MB      |
| GitLab 17.11 slice | plus `errorCatalog` over all and `createBan` | 778,465        | 0.379 s    | 173 MB      |

The declarations took under 0.1 percent more instantiations than in the sixth record, and
`errorCatalog` 0.3 and 0.5 percent more, the cost of leaving unenforced constraints out of the typed
codes.

The eighth record covers section 8. Read once on every declaration, on Node.js 24, `fields` took 3
ms over stern's 111 declarations and 3 ms over the GitLab slice's 60. A script built the probes of
`support/meta-probes.ts` from each entry alone, as `fields.e2e.test.ts` does, and checked three
things on PostgreSQL 18.3 (PGlite) and on a PostgreSQL 14.19 server holding each schema. The
member's schema without validators gives the metadata's verdict on every probe. PostgreSQL, writing
each probe into a probe table holding the column's type, its NOT NULL, and its single-column CHECKs
that have a rule (a relationship's ids go into its target's key), stores what the metadata admits as
sent and refuses or changes the rest. And on a `LIKE` copy of each table, holding only the CHECKs
that have a rule on a creatable member and NOT NULL only on creatable members and identities, a row
of the `required` members alone is stored, leaving out any one of them fails with 23502 or 23514,
and each creatable member left out holds its stated `default`:

| Catalog            | Entries | Probes | Required | Left out: constant, expression, no default | Disagreements |
| ------------------ | ------- | ------ | -------- | ------------------------------------------ | ------------- |
| stern              | 1,367   | 26,416 | 265      | 129, 181, 741                              | 0             |
| GitLab 17.11 slice | 1,487   | 23,790 | 223      | 649, 1, 614                                | 0             |

The oracle's own keys had already changed the metadata once: a `bool` key's id took any string,
where the linkage schema takes only `true` and `false`, so such a relationship now states those two
options. The real catalogs changed the probes twice: a pattern that rules out the probe length
(`^[0-9]{14}$` on GitLab's `ai_active_context_migrations.version`) is probed at the first length it
admits, and a `date`, `uuid`, or `boolean` value gains a probe just outside its form. That member's
`maxLength` of 255, which its pattern makes unreachable, is the only stated fact left unprobed. A
codec member is carried with its codec's first fixture, except stern's `embeddings.embedding`: its
codec's fixtures have 3 dimensions where the column holds 768, which no metadata states. Turning off
`required`, `default`, `maxLength`, or `nullable` in the installed build made the script report 110,
310, 512, and 1,050 problems on stern.

In types, as medians of five runs, declaring the resources computes nothing of `fields`, and reading
every declaration's `fields`, one resource at a time as a form would, costs about as much as reading
each one's `schema.create` output instead:

| Catalog            | File                                            | Instantiations | Check time | Peak memory |
| ------------------ | ----------------------------------------------- | -------------- | ---------- | ----------- |
| stern              | the declarations                                | 411,577        | 0.184 s    | 127 MB      |
| stern              | plus `Object.values(X.fields)` on each          | 892,682        | 0.348 s    | 160 MB      |
| stern              | plus `z.output<typeof X.schema.create>` on each | 924,465        | 0.380 s    | 179 MB      |
| GitLab 17.11 slice | the declarations                                | 495,111        | 0.266 s    | 153 MB      |
| GitLab 17.11 slice | plus `Object.values(X.fields)` on each          | 1,129,235      | 0.565 s    | 182 MB      |
| GitLab 17.11 slice | plus `z.output<typeof X.schema.create>` on each | 1,225,432      | 0.544 s    | 210 MB      |

Flattening each entry's facts with a mapped type costs 9 percent of the instantiations and no check
time, so hovers show one object.

The ninth record covers section 10. On Node.js 24, `defaultMessages` took 8 ms over stern's 111
declarations (17 codes no resource derives, 4 constraint kinds, 1,367 member labels, and 479 option
labels on 63 fields) and 9 ms over the GitLab slice's 60 (1,487 member labels, no options), and
`defineMessages` checked a full mapping in 2 ms. A script mapped every message to a function that
names its slot and echoes its inputs, as a translation's functions would, and rendered through the
ban handler with `localizeErrors` every derived code, 745 and 1,302, in that mapping and in English,
and an `enum` issue on each of stern's 63 fields with options. Every object took its constraint
kind's title and a detail given the labels of its members, every `enum` detail the labels of its
options, and no English text held a placeholder; a response took 0.03 ms. Leaving one member label
out made `defineMessages` throw naming its path and `tsc` fail once, at that type's labels. In
types, as medians of five runs, with one function per code, constraint kind, issue kind, member, and
option:

| Catalog            | File                                 | Instantiations | Check time | Peak memory |
| ------------------ | ------------------------------------ | -------------- | ---------- | ----------- |
| stern              | the declarations                     | 411,577        | 0.186 s    | 124 MB      |
| stern              | plus a full `defineMessages` mapping | 884,323        | 0.353 s    | 161 MB      |
| GitLab 17.11 slice | the declarations                     | 495,111        | 0.277 s    | 157 MB      |
| GitLab 17.11 slice | plus a full `defineMessages` mapping | 1,107,182      | 0.671 s    | 198 MB      |

The option labels are typed from each column's options (`TypedFieldOptions`), not from `fields`,
whose full metadata the first version built for every member to read them: 1,164,397 instantiations
and 0.469 s on stern.

The tenth record covers section 11's checks of the definitions a declaration derives. A script
compared the runtime and type-level checks on probes it built from each catalog, one declaration per
line, compiled together: for every column a field can name, each keyset-core operator and
`sort: true` (23,260 probes on stern, 27,540 on the GitLab slice); and for every declarable table,
public names given with `as` (`okName`, `9lives`, `a-b_c`, `größe`, `nick name`, `or`, `q`, `abc_`,
`constructor`, `toString`, `hasOwnProperty`) on a field that filters, sorts, or does neither and on
a relationship that filters or not, `or` and `q` beside `search` on stern's three generated
`tsvector` columns, empty and repeated `filter` lists, repeated `sort.default` entries, search
configurations, and each table's empty declaration (7,079 probes on stern, 3,306 on the GitLab
slice). The two checks accepted the same probes and, where both refused, gave the same reason.
Neither catalog has a primary key keyset-core cannot order or a search configuration it refuses:
stern's three columns are generated with `simple`, and the GitLab slice has none. Compiled against
catalogs extracted before the catalog types had names (catalog ADR 0011), each refused relationship
printed the whole catalog in its message, and 60 of them took 18.9 s and 5.3 GB; against the named
types, all 1,834 took 1.2 s. In types, as medians of five runs:

| Catalog            | Checks                       | Instantiations | Check time | Peak memory |
| ------------------ | ---------------------------- | -------------- | ---------- | ----------- |
| stern              | operators and sort (11.3)    | 471,980        | 0.184 s    | 134 MB      |
| stern              | plus the definitions' checks | 489,983        | 0.187 s    | 135 MB      |
| GitLab 17.11 slice | operators and sort (11.3)    | 569,406        | 0.269 s    | 158 MB      |
| GitLab 17.11 slice | plus the definitions' checks | 580,496        | 0.279 s    | 163 MB      |

The operator and sort check had added 15 percent instantiations and 4 and 6 percent check time to
the ninth record's declarations. The first version of the name checks read every public name one
character at a time: 596,534 and 890,902 instantiations, 0.218 s and 0.378 s. Examining only the
members the names check already examines (11.2) removed nearly all of it.

The eleventh record covers section 11's definitions themselves. A script derived both definitions of
each declaration as written (111 on stern and 60 on the GitLab slice, filtering with `eq` only) and
of one declaration per table naming every column with each operator and `sort: true` the runtime
accepts, every relationship with its operators and `include`, `search` on stern's `tsvector`
columns, and a default sort. The server's `createDefineKeyset({ cursor })` accepted every `keyset`,
and every `resource` built. Each request `parseQuery` accepted, keyset-core planned and
`@netvark/kysely-keyset` ran as a page query: on the per-table declarations, 13,202 field-operator
pairs, 2,126 sorts, 184 includes, and 3 searches on stern, and 13,319, 2,640, 26, and none on the
GitLab slice. Each operator `parseQuery` refused for a name, keyset-core refused too (14,500 and
14,478), and so did each sort it refused, but the key's. Then, in a transaction rolled back after,
each table was replaced by a copy without constraints holding six rows with ties and NULLs: walking
the default sort and every sortable name in both directions two rows at a time, forwards with `next`
and back with `prev`, gave the order of one page of all six rows (2,127 and 2,640 walks). Everything
ran on PostgreSQL 18.3 (PGlite) and on a 14.19 server without a disagreement. The declarations'
instantiations did not change (489,983 and 580,496): TypeScript computes the two members' types only
where they are read.

The twelfth record covers obligation 5 of 12.8. The reference adapter of 12.9, whose `list` renders
keyset-core's plan as plain SQL, ran against `@netvark/kysely-keyset`, an independent renderer of
the same plan, on the eleventh record's per-table declarations. In a transaction rolled back after,
each table was replaced by a copy without constraints holding six rows with ties and NULLs in every
member the keyset filters or sorts, keys past 2^53 where the key is an `int8`, and a `tsvector` in
stern's search columns. The reference adapter's pages, walked two rows at a time forwards with
`next` and back with `prev`, gave kysely-keyset's one page of all rows for the default sort and for
every sortable name in both directions, the key's included (2,349 walks on stern and 2,760 on the
GitLab slice); its one page held kysely-keyset's rows for every declared operator, `isNull` both
ways (13,812 and 13,930 requests), and for 9 searches on stern. Everything ran on PostgreSQL 18.3
(PGlite) and on a 14.19 server without a disagreement. The comparison catches what it is about: keys
ordered without their null placement disagreed 752 times on stern, and `nin` rendered as `in` 1,131
times. The script's first run computed the GitLab slice's `int8` keys as JavaScript numbers, so
9007199254740993 went in as a second 9007199254740992, into a key without its constraint, and 609
walks lost or repeated a row: the values the contract's cases are made of.

### 15.6 The Zod floor

A CI job runs the package's unit tests with `zod` 4.5.0, the floor of the peer range;
`length.test.ts` pins that `z.string().max(1)` accepts `U+1F600`, which 4.4.3 rejects.

---

## 16. Packaging

- ESM only, `engines.node >= 22.12.0`, built by tsdown with declarations through oxc
  (`isolatedDeclarations`), `platform: 'neutral'`, `sideEffects: false`. `publint --strict` and
  `attw --profile esm-only` run in the build.
- Entries `index`, `server`, `openapi`, and `testing`; the `exports` map, `source` conditions,
  `publishConfig`, `files`, and release flow follow the keyset family (keyset SPEC 12).
- Dependencies: `@netvark/catalog-core`, `@netvark/jsonapi-core`, `@netvark/keyset-core`, and
  `@netvark/ban-core`, each `workspace:^`. Peer dependency: `zod` `^4.5.0`. Development: `zod` from
  the workspace catalog.
- Runs on Node.js 22.12 and later, Bun, Deno, Cloudflare Workers, and browsers; the root and
  `openapi` entries carry no server code.

---

## 17. Constants

| Name                                         | Value                                                                                                        | Exported |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------- |
| `CATALOG_FORMAT`                             | 3, from `@netvark/catalog-core`                                                                              | no       |
| `DEFAULT_PAGE_SIZE`, `DEFAULT_MAX_PAGE_SIZE` | 20 and 100, from `@netvark/keyset-core`                                                                      | no       |
| `SEARCH_PARAMETER`                           | `filter[q]`                                                                                                  | no       |
| `SEARCH_MEMBER`, `FILTER_OR_MEMBER`          | `q` and `or`, the members of `filter` jsonapi-core reserves (11.2)                                           | no       |
| `FIELD_NAME_SYNTAX`                          | `^[A-Za-z0-9][A-Za-z0-9_-]*$`, keyset-core's field names, which its `isFieldName` tests                      | no       |
| `SEARCH_CONFIG_SYNTAX`                       | `^[a-z_][a-z0-9_]{0,62}$`, keyset-core's search configurations, which its `isSearchConfig` tests             | no       |
| `CODE_PATTERN`                               | `^[A-Z][A-Z0-9_]*$`                                                                                          | no       |
| `ID_SUFFIX`                                  | `_id`                                                                                                        | no       |
| `NOT_NULL_SUFFIX`                            | `_not_null`                                                                                                  | no       |
| `ISSUE_KINDS`                                | the thirteen kinds of 6.4, in that order                                                                     | yes      |
| integer bounds                               | `int2` [-32768, 32767], `int4` [-2147483648, 2147483647], `int8` [-9223372036854775808, 9223372036854775807] | no       |
| `real` limit                                 | `Math.fround` finite and nonzero for a nonzero input                                                         | no       |
| fraction digits of a second                  | at most 6                                                                                                    | no       |
| date years                                   | 0001 to 9999                                                                                                 | no       |
| Standard Schema vendor                       | `netvark`                                                                                                    | no       |
| `QUOTA_EXCEEDED`                             | 403, `Quota Exceeded`                                                                                        | no       |
