# ADR 0001: Record architecture decisions

- Status: accepted
- Date: 2026-10-10

## Context

Each family in this repository records its decisions in its own `docs/<family>/adr/` directory:
choices a specification leaves to the server, wire and cursor formats, dependency and runtime
policies. Decisions about the repository itself (how the packages are laid out, named, versioned,
tested, and released) belong to no family, and until now lived only in configuration and commit
messages, where their reasons are lost.

## Decision

Every decision that affects the repository as a whole (the workspace layout, the package naming
scheme, shared tooling, the release process, the support matrix every package inherits) is recorded
as an ADR in `docs/adr/`, numbered sequentially, using `0000-template.md`. Family decisions stay in
the family's `adr/` directory with their own numbering. A decision is changed by adding a new ADR
that supersedes the old one, never by editing history. Pull requests that make such a change link
the ADR.

## Consequences

Reviewers can check a repository change against a stated decision, and a family can tell a
repository rule from one of its own. The overhead is one short file per decision.
