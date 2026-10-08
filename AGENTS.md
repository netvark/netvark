# jsonapi-kit: instructions for coding agents

This file is read by AI coding agents working in this repository. Humans: see `CONTRIBUTING.md`.

## Ground rules

- Read `docs/DESIGN.md` for intent and `docs/SPEC.md` for the exact contract before changing public
  API. Implement from the SPEC section named in the file header; update the SPEC in the same PR when
  the code must differ. Read the relevant ADR in `docs/adr/` before changing a decision it records;
  add a new ADR instead of silently reversing one.
- Spec-driven, not memory-driven. Every behavior comes from a clause of JSON:API 1.1
  (https://jsonapi.org/format/1.1/), the Cursor Pagination profile
  (https://jsonapi.org/profiles/ethanresnick/cursor-pagination/), the Atomic Operations extension
  (https://jsonapi.org/ext/atomic/), RFC 9110, RFC 6901, or Standard Schema. Fetch the clause, cite
  it in the code with an `@ref <url>` comment next to the decision it justifies, and quote the
  normative words in the test name. Where the specification leaves a choice to the server, the
  choice is written down in `docs/SPEC.md` and an ADR.
- Run the gates after every meaningful change, not at the end: `pnpm check:types`,
  `pnpm check:lint`, then `pnpm test` (both packages; `hono-jsonapi` resolves `jsonapi-kit` from
  source through the `source` export condition, so no build is needed between edits). Run
  `pnpm build`, `pnpm check`, and `pnpm test:e2e` before declaring done, in that order: the
  type-aware lint of `e2e/` and the package checks read `dist/`, and the e2e suite is the only check
  that exercises `dist/` and the published `exports` maps. `pnpm test:runtimes` (Bun, Deno, workerd
  smoke) needs `bun` and `deno` installed; CI runs it.
- Tests are colocated (`x.test.ts`, `x.test-d.ts`) and cover behavior, not implementation. A test
  earns its place by pinning a specification clause, a server choice recorded in the SPEC, or a
  regression. Coverage thresholds are enforced; do not lower them.
- Nothing about the server reaches a client that a factory did not put there: unexpected errors
  render as a constant 500, the `cause` stays on the error for `report`.
- Client input never becomes an object key without a check (`PROTO_KEYS`, `Object.hasOwn`), and
  every lookup into client-shaped data goes through `internal/object.ts`.
- No `process.env` at module scope, no Node-only APIs in `src/` (web standards only), no enums or
  parameter properties (`erasableSyntaxOnly`), no `any`, no `T[]`, no emojis.
- Commit subjects use conventional commits. Every user-visible change needs a changeset in
  `.changeset/` (`pnpm changeset`) naming the package or packages it changes.
- Framework code stays in the adapter. Nothing under `packages/jsonapi-kit/` imports `hono` or
  another framework; what needs a request, a response, or a framework context lives in
  `packages/hono-jsonapi/` and calls the core (ADR 0013). The host context handlers receive is the
  `TContext` type parameter, never a concrete framework type, in the core.
- Never mention AI assistance in commits, changesets, or docs.

## Repository map

A pnpm workspace: `packages/jsonapi-kit` (the framework-free core, published as `jsonapi-kit`),
`packages/hono-jsonapi` (the Hono adapter, published as `hono-jsonapi`, depends on the core and
re-exports it), and `e2e/` (private). Root configs (`vitest.config.ts` with `test.projects`,
`tsconfig.base.json`, `knip.jsonc`, `.oxlintrc.json`, `.oxfmtrc.json`) apply to all of them.

`packages/jsonapi-kit/src/`:

- `internal/` constants, prototype-safe object helpers, RFC 6901 pointers, vendored Standard Schema
  types; never exported
- `media-type/` RFC 9110 media type and `Accept` parsing and serialization, the JSON:API media type
  and its `ext` and `profile` parameters
- `negotiate/` the server content negotiation rules as a pure function
- `errors/` `JsonApiError`, the closed error catalog, the registered status code table
- `document/` document and resource object types, member name rules, resource serialization,
  document builders, full linkage
- `resource/` `defineResource`: the definition everything else reads from
- `query/` `parseQuery`: `include`, `fields`, `sort`, `page`, `filter`, search, custom
- `pagination/` the Cursor Pagination profile: links, meta, errors, `paginatedDocument`
- `request/` request documents: identifiers, resource objects, relationship documents
- `atomic/` the Atomic Operations extension (`jsonapi-kit/atomic`): `operationsProcessor`,
  `assertOperationsContentType`, the document parser, lids, executors
- `test-support/` the vendored JSON:API 1.0 JSON Schema and the Ajv conformance helper for the
  repository's own tests; not published

`packages/hono-jsonapi/src/`:

- `index.ts` re-exports `jsonapi-kit` and adds the Hono integration: `jsonApi()` middleware
  (`middleware.ts`), `respond` (`respond.ts`), `readDocument` (`body.ts`), validators
  (`validators.ts`), `errorHandler` and `notFoundHandler` (`handlers.ts`)
- `atomic/` re-exports `jsonapi-kit/atomic` and adds `atomicOperations()`, the operations endpoint
  as a Hono handler

`e2e/`: end-to-end suite, a private workspace package that consumes the built `jsonapi-kit` and
`hono-jsonapi` through `workspace:*` and drives a blog API over real HTTP with `@hono/node-server`;
never imports from `src/`. `e2e/smoke/` is the runtime smoke test (Bun, Deno, workerd).

- `docs/DESIGN.md` what we are building and why; `docs/SPEC.md` the normative contract; `docs/adr/`
  decisions
