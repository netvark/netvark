# ADR 0011: A binding takes the core an application installs through its adapter as an optional peer

- Status: accepted; applies ADR 0009 to a core the application installs through its adapter
- Date: 2026-10-12

## Context

A binding to a library's core
([ADR 0010](0010-a-binding-to-a-library-with-a-framework-free-core-binds-the-core.md)) needs the
core's types, and may hand the library values made with the core: the TanStack Form binding hands
every form `revalidateLogic()`. An application installs its framework's adapter, not the core, and
the adapter depends on one exact release of the core. A binding that reaches another copy breaks
both its types and its values:

- TanStack Query tags a key with its data through `DataTag`, keyed by a `unique symbol` that each
  copy's declarations declare anew. A key the binding tagged with one copy is untagged for the
  `getQueryData` of the other, which no longer infers the data's type.
- A form calls a `revalidateLogic` from another release than the `FormApi` that runs it.

[ADR 0009](0009-a-binding-makes-what-it-hands-its-host-with-the-hosts-own-dependency.md) makes such
values with the host's own copy, resolved from the host's package. Here the host is any of the
library's adapters, and the binding imports none of them.

A probe binding importing `revalidateLogic` from `@tanstack/form-core` and typing a key through
`@tanstack/query-core` was installed on 2026-10-12 beside the newest adapters,
`@tanstack/react-query` 5.104.1 and `@tanstack/react-form` 1.33.5, and beside lagging ones, 5.90.2
and 1.20.0, when the newest `@tanstack/query-core` was 5.104.2. The copies of each core the binding
and the adapter loaded, with `getQueryData` typed only where they were one:

| The binding takes the core as                            | npm 11.19                      | pnpm 12.3 | Yarn 4.18, `node-modules` | Bun 1.4, hoisted and isolated | Yarn 4.18, Plug'n'Play          |
| -------------------------------------------------------- | ------------------------------ | --------- | ------------------------- | ----------------------------- | ------------------------------- |
| a peer                                                   | one; two when the adapter lags | one       | one                       | one                           | none: the binding fails to load |
| an optional peer                                         | one                            | one       | one                       | one                           | none: the binding fails to load |
| an optional peer, which the application lists with `^`   | two once a newer core exists   | two       | two                       | two                           | two                             |
| an optional peer, listed at the release its adapter pins | one                            | one       | one                       | one                           | one                             |

Plug'n'Play refuses a package any dependency it does not declare and any peer its parent does not
provide ([Yarn docs](https://yarnpkg.com/features/pnp)), and an application that installs only its
adapter provides no core.

## Decision

- A binding to a framework-free core takes the core as an optional peer (`peerDependenciesMeta`),
  never as a dependency or a required peer, and as a development dependency at the catalog's release
  for its own build and tests. The range starts at the first release with what the binding uses, and
  CI tests that floor
  ([ADR 0007](0007-a-peer-range-starts-past-published-advisories-and-ci-tests-its-floor.md)).
- At runtime it imports from the core only the values it hands the library, and the rest as types,
  so the copy matters only where the library meets what the binding made.
- Its README installs the adapter alone, says not to list the core, and tells a Plug'n'Play
  application to list it at the exact release its adapter depends on, which `yarn why` shows.
- The family's e2e suite type-checks the built binding with each adapter, and its floor job runs the
  binding's tests on the floor of the core.

## Consequences

Under npm, pnpm, Yarn's `node-modules` linker, and Bun, the binding loads the adapter's copy, and
under Plug'n'Play it does once the application lists the core at its adapter's release, so keys stay
typed and a form runs its own release's logic whatever adapter release the application has, and an
adapter that lags needs nothing from the application. An application that lists the core with a
range of its own gets a second copy as soon as a newer core is published, which the README warns of.
The binding may use only what its floor release provides, and its tests on the floor and on the
catalog's release prove both ends. "Adding a package" asks whether a binding's host ships as a core
plus adapters.
