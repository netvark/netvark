# ADR 0006: CHECK constraints become rules only when the rule is equivalent

- Status: accepted; amended by ADR-0010 (a NOT ENFORCED CHECK needs no validator, since the database
  never checks it)
- Date: 2026-10-10

## Context

A rule read from a CHECK lets the API reject a bad value before the database does, with the same
verdict. A rule that disagrees with its CHECK on some value is worse than no rule: the client
accepts what the server rejects, or the reverse. PostgreSQL stores a CHECK as a parse tree and
deparses it in a normalized form: `BETWEEN` becomes two comparisons, `IN` becomes
`= ANY (ARRAY[...])`, a `varchar` column is cast to `text`, negative literals are quoted and cast. A
CHECK passes when its expression is null, so a rule only ever constrains non-null values. @ref
https://www.postgresql.org/docs/18/ddl-constraints.html#DDL-CONSTRAINTS-CHECK-CONSTRAINTS

PostgreSQL's advanced regular expressions differ from JavaScript's in places: `.` matches a newline
by default, `\b` is a backspace and `\B` a backslash, `\d`, `\s`, and `\w` are locale classes, and
in a UTF-8 database a character is a code point. Bracket ranges are documented as
collation-dependent. @ref
https://www.postgresql.org/docs/18/functions-matching.html#POSIX-SYNTAX-DETAILS JavaScript's `s`
flag makes `.` match line terminators and its `u` flag matches code points. @ref
https://tc39.es/ecma262/#sec-regexp-regular-expression-objects

## Decision

- The recognizer reads the deparsed expression of an enforced single-column CHECK, NOT VALID ones
  included since PostgreSQL applies them to every new row, or of a domain CHECK over `VALUE`, and
  returns a rule only for these shapes, after removing redundant parentheses and any
  `<subject> IS NULL OR` guard, at the top or inside an `AND`: character length bounds
  (`char_length`, `character_length`, `length` of a text column compared with integer literals, or
  `<> ''`); numeric bounds (a numeric column compared with literals of its own numeric family, with
  their inclusiveness); membership (`= ANY (ARRAY[...])` of string literals, or `=` with one);
  `IS NOT NULL`; and a pattern (`~` with a string literal in the subset below). A guard around
  `IS NOT NULL` makes the CHECK true for every value, so it yields `null`, never `notNull`. An `AND`
  of length rules, or of range rules, merges into one when no bound repeats; any other combination,
  function, operator, column, or literal form yields `null`. A NOT ENFORCED CHECK (PostgreSQL 18)
  yields no rule, since the database never applies it.
- A pattern is translated only when it uses literal characters, escapes of JavaScript syntax
  characters, `.`, `^`, `$`, groups and non-capturing groups, alternation, the quantifiers `*`, `+`,
  `?`, `{m}`, `{m,}`, `{m,n}` up to PostgreSQL's limit of 255 and their lazy forms, and bracket
  expressions of literal characters, escaped syntax characters, ASCII ranges (`0-9`, `a-z`, `A-Z`
  and their sub-ranges), and a `-` first or last, which both engines read as itself. Class escapes,
  constraint escapes, back references, lookaround, POSIX classes, embedded options, a `]` first in a
  bracket, and `~*` are never translated. A translated pattern carries the flags `su`, and the
  subset admits only constructs that compile in JavaScript with them.
- A text rule needs a deterministic collation where the CHECK compares: the column's own for a table
  CHECK, and for a domain CHECK that of the type the domain is declared over, which is the collation
  PostgreSQL gives `VALUE`. @ref
  https://github.com/postgres/postgres/blob/REL_18_STABLE/src/backend/commands/typecmds.c
  (`domainAddCheckConstraint`) Under a nondeterministic collation only `notNull` remains, and the
  same holds for `bpchar` (its comparisons and `char_length` ignore trailing spaces), for `float4`
  (values round to single precision before the CHECK runs), and for types such as `citext` whose
  operators are not the text operators the rules describe.
- A rule speaks of the column's values after PostgreSQL's input conversion and type modifier
  coercion, and a range rule of finite numbers only. A bound compares in the column's type: exactly
  for the integer types and `numeric`, as the nearest double for `float8`.
- Every shape has a table-driven test with the exact text PostgreSQL 14 and 18 deparse. An oracle
  test runs values around every bound through the rule and through the database, and every accepted
  pattern through both engines' matchers; `rules --check` (#19) will run the same comparison over an
  application's own schema.

## Consequences

A rule in the catalog can be trusted to agree with the database for non-null values; `null` tells
the API that a validator must cover the constraint. Writing one constraint per rule gives each its
own rule and its own error code. New shapes are added only with their deparsed forms and tests.
