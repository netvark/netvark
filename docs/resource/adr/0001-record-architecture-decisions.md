# ADR 0001: Record architecture decisions

- Status: accepted
- Date: 2026-10-10

## Context

A resource declaration turns database facts into a public contract: the names clients see, the
schemas that accept or reject their input, the error codes they switch on, and the messages they
show. Each derivation is a choice that clients come to depend on, and most of them cannot be changed
later without a breaking release. Choices have to be visible to be reviewable.

## Decision

Every decision that affects the declaration grammar, the derived names, the wire forms, the schemas,
the error catalog, the messages, the server contracts, the support matrix, or the dependencies of
the resource family is recorded as an ADR in `docs/resource/adr/`, numbered sequentially, using
`0000-template.md`. A decision changes through a new ADR that supersedes the old one, never by
editing history. Pull requests that make such a change link the ADR.

## Consequences

Reviewers check code against a stated decision, and a PostgreSQL or JSON:API behavior can be told
apart from a library choice. The overhead is one short file per decision.
