# ADR 0007: The `filter` grammar

- Status: accepted
- Date: 2026-10-08

## Context

JSON:API reserves the `filter` query parameter family and leaves its strategy to the server: "The
filter query parameter family is reserved for filtering data. Servers and clients SHOULD use this
parameter for filtering operations." A server still has to reject what it cannot process with a 400.
The previous toolkit dropped unknown `filter` members and reserved `q` and `or` without declaring
them. @ref https://jsonapi.org/format/1.1/#fetching-filtering @ref
https://jsonapi.org/format/1.1/#query-parameters-families @ref
https://jsonapi.org/recommendations/#filtering

## Decision

The package defines one grammar over the family:

- `filter[field]=v` is the `eq` operator; `filter[field][op]=v` is a declared operator;
- `filter[or][n][field]=v` and `filter[or][n][field][op]=v` place a condition in disjunction group
  `n` (`[0-9]+`); groups are returned in ascending index order; every group must hold, any condition
  within a group may hold; all top-level conditions must hold;
- fields and their operators are declared per definition (`query.filter`); `or` and the search
  member are reserved names;
- a definition's search parameter may live in the family as `filter[<member>]`;
- anything else in the family is a 400: an undeclared field or operator is
  `INVALID_QUERY_PARAMETER`, a shape the grammar does not define is `UNKNOWN_QUERY_PARAMETER`.

Values are strings (or arrays for a repeated parameter); interpreting them is the application's job,
since only it knows the column types.

## Consequences

Clients get a predictable, documented grammar with full error reporting. Servers with another
strategy (an expression language in `filter`, a `filter[field][in]` list syntax) parse the family
themselves with `parseQuery` configured without filters, or propose a new ADR.
