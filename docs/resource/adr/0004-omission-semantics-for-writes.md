# ADR 0004: Writes omit what they do not change; the database supplies defaults

- Status: accepted
- Date: 2026-10-10

## Context

JSON:API 1.1 says a server MUST interpret attributes missing from a `PATCH` as if they were included
with their current values, and MUST NOT interpret them as `null`. On create, PostgreSQL applies
column and domain defaults (literals, `now()`, `gen_random_uuid()`, identity sequences) to every
column an `INSERT` does not name, and only then checks `NOT NULL`.

A validation schema with `.default()` copies a database default into every client. The copy drifts
when a migration changes the default, cannot express `now()` or a sequence, and turns "the client
did not say" into "the client said this value", which then overwrites the column on update.

JSON has no `undefined`: `JSON.stringify` drops a member whose value is `undefined`, so on the wire
an absent member and an `undefined` one are the same request.

@ref https://jsonapi.org/format/1.1/#crud-updating-resource-attributes @ref
https://www.postgresql.org/docs/18/sql-insert.html @ref
https://www.postgresql.org/docs/18/ddl-default.html

## Decision

- **Create.** A field is required when its column is effectively NOT NULL (the column is NOT NULL,
  or a `notNull` rule applies to the column or its domain, or the domain is NOT NULL) and nothing
  supplies a value (no column default, no domain default, no identity, not generated). Every other
  writable field is optional.
- **Update.** Every field writable on update is optional. Immutable and read-only fields are not in
  the schema, and a key the schema does not know is an issue.
- **Optional means untouched.** An absent key and a key whose value is `undefined` mean the same
  thing, as they do after `JSON.stringify`. `null` is a value: it clears a nullable column and is an
  issue for an effectively NOT NULL one.
- **No invented values.** No composed schema carries `.default()`, `.prefault()`, `.catch()`, or a
  transform that adds a member; parsing never returns a key the input did not have. The default
  literal of the public catalog is metadata (a form may show it as a placeholder), never a value.
- **Reads are complete.** The read schema requires every readable field; sparse fieldsets are a
  projection of it.
- **Storage writes what it was given.** The storage contract requires an adapter to insert or update
  exactly the keys present in the parsed input, plus the scope column and server values (SPEC 12.8).

## Consequences

A default lives in one place, the migration, and a changed default needs no client release. A
`PATCH` with one attribute changes one column. A column that is required on insert but not writable
by clients must be supplied by the server, and the server definition fails `tsc` until it does (SPEC
12.3).
