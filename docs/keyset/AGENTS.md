# keyset family: instructions for coding agents

Read with the root [`AGENTS.md`](../../AGENTS.md), which holds the rules every family shares; this
file adds what is specific to `@netvark/keyset-core` (the database-free core) and
`@netvark/kysely-keyset` (the Kysely binding). Humans: see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Ground rules

- Read `docs/keyset/DESIGN.md` for intent and `docs/keyset/SPEC.md` for the exact contract before
  changing public API. Implement from the SPEC section named in the file header; update the SPEC in
  the same PR when the code must differ. Read the relevant ADR in `docs/keyset/adr/` before changing
  a decision it records; add a new ADR instead of silently reversing one.
- Spec-driven, not memory-driven. Every behavior comes from the Cursor Pagination profile
  (https://jsonapi.org/profiles/ethanresnick/cursor-pagination/), the PostgreSQL documentation
  (ordering, pattern matching, arrays, text search, data types), Kysely's documentation, the Web
  Crypto specification, or an RFC (2104 for HMAC, 4648 for base64url, 8785 for canonical JSON).
  Fetch the clause, cite it in the code with an `@ref <url>` comment next to the decision it
  justifies, and name it in the test. Where the profile leaves a choice to the server, the choice is
  written down in `docs/keyset/SPEC.md` and an ADR.
- Every identifier in SQL comes from the definition, validated once in `defineKeyset`; every value
  from a request is a bound parameter. The one literal (the text search configuration) is validated
  against `regconfig`'s name syntax at definition time. Never interpolate request data.
- Error messages are constant. Request data goes into the error's structured fields, never into
  `message`.
- Client input never becomes an object key without a check (`PROTO_KEYS`, `Object.hasOwn`), and
  every lookup into client-shaped data goes through `internal/object.ts` or a `ReadonlyMap`.
- Database code stays in the adapter. Nothing under `packages/keyset-core/` imports `kysely` or a
  driver; what needs a query builder lives in `packages/kysely-keyset/` and renders the plan (ADR
  0004).

## Repository map

A pnpm workspace: `packages/keyset-core` (the database-free core, published as
`@netvark/keyset-core`), `packages/kysely-keyset` (the Kysely adapter, published as
`@netvark/kysely-keyset`, depends on the core and re-exports it), and `e2e/keyset/` (private). Root
configs (`vitest.config.ts` with `test.projects`, `tsconfig.base.json`, `knip.jsonc`,
`.oxlintrc.json`, `.oxfmtrc.json`) apply to all of them.

`packages/keyset-core/src/`:

- `internal/` base64url and UTF-8 over web APIs, Web Crypto (SHA-256, HMAC), prototype-safe object
  helpers, canonical JSON, LIKE escaping; never exported
- `definition/` `defineKeyset`: the field type vocabularies (`field-types.ts`), field and relation
  validation (`normalize-fields.ts`, `normalize-relations.ts`), the definition types (`types.ts`),
  and the definition everything else reads from (`define-keyset.ts`)
- `filter/` the filter tree (`types.ts`), the operator table (`operators.ts`), value checks by type
  (`values.ts`), one condition to one predicate (`condition.ts`), the tree to a predicate
  (`normalize.ts`)
- `sort/` sort resolution with the key appended, and the sort signature cursors bind to
- `plan/` the query plan types (`types.ts`), the planner (`plan.ts`), the seek predicate (`seek.ts`)
- `page/` page request resolution (`page-request.ts`) and page assembly (`finish.ts`)
- `cursor/` the cursor codec: signing, verification, rotation, expiry, context binding
- `errors.ts` the request-time error classes
- `test-support/` the shared definition and helpers for the repository's own tests; not published

`packages/kysely-keyset/src/`:

- `index.ts` re-exports `@netvark/keyset-core` and adds the adapter
- `define-keyset.ts` `createDefineKeyset<DB>()`: a `defineKeyset` that checks names against the
  Kysely `DB` interface and whose keysets carry `paginate`
- `paginate.ts` the plan rendered onto the caller's select query: filter, total, seek, key
  selections, ordering, limit; rows split from the private aliases
- `render/` `renderTarget` (columns, correlated aggregates, `concat_ws`) and `renderPredicate`
  (every predicate kind as a Kysely expression)
- `test-support/` a compile-only Kysely and a canned-rows driver for the unit tests; not published

`e2e/keyset/`: end-to-end suite, a private workspace package that consumes the built
`@netvark/keyset-core` and `@netvark/kysely-keyset` through `workspace:*`; never imports from
`src/`. `e2e/keyset/support/` holds the schema and seed (`schema.ts`, `seed.ts`), the harnesses
(`db.ts`: PGlite, node-postgres over pglite-socket, a PostgreSQL server), the keysets under test
(`keysets.ts`), and the invariants every harness must satisfy (`invariants.ts`). `e2e/keyset/smoke/`
is the runtime smoke test (Bun, Deno, workerd).

- `docs/keyset/DESIGN.md` what we are building and why; `docs/keyset/SPEC.md` the normative
  contract; `docs/keyset/adr/` decisions
