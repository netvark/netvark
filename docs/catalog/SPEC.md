# catalog: implementation specification

- Status: normative for the 0.x line of `@netvark/catalog-core` and `@netvark/pg-catalog`;
  `docs/catalog/DESIGN.md` explains the why

The key words MUST, MUST NOT, SHOULD, and MAY are used as in RFC 2119. Every section names the
source file that implements it and the tests that prove it. When this document and the code
disagree, fix one of them in the same pull request. PostgreSQL references are to the version 18
manual; the behavior they describe is the same on every supported major (14 to 18) unless a section
says otherwise.

Contents

1. Public surface and module map
2. The catalog model
3. The public catalog
4. The diff
5. Migrations
6. Replay targets
7. Extraction
8. The CHECK recognizer
9. Output files
10. Commands
11. Configuration and the CLI
12. Errors
13. Test plan
14. Packaging
15. Constants

---

## 1. Public surface and module map

Two packages (ADR 0002). `@netvark/catalog-core` is the model and the pure functions over it; it has
no dependencies and runs anywhere the other cores run. `@netvark/pg-catalog` replays, extracts,
renders, compares, and runs the CLI; it depends on `@netvark/catalog-core` (and re-exports all of
it) and on `pg`, and takes `@electric-sql/pglite` as an optional peer dependency.

| Package                 | Exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@netvark/catalog-core` | Values: `toPublicCatalog`, `diffCatalogs`, `CATALOG_FORMAT`; and the types of sections 2 to 4 (`Catalog`, `CatalogTable`, `CatalogColumn`, `ColumnDefault`, `ColumnGenerated`, `TypeKind`, `Identity`, `Constraint`, `PrimaryKeyConstraint`, `UniqueConstraint`, `ForeignKeyConstraint`, `CheckConstraint`, `ExclusionConstraint`, `ReferentialAction`, `CatalogIndex`, `RowSecurity`, `Policy`, `PolicyCommand`, `CatalogDomain`, `DomainConstraint`, `Rule`, `LengthRule`, `RangeRule`, `RangeBound`, `EnumRule`, `NotNullRule`, `PatternRule`, `PublicCatalog`, `PublicTable`, `PublicColumn`, `PublicColumnDefault`, `PublicColumnGenerated`, `PublicConstraint` and its five kinds, `PublicDomain`, `PublicDomainConstraint`, `CatalogDiff`, `CatalogChange`, `JsonValue`) |
| `@netvark/pg-catalog`   | Everything of `@netvark/catalog-core` (the same bindings), plus `defineExtraction`, `extract`, `drift`, `extractCatalog`, `introspectCatalog`, `renderCatalogModule`, `renderPublicCatalogModule`, `parseCatalogModule`, `renderKyselyTypes`, `formatDiff`, `PgCatalogError`, `isPgCatalogError`; the types `ExtractionConfig`, `MigrationSource`, `Migration`, `DatabaseConfig`, `PgliteExtension`, `OutputConfig`, `TypesConfig`, `TypeOverride`, `DriftEnvironment`, `ExtractOptions`, `ExtractReport`, `ExtractedFile`, `ExtractCatalogOptions`, `IntrospectOptions`, `KyselyTypesOptions`, `PgCatalogErrorCode`; and the `pg-catalog` bin                                                                                                                                  |

`e2e/catalog/package-surface.e2e.test.ts` asserts the exact value export lists against the built
packages and that the re-exports are the core's own bindings.

Source layout. Every module with behavior has a sibling `*.test.ts`; contract types have
`*.test-d.ts`. Imports form a DAG; nothing under `packages/catalog-core` imports a driver, PGlite,
or a Node.js module, and `packages/pg-catalog` imports the core only through its package name.

```
packages/catalog-core/src/
  index.ts                     root entry
  model.ts                     the catalog model types, CATALOG_FORMAT (2)
  rules.ts                     the rule types (2.9)
  public.ts                    toPublicCatalog(), the public types (3)
  diff.ts                      diffCatalogs(), CatalogDiff, CatalogChange (4)
  internal/json.ts             JsonValue, isPlainObject(), jsonEqual() (4)
packages/pg-catalog/src/
  index.ts                     root entry: re-exports @netvark/catalog-core, adds the rest
  cli.ts                       the bin entry (11.2)
  errors.ts                    PgCatalogError, isPgCatalogError() (12)
  config.ts                    defineExtraction(), the config types (11.1)
  config-file.ts               findConfigFile(), loadConfigFile() (11.1)
  migrations/order.ts          orderMigrations(), naturalCompare() (5)
  migrations/load.ts           loadMigrations() (5)
  target/session.ts            SqlSession, SESSION_SETTINGS (6, 7.1)
  target/pglite.ts             openPglite() (6.1)
  target/server.ts             openThrowawayDatabase(), openLiveDatabase() (6.2, 10.2)
  replay.ts                    replay() (6.3)
  extract/names.ts             referenceName(), assertSafeKey() (2.1)
  extract/queries.ts           the extraction SQL by server version (7.2)
  extract/read-catalog.ts      readCatalog() (7)
  extract/modifiers.ts         typeModifiers() (7.3)
  extract/defaults.ts          defaultLiteral() (7.3)
  extract/search-config.ts     searchConfig() (7.3)
  sql/tokenize.ts              tokenize() over deparsed SQL (8.2)
  sql/parse.ts                 parseExpression() (8.2)
  recognize/recognize.ts       recognizeCheck() (8.1, 8.3)
  recognize/pattern.ts         translatePattern() (8.4)
  render/catalog-module.ts     renderCatalogModule(), renderPublicCatalogModule(), parseCatalogModule() (9.1)
  render/kysely-mapping.ts     the type table (9.2)
  render/kysely-types.ts       renderKyselyTypes() (9.2)
  commands/extract.ts          extractCatalog(), extract() (10.1)
  commands/drift.ts            introspectCatalog(), drift() (10.2)
  commands/format-diff.ts      formatDiff() (10.2)
  cli/main.ts                  runCli() (11.2)
