# jsonapi family: instructions for coding agents

Read with the root [`AGENTS.md`](../../AGENTS.md), which holds the rules every family shares; this
file adds what is specific to `@netvark/jsonapi-core` (the framework-free core),
`@netvark/hono-jsonapi` (the Hono binding), and `@netvark/jsonapi-client` (the typed client).
Humans: see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Ground rules

- Read `docs/jsonapi/DESIGN.md` for intent and `docs/jsonapi/SPEC.md` for the exact contract before
  changing public API. Implement from the SPEC section named in the file header; update the SPEC in
  the same PR when the code must differ. Read the relevant ADR in `docs/jsonapi/adr/` before
  changing a decision it records; add a new ADR instead of silently reversing one.
- Spec-driven, not memory-driven. Every behavior comes from a clause of JSON:API 1.1
  (https://jsonapi.org/format/1.1/), the Cursor Pagination profile
  (https://jsonapi.org/profiles/ethanresnick/cursor-pagination/), the Atomic Operations extension
  (https://jsonapi.org/ext/atomic/), RFC 9110, RFC 6901, or Standard Schema. Fetch the clause, cite
  it in the code with an `@ref <url>` comment next to the decision it justifies, and quote the
  normative words in the test name. Where the specification leaves a choice to the server, the
  choice is written down in `docs/jsonapi/SPEC.md` and an ADR.
- Nothing about the server reaches a client that a factory did not put there: unexpected errors
  render as a constant 500, the `cause` stays on the error for `report`.
- Client input never becomes an object key without a check (`PROTO_KEYS`, `Object.hasOwn`), and
  every lookup into client-shaped data goes through `internal/object.ts`.
- Framework code stays in the adapter. Nothing under `packages/jsonapi-core/` imports `hono` or
  another framework; what needs a request, a response, or a framework context lives in
  `packages/hono-jsonapi/` and calls the core (ADR 0013). The host context handlers receive is the
  `TContext` type parameter, never a concrete framework type, in the core.
- The client runs wherever `fetch` does. Nothing under `packages/jsonapi-client/` imports a
  framework, a Node built-in, or `process`; it reads a definition's `type`, `relationships`,
  `links`, and `query`, and never calls its `serialize` or a validator (SPEC 15).

## Repository map

A pnpm workspace: `packages/jsonapi-core` (the framework-free core, published as
`@netvark/jsonapi-core`), `packages/hono-jsonapi` (the Hono adapter, published as
`@netvark/hono-jsonapi`, depends on the core and re-exports it), `packages/jsonapi-client` (the
typed client, published as `@netvark/jsonapi-client`, depends on the core alone), and `e2e/jsonapi/`
(private). Root configs (`vitest.config.ts` with `test.projects`, `tsconfig.base.json`,
`knip.jsonc`, `.oxlintrc.json`, `.oxfmtrc.json`) apply to all of them.

`packages/jsonapi-core/src/`:

- `internal/` constants, prototype-safe object helpers, RFC 6901 pointers, vendored Standard Schema
  types; never exported
- `media-type/` RFC 9110 media type and `Accept` parsing and serialization, the JSON:API media type
  and its `ext` and `profile` parameters
- `negotiate/` the server content negotiation rules as a pure function
- `errors/` the catalog fragment over @netvark/ban-core's built-ins, the `jsonApiBan` instance,
  `jsonApiError` and `errorItem`; every error is a @netvark/ban-core `BanError`
- `document/` document and resource object types, member name rules, resource serialization,
  document builders, full linkage
- `resource/` `defineResource`: the definition everything else reads from; `links.ts` derives links
  from `links.base`; `createDefineResource` configures defaults once
- `query/` `parseQuery`: `include`, `fields`, `sort`, `page`, `filter`, search, custom
- `pagination/` the Cursor Pagination profile: links, meta, errors, `paginatedDocument`
- `request/` request documents: identifiers, resource objects, relationship documents
- `atomic/` the Atomic Operations extension (`@netvark/jsonapi-core/atomic`): `operationsProcessor`,
  `assertOperationsContentType`, `errorAtOperation`, the document parser, lids, executors
- `test-support/` the vendored JSON:API 1.0 JSON Schema and the Ajv conformance helper for the
  repository's own tests; not published

`packages/hono-jsonapi/src/`:

- `index.ts` re-exports `@netvark/jsonapi-core` and adds the Hono integration: `jsonApi()`
  middleware (`middleware.ts`), `respond` (`respond.ts`), `readDocument` (`body.ts`), validators
  (`validators.ts`), `errorHandler` and `notFoundHandler` (`handlers.ts`)
- `atomic/` re-exports `@netvark/jsonapi-core/atomic` and adds `atomicOperations()`, the operations
  endpoint as a Hono handler

`packages/jsonapi-client/src/` (SPEC 15.1):

- `query/` the query types (`types.ts`) and `serializeQuery` (`serialize-query.ts`,
  `serialize-filter.ts`)
- `pagination/cursors.ts` `pageCursors` and `cursorOf`
- `internal/object.ts` prototype-safe reads of response JSON; never exported
- `test-support/blog.ts` the blog's definitions for the package's own tests; not published

`e2e/jsonapi/`: end-to-end suite, a private workspace package that consumes the built
`@netvark/jsonapi-core` and `@netvark/hono-jsonapi` through `workspace:*` and drives a blog API over
real HTTP with `@hono/node-server`; never imports from `src/`. `e2e/jsonapi/smoke/` is the runtime
smoke test (Bun, Deno, workerd).

- `docs/jsonapi/DESIGN.md` what we are building and why; `docs/jsonapi/SPEC.md` the normative
  contract; `docs/jsonapi/adr/` decisions
