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

| Entry point                      | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@netvark/resource-core`         | `createDeclareResource`, `defineCodec`, `defineValidator`, `errorCatalog`, `forbiddenMembers`, `defineMessages`, `defaultMessages`, `localizeErrors`, `negotiateLanguage`, `ISSUE_KINDS`, and the types `DeclareResource`, `DeclareResourceConfig`, `DeclareContext`, `DeclarationCheck`, `CodecRegistry`, `CodecTypes`, `ValidatorRegistry`, `ScopeRegistry`, `ScopeColumn`, `DomainRule`, `DomainRules`, `EmptyRegistry`, `DeclaredResource`, `ResourceNames`, `Declaration`, `FieldDeclaration`, `RelationshipDeclaration`, `RelationshipOperator`, `RuleDeclaration`, `SearchDeclaration`, `SortDeclaration`, `Access`, `Operation`, `Infer`, `FieldMeta`, `ErrorEntry`, `IssueKind`, `ResourceIssue`, `Codec`, `Validator`, `StorageCodec`, `StorageCodecs`, `Messages`, `MessagesFor` |
| `@netvark/resource-core/server`  | `createDomainDefiners`, `defineScope`, `defineQuota`, `defineEvent`, `reject`, `denyAll`, `constraintError`, and the types `Actor`, `Policy`, `ResourceBehavior`, `ServerValuesOf`, `Scope`, `Quota`, `DomainEvent`, `Rejection`, `StorageAdapter`, `StorageRequest`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `@netvark/resource-core/openapi` | `openapi`, `surfaceOf`, `diffSurfaces`, and the types `OpenApiOptions`, `Surface`, `SurfaceChange`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `@netvark/resource-core/testing` | `storageContract`, `boundaryFixtures`, and the types `ContractCase`, `ContractHarness`, `BoundaryFixture`, `ResourceBoundaries`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

```
packages/resource-core/src/
  index.ts                  root re-exports
  declare/                  createDeclareResource, declareResource, the declaration types, checks (2, 3, 14)
  catalog/                  type-level and prototype-safe runtime lookups into the public catalog
  names/                    derived names and codes, the reverse maps, their type-level twins and checks (4)
  wire/                     the wire forms, exact decimal comparison, the JSON Schema of each form (5)
  schema/                   value, read, create, and update schemas; rules; issue mapping; Standard Schema (6)
  codecs/                   defineCodec, defineValidator, StorageCodecs (7)
  meta/                     field metadata (8)
  errors/                   derived codes, errorCatalog, forbiddenMembers (9)
  messages/                 defineMessages, defaultMessages, templates, localizeErrors, negotiateLanguage (10)
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

- `catalog` MUST be a public catalog (`toPublicCatalog`, catalog SPEC 3) of format 1
  (`CATALOG_FORMAT` of `@netvark/catalog-core`); a catalog of another format throws `TypeError`, and
  its literal type fails the `TCatalog` constraint. The full catalog is rejected too, because
  declarations reach browsers (ADR 0002): structurally it would satisfy `PublicCatalog`, so the
  constraint also requires the absence of its `schemas` member (`NotFullCatalog`), whose requirement
  (3, "How mistakes are reported") reads
  `catalog: a full catalog; pass the public catalog (toPublicCatalog), since declarations reach browsers`,
  and the runtime check tests the same member.
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
resource id (3.4).

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
name for that constraint; ADR 0003). `code` renames the derived error code of any key. `validator`
names a validator for a CHECK whose `rule` is `null`:

- It is REQUIRED for every such CHECK whose `columns` include a column that a declared operation
  writes (a field or relationship whose access is not `read`); the declaration fails `tsc` without
  it.
- It is an error on a CHECK that has a rule (the rule already enforces it, proven by the recognizer)
  and on any other constraint kind.

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
  When it is not generated, `config` is REQUIRED. The search parameter is `filter[q]`
  (`SEARCH_PARAMETER`).