```

---

## 2. The catalog model (`packages/catalog-core/src/model.ts`, `rules.ts`)

The model is plain JSON data: strings, numbers, booleans, `null`, arrays, and objects. Every type is
deeply readonly, so a generated `as const` literal is assignable to it. Interfaces below list their
members in the order the renderer writes them (2.10).

### 2.1 Names and keys (`pg-catalog/src/extract/names.ts`)

The **default schema** is the first configured schema (11.1). An object's **reference name** is its
name when its schema is the default schema or `pg_catalog`, and `<schema>.<name>` otherwise.
Reference names key tables, enums, and domains, name column and domain base types, and name the
table a foreign key references. Names are PostgreSQL's own, never case-folded or quoted.

Extraction MUST fail with `unsafe_name` (12) when any key it would write (a table, column,
constraint, index, policy, enum, or domain) is `__proto__`, because an object literal with that key
sets its prototype instead of creating a member, and with `duplicate_key` when two objects map to
the same reference name (a table `"a.b"` in the default schema and a table `b` in schema `a`).

### 2.2 Catalog

```ts
interface Catalog {
  readonly format: 1; // CATALOG_FORMAT; any change to the model's shape increments it
  readonly schemas: ReadonlyArray<string>; // the configured schemas, in order
  readonly extensions: ReadonlyArray<string>; // installed into a configured schema, sorted
  readonly enums: Readonly<Record<string, ReadonlyArray<string>>>; // labels in declaration order
  readonly domains: Readonly<Record<string, CatalogDomain>>;
  readonly tables: Readonly<Record<string, CatalogTable>>;
}
```

The catalog describes ordinary and partitioned tables (`relkind` `r` and `p`, partitions excluded),
enums, and domains in the configured schemas, and the extensions installed into them. Objects that
belong to an extension (a `pg_depend` row with `deptype = 'e'`, the test pg_dump uses) are left out:
`earthdistance`'s `earth` domain is not the application's. Views, functions, triggers, sequences,
composite types, ranges, and privileges are not modeled. @ref
https://www.postgresql.org/docs/18/catalog-pg-depend.html

### 2.3 Tables

```ts
interface CatalogTable {
  readonly schema: string;
  readonly name: string;
  readonly comment: string | null; // obj_description
  readonly primaryKey: ReadonlyArray<string> | null; // the primary key constraint's columns
  readonly columns: Readonly<Record<string, CatalogColumn>>; // attnum order
  readonly constraints: Readonly<Record<string, Constraint>>;
  readonly indexes: Readonly<Record<string, CatalogIndex>>;
  readonly rowSecurity: RowSecurity;
}
```

### 2.4 Columns

```ts
type TypeKind = 'base' | 'enum' | 'domain' | 'composite' | 'range' | 'multirange';
type Identity = 'always' | 'byDefault';

interface CatalogColumn {
  readonly type: string; // reference name of the type, of the element type for an array
  readonly typeKind: TypeKind; // of `type`
  readonly array: boolean;
  readonly sqlType: string; // format_type(atttypid, atttypmod), e.g. "character varying(320)"
  readonly maxLength: number | null; // n of varchar(n) and char(n)
  readonly precision: number | null; // p of numeric(p) and numeric(p, s)
  readonly scale: number | null; // s of numeric(p, s); 0 for numeric(p)
  readonly collation: string | null; // an explicit COLLATE; null for the default or none
  readonly nullable: boolean; // not attnotnull
  readonly default: ColumnDefault | null;
  readonly identity: Identity | null;
  readonly generated: ColumnGenerated | null;
  readonly comment: string | null; // col_description
}

interface ColumnDefault {
  readonly expression: string; // pg_get_expr(adbin, adrelid)
  readonly literal: string | null; // the constant's text when the default is a constant (7.3)
}

interface ColumnGenerated {
  readonly kind: 'stored' | 'virtual'; // attgenerated 's' and, from PostgreSQL 18, 'v'
  readonly expression: string; // pg_get_expr(adbin, adrelid)
  readonly searchConfig: string | null; // the regconfig of a tsvector expression (7.3)
}
```

- `type` is `pg_type.typname` (`int4`, `varchar`, `timestamptz`, `bpchar`), so the Kysely mapping
  and the recognizer key on one unambiguous name; `sqlType` is the spelling a human reads. A column
  is an array when its type is a base type of category `A` with an element type; a domain over an
  array is a column of kind `domain` that is not itself an array (the domain records the array).
- `maxLength`, `precision`, and `scale` are decoded from `atttypmod` (7.3), the column's own
  modifier; a column of a domain type carries `null` and the domain carries the modifier.
- `collation` is `pg_collation.collname` when `attcollation` is set and differs from the type's
  default collation, so it is `null` for a plain `text` column and `"C"` for `text COLLATE "C"`.
- A generated column has `default` `null`; its expression lives in `generated`. An identity column
  has no `pg_attrdef` row, so its `default` is `null` too.

### 2.5 Constraints

```ts
type ReferentialAction = 'noAction' | 'restrict' | 'cascade' | 'setNull' | 'setDefault';
type Constraint =
  | PrimaryKeyConstraint
  | UniqueConstraint
  | ForeignKeyConstraint
  | CheckConstraint
  | ExclusionConstraint;

interface PrimaryKeyConstraint {
  readonly kind: 'primaryKey';
  readonly columns: ReadonlyArray<string>;
  readonly definition: string; // pg_get_constraintdef(oid)
}
interface UniqueConstraint {
  readonly kind: 'unique';
  readonly columns: ReadonlyArray<string>;
  readonly nullsDistinct: boolean; // false for NULLS NOT DISTINCT (PostgreSQL 15+)
  readonly definition: string;
}
interface ForeignKeyConstraint {
  readonly kind: 'foreignKey';
  readonly columns: ReadonlyArray<string>;
  readonly references: { readonly table: string; readonly columns: ReadonlyArray<string> };
  readonly onUpdate: ReferentialAction;
  readonly onDelete: ReferentialAction;
  readonly validated: boolean; // false after NOT VALID until VALIDATE CONSTRAINT
  readonly enforced: boolean; // false for NOT ENFORCED (PostgreSQL 18+)
  readonly definition: string;
}
interface CheckConstraint {
  readonly kind: 'check';
  readonly columns: ReadonlyArray<string>;
  readonly expression: string; // pg_get_expr(conbin, conrelid)
  readonly rule: Rule | null; // section 8
  readonly validated: boolean;
  readonly enforced: boolean;
  readonly definition: string;
}
interface ExclusionConstraint {
  readonly kind: 'exclusion';
  readonly columns: ReadonlyArray<string>; // the plain columns among the elements
  readonly definition: string;
}
```

Constraints come from `pg_constraint` rows with `contype` `p`, `u`, `f`, `c`, and `x`; NOT NULL rows
(`n`, PostgreSQL 18) and constraint triggers (`t`) are left out, because nullability is `attnotnull`
on every major (ADR 0004). `columns` maps `conkey` to names in `conkey` order, dropping the zero
entries of expression elements; `references.columns` maps `confkey` the same way. The actions decode
`confupdtype` and `confdeltype` (`a`, `r`, `c`, `n`, `d`). `nullsDistinct` reads the backing index's
`indnullsnotdistinct`, and `enforced` reads `conenforced`; on majors without those columns they are
`true`. @ref https://www.postgresql.org/docs/18/catalog-pg-constraint.html

### 2.6 Indexes

```ts
interface CatalogIndex {
  readonly method: string; // pg_am.amname: "btree", "gin", "gist", ...
  readonly unique: boolean;
  readonly primary: boolean;
  readonly nullsDistinct: boolean;
  readonly columns: ReadonlyArray<string | null>; // key columns; null for an expression element
  readonly include: ReadonlyArray<string>; // INCLUDE columns
  readonly predicate: string | null; // pg_get_expr(indpred, indrelid)
  readonly definition: string; // pg_get_indexdef(indexrelid)
}
```

Every `pg_index` row of a cataloged table is listed, including the indexes behind primary key,
unique, and exclusion constraints, so the index set is what the planner sees. The first
`indnkeyatts` entries of `indkey` are the key columns and the rest are the INCLUDE columns. @ref
https://www.postgresql.org/docs/18/catalog-pg-index.html

### 2.7 Row security

```ts
type PolicyCommand = 'all' | 'select' | 'insert' | 'update' | 'delete';

