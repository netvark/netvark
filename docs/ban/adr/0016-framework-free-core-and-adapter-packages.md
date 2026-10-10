# ADR 0016: The core ships as `ban-kit`; `hono-ban` becomes the Hono adapter

- Status: accepted
- Date: 2026-10-08

## Context

hono-ban 1.x was one package whose only framework coupling was thin: `BanError` extended Hono's
`HTTPException`, `ban.onError()` took a Hono `Context`, and `ban.from()` recognized `HTTPException`.
Everything else (catalog, formats, schemas, validation, OpenAPI, Postgres, testing) already typed
its inputs structurally (ADR 0009) and ran on web standards alone (ADR 0004).

A sibling library needed the same error model outside Hono: a JSON:API toolkit that renders error
documents from a catalog and that is consumed by Hono and non-Hono services. Reimplementing the
catalog, status handling, and rendering there would have produced a second, incompatible error
layer, and importing `hono-ban` would have made `hono` a transitive peer of a library that never
touches it. Tests and tooling that build error bodies without a request had the same problem in
miniature.

The options considered:

1. Keep one package and make `hono` an optional peer. Declaration files would still import Hono's
   types, and every consumer would carry the framework in its lockfile for one adapter.
2. Split the core out and keep the name `hono-ban` for the adapter, with the core under a new name.
3. Rename the whole thing and ship the Hono adapter under the new name's scope.

The name question was settled separately: `ban` is short, already published, and recognizable, so
the core is `ban-kit` and the adapter keeps `hono-ban`, which Hono users already search for.

## Decision

The repository becomes a pnpm workspace with two published packages:

- `ban-kit` holds everything that does not need Hono: the catalog and factories, `BanError`, the
  formats, the framework-free handler (`ban.handler()` fed by an `ErrorRequest`, SPEC section 6),
  `fromRequest()` for fetch `Request` objects, the validation hooks and converters, the OpenAPI
  helpers, the OpenTelemetry adapter, the Postgres mapper, and the testing utilities. It has no
  dependencies and no peer dependencies. Version 1.0.0.
- `hono-ban` depends on `ban-kit` (caret range) and peers on `hono`. It re-exports every `ban-kit`
  subpath under the same name, so `hono-ban/formats/json-api` and `ban-kit/formats/json-api` are the
  same module, and its root replaces `createBan` with one that installs the `HTTPException` adopter
  (ADR 0018) and adds `onError` for `app.onError()`. Version 2.0.0, because the error class changed
  (ADR 0018) and the format interface changed (ADR 0017).

The subpath layout is identical in both packages, so a consumer migrates from one to the other by
changing the package name in imports. `hono-ban`'s re-export files are one line each; behavior lives
in the core, and the adapter owns only what needs a Hono type: `HandlerOptions<E>`, `Ban`,
`onError`, `fromHttpException`, `passthroughResponse`.

Inside the repository, `hono-ban` imports `ban-kit` by package name and the `source` export
condition resolves it to the core's `src/`, so tests and type checks run without a build; the
published packages resolve through `dist/`. The e2e package consumes both built packages.

Changesets version the two packages independently with `updateInternalDependencies: patch`, so a
core release carries an adapter release that depends on it.

## Consequences

- A library or service renders the same errors with the same formats without a framework, and an
  adapter for another host is a small package: an `adopt` hook for the host's exceptions and a
  mapping from its request to `ErrorRequest`.
- Hono users keep `hono-ban`, its subpaths, and `ban.onError()`; the breaking changes they see are
  the ones ADR 0017 and ADR 0018 record, not the split.
- Two packages mean two `package.json` files, two build configs, two READMEs, and a coverage run
  that spans both; the root scripts, CI, and `check:pkg` cover both in one invocation.
- ADR 0009's "`hono` is the only peer dependency" now reads as "`ban-kit` has no peer; `hono-ban`
  peers on `hono` alone"; the structural-typing rule it records is unchanged and is what made the
  split cheap.
