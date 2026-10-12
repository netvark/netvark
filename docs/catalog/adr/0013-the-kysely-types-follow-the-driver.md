# ADR 0013: The Kysely types follow the application's driver

- Status: accepted
- Date: 2026-10-12

## Context

ADR 0007 types every column as node-postgres returns it, the driver behind Kysely's
`PostgresDialect`, and leaves other drivers to overrides. Since Kysely 0.29, `PGliteDialect` queries
PGlite through its own `query()`, so an application on it gets PGlite's values, and ADR 0007's own
example of them was wrong: PGlite does not return `int8` as `bigint`. @ref
https://pglite.dev/docs/orm-support#kysely @ref
https://github.com/kysely-org/kysely/blob/v0.29.6/src/dialect/pglite/pglite-driver.ts

PGlite's parsers and serializers were read from its source and measured on 0.5.0, the peer range's
floor, and 0.5.8, with the same results unless noted. @ref
https://github.com/electric-sql/pglite/blob/%40electric-sql/pglite%400.5.8/packages/pglite/src/types.ts
@ref
https://github.com/electric-sql/pglite/blob/%40electric-sql/pglite%400.5.8/packages/pglite/src/base.ts
(`_initArrayTypes`, `#runQuery`)

- **Rows.** `int2`, `int4`, `oid`, `float4`, and `float8` become numbers, and `int8` a number within
  ±(2^53 − 1) and a `bigint` beyond. `bool` becomes a boolean; `date`, `timestamp`, and
  `timestamptz` a `Date`; `bytea` a `Uint8Array`; `json` and `jsonb` what `JSON.parse` returns.
  Every other type stays text, `numeric`, `interval`, `point`, and `circle` included. PostgreSQL
  describes a domain column with its base type, so a domain reads as its base type.
- **Arrays.** At startup PGlite gives every array type in `pg_type` a parser and a serializer that
  apply the element type's own, so `numeric[]` and `interval[]` come back as arrays of text, and an
  array of an enum as an array of labels. An array of a domain comes back as an array of text, since
  the domain itself has no parser. An array of a type created after startup, such as an enum a
  migration adds, comes back as array text and refuses a JavaScript array (22P02) until
  `refreshArrayTypes()` runs, which PGlite documents for this case. @ref
  https://pglite.dev/docs/api#refresharraytypes
- **Parameters.** PGlite asks PostgreSQL for each parameter's type and uses that type's serializer,
  or else sends `value.toString()`. `bytea` takes only a `Uint8Array`. `json` and `jsonb` send a
  string as it is, as JSON text, so `'plain'` fails (22P02) and `'123'` stores a number, and
  anything else through `JSON.stringify`. A `Date` goes out as `toISOString()`. On 0.5.0, `bool`
  takes only booleans and text columns only strings and numbers; 0.5.8 also takes `1`, `0`, and
  boolean words for `bool`, and a `Date` for text.
- **Domain parameters.** PostgreSQL types the parameter of an insert or update of a domain column as
  the domain, which has no serializer. A `Date` then fails (22007 in a process running in UTC, 22023
  elsewhere), as do a JavaScript array for a domain over an array and an object for a domain over
  `jsonb` (22P02), and a `Uint8Array` for a domain over `bytea` is stored as the three bytes of
  `"1,2"`, without an error. A comparison types its parameter as the base type, so values in `where`
  keep their serializers.
- **Time zones.** `timestamp` text is read back with `new Date(text)`, in the process's local time
  zone, while a `Date` is written in UTC, so a `Date` written to a `timestamp` comes back shifted by
  the local offset unless the process runs in UTC.

## Decision

- `types.driver` names the driver whose values the types describe: `'node-postgres'`, the default
  and ADR 0007's table, or `'pglite'`, PGlite's own `query()` as `PGliteDialect` calls it. PGlite
  served over pglite-socket and queried with node-postgres is `'node-postgres'`.
- The PGlite table follows the measurements above. The select type is what the parsers return:
  `int8` is `number | bigint`, `bytea` is `Uint8Array`, and every type without a parser is `string`.
  The insert and update types are, as in ADR 0007, the values the serializers send as what they are,
  with `string` wherever the serializer passes PostgreSQL's text through. For `json` and `jsonb`
  that is a helper of its own, `JsonParameter`: any JSON value, whose strings are JSON text.
- Every array is typed parsed: `Array<element select type>`, with `string` elements for an array of
  a domain, and `Array<element insert type> | string` on insert and update. The types assume
  `refreshArrayTypes()` has run after the migrations that create a type an array column uses, as
  PGlite does at startup; the README says so.
- A domain's insert and update types keep only what `toString()` writes as PostgreSQL's text:
  numbers, bigints, strings, booleans, and labels. A domain over a date or time type, `bytea`,
  `json`, `jsonb`, or an array takes `string`. A domain's select type stays its base type's.
- Overrides work as in ADR 0007. Since PGlite parses and serializes array elements with the element
  type's own parser and serializer, the application's included, an override of `<type>` also types
  the elements of `<type>[]`, except under a domain, whose elements stay text.
- The driver oracle runs through PGlite in the unit tests, which CI also runs on PGlite 0.5.0, so
  every row of the PGlite table is held against the floor and the current release.

## Consequences

An application on `PGliteDialect` gets types that match its rows without overrides. The PGlite table
is held only for the PGlite versions CI runs; a release that changes a parser or a serializer fails
the oracle before the types mislead. The time-zone behavior of `timestamp` is PGlite's and is not
visible in the types, so the README tells applications to run in UTC or to use `timestamptz`.
Switching an application between drivers changes its types, which `extract --check` reports as any
other change.