interface RowSecurity {
  readonly enabled: boolean; // relrowsecurity
  readonly forced: boolean; // relforcerowsecurity
  readonly policies: Readonly<Record<string, Policy>>;
}
interface Policy {
  readonly command: PolicyCommand; // polcmd '*', 'r', 'a', 'w', 'd'
  readonly permissive: boolean;
  readonly roles: ReadonlyArray<string>; // sorted; "public" for the PUBLIC pseudo-role
  readonly using: string | null; // pg_get_expr(polqual, polrelid)
  readonly withCheck: string | null; // pg_get_expr(polwithcheck, polrelid)
}
```

@ref https://www.postgresql.org/docs/18/catalog-pg-policy.html

### 2.8 Enums and domains

An enum is its labels in `enumsortorder`. A domain is:

```ts
interface CatalogDomain {
  readonly schema: string;
  readonly name: string;
  readonly type: string; // the base type, as CatalogColumn.type
  readonly typeKind: TypeKind;
  readonly array: boolean;
  readonly sqlType: string; // format_type(typbasetype, typtypmod)
  readonly maxLength: number | null;
  readonly precision: number | null;
  readonly scale: number | null;
  readonly collation: string | null;
  readonly nullable: boolean; // not typnotnull
  readonly default: ColumnDefault | null; // pg_get_expr(typdefaultbin, 0)
  readonly constraints: Readonly<Record<string, DomainConstraint>>;
  readonly comment: string | null;
}
interface DomainConstraint {
  readonly kind: 'check';
  readonly expression: string; // over VALUE
  readonly rule: Rule | null;
  readonly validated: boolean;
  readonly definition: string;
}
```

The domain's `default` reads `typdefaultbin` rather than `typdefault`, which holds text deparsed
when the domain was created, under that session's `search_path`. Domain NOT NULL constraints (stored
as `pg_constraint` rows from PostgreSQL 17) are carried by `nullable`. @ref
https://www.postgresql.org/docs/18/catalog-pg-type.html

### 2.9 Rules (`rules.ts`)

```ts
type Rule = LengthRule | RangeRule | EnumRule | NotNullRule | PatternRule;

interface LengthRule {
  readonly kind: 'length';
  readonly min: number | null; // in Unicode code points, inclusive
  readonly max: number | null;
}
interface RangeRule {
  readonly kind: 'range';
  readonly min: RangeBound | null;
  readonly max: RangeBound | null;
}
interface RangeBound {
  readonly value: string; // a decimal literal: /^-?\d+(\.\d+)?$/
  readonly inclusive: boolean;
}
interface EnumRule {
  readonly kind: 'enum';
  readonly values: ReadonlyArray<string>; // in the CHECK's order
}
interface NotNullRule {
  readonly kind: 'notNull';
}
interface PatternRule {
  readonly kind: 'pattern';
  readonly source: string; // the PostgreSQL pattern, valid JavaScript with the flags below
  readonly flags: 'su';
}
```

A rule states a predicate over the non-null values of the column's type, after PostgreSQL's input
conversion and type modifier coercion (a `numeric(10,2)` value is already rounded to two places); a
codec that accepts other representations must apply the same conversion before the rule. Within that
domain a rule is true exactly when the CHECK is, with two stated limits: a range rule speaks of
finite numbers only (PostgreSQL orders `NaN` above every number and JSON carries neither `NaN` nor
infinities), and every rule assumes a UTF-8 database, which replay always creates (6.2). Range bound
values stay decimal strings so that `numeric` and `int8` bounds keep every digit.

### 2.10 Order and serialization

- Tables, enums, domains, constraints, indexes, and policies are ordered by key, comparing UTF-16
  code units (`Array.prototype.sort` without a comparator); columns by `attnum`; enum labels by
  `enumsortorder`; `extensions` and policy `roles` by code units; `schemas` as configured.
- Sorting happens in JavaScript after the queries, so the database's collation never decides it.
- Integer-like keys (a column named `"2024"`) are an exception JavaScript imposes: object literals
  list them first, in numeric order. The output stays deterministic.

---

## 3. The public catalog (`packages/catalog-core/src/public.ts`, ADR 0005)

`toPublicCatalog(catalog, tables)` returns the slice a browser may see. `tables` is the configured
list of table keys; a key the catalog does not hold throws `TypeError` naming it, and a duplicate
key throws too. The function is pure: same inputs, same output, in the same order.

```ts
interface PublicCatalog {
  readonly format: 1;
  readonly enums: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly domains: Readonly<Record<string, PublicDomain>>;
  readonly tables: Readonly<Record<string, PublicTable>>;
}
interface PublicTable {
  readonly schema: string;
  readonly name: string;
  readonly primaryKey: ReadonlyArray<string> | null;
  readonly columns: Readonly<Record<string, PublicColumn>>;
  readonly constraints: Readonly<Record<string, PublicConstraint>>;
}
interface PublicColumn {
  readonly type: string;
  readonly typeKind: TypeKind;
  readonly array: boolean;
  readonly sqlType: string;
  readonly maxLength: number | null;
  readonly precision: number | null;
  readonly scale: number | null;
  readonly nullable: boolean;
  readonly default: PublicColumnDefault | null; // { literal }: a client may omit the column
  readonly identity: Identity | null;
  readonly generated: PublicColumnGenerated | null; // { kind, searchConfig }
}
```

- Constraints keep `kind` and `columns`, plus `nullsDistinct` (unique), `references` (foreign key),
  and `rule` (check). They drop `definition`, `expression`, `validated`, `enforced`, and the
  referential actions.
- Domains keep everything but `collation`, `comment`, the default's `expression`, and the
  constraints' `expression`, `validated`, and `definition`; each domain constraint keeps `kind` and
  `rule`.
- Columns drop `collation` and `comment`, the default's `expression`, and the generation
  `expression`. Tables drop `comment`, `indexes`, and `rowSecurity`.
- `enums` and `domains` hold exactly the ones the kept columns use, directly or through a kept
  domain's base type, recursively; tables keep the order of the full catalog, not of `tables`.

---

## 4. The diff (`packages/catalog-core/src/diff.ts`, ADR 0008)

`diffCatalogs(expected, actual)` compares two catalogs structurally and returns
`{ changes: ReadonlyArray<CatalogChange> }`:

```ts
type CatalogChange =
  | { readonly kind: 'added'; readonly path: ReadonlyArray<string>; readonly actual: JsonValue }
  | { readonly kind: 'removed'; readonly path: ReadonlyArray<string>; readonly expected: JsonValue }
  | {
      readonly kind: 'changed';
      readonly path: ReadonlyArray<string>;
      readonly expected: JsonValue;
      readonly actual: JsonValue;
    };
