# hono-jsonapi: instructions for coding agents

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
  `pnpm check:lint`, then `pnpm test`. Run `pnpm build`, `pnpm check`, and `pnpm test:e2e` before
  declaring done, in that order: the type-aware lint of `e2e/` and the package checks read `dist/`,
  and the e2e suite is the only check that exercises `dist/` and the `exports` map.
  `pnpm test:runtimes` (Bun, Deno, workerd smoke) needs `bun` and `deno` installed; CI runs it.
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
  `.changeset/` (`pnpm changeset`).
- Never mention AI assistance in commits, changesets, or docs.

## Repository map

- `src/internal/` constants, prototype-safe object helpers, RFC 6901 pointers, vendored Standard
  Schema types; never exported
- `src/media-type/` RFC 9110 media type and `Accept` parsing and serialization, the JSON:API media
  type and its `ext` and `profile` parameters
- `src/negotiate/` the server content negotiation rules as a pure function
- `src/errors/` `JsonApiError`, the closed error catalog, the registered status code table
- `src/document/` document and resource object types, member name rules, resource serialization,
  document builders, full linkage
- `src/resource/` `defineResource`: the definition everything else reads from
- `src/query/` `parseQuery`: `include`, `fields`, `sort`, `page`, `filter`, search, custom
- `src/pagination/` the Cursor Pagination profile: links, meta, errors, `paginatedDocument`
- `src/request/` request documents: identifiers, resource objects, relationship documents
- `src/hono/` the Hono integration: `jsonApi()` middleware, `respond`, `readDocument`, validators,
  `errorHandler` and `notFoundHandler`
- `src/atomic/` the Atomic Operations extension (`hono-jsonapi/atomic`)
- `src/test-support/` the vendored JSON:API 1.0 JSON Schema and the Ajv conformance helper for the
  repository's own tests; not published
- `e2e/` end-to-end suite: a private workspace package that consumes the built `hono-jsonapi`
  through `workspace:*` and drives a blog API over real HTTP with `@hono/node-server`; never imports
  from `src/`. `e2e/smoke/` is the runtime smoke test (Bun, Deno, workerd)
- `docs/DESIGN.md` what we are building and why; `docs/SPEC.md` the normative contract; `docs/adr/`
  decisions
