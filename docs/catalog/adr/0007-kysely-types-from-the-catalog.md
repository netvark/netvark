# ADR 0007: Kysely types are generated from the catalog

- Status: accepted
- Date: 2026-10-10

## Context

Kysely needs a `DB` interface describing each table's select, insert, and update types. Kanel with
`kanel-kysely` and `kysely-codegen` both introspect the database themselves, which would make the
types a second extraction that can disagree with the catalog, and both bring their own dependency
trees and configuration. The catalog already holds every fact the types need: column types, arrays,
nullability, defaults, identity, generation, and enums. @ref
https://kysely.dev/docs/generating-types

The JavaScript type of a column is decided by the driver's parsers, not by PostgreSQL. node-postgres
uses pg-types, which returns `int8` and `numeric` as strings, parses `int2`, `int4`, `oid`,
`float4`, and `float8` as numbers, `date` and both timestamps as `Date`, `interval` as an object,
`bytea` as a `Buffer`, and `json` and `jsonb` with `JSON.parse`; it parses arrays only of the types
it registers (a `numeric[]` becomes numbers), and returns every other type, including enum arrays,
as a string. @ref https://github.com/brianc/node-pg-types/blob/master/lib/textParsers.js

Kysely leaves the TypeScript types to the application, which must match what the driver returns.
@ref https://kysely.dev/docs/recipes/data-types `Generated<T>` makes a column optional on insert,
`GeneratedAlways<T>` forbids writing it, and `ColumnType<S, I, U>` states the select, insert, and
update types separately. @ref https://kysely-org.github.io/kysely-apidoc/types/ColumnType.html @ref
https://kysely-org.github.io/kysely-apidoc/types/GeneratedAlways.html

## Decision

- `@netvark/pg-catalog` generates the Kysely types from the extracted catalog, in the same run and
  with the same determinism as the catalog files, and `extract --check` covers them.
- The default mapping follows pg-types 2.x as above. A column with a default or an identity
  `BY DEFAULT` is optional on insert, an identity `ALWAYS` or a generated column is never written,
  and a nullable column admits `null` in all three positions. The configuration may override the
  mapping per type name for applications that register their own parsers.
- Enums become string literal unions; table interfaces are named `<PascalCase>Table` and collected
  in an interface `DB`.

## Consequences

Types and catalog cannot disagree, and there is no second introspection to configure. The mapping is
the library's responsibility: a driver with other defaults (PGlite, postgres.js) needs overrides,
which the documentation lists.