```

- Two objects are compared member by member: a member only in `actual` is `added` with its whole
  value, one only in `expected` is `removed`, one in both recurses when both values are plain
  objects and is `changed` when the values are not equal. Arrays and scalars are compared as values
  (an enum that gained a label is one `changed` entry with both label lists).
- `path` is the member names from the root, such as
  `["tables", "contacts", "constraints", "contacts_name_length", "definition"]`.
- Changes are listed depth first, visiting the members of `expected` in order and then the members
  only `actual` has, in order; equal catalogs give an empty list.
- Catalogs of different `format` throw `TypeError`, because their members are not comparable; the
  drift command reports it as `catalog_format` (12).

`formatDiff` (10.2) groups changes by the object kind of their path: the nearest `extensions`,
`enums.<e>`, `domains.<d>`, `tables.<t>`, `columns.<c>`, `constraints.<k>`, `indexes.<i>`, or
`policies.<p>` segment.

---

## 5. Migrations (`packages/pg-catalog/src/migrations/`, ADR 0003)

A migration is `{ name, sql }`. The source is a directory path (relative to the configuration file)
or a function returning the migrations in the order they must run; a function's order is used as
given.

A directory is walked recursively; names are paths relative to it with `/` separators. Then:

1. Files whose name does not end in `.sql`, and files ending in `.down.sql`, are ignored.
2. When every remaining basename follows Flyway's naming, `V<version>__<description>.sql` files run
   first, ordered by version, and `R__<description>.sql` files run after them, ordered by
   description; `U<version>__<description>.sql` undo files never run. A version is digit groups
   separated by `.` or `_`, compared group by group as numbers (`V1_10` after `V1_9`); two files
   with the same version fail with `migrations_invalid`. @ref
   https://documentation.red-gate.com/fd/migrations-271585107.html
3. Otherwise every remaining file except `U<version>__*.sql` runs in natural order of its name: runs
   of digits compare as numbers, everything else by UTF-16 code units, and names that compare equal
   that way (`01_a.sql`, `1_a.sql`) fall back to plain code unit order.

An empty result, or a directory that does not exist, fails with `migrations_invalid`. Files are read
as UTF-8.

---

## 6. Replay targets (`packages/pg-catalog/src/target/`, `replay.ts`, ADR 0003)

Both targets implement one session interface:

```ts
interface SqlSession {
  exec(sql: string): Promise<void>; // simple query protocol: several statements, no parameters
  query<TRow>(sql: string, params?: ReadonlyArray<unknown>): Promise<ReadonlyArray<TRow>>;
  close(): Promise<void>;
}
```

### 6.1 PGlite (`target/pglite.ts`)

The default target. `@electric-sql/pglite` is imported dynamically, so it stays an optional peer
dependency; when it is missing, extraction fails with `pglite_missing`. The instance is created in
memory with `PGlite.create({ extensions })`: a string names a contrib extension and imports
`@electric-sql/pglite/contrib/<name>` (with `-` written as `_`, so `uuid-ossp` imports `uuid_ossp`),
and an object is any PGlite extension (`{ name, setup }`, such as `@electric-sql/pglite-pgvector`),
passed through. A migration still runs `CREATE EXTENSION` itself. @ref
https://pglite.dev/extensions/

### 6.2 A server (`target/server.ts`)

With `database.url`, extraction connects with `pg` to the URL (a `postgres://` or `postgresql://`
URL), creates `netvark_catalog_<16 hex digits>` with
`CREATE DATABASE ... TEMPLATE template0 ENCODING 'UTF8'`, connects to it by replacing the URL's
path, replays and extracts, then closes that connection and drops the database in a `finally` block.
A failed drop is reported after the primary outcome, never instead of it. The role needs `CREATEDB`.
Roles are cluster-wide, so a migration that creates a role must do so idempotently. @ref
https://www.postgresql.org/docs/18/sql-createdatabase.html

### 6.3 Replay (`replay.ts`)

For each migration in order, the session runs `SESSION_SETTINGS` (7.1) and then the file's SQL as
one simple-protocol query, which PostgreSQL runs as one implicit transaction unless the file
controls transactions itself. A failure aborts with `migration_failed` naming the migration, the
PostgreSQL error code and message, and the line and column when PostgreSQL reports a position. @ref
https://www.postgresql.org/docs/18/protocol-flow.html#PROTOCOL-FLOW-MULTI-STATEMENT

---

## 7. Extraction (`packages/pg-catalog/src/extract/`)

`readCatalog(session, schemas)` reads one catalog. The same function serves replayed databases
(10.1) and live ones (10.2).

### 7.1 Session settings (`target/session.ts`)

Before replaying each file and before reading, the session pins the settings that change what
PostgreSQL stores or how it prints constants:

| Setting                       | Value      | Why                                                          |
| ----------------------------- | ---------- | ------------------------------------------------------------ |
| `TimeZone`                    | `UTC`      | `timestamptz` constants are converted and printed in it      |
| `DateStyle`                   | `ISO, YMD` | date and time constants are parsed and printed in it         |
| `IntervalStyle`               | `postgres` | interval constants are printed in it                         |
| `extra_float_digits`          | `1`        | float constants print with the shortest exact representation |
| `bytea_output`                | `hex`      | `bytea` constants are printed in it                          |
| `standard_conforming_strings` | `on`       | string constants with backslashes deparse without `E'...'`   |

Reading additionally sets `search_path` to the configured schemas, in order, through
`set_config('search_path', $1, false)` with each name quoted by `quote_ident`, so deparsed text
qualifies exactly the objects outside them. @ref
https://www.postgresql.org/docs/18/runtime-config-client.html

### 7.2 Queries (`extract/queries.ts`)

One query per object kind, each returning a single `json_agg(...)::text` value parsed with
`JSON.parse`, so PGlite and `pg` hand back identical data whatever their type parsers do. The
queries read `pg_catalog` only: `information_schema` hides objects the current role has no privilege
on, which would make a read-only drift role see a different catalog.

1. `current_setting('server_version_num')::int`; below 140000 the extraction fails with
   `unsupported_server`. The version selects two fragments: `indnullsnotdistinct` from 150000 and
   `conenforced` from 180000, `false` and `true` respectively before.
2. Extensions: `pg_extension` joined to `pg_namespace` on `extnamespace`, in the configured schemas.
3. Enums: `pg_type` with `typtype = 'e'` in the configured schemas and not owned by an extension,
   with labels from `pg_enum`.
4. Domains: `pg_type` with `typtype = 'd'`, same filters, with the base type's `typname`, `typtype`,
   category, element type, `format_type(typbasetype, typtypmod)` and
   `format_type(typbasetype, NULL)`, `typtypmod`, `typnotnull`, `pg_get_expr(typdefaultbin, 0)`, the
   collation, the comment, and the `pg_constraint` rows with `contypid` set and `contype = 'c'`.
5. Tables: `pg_class` with `relkind in ('r', 'p')`, `not relispartition`, same filters, with
   `relrowsecurity`, `relforcerowsecurity`, and `obj_description(oid, 'pg_class')`.