- `sort.default` entries name fields declared with `sort: true`; the key is appended by
  `@netvark/keyset-core` (keyset SPEC 5).
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
targets are read: TypeScript checks it where a registry is assembled (4.2), and at runtime the first
read of a target, and the registry, throw `TypeError`
(`contacts.relationships.organization_id.target: the target is a resource of users; the foreign key references organizations`),
and a target that returns anything but a declared resource throws
`... .target: must return the declared resource of organizations`. Nothing reads a target while
modules load, so a target declared later in the module graph is read after it exists: the first read
of `linkage` or `write` (6.2), which reads every target, is where a wrong target fails, and a failed
read throws again on the next.

Tests: `declare-resource.test.ts`, `declare-fields.test.ts`, `declare-relationships.test.ts`, and
`declare-options.test.ts` (every `TypeError` of 14 a declaration can throw);
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
  `openapi`, the server runtime), types are unique, and codes are unique and distinct from the
  application's own codes, `@netvark/jsonapi-core`'s `ERROR_CODES`, and `@netvark/ban-core`'s
  built-in keys (a derived `CONFLICT` would replace the built-in entry), and every relationship's
  target is a declared resource of the table its foreign key references and is in the registry
  (3.8).

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

The registry checks run where the registry is assembled and throw `TypeError` listing every
conflict.

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
3. The rules of the table's CHECK constraints whose `columns` are exactly this column.
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
documentation, and clients: a record keyed by public name, in declaration order
(`Contacts.fields.name.limits`):

```ts
interface FieldMeta {
  readonly name: string; // public
  readonly column: string;
  readonly kind: 'attribute' | 'relationship';
  readonly access: Access;
  readonly wire: 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'any';
  readonly format: string | null; // the OpenAPI format of 5.1, or null
  readonly nullable: boolean;
  readonly required: boolean; // on create (6.3)
  readonly default: { readonly literal: string | null } | null; // the public catalog's, for display only
  readonly limits: Limits; // minLength, maxLength, minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf, pattern
  readonly options: ReadonlyArray<string> | null; // enum labels or an enum rule's values, in order
  readonly target: string | null; // a relationship's target type
  readonly filter: ReadonlyArray<Operator>;
  readonly sortable: boolean;
  readonly codec: string | null;
  readonly description: string | null;
  readonly example: unknown; // undefined when none is declared
}
```

`limits` merges the type's bounds and every rule of 6.1 into the tightest value per keyword (numeric
bounds as decimal strings), the same fold the OpenAPI schema uses. `options` is typed as the tuple
of literals. A declared `example` MUST pass the field's value schema; otherwise `declareResource`
throws `TypeError`.

Tests: `field-meta.test.ts` (the contacts fixture, the folds), `field-meta.test-d.ts`.

---

## 9. Errors (`errors/`, ADR 0007)

### 9.1 Derived codes

A declared resource has one code per constraint a client can cause and see: a constraint with at
least one column that is a public field or relationship, the primary key when `clientIds` is true,
and the NOT NULL key (3.5) of each public member writable by an operation. The code is the rule key
upper-cased, or its `code` (4.1).

| Constraint  | Status | Title                      | Items point at                  | Detail (English, constant)               |
| ----------- | ------ | -------------------------- | ------------------------------- | ---------------------------------------- |
| CHECK       | 422    | Invalid Attribute          | each public member of `columns` | The value violates a constraint.         |
| NOT NULL    | 422    | Invalid Attribute          | the member                      | A value is required.                     |
| UNIQUE      | 409    | Conflict                   | each public member of `columns` | Another record already has this value.   |
| PRIMARY KEY | 409    | Conflict                   | `id`                            | A record with this id already exists.    |
| EXCLUDE     | 409    | Conflict                   | each public member of `columns` | The value conflicts with another record. |
| FOREIGN KEY | 404    | Related Resource Not Found | the relationship                | The related resource does not exist.     |

