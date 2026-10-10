# ADR 0005: Values cross the wire in canonical forms; a write PostgreSQL would alter is rejected

- Status: accepted
- Date: 2026-10-10

## Context

JSON has strings, numbers, booleans, arrays, objects, and `null`; PostgreSQL has dozens of types,
and its input functions accept many spellings of each value and quietly change some of them. Checked
on PostgreSQL 14.19 and on PGlite 0.5.8 (PostgreSQL 18.3) through node-postgres:

- `varchar(3)` stores `'abc  '` as `'abc'`: excess characters that are all spaces are truncated
  without an error, while `'abcd'` fails with 22001. Lengths count code points: `varchar(1)` holds
  one astral character of four UTF-8 bytes.
- `numeric(5,2)` stores `'1.005'` as `1.01` (rounding to the scale) and rejects `'1000'` and
  `'Infinity'` with 22003; an unconstrained `numeric` keeps `'1.50'` as written.
- `text` rejects U+0000 with 22021, and a lone UTF-16 surrogate reaches the server as U+FFFD
  (`efbfbd`), because the client's UTF-8 encoder replaces it.
- `real` rejects `3.5e38` and `1e-50` with 22003, and `0.1::real > 0.1` is true: the comparison
  promotes the rounded `real` to `double precision`.
- `bigint` accepts `'+5'`, `' 5 '`, and `'007'`; JavaScript numbers lose integers beyond 2^53.
- `timestamptz` rounds `06:15:00.1234567` to microseconds and accepts `06:15Z`, which RFC 3339 does
  not allow; `date` accepts `10000-01-01`, `infinity`, and BC dates; `double precision` accepts
  `NaN`, which JSON cannot carry.
- `text[]` accepts `NULL` elements and two-dimensional values; `jsonb` rejects `\u0000` with 22P05
  while `json` stores it.

node-postgres returns `bigint` and `numeric` as strings and `timestamptz` as a `Date`, whose
millisecond precision drops microseconds.

@ref https://www.postgresql.org/docs/18/datatype-character.html @ref
https://www.postgresql.org/docs/18/datatype-numeric.html @ref
https://www.postgresql.org/docs/18/datatype-datetime.html @ref
https://www.rfc-editor.org/rfc/rfc3339#section-5.6 @ref https://github.com/brianc/node-pg-types

## Decision

- Every supported PostgreSQL type has one wire form (SPEC 5): reads produce it, writes accept it,
  and the read form of a value is always a valid write. A type outside the table needs a codec.
- A write is rejected, as a field-level issue, wherever PostgreSQL would reject it, so the client
  learns which member is wrong instead of receiving a generic data exception.
- A write is also rejected wherever PostgreSQL would store something other than the value sent:
  over-long strings whose excess is spaces, more fraction digits than the scale, unpaired
  surrogates, more than six fraction digits of a second. The API stores what it was sent or nothing.
- Normalizations that keep the value are allowed and documented: a UUID in upper case reads back in
  lower case, a `timestamptz` with an offset reads back as the same instant in UTC.
- Integers beyond the double range (`bigint`) and decimals (`numeric`) travel as strings, so no
  digit is lost in JavaScript; temporal values travel as RFC 3339 text with microseconds.
- Arrays are one-dimensional with non-null elements. Values PostgreSQL accepts beyond that need a
  codec.

## Consequences

The schemas are stricter than PostgreSQL's input syntax in the documented cases, and exactly as
strict everywhere else; the oracle tests every row of the table against PGlite and PostgreSQL 14 and
18 (ADR 0006). A storage adapter must produce the wire forms (the storage contract tests it), which
for node-postgres means reading `timestamptz` and `date` as text instead of `Date`.