6. Columns: `pg_attribute` with `attnum > 0 and not attisdropped`, with the type facts as for
   domains, `format_type(atttypid, NULL)`, `attnotnull`, `attidentity`, `attgenerated`,
   `pg_get_expr(adbin, adrelid)` from `pg_attrdef`, the collation name and `collisdeterministic`
   when `attcollation` differs from the type's `typcollation`, and `col_description`.
7. Constraints: `pg_constraint` with `conrelid` in the tables and
   `contype in ('p', 'u', 'f', 'c', 'x')`, with `conkey`, `confkey`, and the referenced table mapped
   to names, `pg_get_constraintdef(oid)`, `pg_get_expr(conbin, conrelid)`, and the version
   fragments.
8. Indexes: `pg_index` joined to the index's `pg_class` and `pg_am`, with `indkey::int2[]`,
   `indnkeyatts`, `pg_get_expr(indpred, indrelid)`, and `pg_get_indexdef(indexrelid)`.
9. Policies: `pg_policy`, with `polroles` mapped through `pg_roles` (`0` is `public`).

@ref https://www.postgresql.org/docs/18/functions-info.html#FUNCTIONS-INFO-CATALOG

### 7.3 Normalization

**Type modifiers** (`modifiers.ts`). For `varchar` and `bpchar` a modifier above 0 is the length
plus 4 (`VARHDRSZ`). For `numeric` a modifier of 4 or more encodes precision and scale:
`p = ((typmod - 4) >> 16) & 0xffff` and `s = (((typmod - 4) & 0x7ff) ^ 1024) - 1024`, the
sign-extended 11-bit scale PostgreSQL 15 introduced, which decodes PostgreSQL 14's non-negative
scales the same way. Every other type gives `null` for all three. @ref
https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/utils/adt/numeric.c

**Default literals** (`defaults.ts`). `literal` is set only when converting it with the column
type's input function yields the stored default, which rules out defaults where the deparser hid a
cast that changes the value (a `1.5` default on an `integer` column stores `2`). The base type below
is the column's type, or for a domain the domain's base type, resolved through nested domains.

| Deparsed default                                                                                          | Accepted when the base type is                        | `literal`          |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------ |
| `'<text>'::<T>` with `<T>` the base type spelled by `format_type(type, NULL)`                             | any                                                   | `<text>` unescaped |
| `true`, `false`                                                                                           | `bool`                                                | `true`, `false`    |
| an integral number: unsigned digits, or `'[-]<digits>'::<T>` with `<T>` `integer`, `bigint`, or `numeric` | `int2`, `int4`, `int8`, `numeric`, `float4`, `float8` | the number         |
| a fractional number: `<digits>.<digits>`, or `'[-]<digits>.<digits>'::numeric`                            | `numeric`, `float4`, `float8`                         | the number         |

Everything else (function calls, operators, `CURRENT_TIMESTAMP`, `nextval(...)`, explicit casts of
expressions, `NULL`) gives `null`. The deparse rules behind the table are those of `get_const_expr`
in PostgreSQL's `ruleutils.c`: a non-negative `int4` and a non-negative non-integral `numeric` print
bare, other numbers print quoted with a cast, and a top-level implicit cast is not printed. @ref
https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/utils/adt/ruleutils.c

**Search configuration** (`search-config.ts`). For a generated column of type `tsvector`,
`searchConfig` is the configuration named by every `to_tsvector('<name>'::regconfig, ...)` call in
the expression, found with the tokenizer of 8.2 so string contents never match. It is `null` when
there is no such call, when any `to_tsvector` call has another first argument, or when the calls
name different configurations. The one-argument form cannot appear: it is not immutable, and a
generation expression must be. @ref https://www.postgresql.org/docs/18/textsearch-tables.html

---

## 8. The CHECK recognizer (`packages/pg-catalog/src/recognize/`, `sql/`, ADR 0006)

`recognizeCheck(expression, subject)` returns a `Rule` or `null`. It never throws on any input.

### 8.1 Applicability

A table CHECK is a candidate when it is enforced and its `conkey` names exactly one column; a domain
CHECK always is. The subject is that column (written as its name) or the domain's `VALUE`. Its
**base type** is the column's or domain's type resolved through domains.

| Rule kind | Base types                                  | Further conditions                             |
| --------- | ------------------------------------------- | ---------------------------------------------- |
| length    | `text`, `varchar`                           | not an array; deterministic collation          |
| pattern   | `text`, `varchar`                           | not an array; deterministic collation          |
| enum      | `text`, `varchar`, any enum                 | not an array; deterministic collation for text |
| range     | `int2`, `int4`, `int8`, `numeric`, `float8` | not an array                                   |
| notNull   | any                                         |                                                |

`bpchar` is excluded because its comparisons, `char_length`, and casts to `text` ignore trailing
spaces; `float4` because values round to single precision before the CHECK; `citext` and other types
because their operators are not the text operators the rules describe.

### 8.2 Expressions (`sql/tokenize.ts`, `sql/parse.ts`)

The tokenizer reads the deparsed text: words (`[A-Za-z_][A-Za-z0-9_$]*`, case kept: the deparser
prints keywords in upper case and identifiers in lower case), quoted identifiers (`"..."` with `""`
escapes), string constants (`'...'` with `''` escapes; an `E'...'` or `U&'...'` constant fails the
parse), unsigned numbers, and operators and punctuation. The parser builds a tree of `OR`, `AND`,
comparisons (`=`, `<>`, `<`, `<=`, `>`, `>=`, `~`, `~*`, `!~`, `!~*`), `= ANY (...)`,
`IS [NOT] NULL`, function calls, casts (`::` followed by a type name: a word or quoted identifier,
optionally schema-qualified, with the multiword spellings `format_type` prints such as
`character varying`, `double precision`, and `timestamp(3) with time zone`, an optional modifier,
and `[]` suffixes), `ARRAY[...]`, parentheses, the subject, and constants. Any other input fails the
parse, and a failed parse gives `null`.

### 8.3 Shapes (`recognize/recognize.ts`)

`S` is the subject, optionally wrapped in casts to `text` or `character varying` without a modifier
(how the deparser prints a `varchar` column given to a text function or operator). `N` is an
unsigned integer constant. `L` is a numeric constant: unsigned digits with an optional fraction, a
quoted signed number cast to `smallint`, `integer`, `bigint`, or `numeric`, or such a constant in
parentheses cast again to one of those types or `double precision`; a cast to an integer type
requires an integral value, so no cast in the chain changes the number.

1. **Guard.** `S IS NULL OR X` and `X OR S IS NULL` reduce to `X`: a CHECK passes on null anyway.
2. **Length.** `F(S) op N` or `N op F(S)` with `F` one of `char_length`, `character_length`, and
   `length`, and `op` one of `>=`, `>`, `<=`, `<`, `=`. Strict bounds become inclusive (`> 0` is
   `min: 1`); `=` sets both bounds; a bound below zero gives `null`. `S <> ''::text` is `min: 1`.