The scope column is never a public member, so a UNIQUE over `(organization_id, email)` points at
`email` alone. JSON:API requires 404 for a request that references a related resource that does not
exist and 409 for a client-generated id that exists, and allows 409 for a uniqueness violation on
update; 422 with a pointer is the form its examples use for an invalid attribute. @ref
https://jsonapi.org/format/1.1/#crud-creating-responses @ref
https://jsonapi.org/format/1.1/#crud-updating-responses @ref
https://jsonapi.org/examples/#error-objects

`errors` on a declared resource maps each code to `{ status, title, fields }`, with literal types,
for messages, OpenAPI, and clients.

### 9.2 `errorCatalog(resources)`

Returns the codes of every listed resource, plus resource-core's own `QUOTA_EXCEEDED` (12.6), as a
`@netvark/ban-core` catalog fragment, `{ [code]: { status, title } }`, to spread into
`createBan({ errors })` next to `ERROR_CATALOG` from `@netvark/jsonapi-core`. It runs the registry
checks of 4.2 and throws one `TypeError` listing every conflict. Its type keeps each key, so
`ban.error('CONTACTS_EMAIL_UNIQUE')` type-checks.

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

`constraintError(resources, thrown, { resource, operation, pointer = '/data' })` turns a PostgreSQL
error raised inside an operation into the declared error, or returns `undefined`:

1. Recognize the driver error with `findPostgresError` and read
   `{ sqlstate, constraint, table, schema, column }` with `readPostgresFields`
   (`@netvark/ban-core/postgresql`), so node-postgres, PGlite, postgres.js, and Bun are covered
   without a driver import.
2. 23503 (foreign key) during `remove`: the referencing row belongs to another table, so return the
   built-in `CONFLICT` (409) with the detail "The resource is still referenced." and no items.
3. 23502 (not null) carries no constraint name on any supported major: find the NOT NULL key of
   `(table, column)`. Other integrity errors (23505, 23P01, 23514, 23503 on a write): find the rule
   key of `(table, constraint)`. The table is matched by schema and name, so two schemas' tables of
   one name stay apart.
4. Found: build the error from 9.1 with one item per public member, each with `path` under `pointer`
   (`/data/attributes/<field>`, `/data/relationships/<name>`, `/data/id`), and the driver error as
   `cause`. Not found: return `undefined`, and the ban's own `map` (typically `postgresMapper()`)
   handles it with its SQLSTATE table.

It runs inside the operation because only there are the operation and the document's base known;
inside Atomic Operations the base is the operation's own `data` (ADR 0007). Tests:
`constraint-error.test.ts` with errors captured from node-postgres, PGlite, and postgres.js, and the
end-to-end suite against real violations (15.4).

---

## 10. Messages and localization (`messages/`)

### 10.1 `defineMessages(resources, appErrors, messages)`

```ts
interface Messages<
  TCodes extends string,
  TDerived extends string,
  TConstraints extends string,
  TKinds extends string,
  TFields,
  TOptions,
> {
  readonly errors: { readonly [K in TCodes]: Text } & { readonly [K in TDerived]?: Text };
  readonly constraints: { readonly [K in TConstraints]: Text }; // templates (10.3)
  readonly validation: { readonly [K in TKinds]: string }; // templates (10.3)
  readonly fields: TFields; // { [type]: { [public member]: label } }
  readonly options: TOptions; // { [type]: { [field]: { [value]: label } } } for fields with options
}
interface Text {
  readonly title: string;
  readonly detail: string;
}
```

- `TCodes` is every code a response can carry that is not derived: `@netvark/jsonapi-core`'s
  `ErrorCode`s, `QUOTA_EXCEEDED`, and the keys of `appErrors` (the application's own
  `@netvark/ban-core` catalog fragment). Each needs a title and a detail.
