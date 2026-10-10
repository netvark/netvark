# ADR 0006: CHECK constraints become rules only when the rule is equivalent

- Status: accepted
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

- The recognizer reads the deparsed expression of a single-column CHECK, or of a domain CHECK over
  `VALUE`, and returns a rule only for these shapes, after removing redundant parentheses and an
  `<column> IS NULL OR` guard: character length bounds (`char_length`, `character_length`, `length`
  of a text column compared with integer literals, or `<> ''`); numeric bounds (a numeric column
  compared with numeric literals, with their inclusiveness); membership (`= ANY (ARRAY[...])` of
  string literals); `IS NOT NULL`; and a pattern (`~` with a string literal in the subset below). An
  `AND` of two rules of the same kind merges into one; any other combination, function, operator,
  column, or literal form yields `null`.
- A pattern is translated only when it uses literal characters, escapes of JavaScript syntax
  characters, `.`, `^`, `$`, groups and non-capturing groups, alternation, the quantifiers `*`, `+`,
  `?`, `{m}`, `{m,}`, `{m,n}` and their lazy forms, and bracket expressions of literal characters,
  escaped syntax characters, and ASCII ranges (`0-9`, `a-z`, `A-Z` and their sub-ranges). Class
  escapes, constraint escapes, back references, lookaround, POSIX classes, embedded options, and
  `~*` are never translated. A translated pattern carries the flags `su`, and must compile in
  JavaScript with them.
- Columns with a nondeterministic collation get no rules except `notNull`, and so do `bpchar`
  columns (their comparisons and `char_length` ignore trailing spaces), `float4` columns for ranges
  (values round to single precision before the CHECK runs), and types such as `citext` whose
  operators are not the text operators the rules describe.
- A rule speaks of the column's values after PostgreSQL's input conversion and type modifier
  coercion, and a range rule of finite numbers only.
- Every shape has a table-driven test with the exact text PostgreSQL 14 and 18 deparse, and the
  oracle (`rules --check`) runs generated boundary values through the rule and through the database.

## Consequences

A rule in the catalog can be trusted to agree with the database for non-null values; `null` tells
the API that a validator must cover the constraint. Writing one constraint per rule gives each its
own rule and its own error code. New shapes are added only with their deparsed forms and tests.
