# ADR 0002: A framework-free core and a Paraglide binding

- Status: accepted
- Date: 2026-10-12

## Context

The family has two halves with different homes. Formatting dates and numbers, resolving the reader's
time zone, and isolating a value are functions of a locale, a zone, and ECMA-402: they run in every
server runtime and in the browser, and they do not care which message library produced the locale.
Isolating the values a compiled message interpolates is a build step over one message library's
compiler: Paraglide JS 2, whose `compile()` is `loadProjectFromDirectory()` from the inlang SDK,
then `compileProject()` and `writeOutput()`
([`compile.ts`, 2.27.0](https://github.com/opral/paraglide-js/blob/0c6cf2c971b667cedf133dea471101897c8c0ade/src/compiler/compile.ts#L58-L69)),
and whose documentation shows applications importing `@inlang/sdk` themselves to load a project
([`create-paraglide.ts`](https://github.com/opral/paraglide-js/blob/0c6cf2c971b667cedf133dea471101897c8c0ade/src/compiler/create-paraglide.ts#L28)).
The SDK's data model changed in each of its last two majors (SDK 3 with Paraglide 2.24, SDK 4 with
Paraglide 2.27, measured from the registry on 2026-10-12): a project loaded by one SDK cannot be
compiled by a Paraglide built against another.

## Decision

- `@netvark/intl-core` is the core ([root ADR 0003](../../adr/0003-package-naming.md)): web
  standards only, no dependencies, nothing imported from Paraglide or the inlang SDK, not even
  types. The application hands it getters (`getLocale` from its Paraglide runtime) and a request
  scope (an `AsyncLocalStorage` it creates); the core imports neither.
- `@netvark/paraglide-intl` is the binding to Paraglide. It re-exports the core in full, so an
  application imports one package. It takes `@inlang/paraglide-js` and `@inlang/sdk` as peer
  dependencies: it loads the project with the SDK and hands it to Paraglide's `compileProject()`, so
  both must be the application's one copy, the one Paraglide's own dependency resolves to
  ([root ADR 0009](../../adr/0009-a-binding-takes-as-peers-the-packages-whose-values-it-hands-its-host.md)).
- The binding is a build-time tool, like `@netvark/pg-catalog`: it reads and writes files through
  the file system Paraglide's compiler is given (`node:fs` by default), so it is the second
  exception to the web-standards rule. It reads no environment at module scope.

## Consequences

A browser bundle, a Worker, or a server that formats imports only the core's code. A Paraglide
upgrade that changes the SDK major is an unmet peer dependency at install, not a failed compile. The
binding's floor is the oldest Paraglide and SDK pair its tests pass on, and CI runs them there (root
ADR 0007).