- `TDerived` is the resources' derived codes (9.1). Each is covered by the template of its
  constraint kind in `constraints` (`check`, `notNull`, `unique`, `primaryKey`, `exclusion`,
  `foreignKey`, only those the resources have), so a locale needs one sentence per kind, not one per
  constraint; an entry in `errors` overrides the template for that code.
- `TKinds` is the issue kinds the resources' schemas can raise (a resource without a `pattern` rule
  does not need a `pattern` template) plus their validators' codes.
- `fields` labels every public member of every resource; `options` labels every option of every
  field that has options.

A missing key fails `tsc`, and so does an unknown one. At runtime `defineMessages` throws
`TypeError` for the same mistakes and for a template naming a variable its kind does not have, so
JavaScript callers learn at startup.

### 10.2 `defaultMessages(resources, appErrors)`

A complete English locale built mechanically: catalog titles and generic details for the codes that
are not derived, the titles and details of 9.1 as the constraint templates, an English template per
issue kind, labels made from public names (`createdAt` is "Created at"), and option labels equal to
the values. An application uses it as is or spreads it under its own `en`.

### 10.3 Templates

A template is plain text with `{name}` placeholders; no other syntax exists, and literal braces are
not supported. Variables per kind:

| Template                                                                                             | Variables                                                       |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| every issue kind                                                                                     | `{field}`: the member's label from `fields`                     |
| every constraint kind                                                                                | `{fields}`: the labels of the error's members, joined with `, ` |
| `minLength`, `maxLength`, `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf` | `{limit}`: `expected`                                           |
| `enum`                                                                                               | `{values}`: the option labels, joined with `, `                 |
| `format`                                                                                             | `{format}`: `expected`                                          |
| `type`                                                                                               | `{type}`: `expected`                                            |

### 10.4 `localizeErrors(locales, { language, fallback })`

Returns a `transform` for `@netvark/ban-core`'s handler (ban SPEC 6.2), the localization point:

- `locales` maps BCP 47 language tags to `defineMessages` results; `language(ctx)` returns the
  request's `Accept-Language` value from the handler context; `fallback` names a key of `locales`
  (default: the first).
- The language is `negotiateLanguage(header, Object.keys(locales), fallback)`.
- For a JSON:API document (`{ errors: [...] }`), each error object is paired with the error's item
  at the same index, or with the error itself when it has none. `title` becomes the code's localized
  title, the override in `errors` or else its constraint template for a derived code. `detail`
  becomes, for an item whose `reason` is an issue kind, its template filled from the item (the
  member from the pointer, `expected`, the options); for an item whose `reason` is a validator's
  code, that code's detail; otherwise the code's detail, filled the same way.
- `status`, `code`, `source`, `id`, `links`, and `meta` are never changed. A body of another shape
  passes through untouched.

The transform cannot set headers. The host sets `Content-Language` to the negotiated tag and adds
`Vary: Accept-Language` to every response whose body depends on it (`@netvark/hono-resource` does
both). @ref https://www.rfc-editor.org/rfc/rfc9110#section-8.5 @ref
https://www.rfc-editor.org/rfc/rfc9110#section-12.5.5

### 10.5 `negotiateLanguage(header, available, fallback)`

Parses `Accept-Language` (RFC 9110 12.5.4): comma-separated language ranges with optional `q`
weights from 0 to 1 with up to three decimals; a malformed member is skipped and `q=0` excludes. The
ranges are tried in descending weight, ties in header order, each by RFC 4647 Lookup: compare
case-insensitively, then drop the last subtag (and a single-character subtag left before it) until a
tag of `available` matches. `*` matches nothing in Lookup and is skipped. No match returns
`fallback`. @ref https://www.rfc-editor.org/rfc/rfc9110#section-12.5.4 @ref
https://www.rfc-editor.org/rfc/rfc4647#section-3.4

