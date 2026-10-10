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

One package with four entry points (ADR 0008). It depends on `@netvark/catalog-core` (types only),
`@netvark/jsonapi-core`, `@netvark/keyset-core`, and `@netvark/ban-core`, and takes `zod` `^4.5.0`
as a peer dependency. Nothing in it imports a framework, a query builder, a driver, or a Node.js
module.

| Entry point                      | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@netvark/resource-core`         | `createDeclareResource`, `defineCodec`, `defineValidator`, `errorCatalog`, `forbiddenMembers`, `defineMessages`, `defaultMessages`, `localizeErrors`, `negotiateLanguage`, `ISSUE_KINDS`, and the types `DeclaredResource`, `Declaration`, `FieldDeclaration`, `RelationshipDeclaration`, `RuleDeclaration`, `Access`, `Operation`, `Infer`, `FieldMeta`, `ErrorEntry`, `IssueKind`, `ResourceIssue`, `Codec`, `Validator`, `StorageCodecs`, `Messages`, `MessagesFor` |
| `@netvark/resource-core/server`  | `createDomainDefiners`, `defineScope`, `defineQuota`, `defineEvent`, `reject`, `denyAll`, `constraintError`, and the types `Actor`, `Policy`, `ResourceBehavior`, `ServerValuesOf`, `Scope`, `Quota`, `DomainEvent`, `Rejection`, `StorageAdapter`, `StorageRequest`                                                                                                                                                                                                   |
| `@netvark/resource-core/openapi` | `openapi`, `surfaceOf`, `diffSurfaces`, and the types `OpenApiOptions`, `Surface`, `SurfaceChange`                                                                                                                                                                                                                                                                                                                                                                     |
| `@netvark/resource-core/testing` | `storageContract`, `boundaryFixtures`, and the types `ContractCase`, `ContractHarness`                                                                                                                                                                                                                                                                                                                                                                                 |

```
packages/resource-core/src/
  index.ts                  root re-exports
  declare/                  createDeclareResource, declareResource, the declaration types, checks (2, 3, 14)
  catalog/                  type-level and prototype-safe runtime lookups into the public catalog
  names/                    derived names, the reverse maps, the type-level conversions (4)
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
  const TCatalog extends PublicCatalog,
  const TCodecs extends CodecRegistry = EmptyRegistry,
  const TValidators extends ValidatorRegistry = EmptyRegistry,
  const TScopes extends ScopeRegistry = EmptyRegistry,
