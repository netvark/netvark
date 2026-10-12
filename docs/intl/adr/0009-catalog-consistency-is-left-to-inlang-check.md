# ADR 0009: Catalog consistency is left to `inlang check`

- Status: accepted
- Date: 2026-10-12

## Context

The application package this family generalizes checks its catalogs before compiling: every key in
every locale, the same variant shape in each, every plural category the locale has. Paraglide's
failures there are silent: measured on Paraglide 2.27.0 (2026-10-12), a key missing from `ar`
renders the `en` text, and an Arabic plural without `two`, `few`, and `many` renders the message's
key (`items`) for 2, 3, and 11. Since 2026-10-09, the inlang SDK 4 ships these checks
(`checkProject()`: `missing-translation`, `missing-variant`, `missing-selector`, `missing-variable`,
`unknown-variable`, `empty-translation`, `unused-message`), the inlang CLI 3.4 runs them with
`inlang check` and exits 1 on a finding, and Paraglide 2.27's `init` adds the check to a new project
([commit](https://github.com/opral/paraglide-js/commit/8ee34b6a6a4d40edf7a2e035626610f56bfaeb3f)).
`inlang check` reported both cases above.

## Decision

The family does not check catalogs. Its documentation recommends `inlang check` in CI and before a
push, with `@inlang/plugin-m-function-matcher` 2.3 or later in the project's modules so unused
messages are found too.

## Consequences

The checks follow the SDK's data model as it changes, maintained where the model is. A rule the
application wants beyond them (a key grammar, ownership of key prefixes by directory) stays in the
application.