Tests: `define-messages.test-d.ts` (a locale missing one code, constraint kind, issue kind, label,
or option fails; an unknown key fails; a derived code needs no entry), `define-messages.test.ts`,
`templates.test.ts`, `negotiate-language.test.ts` (the RFC examples, weights, ties, malformed
members), `localize-errors.test.ts` (a 422 with two items and a 409 become the expected German
document).

---

## 11. The JSON:API resource and the keyset definition (`jsonapi/`)

### 11.1 `resource`

`resource` on a declared resource is a `@netvark/jsonapi-core` definition built with the definer's
`createDefineResource({ links })`:

| Member          | Value                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `type`          | the public type                                                                                                                |
| `attributes`    | every field's public name, `write` fields included, so requests may carry them                                                 |
| `relationships` | each relationship: `{ type: target type, cardinality: 'one', resource: () => target.resource }`                                |
| `serialize`     | a public row (`{ id, ...fields, ...relationship ids }`) to `{ id, attributes, relationships }`, never emitting a `write` field |
| `query.sort`    | the public names of fields with `sort: true`                                                                                   |
| `query.filter`  | each field and relationship with `filter`, by public name, with its operators                                                  |
| `query.include` | the public names of relationships with `include: true` (one level)                                                             |
| `query.page`    | the merged `page` (2, 3.7)                                                                                                     |
| `query.search`  | `filter[q]` when the declaration has `search`                                                                                  |
| `validate`      | `{ create, update }` from 6.5, for the declared operations                                                                     |
| `clientIds`     | the declaration's `clientIds`                                                                                                  |

Relationship targets are read lazily (3.8), so `Contacts` and `Users` may reference each other in
either order.

### 11.2 `keyset`

`keyset` is a `@netvark/keyset-core` `DefaultedKeysetInit`: everything but the cursor, whose secret
is server configuration, so the server passes it to its own `createDefineKeyset({ cursor })`.

- `table` is the table's name; `key` is `['id']`; the `id` field maps the primary key column.
- Each field with `filter` or `sort: true`, and each relationship with `filter`, becomes a field
  keyed by public name: `column`, the keyset type below, `nullable`, `sortable`, `operators`,
  `values` for the `enum` type, `of` for arrays, `collation: 'insensitive'` for `citext`.
- `search` is `{ vector: column, config, mode }`; `sort.default` maps columns to public names;
  `page` is the merged page.

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
| `json`, `jsonb`, a codec field              | not filterable, not sortable                     |

### 11.3 Operators

A field's declared `filter` MUST be a subset of the operators `@netvark/keyset-core` accepts for its
keyset type (keyset SPEC 4.2), and `isNull` requires an effectively nullable field; both fail `tsc`
and throw `TypeError`. The operator vocabulary is keyset-core's, so a filter the declaration allows
is a filter the planner executes.

Tests: `resource-definition.test.ts` and `keyset-definition.test.ts` compare both derived
definitions with hand-written ones for the contacts fixture; `operators.test-d.ts`.

---

## 12. The `server` subpath (`server/`, ADR 0008)

What only a server composes, typed by the application's registries. Nothing here touches a database:
the storage adapter does (12.8).

### 12.1 `createDomainDefiners<TDomain>()`

```ts
const { definePolicy, defineResource } = createDomainDefiners<{
  actor: AppActor; // extends Actor<Permission>
  permissions: Permission; // a union of permission strings
  quotas: QuotaName; // a union of quota names
  services: Services; // what the runtime hands to rules and effects
  errors: typeof APP_ERRORS; // the application's ban-core catalog fragment
}>();

interface Actor<TPermission extends string> {
  readonly id: string;
  can(permission: TPermission): boolean;
}
```

The type argument is the whole input; the function only binds the definers to it, so
`actor.can('contacts:raed')`, `quota: 'contact'`, and `reject('CONTACT_LIMTI')` fail `tsc`.

### 12.2 Policies

