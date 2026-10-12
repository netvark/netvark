# ADR 0001: Record architecture decisions

- Status: accepted
- Date: 2026-10-12

## Context

Formatting and message isolation are mostly choices a specification leaves to the application: which
calendar and digits a locale formats with, which time zone a date is read in during a server render,
whether a value is isolated in a left-to-right sentence, whether a message may format a number
itself. The application package this family generalizes made those choices well, but in code and
comments only, and some of its reasons no longer hold on every engine (bare `ar-SA` is Gregorian on
Node 24 and Islamic everywhere else measured). Choices have to be visible, with the measurement that
justified them, to be reviewable and to be revisited when an engine changes.

## Decision

Every decision that affects the public API, the output a formatter or a compiled message produces,
the runtime or dependency support matrix, or a default is recorded as an ADR in `docs/intl/adr/`,
numbered sequentially, using `0000-template.md`. A decision is changed by adding a new ADR that
amends or supersedes the old one, never by editing history. Pull requests that make such a change
link the ADR.

## Consequences

Reviewers can check code against a stated decision, and a measured claim carries the runtime and
version it was measured on, so it can be measured again. The overhead is one short file per
decision.