3. **Range.** `S op L` or `L op S` with `op` one of `>=`, `>`, `<=`, `<`; the bound keeps its
   inclusiveness and its value as decimal text (`'-10'::integer` is `"-10"`).
4. **Membership.** `S = ANY (ARRAY[c1, ..., cn])` and
   `(S)::text = ANY ((ARRAY[c1, ..., cn])::text[])` with every `ci` a string constant cast to the
   subject's type (`text`, `character varying`, or the enum's spelling); `S = c` is membership in
   one value (how the deparser prints `IN` with one element).
5. **Not null.** `S IS NOT NULL`.
6. **Pattern.** `S ~ '<pattern>'::text` when 8.4 accepts the pattern.
7. **Conjunction.** An `AND` of length terms, or of range terms, merges into one rule when no bound
   is set twice. Any other `AND`, any other `OR`, `NOT`, and any other shape give `null`.

### 8.4 The pattern subset (`recognize/pattern.ts`)

`translatePattern(pattern)` returns the pattern unchanged as the rule's `source` when it parses
entirely within this grammar, on which PostgreSQL's advanced regular expressions and JavaScript
regular expressions with the flags `su` agree, and when `new RegExp(source, 'su')` compiles;
otherwise `null`.

```
pattern      = branch ( "|" branch )*
branch       = piece*
piece        = atom quantifier?
quantifier   = ( "*" | "+" | "?" | "{" m "}" | "{" m ",}" | "{" m "," n "}" ) "?"?   ; m <= n <= 255
atom         = literal | "." | "^" | "$" | "(" pattern ")" | "(?:" pattern ")" | bracket
literal      = any character but  ^ $ \ . * + ? ( ) [ ] { } |  ; or "\" followed by one of them or "/"
bracket      = "[" "^"? item+ "]"
item         = range | class-literal
range        = "0".."9" "-" "0".."9" | "a".."z" "-" "a".."z" | "A".."Z" "-" "A".."Z"  ; low <= high
class-literal = any character but  \ ] [ - ^  ; or "\" followed by one of  ^ $ \ . * + ? ( ) [ ] { } | / -
```

- `^` and `$` anchor at the start and end of the string in both (PostgreSQL is not newline-sensitive
  by default, and JavaScript without the `m` flag anchors only there); quantifiers cannot follow
  them.
- `.` and a negated bracket match any character, newline included, in both with the `s` flag, and
  match code points with the `u` flag as PostgreSQL does in a UTF-8 database.
- A bracket's ranges are code point ranges in PostgreSQL's implementation; restricting them to ASCII
  digits and letters keeps them independent of any collation.
- Rejected: escapes of letters and digits (class escapes such as `\d`, constraint escapes such as
  `\b` and `\m`, back references, `\x` and `\u` escapes), lookaround, POSIX classes and collating
  elements inside brackets, embedded options such as `(?i)`, the `***` directors, a `]` or `-` at
  the start of a bracket, unbalanced `]`, `{`, or `}`, bounds above PostgreSQL's limit of 255, and
  every case-insensitive operator. @ref
  https://www.postgresql.org/docs/18/functions-matching.html#POSIX-SYNTAX-DETAILS @ref
  https://tc39.es/ecma262/#sec-regexp-regular-expression-objects

---

## 9. Output files (`packages/pg-catalog/src/render/`)

Each renderer is a pure function returning the file's full text, ending in one newline.

### 9.1 Catalog modules (`render/catalog-module.ts`, ADR 0004)

```ts
// Generated by @netvark/pg-catalog. Do not edit: change the migrations and run `pg-catalog extract`.
export const catalog = {
  "format": 1,
  ...
} as const;
```

`renderCatalogModule(catalog)` writes the header line, then `export const catalog = `, then
`JSON.stringify(catalog, null, 2)`, then ` as const;`. `renderPublicCatalogModule(publicCatalog)`
does the same with the binding `publicCatalog`. A consumer names the types with `typeof catalog` and
`typeof publicCatalog`. `parseCatalogModule(text)` takes the text between the first `= ` and the
final ` as const;`, parses it with `JSON.parse`, and returns it as a `Catalog` when it is an object
whose `format` equals `CATALOG_FORMAT`; otherwise it throws `catalog_unreadable` or
`catalog_format`.

### 9.2 Kysely types (`render/kysely-types.ts`, `render/kysely-mapping.ts`, ADR 0007)

`renderKyselyTypes(catalog, options)` writes, in order: the header line;
`import type { ... } from 'kysely';` with the helpers the file uses, sorted; the configured
`imports`, verbatim; the helper types the file uses (`JsonValue`, `PostgresInterval`, `Point`,
`Circle`); one `export type <Name> = '<label>' | ...;` per enum, by key; one
`export interface <Name>Table` per table, by key, with its columns in order; and
`export interface DB` mapping each table key to its interface.

The select, insert, and update types of a column follow node-postgres's default parsers (pg-types
2.x). PostgreSQL reports a domain column with its base type's OID, so a domain maps as its base
type. @ref https://github.com/brianc/node-pg-types/blob/master/lib/textParsers.js @ref
https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/access/common/printtup.c

| `type`                                                                                                             | Select             | Insert and update            |
| ------------------------------------------------------------------------------------------------------------------ | ------------------ | ---------------------------- |
| `int2`, `int4`, `oid`, `float4`, `float8`                                                                          | `number`           | `number`                     |
| `int8`                                                                                                             | `string`           | `string \| number \| bigint` |
| `numeric`                                                                                                          | `string`           | `string \| number`           |
| `bool`                                                                                                             | `boolean`          | `boolean`                    |
| `date`, `timestamp`, `timestamptz`                                                                                 | `Date`             | `Date \| string`             |
| `interval`                                                                                                         | `PostgresInterval` | `PostgresInterval \| string` |
| `bytea`                                                                                                            | `Buffer`           | `Buffer`                     |
| `json`, `jsonb`                                                                                                    | `JsonValue`        | `string` (JSON text)         |
| `point`                                                                                                            | `Point`            | `Point \| string`            |
| `circle`                                                                                                           | `Circle`           | `Circle \| string`           |
| an enum                                                                                                            | the label union    | the label union              |
| every other type (`text`, `varchar`, `bpchar`, `uuid`, `citext`, `time`, `inet`, `money`, `tsvector`, ranges, ...) | `string`           | `string`                     |

- **Arrays.** pg-types parses the arrays of `bool`, `int2`, `int4`, `oid`, `int8` (strings),
  `float4`, `float8`, `numeric` (parsed as floats, so `Array<number>`), `bpchar`, `varchar`, `text`,
  `uuid`, `inet`, `cidr`, `macaddr`, `money`, `time`, `timetz`, `numrange`, `date`, `timestamp`,
  `timestamptz`, `interval`, `bytea`, `json`, `jsonb`, and `point`; their select type is
  `Array<element>`, and insert and update take `Array<element insert type> | string`. Every other
  array, enum arrays included, is returned as PostgreSQL's array text: `string` on select, and
  `Array<element> | string` on insert and update.
