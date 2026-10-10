# ADR 0001: Record architecture decisions

- Status: accepted
- Date: 2026-10-10

## Context

A catalog extracted from PostgreSQL is mostly choices: which facts it records, how it names and
orders them, which database it replays the migrations into, which CHECK expressions it dares to
translate, how it maps PostgreSQL types to TypeScript, and what counts as drift. Each choice decides
whether two runs agree, whether a browser bundle leaks internals, and whether a translated rule can
be trusted. Choices have to be visible to be reviewable.

## Decision

Every decision that affects the catalog model, the output files, the replay target, the CHECK
recognizer, the type mapping, the command set, the support matrix, or dependencies is recorded as an
ADR in `docs/catalog/adr/`, numbered sequentially, using `0000-template.md`. A decision changes
through a new ADR that supersedes the old one, never by editing history. Pull requests that make
such a change link the ADR.

## Consequences

Reviewers check code against a stated decision, and a PostgreSQL behavior can be told apart from a
library choice. The overhead is one short file per decision.
