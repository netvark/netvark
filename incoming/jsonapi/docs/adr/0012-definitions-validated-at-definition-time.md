# ADR 0012: Definitions are validated at definition time, never at request time

- Status: accepted
- Date: 2026-10-08

## Context

A resource definition can be wrong in ways that only surface when a client sends the request that
exercises them: a field named `type`, a sort name that is not a member name, a `query.page.default`
above the max, a relationship path through a relationship that declares no related definition, a
custom parameter name made only of `a-z` that the specification may reserve later. Surfacing those
as 400s punishes the client for the server's mistake and hides the bug until production. @ref
https://jsonapi.org/format/1.1/#document-resource-object-fields @ref
https://jsonapi.org/format/1.1/#document-member-names @ref
https://jsonapi.org/format/1.1/#query-parameters-custom

## Decision

`defineResource` validates everything it can at the call: member-name grammar for the type and
fields, the `type`/`id` namespace rule, duplicate names, relationship shapes, query capabilities
(member paths for sort and filter names, non-empty operator lists, reserved filter names, custom and
search parameter naming, page bounds), and the Standard Schema shape of validators. It throws
`TypeError` naming the option. The include registry, which needs related definitions that may be
defined later, is built and checked on first use per definition and memoized. Request-time parsers
assume a valid definition and never re-check it.

## Consequences

Definition mistakes fail at startup (or at the first request through the registry) with a message
naming the option, and the test suite for an application can assert them. Parsers stay small.