>(config: {
  readonly catalog: TCatalog; // the generated public catalog, `as const`
  readonly codecs?: TCodecs | undefined; // { name: defineCodec(...) }
  readonly validators?: TValidators | undefined; // { name: defineValidator(...) }
  readonly scopes?: TScopes | undefined; // { name: { column } }
  readonly domains?: DomainRules<TCatalog, TValidators> | undefined; // 3.6
  readonly links?: ResourceLinksInit | undefined; // @netvark/jsonapi-core
  readonly page?: PageCapabilitiesInit | undefined; // @netvark/jsonapi-core
}): DeclareResource<TCatalog, TCodecs, TValidators, TScopes>;
```

- `catalog` MUST be a public catalog (`toPublicCatalog`, catalog SPEC 3) of format 1
  (`SUPPORTED_CATALOG_FORMAT`); a catalog of another format throws `TypeError`, and its literal type
  fails the `TCatalog` constraint. The full catalog is rejected too, because declarations reach
  browsers (ADR 0002): structurally it would satisfy `PublicCatalog`, so the constraint also
  requires the absence of its `schemas` member, and the runtime check tests the same member.
- Registries map a name to a value made by `defineCodec`, `defineValidator`, or
  `{ column: string }`. A codec or validator value that the define function did not produce throws
  `TypeError` (they carry a private brand). Scope names are internal and unconstrained; a scope's
  `column` is checked per declaration (3.2).
- `links` and `page` are the application's defaults, checked here with `@netvark/jsonapi-core`'s own
  rules (`links.base` by its link convention, `page.default` and `page.max` positive integers with
  `default <= max`) and merged under every declaration member by member, as `createDefineResource`
  and `createDefineKeyset` merge theirs (jsonapi ADR 0015, keyset ADR 0014). They live in the module
  that exports the configured definer, never in module-level state.

The result is `declareResource(table, declaration)`, typed by the four registries. Tests:
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
  readonly target: () => DeclaredResource; // read lazily, so declarations can reference each other
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
NOT NULL keys of 3.5. `declareResource` returns a `DeclaredResource` (sections 4 to 11); its members
are computed once, at declaration, except `resource` and `keyset`, which read their relationship
targets lazily (11.1).

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
in the id column's wire form (5). With `clientIds: true` a create MAY carry an `id`, validated by
that form; without it a create that carries one is rejected by `@netvark/jsonapi-core` (403,
JSON:API "Client-Generated IDs"). A primary key with no default and no identity, and no `clientIds`,
is a server value on create.

@ref https://jsonapi.org/format/1.1/#crud-creating-client-ids

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
an array column, has that domain, directly or through a base domain.

### 3.7 Search, sort, page

- `search.column` MUST be a `tsvector` column of the table. When the column is generated and the
  catalog records its `searchConfig`, that is the configuration; a declared `config` MUST equal it.
  When it is not generated, `config` is REQUIRED. The search parameter is `filter[q]`
  (`SEARCH_PARAMETER`).
- `sort.default` entries name fields declared with `sort: true`; the key is appended by
  `@netvark/keyset-core` (keyset SPEC 5).
- `page` overrides the definer's `page` member by member.

Tests: `declare-resource.test.ts` (every `TypeError` of 14), `declare-resource.test-d.ts` (every
compile error above, each as a `@ts-expect-error` on the offending option, next to the valid form
that compiles).

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
`_Tmp`, `Mixed Case` is unchanged). It moves from `packages/pg-catalog/src/render/camel-case.ts` to
`@netvark/catalog-core` so both packages share one implementation, and `names/camel-case.ts` holds
its type-level twin `CamelCase<S>`. Upper-casing uses `String.prototype.toUpperCase` at runtime and
the intrinsic `Uppercase<S>` in types, which applies the same function. @ref
https://github.com/kysely-org/kysely/blob/v0.28.17/src/plugin/camel-case/camel-case.ts

A relationship column MUST end in `_id` with at least one character before it; otherwise `as` is
REQUIRED.

### 4.2 Checks

- Types, fields, and relationships MUST be JSON:API member names (`isMemberName` of
  `@netvark/jsonapi-core`): at least one character, only the allowed characters, a globally allowed
  character first and last. JSON:API requires the same of type values. @ref
  https://jsonapi.org/format/1.1/#document-member-names
- Fields and relationships of a resource share one namespace that also holds `id` and `type`; a
  collision (a `foo_id` relationship next to a `foo` column, or a column named `type`) needs `as`.
  @ref https://jsonapi.org/format/1.1/#document-resource-object-fields
- Codes MUST match `^[A-Z][A-Z0-9_]*$` (`CODE_PATTERN`), so `CONTACTS_GRÖSSE_CHECK` needs `code`.
- Across a registry (every place that takes a list of resources: `errorCatalog`, `defineMessages`,
  `openapi`, the server runtime), types are unique, and codes are unique and distinct from the
  application's own codes, `@netvark/jsonapi-core`'s `ERROR_CODES`, and `@netvark/ban-core`'s
  built-in keys (a derived `CONFLICT` would replace the built-in entry).

TypeScript reports what it can see at the declaration: an invalid character in a literal name, a
reserved name, a collision inside one resource. The registry checks run where the registry is
assembled and throw `TypeError` listing every conflict.

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

Tests: `camel-case.test.ts` in `@netvark/catalog-core` and `names.test-d.ts` read one case table
(`names/cases.ts`), so the runtime conversion and its type-level twin are pinned to the same pairs;
`derive-names.test.ts` covers overrides, the `_id` rule, every check, and the reverse maps.

---

## 5. Wire forms (`wire/`, ADR 0005)

### 5.1 The table

A column's wire form is chosen by its catalog `type` (the element type for an array) and `typeKind`.
Reads produce exactly the read form; writes accept exactly the values in the "Write" column.

| `type`                                  | Wire            | Write accepts                                                                                                          | Read form                                                  | JSON Schema                                              |
| --------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| `text`, `varchar`, `bpchar`, `citext`   | string          | a well-formed string (no unpaired surrogate) without U+0000; with `maxLength` n, at most n code points                 | as stored; `bpchar(n)` padded to n as PostgreSQL prints it | `{ type: 'string', maxLength }`                          |
| `int2`                                  | number          | an integer in [-32768, 32767]                                                                                          | the number                                                 | `{ type: 'integer', format: 'int16', minimum, maximum }` |
| `int4`                                  | number          | an integer in [-2147483648, 2147483647]                                                                                | the number                                                 | `{ type: 'integer', format: 'int32', minimum, maximum }` |
| `int8`                                  | string          | `^-?(0\|[1-9][0-9]*)$` within [-9223372036854775808, 9223372036854775807]                                              | PostgreSQL's text                                          | `{ type: 'string', format: 'int64', pattern }`           |
| `numeric`                               | string          | `^-?(0\|[1-9][0-9]*)(\.[0-9]+)?$`; with `(p, s)`, at most s fraction digits and an absolute value below 10^(p-s)       | PostgreSQL's text (`numeric(5,2)` prints `1.00`)           | `{ type: 'string', format: 'decimal', pattern }`         |
| `float4`                                | number          | a finite number whose `Math.fround` is finite, and nonzero when the number is                                          | the number                                                 | `{ type: 'number', format: 'float' }`                    |
| `float8`                                | number          | a finite number                                                                                                        | the number                                                 | `{ type: 'number', format: 'double' }`                   |
| `bool`                                  | boolean         | `true`, `false`                                                                                                        | the boolean                                                | `{ type: 'boolean' }`                                    |
| `uuid`                                  | string          | 8-4-4-4-12 hexadecimal digits, either case                                                                             | lower case                                                 | `{ type: 'string', format: 'uuid' }`                     |
| `date`                                  | string          | `YYYY-MM-DD` naming a real calendar day in the years 0001 to 9999                                                      | the same                                                   | `{ type: 'string', format: 'date' }`                     |
| `timestamp`                             | string          | RFC 3339 `full-date "T" full-time` without an offset: seconds required, at most six fraction digits, the date as above | the same, fraction as PostgreSQL prints it                 | `{ type: 'string', format: 'date-time-local' }`          |
| `timestamptz`                           | string          | RFC 3339 `date-time` with `Z` or `±HH:MM`: seconds required, at most six fraction digits, the date as above            | the instant in UTC with `Z`                                | `{ type: 'string', format: 'date-time' }`                |
| `json`, `jsonb`                         | any             | any JSON value; for `jsonb`, no U+0000 in any string                                                                   | the parsed value                                           | `{}`                                                     |
| an enum (`typeKind: 'enum'`)            | string          | one of the labels, in the catalog's order                                                                              | the label                                                  | `{ type: 'string', enum }`                               |
| a domain (`typeKind: 'domain'`)         | the base type's | the base type's form, then the domain's rules and NOT NULL                                                             | the base type's                                            | the base type's, with the rules' keywords                |
| an array of any of the above but `json` | array           | a one-dimensional array of non-null elements in the element's form                                                     | the same                                                   | `{ type: 'array', items }`                               |

@ref https://www.postgresql.org/docs/18/datatype.html @ref
https://www.rfc-editor.org/rfc/rfc3339#section-5.6 @ref https://spec.openapis.org/registry/format/

Every other type has no wire form and needs a codec (7): among them `time`, `timetz`, `interval`,
`bytea`, `money`, `inet`, `cidr`, `macaddr`, `bit`, `varbit`, `xml`, `tsquery`, the geometric types,
ranges, multiranges, composites, the `oid` types, and extension types such as `vector`, `hstore`,
and `ltree`. A `tsvector` column is only ever a search column (3.7).

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
  canonical spelling (PostgreSQL also accepts `+5`, `007`, and surrounding spaces).
- `timestamptz` rounds to microseconds and accepts minute precision; `timestamp` silently ignores an
  offset (`'2020-01-01T06:15:00+02:00'::timestamp` is `06:15:00`); `date` accepts years beyond 9999,
  BC dates, and `infinity`, which RFC 3339 cannot express. @ref
  https://www.postgresql.org/docs/18/datatype-datetime.html
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
  and `Math.fround(0.1) > 0.1` is true in JavaScript.
- `float8`, `int2`, and `int4` values are compared as numbers against `Number(bound)`, the same
  correctly rounded conversion PostgreSQL applies to the numeric constant.

Tests: `wire-forms.test.ts` holds, per row, the values the write form accepts and rejects; the
oracle runs the same values and generated boundaries through PostgreSQL (15.3).

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
type as a literal and the id in the target id's wire form, or `null` when the foreign-key column is
effectively nullable. A relationship is required on create when its column is required on insert.

- `read` strips keys it does not know instead of rejecting them, so a client that validates
  responses keeps working when the server adds a field; a response with a sparse fieldset is
  validated with `schema.read.pick(...)` of the requested members.
- Optional members accept a missing key and `undefined` alike, and the parsed output never holds a
  member whose value is `undefined` (ADR 0004).
- No schema carries `.default()`, `.prefault()`, `.catch()`, or a transform that adds a member; a
  test walks every composed schema and fails on any of them.
- Multi-column validators (3.5) run on the object schema after the members parse, only when every
  column of the CHECK has its field present in the input; otherwise the database decides (9.5).
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

| Kind                                                         | Raised when                                                             | `expected`                                                                                                      |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `required`                                                   | a required member is missing, or `null` where the field is not nullable | absent                                                                                                          |
| `type`                                                       | the JSON type is wrong                                                  | `string`, `integer`, `number`, `boolean`, `array`, `object`                                                     |
| `format`                                                     | a string is not in its wire form                                        | `uuid`, `date`, `date-time`, `date-time-local`, `int64`, `decimal`, or `text` (U+0000 or an unpaired surrogate) |
| `minLength`, `maxLength`                                     | a length rule or `varchar(n)` fails                                     | the bound                                                                                                       |
| `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum` | a range rule, a type bound, or `numeric(p, s)`'s integer digits fail    | the bound as a decimal                                                                                          |
| `multipleOf`                                                 | more fraction digits than `numeric(p, s)`'s scale                       | `10^-s` as a decimal (`0.01`)                                                                                   |
| `enum`                                                       | a value outside an enum or an `enum` rule                               | the values as a JSON array                                                                                      |
| `pattern`                                                    | a `pattern` rule fails                                                  | the pattern's source                                                                                            |
| `additionalProperties`                                       | a key the schema does not know, one issue per key                       | absent                                                                                                          |
| a constraint code                                            | a validator rejects the value                                           | absent                                                                                                          |

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

Tests: `compose.test.ts` (each step of 6.1 and each rule), `object-schemas.test.ts` (6.2, 6.3 over
the contacts fixture), `issues.test.ts` (one case per row of 6.4), `no-defaults.test.ts` (the walk),
`infer.test-d.ts` (`Infer` over the contacts fixture, enum narrowing, optional and nullable
members).

---

## 7. Codecs and validators (`codecs/`, ADR 0006)

### 7.1 `defineCodec`

```ts
function defineCodec<const TTypes extends ReadonlyArray<string>, TSchema extends ZodType>(init: {
  readonly types: TTypes; // type reference names it attaches to: base types, enums, domains, `<type>[]`
  readonly schema: TSchema; // the public schema: what the wire carries
  readonly fixtures: readonly [input<TSchema>, ...Array<input<TSchema>>]; // round-trip values
  readonly description?: string | undefined;
}): Codec<TTypes, TSchema>;
```

A codec is the public facet of a value type. A field may name a codec only when the column's type
(`type`, with `[]` appended for an array column) is in `types`. The storage facet, which converts
between the wire value and what the driver reads and writes, lives in the storage adapter, keyed by
the same names: `StorageCodecs<typeof codecs, TStored>` is
`{ readonly [K in keyof TCodecs]: { read(stored: TStored): output<schema>; write(value: output<schema>): TStored } }`,
so the two facets cannot disagree on the key set.

`defineCodec` throws `TypeError` when `types` is empty or holds a non-string, when `fixtures` is
empty, or when the schema rejects a fixture (naming its index). Without `fixtures` the call does not
compile.

### 7.2 `defineValidator`

```ts
function defineValidator<TSchema extends ZodType>(init: {
  readonly schema: TSchema; // input: the field's value, or an object of the CHECK's fields by public name
  readonly fixtures: {
    readonly accept: readonly [input<TSchema>, ...Array<input<TSchema>>];
    readonly reject: readonly [input<TSchema>, ...Array<input<TSchema>>];
  };
  readonly description?: string | undefined;
}): Validator<TSchema>;
```

A validator is the request-side twin of a CHECK the recognizer could not translate. Attached to a
single-column CHECK, its input is the field's value (6.1 step 5); attached to a multi-column CHECK,
its input is an object of the CHECK's fields keyed by public name (6.2). The validator's input type
MUST accept the field's output type, which `tsc` checks at the attachment. Its issues carry the
CHECK's error code as their kind (6.4), whatever the schema's own codes.

`defineValidator` throws `TypeError` when either list is empty, when the schema rejects an `accept`
fixture, or when it accepts a `reject` fixture (naming the list and index).

### 7.3 The oracle's inputs

`fixtures` are what `pg-catalog rules --check` runs through the database (catalog SPEC 10.3):

- a codec fixture is written through the storage facet as `SELECT ($1::<type>)::text`, read back
  through it, and must equal the fixture and pass the public schema;
- a validator fixture is substituted into the CHECK expression, `SELECT (<expression>)`, and the
  database's verdict (true or null accepts, false rejects) must match the list it is in.

This package only stores, types, and self-checks them. Tests: `define-codec.test.ts`,
`define-validator.test.ts`, `storage-codecs.test-d.ts`.

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

Relationship targets are read lazily, so `Contacts` and `Users` may reference each other in either
order.

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

Mistakes TypeScript cannot see, and every mistake made from JavaScript, throw `TypeError` when the
definer or the declaration runs, at startup. The message starts with the path, uses database names
for declaration paths and public names for registry conflicts, and never contains request data:

| Condition                                                                    | Message (example)                                                                                  |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| a catalog of another format                                                  | `createDeclareResource.catalog: format 2 is not supported (expected 1)`                            |
| a table outside the public catalog                                           | `declareResource: "accounts" is not a table of the public catalog`                                 |
| no single-column primary key                                                 | `contact_phones: a resource needs a single-column primary key`                                     |
| an unknown column, foreign key, constraint, scope, codec, or validator       | `contacts.fields.nick: "nick" is not a column of contacts`                                         |
| a column declared against 3.1                                                | `contacts.fields.organization_id: a foreign-key column is declared under relationships`            |
| an access the column does not allow                                          | `contacts.fields.search: a generated column is read-only`                                          |
| a codec that does not accept the column's type                               | `contacts.fields.email.codec: codec "phone" does not accept type email`                            |
| a type without a wire form and no codec                                      | `meetings.fields.during: type tstzrange has no wire form; name a codec`                            |
| an operator the keyset type does not accept, or `isNull` on a non-null field | `contacts.fields.tags.filter: operator "gt" is not available for array fields`                     |
| a sort entry that is not sortable                                            | `contacts.sort.default[0]: "name" is not declared with sort: true`                                 |
| a search column that is not `tsvector`, or a config mismatch or omission     | `contacts.search.config: the column is generated with config "simple"`                             |
| a CHECK without a rule over writable columns and no validator                | `contacts.rules.contacts_phone_check: a CHECK without a rule needs a validator`                    |
| a validator on a CHECK with a rule, or on another constraint kind            | `contacts.rules.contacts_name_check.validator: the CHECK has a rule`                               |
| an uncovered domain CHECK (3.6)                                              | `createDeclareResource.domains.email.email_check: a domain CHECK without a rule needs a validator` |
| a relationship column without the `_id` suffix and no `as`                   | `contacts.relationships.owner: the column does not end in _id; set as`                             |
| a name that is not a member name, is reserved, or collides                   | `contacts: fields "type" and the type member collide; set as`                                      |
| a code that does not match `CODE_PATTERN`                                    | `contacts.rules.contacts_größe_check: code "CONTACTS_GRÖSSE_CHECK" is not A-Z, 0-9, _; set code`   |
| `update` with no member writable on update                                   | `contacts.operations: update needs a member writable on update`                                    |
| an `example` the field schema rejects                                        | `contacts.fields.name.example: the field schema rejects the example`                               |
| registry conflicts (4.2)                                                     | `errorCatalog: code CONTACTS_EMAIL_UNIQUE is derived by contacts and users`                        |

Tests: one case per row in `declare-resource.test.ts` and `registry.test.ts`.

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

For every row of 5.1 and every rule shape of 6.1, the boundary fixtures of `boundaryFixtures` (each
bound and its neighbors, the type's limits, empty and astral strings, U+0000, an unpaired surrogate,
the extra fraction digit, the date limits) run through the composed Zod schema and through
PostgreSQL, `SELECT ($1::<type>)` and `SELECT (<check>)`, and the verdicts MUST agree except where
5.2 documents a stricter wire form, in which case the test asserts that PostgreSQL would store a
different value. It runs on PGlite always, and on PostgreSQL 14 and 18 servers when
`RESOURCE_PG_URL` is set, as CI does.

### 15.4 End-to-end suite (`e2e/resource/`)

A private workspace package, `@netvark/resource-e2e`, that consumes the built packages through
`workspace:*` and never imports from `src/`. It holds its own fixture migrations (the contacts
application of `e2e/catalog`, extended with a multi-column CHECK, a validator-covered CHECK, a codec
column, and an exclusion constraint), the catalogs `@netvark/pg-catalog` extracts from them (checked
with `extract --check`), and declarations over them. It proves: the declarations type-check, and a
`fails/` directory of declarations fails `tsc` with the expected errors; the derived schemas, codes,
metadata, and definitions; `constraintError` against real violations on PGlite and both servers;
localized error documents; the package surface (every value export listed); and the runtime smoke
test on Bun, Deno, and workerd for the root and `openapi` entries.

### 15.5 Real catalogs

Before a release, declarations are compiled against real public catalogs: a production application
(stern, about a hundred tables) and a slice of GitLab 17.11 (dozens of tables, many CHECKs). The
pull request records `tsc --extendedDiagnostics` time and instantiations, the codes that needed
`code` overrides, and any column that needed a codec.

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

| Name                        | Value                                                                                                        | Exported |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ | -------- |
| `SUPPORTED_CATALOG_FORMAT`  | 1                                                                                                            | no       |
| `SEARCH_PARAMETER`          | `filter[q]`                                                                                                  | no       |
| `CODE_PATTERN`              | `^[A-Z][A-Z0-9_]*$`                                                                                          | no       |
| `ID_SUFFIX`                 | `_id`                                                                                                        | no       |
| `NOT_NULL_SUFFIX`           | `_not_null`                                                                                                  | no       |
| `ISSUE_KINDS`               | the thirteen kinds of 6.4, in that order                                                                     | yes      |
| integer bounds              | `int2` [-32768, 32767], `int4` [-2147483648, 2147483647], `int8` [-9223372036854775808, 9223372036854775807] | no       |
| `real` limit                | `Math.fround` finite and nonzero for a nonzero input                                                         | no       |
| fraction digits of a second | at most 6                                                                                                    | no       |
| date years                  | 0001 to 9999                                                                                                 | no       |
| Standard Schema vendor      | `netvark`                                                                                                    | no       |
| `QUOTA_EXCEEDED`            | 403, `Quota Exceeded`                                                                                        | no       |