- **Nullability.** A nullable column whose domains are all nullable adds `| null` to all three
  types.
- **Defaults.** A column with a default or `identity: 'byDefault'` is optional on insert:
  `Generated<S>` when the three types are equal, otherwise `ColumnType<S, I | undefined, U>`. An
  `identity: 'always'` or generated column is `GeneratedAlways<S>`. A column with equal types and no
  default is written as the bare type.
- **Overrides.** `types.overrides` keys are a `type` (or `<type>[]` for its arrays) and values a
  TypeScript type for all three positions or `{ select, insert?, update? }`, the missing positions
  taking `select`'s type. They replace the mapping for applications that register their own parsers
  or use another driver.
- **Names.** `<Name>` is the reference name in PascalCase: split at every character outside
  `[A-Za-z0-9]`, upper-case each part's first character, join, and prefix `_` when the result starts
  with a digit. Two objects with the same name, or a name equal to a helper, fail with
  `name_collision`. Member names that are not identifiers are written as string literals.

---

## 10. Commands (`packages/pg-catalog/src/commands/`)

### 10.1 extract and extract --check (`commands/extract.ts`)

`extractCatalog({ migrations, database, schemas, cwd })` loads the migrations (5), opens the target
(6), replays (6.3), reads the catalog (7), and closes the target, returning the `Catalog`.

`extract(config, { check, cwd })` calls `extractCatalog`, renders the catalog module, the public
module when `out.public` is set (with `toPublicCatalog`, whose `TypeError` becomes
`public_table_unknown`), and the Kysely types when `out.types` is set, then compares each with the
file on disk byte for byte. Without `check` it writes the files that differ (creating directories)
and reports each as `written` or `unchanged`; with `check` it writes nothing and reports each as
`unchanged`, `stale`, or `missing`. It returns `{ catalog, files }` with `files` in the order
catalog, public, types.

### 10.2 drift (`commands/drift.ts`, `commands/format-diff.ts`, ADR 0008)

`introspectCatalog({ url, schemas })` connects with `pg`, pins `SESSION_SETTINGS`, opens
`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, reads the catalog (7), rolls back, and
disconnects; it replays nothing and cannot write. Before reading it checks
`has_schema_privilege(oid, 'USAGE')` for every configured schema that exists and fails with
`schema_usage` when one is missing: PostgreSQL leaves such a schema out of the role's effective
`search_path`, so every name in it would deparse qualified and show up as drift. A configured schema
that does not exist is read as empty. `drift(config, environment, { cwd })` reads the committed
catalog file with `parseCatalogModule`, introspects the environment's URL with the configured
schemas, and returns `{ environment, diff: diffCatalogs(committed, live) }`. An unknown environment,
or a URL function that returns nothing, fails with `config_invalid`.

`formatDiff(diff)` prints a summary line and the changes grouped by object kind (4), one line per
object with `+`, `-`, or `~`, and for `changed` entries the member path with the expected and actual
values as JSON. The text is for people and may change between minor versions; the CLI's `--json`
output (the `CatalogDiff` itself) is the stable machine format.

### 10.3 rules --check (planned, #19)

The oracle runs every rule's generated boundary values and every validator's fixtures through Zod
and through `SELECT (<expression with the subject replaced by $1::type>)` in a replayed database. It
reads fixtures from the resource registry, so it ships after `@netvark/resource-core`, with its own
section here.

---

## 11. Configuration and the CLI

### 11.1 `defineExtraction(config)` (`config.ts`, `config-file.ts`)

```ts
interface ExtractionConfig {
  readonly migrations: string | MigrationSource;
  readonly database?: DatabaseConfig; // default { pglite: {} }
  readonly schemas?: ReadonlyArray<string>; // default ['public']; the first is the default schema
  readonly out: OutputConfig;
  readonly drift?: Readonly<Record<string, DriftEnvironment>>;
}
type MigrationSource = () => ReadonlyArray<Migration> | Promise<ReadonlyArray<Migration>>;
interface Migration {
  readonly name: string;
  readonly sql: string;
}
type DatabaseConfig =
  | { readonly pglite: { readonly extensions?: ReadonlyArray<string | PgliteExtension> } }
  | { readonly url: string | (() => string | undefined) };