`definePolicy(Contacts, { list, get, create, update, remove, include })` holds one predicate per
operation, `(context) => boolean | Promise<boolean>`, where the context has `actor` and `services`,
`row` (the current public row) for `get`, `update`, and `remove`, and `input` (the parsed input) for
`create` and `update`; `include` maps a relationship's public name to a predicate deciding whether
the actor may include it.

- An operation without a predicate is denied, and `denyAll` is the policy of a resource that has
  none.
- A denial without a row (`list`, `create`) is `FORBIDDEN` (403). A denial with a row (`get`,
  `update`, `remove`) is `NOT_FOUND` (404), so a client cannot probe for rows it may not see. @ref
  https://www.rfc-editor.org/rfc/rfc9110#section-15.5.4 (an origin server that wishes to hide a
  forbidden resource MAY respond with 404)
- A denied include is `FORBIDDEN` with the `include` parameter as its source.

### 12.3 Behavior

```ts
defineResource(Contacts, {
  policy, // from definePolicy; denyAll when absent
  operations: {
    create: { values, quota, rules, effects }, // each optional, except values (below)
    update: { rules, effects },
    remove: { rules, effects },
  },
});
```

- `values(context)` returns the server values: an object keyed by column, typed
  `ServerValuesOf<typeof Contacts>`, holding exactly the columns required on insert (6.3) that no
  client-writable member, scope, or client id covers. When that set is not empty `values` is
  REQUIRED, and it is a compile error to return a missing or an extra column.
- `quota` names a quota (12.6) checked on create.
- `rules` are predicates over `{ actor, services, input, row }` that refuse with `reject` (12.4).
- `effects` return events (12.7) to record with the write.

Every operation runs the same lifecycle inside one transaction: policy, rules, quota, write,
effects; any failure rolls back everything, effects included.

### 12.4 `reject(code, options?)`

`reject(code, { fields, detail })` throws a `Rejection` carrying one of the application's codes; the
runtime turns it into that code's error (status and title from `errors`) with one item per named
public member, under the operation's pointer base. `fields` are public names of the resource,
checked by `tsc`. Rules use it for what needs outside state: a reference check before `remove`, a
limit only a service knows.

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
- For every operation on a scoped resource, the adapter sets the parameter for the transaction only
  (`set_config(session, value, true)`), adds `column = value` to every statement as defense in depth
  next to row security, and writes `value` into the column on create. @ref
  https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-ADMIN-SET

### 12.6 Quotas

`defineQuota({ limit })` with `limit(context) => number | Promise<number>`. On create, the runtime
counts the resource's rows in the actor's scope and refuses when the insert would exceed the limit,
with `QUOTA_EXCEEDED` (403), a code of resource-core's own catalog fragment (9.2). The count and the
insert are atomic per quota and scope value: the adapter serializes them (a transaction-scoped
advisory lock), so two concurrent creates cannot both take the last slot.

### 12.7 Events

`defineEvent(name, version, schema)` declares an event; `Event.of(payload)` validates the payload
and returns `{ name, version, payload }`. Effects return events, the adapter writes them to an
outbox in the operation's transaction, and delivery after commit belongs to the runtime.

### 12.8 The storage adapter contract (`server/storage.ts`)

```ts
interface StorageAdapter<TTransaction> {
  transaction<T>(
    scopes: ReadonlyArray<ScopeValue>,
    run: (tx: TTransaction) => Promise<T>,
  ): Promise<T>;
  list(
    tx: TTransaction,
    resource: DeclaredResource,
    request: StorageListRequest,
  ): Promise<StoragePage>;
  get(tx: TTransaction, resource: DeclaredResource, id: string): Promise<PublicRow | undefined>;
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
}
```

An adapter MUST:

1. Run each operation in one transaction that begins by setting every scope's parameter locally.
2. Add each scope's predicate to every statement on a scoped table.
3. Return public rows in the read forms of 5, through the storage codecs for codec fields, and fail
   a read whose stored value has no read form instead of emitting another value.
