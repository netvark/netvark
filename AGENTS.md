# ban-kit and hono-ban: instructions for coding agents

This file is read by AI coding agents working in this repository. Humans: see `CONTRIBUTING.md`.

## Ground rules

- Read `docs/DESIGN.md` for intent and `docs/SPEC.md` for the exact contract before changing public
  API. Implement from the SPEC section named in the file header; update the SPEC in the same PR when
  the code must differ. Read the relevant ADR in `docs/adr/` before changing a decision it records;
  add a new ADR instead of silently reversing one.
- Doc-driven, not memory-driven. Before using any external API (Hono, Zod, Standard Schema, OpenAPI,
  npm packaging, RFC 9457, JSON:API), fetch the canonical document and cite it in the code with an
  `@ref <url>` comment next to the decision it justifies.
- Run the gates after every meaningful change, not at the end: `pnpm check:types`,
  `pnpm check:lint`, then `pnpm test`. Run `pnpm build`, `pnpm check`, and `pnpm test:e2e` before
  declaring done, in that order: the type-aware lint of `e2e/` and the package checks read `dist/`,
  and the e2e suite is the only check that exercises `dist/` and the `exports` map.
  `pnpm test:runtimes` (Bun, Deno, workerd smoke) needs `bun` and `deno` installed; CI runs it.
- Adding a wire format, a validator hook, or an observability module: follow "Adding a format or
  adapter" in `CONTRIBUTING.md`, which lists the acceptance policy and every file to touch.
- Tests are colocated (`x.test.ts`, `x.test-d.ts`) and cover behavior, not implementation. Coverage
  thresholds are enforced; do not lower them.
- The error handler never throws and never reveals server internals by default. Any change to
  `packages/ban-kit/src/handler/` must keep the single-invocation and constant-500-detail tests
  green.
- `packages/ban-kit` imports nothing from Hono, not even types; anything that needs a Hono type
  belongs in `packages/hono-ban`, which imports `ban-kit` by package name (resolved to the core's
  `src/` in-repo through the `source` export condition).
- No `process.env` at module scope, no Node-only APIs in either `src/` (web standards only), no
  enums or parameter properties (`erasableSyntaxOnly`), no `any`, no `T[]`, no emojis.
- Commit subjects use conventional commits. Every user-visible change needs a changeset in
  `.changeset/` (`pnpm changeset`) naming the package it changes.
- Never mention AI assistance in commits, changesets, or docs.

## Repository map

- `packages/ban-kit/src/core/` error class, error items, status codes, definitions catalog,
  factories, `createBan`
- `packages/ban-kit/src/formats/` wire formats (RFC 9457, JSON:API, plain, Google API, Stripe) and
  `defineFormat`
- `packages/ban-kit/src/headers/` `bearerChallenge()`, the RFC 6750 `WWW-Authenticate` builder
- `packages/ban-kit/src/handler/` the framework-free handler, `fromRequest`, and error mapping
- `packages/ban-kit/src/validation/` validation-issue normalization and validator hooks
- `packages/ban-kit/src/openapi/` response schema helpers
- `packages/ban-kit/src/observability/` the OpenTelemetry trace id adapter
- `packages/ban-kit/src/postgresql/` the Postgres SQLSTATE mapper (`ban-kit/postgresql`)
- `packages/ban-kit/src/testing/` consumer test helpers and format conformance
- `packages/ban-kit/src/internal/` helpers that are never exported
- `packages/ban-kit/src/test-support/` helpers for the repository's own tests (Ajv compiler, handler
  dispatch); not published
- `packages/hono-ban/src/` the Hono adapter: `createBan` with `onError`, `HTTPException` adoption,
  one-line re-exports of every core subpath, and the tests that need Hono or its middleware
- `e2e/` end-to-end suite: a private workspace package that consumes the built `ban-kit` and
  `hono-ban` through `workspace:*` and drives them over real HTTP with `@hono/node-server`; never
  imports from `src/`. `e2e/smoke/` is the runtime smoke test (Bun, Deno, workerd)
- `docs/DESIGN.md` what we are building and why; `docs/SPEC.md` the normative contract; `docs/adr/`
  decisions