interface PgliteExtension {
  readonly name: string;
  readonly setup: (...args: never) => unknown;
}
interface OutputConfig {
  readonly catalog: string;
  readonly public?: { readonly file: string; readonly tables: ReadonlyArray<string> };
  readonly types?: string | TypesConfig;
}
interface TypesConfig {
  readonly file: string;
  readonly overrides?: Readonly<Record<string, string | TypeOverride>>;
  readonly imports?: ReadonlyArray<string>;
}
interface TypeOverride {
  readonly select: string;
  readonly insert?: string;
  readonly update?: string;
}
interface DriftEnvironment {
  readonly url: string | (() => string | undefined);
}
```

`defineExtraction` validates eagerly and returns the config unchanged; a mistake throws `TypeError`
naming the option. It rejects unknown keys at every level (a misspelled `postgres:` fails instead of
being ignored), empty strings, a `database` with both or neither of `pglite` and `url`, schema names
that are empty, longer than 63 bytes, starting with `pg_`, or equal to `information_schema`,
duplicate schemas or public tables, an empty `public.tables`, and environment names outside
`^[A-Za-z0-9][A-Za-z0-9_-]*$`. URL functions are called only when a command needs the URL, so a
missing environment variable only fails the command that needs it. Relative paths resolve against
the configuration file's directory, or the `cwd` option of the programmatic API.

The CLI loads `--config <file>`, or else the first of `netvark.config.ts`, `netvark.config.mts`,
`netvark.config.js`, and `netvark.config.mjs` in the working directory, with a dynamic `import()`;
the default export must pass `defineExtraction`'s validation. A TypeScript configuration needs a
runtime that strips types: Node.js 22.18 or later, Node.js 22.12 to 22.17 with
`--experimental-strip-types`, Bun, or Deno. @ref https://nodejs.org/api/typescript.html

### 11.2 The CLI (`cli.ts`, `cli/main.ts`)

```
pg-catalog extract [--check] [--config <file>]
pg-catalog drift --env <name> [--json] [--config <file>]
pg-catalog --help
pg-catalog --version
```

Arguments are parsed with `node:util`'s `parseArgs` in strict mode. Results go to standard output;
errors go to standard error as `pg-catalog: <message>`. @ref
https://nodejs.org/api/util.html#utilparseargsconfig

| Command           | 0                        | 1                          | 2                                                       |
| ----------------- | ------------------------ | -------------------------- | ------------------------------------------------------- |
| `extract`         | files written or current | (never)                    | usage error, configuration, replay, or database failure |
| `extract --check` | every file current       | a file is stale or missing | as above                                                |
| `drift`           | no differences           | differences                | as above, or an unreadable committed catalog            |

---

## 12. Errors (`packages/pg-catalog/src/errors.ts`)

Commands throw `PgCatalogError` (`isPgCatalogError` narrows it) with a `code`, a message naming the
object or file involved, and the PostgreSQL error as `cause` where there is one. The CLI exits 2 on
all of them. `defineExtraction` and `toPublicCatalog` throw `TypeError` for programming mistakes.

| `code`                 | Raised when                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `config_invalid`       | no configuration file, a file that fails to load or validate, an unknown environment, or a URL function returning nothing |
| `pglite_missing`       | the PGlite target is used and `@electric-sql/pglite` is not installed, or a contrib extension name does not exist         |
| `migrations_invalid`   | the directory is missing or holds no migrations, or two Flyway migrations share a version                                 |
| `migration_failed`     | a migration fails during replay                                                                                           |
| `connection_failed`    | connecting, creating, or dropping a database fails                                                                        |
| `unsupported_server`   | the server is older than PostgreSQL 14                                                                                    |
| `schema_usage`         | the drift role lacks `USAGE` on a configured schema                                                                       |
| `unsafe_name`          | an object to be written as a key is named `__proto__`                                                                     |
| `duplicate_key`        | two objects map to the same reference name                                                                                |
| `public_table_unknown` | `out.public.tables` names a table the catalog does not hold                                                               |
| `name_collision`       | two objects map to the same TypeScript name                                                                               |
| `catalog_unreadable`   | the committed catalog file is missing or not a catalog module                                                             |
| `catalog_format`       | the committed catalog was written in another `format`                                                                     |

---

## 13. Test plan

One Vitest run with a project per package, `typecheck` enabled for `*.test-d.ts`, and V8 coverage
thresholds of 90% over `packages/*/src/`. Every test names the rule or choice it pins. Extraction is
database code, so `@netvark/pg-catalog`'s own tests run it against PGlite in-process, a real
PostgreSQL 18; nothing is mocked.

| Area                  | Files                                                                                       | What is pinned                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core                  | `public.test.ts`, `diff.test.ts`, `model.test-d.ts`, `json.test.ts`                         | every kept and dropped member, enum and domain closure, ordering, change paths and order, format mismatch, generated literals assignable to the model |
| Migrations            | `order.test.ts`, `load.test.ts`                                                             | Flyway detection and ordering, natural order, ignored and undo files, duplicates                                                                      |
| Normalization         | `modifiers.test.ts`, `defaults.test.ts`, `search-config.test.ts`, `names.test.ts`           | typmod decoding on both encodings, every default form, hidden casts, keys                                                                             |
| Recognizer            | `tokenize.test.ts`, `parse.test.ts`, `recognize.test.ts`, `pattern.test.ts`                 | table-driven over the exact text PostgreSQL 14 and 18 deparse; every rejected shape                                                                   |
| Extraction            | `read-catalog.test.ts`, `replay.test.ts`, `pglite.test.ts`                                  | every model member against a PGlite schema, extension-owned objects, settings, failures with positions                                                |
| Rendering             | `catalog-module.test.ts`, `kysely-types.test.ts`, `kysely-mapping.test.ts`                  | exact output text, parse round trip, every mapping row, overrides, names                                                                              |
| Commands, config, CLI | `extract.test.ts`, `drift.test.ts`, `format-diff.test.ts`, `config.test.ts`, `main.test.ts` | statuses, writes only on change, every validation, exit codes                                                                                         |

### 13.1 End-to-end suite (`e2e/catalog/`)

A private workspace package that depends on both packages through `workspace:*` and imports only
their built entries. `e2e/catalog/fixtures/contacts/` holds a realistic application's migrations in
Flyway naming (extensions, organizations, contacts with enums, domains, checks of every recognized
shape, a generated `tsvector`, identity, foreign keys, partial and expression indexes, an exclusion
constraint, row security with forced policies, and comments), and `expected/` holds the three files
`extract` must produce for them, reviewed by hand.

| File                          | Covers                                                                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `package-surface.e2e.test.ts` | the exact export lists, and that `@netvark/pg-catalog` re-exports the core's own bindings                                                                                                        |
| `extract.e2e.test.ts`         | the three files equal `expected/` byte for byte, on two runs; `--check` passes, then fails after a migration changes                                                                             |
| `server.e2e.test.ts`          | when `CATALOG_PG_URL` is set: the server target produces the same bytes as PGlite, and drops its database                                                                                        |
| `drift.e2e.test.ts`           | a live database built from the migrations shows no drift; after a column is added, a policy dropped, and a CHECK changed, exactly those three changes; on PGlite over a socket and on the server |
| `kysely.e2e.test.ts`          | the generated types compile against real Kysely queries, and rows read through `pg` have the runtime types the mapping states, for every row of 9.2                                              |
| `cli.e2e.test.ts`             | the bin in a temporary project: `extract`, `extract --check`, and `drift` exit codes and output, usage errors, `--help`, `--version`                                                             |

`e2e/catalog/smoke/` runs `extractCatalog` on Bun and Deno against PGlite, and `toPublicCatalog` and
`diffCatalogs` in workerd. CI runs the suite on Node.js 22 and 24, and `server.e2e.test.ts` and
`drift.e2e.test.ts` against PostgreSQL 14 and 18 services.

---

## 14. Packaging

- ESM only, `engines.node >= 22.12.0`, built by tsdown with declarations through oxc
  (`isolatedDeclarations`). `publint --strict` and `attw --profile esm-only` run in the build.
- `@netvark/catalog-core`: `platform: 'neutral'`, no dependencies, `sideEffects: false`.
- `@netvark/pg-catalog`: `platform: 'node'`, two entries (`index` and `cli`), `bin` `pg-catalog`
  pointing at `dist/cli.mjs` with a `#!/usr/bin/env node` line, dependencies `@netvark/catalog-core`
  (`workspace:^`) and `pg`, `@electric-sql/pglite` `^0.5.0` as an optional peer dependency, and
  `sideEffects` listing only the bin.
- The `exports` maps, `source` conditions, `publishConfig`, `files`, and release flow follow the
  keyset family (its SPEC 12).

---

## 15. Constants

| Name                    | Value                                                                                                     | Exported |
| ----------------------- | --------------------------------------------------------------------------------------------------------- | -------- |
| `CATALOG_FORMAT`        | 1                                                                                                         | yes      |
| default schemas         | `['public']`                                                                                              | no       |
| minimum server version  | 140000 (PostgreSQL 14)                                                                                    | no       |
| throwaway database name | `netvark_catalog_` followed by 16 lowercase hex digits                                                    | no       |
| `SESSION_SETTINGS`      | the six settings of 7.1                                                                                   | no       |
| configuration files     | `netvark.config.ts`, `.mts`, `.js`, `.mjs`, in that order                                                 | no       |
| pattern bound limit     | 255 (PostgreSQL's `DUPMAX`)                                                                               | no       |
| schema name limit       | 63 bytes (`NAMEDATALEN - 1`)                                                                              | no       |
| file header             | `// Generated by @netvark/pg-catalog. Do not edit: change the migrations and run \`pg-catalog extract\`.` | no       |