4. Insert or update exactly the members present in the input, plus the scope columns and the server
   values, and nothing else (ADR 0004).
5. Page `list` with the declared resource's keyset definition and `@netvark/keyset-core`'s planner,
   filters and sorts addressed by public names.
6. Pass every PostgreSQL error raised inside an operation through `constraintError` (9.5).
7. Treat a row outside the actor's scope as absent for `get`, `update`, and `remove`.
8. Make `count` and the following insert atomic per quota and scope value.
9. Write recorded events in the operation's transaction.

### 12.9 The contract suite (`testing/storage-contract.ts`)

`storageContract(harness)` returns `ReadonlyArray<ContractCase>`, each
`{ name, run(): Promise<void> }`, one or more per obligation of 12.8. The cases throw on failure and
import no test runner, so an adapter package runs them under its own
(`for (const c of cases) it(c.name, c.run)`). The suite ships its own fixture: migrations as SQL
text, their public catalog, and declarations over it; the harness gives an adapter connected to a
database with those migrations applied and a `reset()` between cases.

Tests: `domain.test-d.ts` (permissions, quotas, codes, fields, and server values as compile errors),
`policy.test.ts`, `behavior.test.ts`, `scope.test.ts`, and `constraint-error.test.ts`. The contract
suite itself is proven in `e2e/resource` against a minimal reference adapter written in plain SQL
over PGlite, so the contract is shown implementable before `@netvark/kysely-resource` exists.

---

## 13. OpenAPI and the API diff (`openapi/`)

### 13.1 `openapi(resources, options)`

Returns an OpenAPI 3.1 document object for the listed resources:

- **Paths** from each resource's links base: the collection (`GET` list, `POST` create), the
  resource (`GET`, `PATCH`, `DELETE`), and for each relationship the relationship link (`GET`, and
  `PATCH` when it is writable) and the related link (`GET` when the target has `get`), each only for
  declared operations. Requests and responses use `application/vnd.api+json`.
- **Schemas** per resource and operation, from the field metadata (8): the JSON Schema of each wire
  form (5.1) with the folded limits as keywords, `readOnly` and `writeOnly` by access, `required` by
  6.2, and enum `options`; a codec field takes `z.toJSONSchema(codec.schema)` with `io: 'input'` for
  requests and `'output'` for responses. Validators add no keyword: their constraint appears in the
  error responses.
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
type, the operations; per field its access, wire form, format, nullability, requiredness on create,
limits, options, operators, and sortability; per relationship its target, access, requiredness,
operators, and include; the codes with their statuses; search; and page bounds. Committed next to
the catalog, it is the snapshot of ADR 0003.

`diffSurfaces(before, after)` returns `ReadonlyArray<SurfaceChange>`, each
`{ path, change, breaking, before, after }`:

| Change                                                                           | Breaking |
| -------------------------------------------------------------------------------- | -------- |
| a type, operation, field, relationship, code, operator, or sortable flag removed | yes      |
| a public name renamed (reported as a removal and an addition)                    | yes      |
| a member becoming required on create, or a new member required on create         | yes      |
| a writable member becoming non-nullable, or a readable member becoming nullable  | yes      |
| an option removed, a limit tightened, a code's status changed                    | yes      |
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
| a catalog of another format                                                                      | `createDeclareResource.catalog: format 2 is not supported (expected 1)`                                                                                     |
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
| empty or repeated operations, or `update` with no member writable on update                      | `contacts.operations: update needs a field or relationship writable on update`                                                                              |
| a sort entry that is not sortable                                                                | `contacts.sort.default[0]: "kind" is not declared with sort: true`                                                                                          |
| a search column that is not `tsvector`, or a config mismatch or omission                         | `contacts.search.config: the column is generated with config "simple"`                                                                                      |
| a page default above the max page size                                                           | `contacts.page.default: 200 exceeds the max page size 100`                                                                                                  |
| a CHECK without a rule over written columns and no validator (3.5)                               | `meetings.rules.meetings_contact_or_notes: a CHECK without a rule needs a validator`                                                                        |
| a validator on a CHECK with a rule, or on another constraint kind                                | `contacts.rules.contacts_name_check.validator: the CHECK has a rule, which enforces it already`                                                             |
| a written field whose domain has an uncovered CHECK without a rule (3.6)                         | `contacts.fields.email: domain email's CHECK email_check has no rule; give it a validator in createDeclareResource domains`                                 |
| a relationship column without the `_id` suffix and no `as`                                       | `notes.relationships.author: the column does not end in _id; set as`                                                                                        |
| a derived name that is not a member name, is reserved, or collides (4.2)                         | `notes.fields.type: public name "type" is a member of every resource object; set as`                                                                        |
| a name given with `as` that is not a member name, is reserved, or collides                       | `notes.fields.contact.as: "body" collides with fields.body`                                                                                                 |
| a type that is not a member name or is a member of `Object.prototype`                            | `notes.as: "notes.v2" is not a JSON:API member name`                                                                                                        |
| a cased letter outside the Basic Multilingual Plane after `_` (4.1)                              | `notes.fields.x_𐐨: a letter outside the Basic Multilingual Plane follows _, which Kysely's CamelCasePlugin leaves as is and TypeScript upper-cases; set as` |
| a code that does not match `CODE_PATTERN`, or that another code repeats                          | `notes.rules.notes_priorität_check: code "NOTES_PRIORITÄT_CHECK" is not A-Z, 0-9, _; set code`                                                              |
| `code` on a key without a code (9.1)                                                             | `notes.rules.notes_pkey.code: the key has no code, since clients cannot violate it`                                                                         |
| an `example` the field schema rejects                                                            | `contacts.fields.name.example: the field schema rejects the example`                                                                                        |
| registry conflicts (4.2)                                                                         | `errorCatalog: code CONTACTS_EMAIL_UNIQUE is derived by contacts and users`                                                                                 |

Two checks exist only in types, since a Zod schema's input type has no runtime form: a validator
whose input does not accept what its CHECK holds (7.2), and a domain validator whose input does not
accept every value of the domain (3.6). Their messages are
`validator: "<name>" does not accept every value of <column>`,
`validator: "<name>" does not accept every object of <public names>`, and
`validator: "<name>" does not accept every value of domain <domain>`.

Tests: one case per row in the `declare-*.test.ts`, `create-declare-resource.test.ts`,
`derive-names-errors.test.ts`, `define-codec.test.ts`, `define-validator.test.ts`, and
`registry.test.ts` files; `e2e/resource/fails/` holds each compile-time form, matched by its text.

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
by `jsonb`, and a `notes` table whose columns need `as` and `code`), the catalogs
`@netvark/pg-catalog` extracts from them (checked with `extract --check`), and declarations over
them. It proves: the declarations type-check, and a `fails/` directory of declarations fails `tsc`
with the expected errors; the derived names, recorded in a reviewed snapshot
(`snapshots/names.json`), and a derived code TypeScript leaves to the runtime; the derived schemas,
codes, metadata, and definitions; `constraintError` against real violations on PGlite and both
servers; localized error documents; the package surface (every value export listed); and the runtime
smoke test on Bun, Deno, and workerd for the root and `openapi` entries.

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
| `CATALOG_FORMAT`                             | 1, from `@netvark/catalog-core`                                                                              | no       |
| `DEFAULT_PAGE_SIZE`, `DEFAULT_MAX_PAGE_SIZE` | 20 and 100, from `@netvark/keyset-core`                                                                      | no       |
| `SEARCH_PARAMETER`                           | `filter[q]`                                                                                                  | no       |
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
