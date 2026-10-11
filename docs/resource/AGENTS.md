# resource family: instructions for coding agents

Read with the root [`AGENTS.md`](../../AGENTS.md), which holds the rules every family shares; this
file adds what is specific to `@netvark/resource-core`, `@netvark/kysely-resource`,
`@netvark/hono-resource`, and the bindings that will join them. Humans: see
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## Ground rules

- Read `docs/resource/DESIGN.md` for intent and `docs/resource/SPEC.md` for the exact contract
  before changing public API. Implement from the SPEC section named in the file header; update the
  SPEC in the same PR when the code must differ. Read the relevant ADR in `docs/resource/adr/`
  before changing a decision it records; add a new ADR instead of silently reversing one.
- Each fact has one authority. Database facts come from the public catalog, never from parsing
  migrations or restating them. Wire behavior comes from JSON:API 1.1; type behavior from the
  PostgreSQL manual, checked by running the SQL; schema behavior from Zod's documentation and source
  for the peer range; keywords and formats from JSON Schema 2020-12, OpenAPI 3.1, and the OpenAPI
  Format Registry; localization from Paraglide JS's documentation, which owns the locale (ADR 0009),
  and `Content-Language` and `Vary` from RFC 9110. Cite the clause next to the decision with an
  `@ref <url>` comment and name it in the test.
- Database names in, derived names out. A declaration takes only database names, and no option may
  take a free-form public name except `as` and `code` (ADR 0003).
- Never restate, never invent. No composed schema carries `.default()`, `.prefault()`, `.catch()`,
  or a transform that adds a member; parsing never returns a key the input did not have (ADR 0004).
- Exact or rejected. A change to a wire form or a rule translation comes with oracle cases run on
  PGlite and on PostgreSQL 14 and 18; PostgreSQL behavior in a test or a comment is captured by
  running the SQL, not typed from memory (ADR 0005, 0006).
- Compile errors first. Every rule TypeScript can check gets a `@ts-expect-error` case next to the
  valid form, and the same rule a runtime `TypeError` test for JavaScript callers. A type-level
  derivation and its runtime twin read one case table.
- Checks cost nothing on the valid path. A type-level check reports a mistake at the offending
  option, as a `Requirement` or a message type (SPEC 3), never by intersecting two different literal
  types, which reduces the declaration to `never`. It builds error types only for an actual mistake:
  guard a mapped type of unknown members (`KnownMembers`), and give invalid keys their own mapped
  type, built only when there is one (`FieldsCheck`). Compute what depends on the catalog alone per
  table, so TypeScript caches it (`TableNameRisk`); name every union of template literal types with
  an alias, since TypeScript 7 instantiates an inline one in a conditional's `extends` clause on
  every evaluation; and leave to the runtime a check whose type costs more than it catches (derived
  codes, SPEC 4.2). A check that changes shape is measured on the real catalogs of SPEC 15.5 with
  `tsc --extendedDiagnostics --checkers 1`.
- Type parameters that take a resource are constrained by `AnyDeclaredResource`, never by the wide
  `DeclaredResource` (SPEC 3): a type argument's constraint check reports errors, and against the
  wide type TypeScript recomputes a failed check of the definer context on every reference. So are
  parameters that take any resource, or a list of them, unless the function reads the wide members:
  each argument is compared with the definer context member by member, which tripled the
  instantiations and check time of a 111-table schema that called `openapi` and `surfaceOf` (SPEC
  15.5).
- The core knows no host. Nothing under `packages/resource-core/` imports Kysely, Hono, React, a
  driver, or a Node.js module; `server/` holds contracts, and adapters implement them (ADR 0008).
  The root and `openapi` entries never import from `server/`.
- Messages are constant. Request data goes into structured fields (`path`, `expected`, items), never
  into `message` or `detail`; declaration names may appear in startup `TypeError`s.
- Lookups are prototype-safe. Derived lookups are `ReadonlyMap`s, and a name that arrives in a
  request is checked against them before it is used as a key.
- The runtime binds the core to Kysely and PostgreSQL and nothing else: `packages/kysely-resource/`
  imports Kysely, never a driver or a Node.js module, so it runs wherever a Kysely dialect does.
  `@netvark/resource-core` and `@netvark/keyset-core` are its peers, since the application hands it
  declarations, behaviors, and the keyset definer made with its own copies (root ADR 0006). Its
  tests run on PGlite through Kysely's PGlite dialect, never on a mocked database, and what only a
  server shows (the isolation level, pooled connections) runs in `e2e/resource` on PostgreSQL 14
  and 18.
- The routes bind the runtime contract to Hono and nothing else: `packages/hono-resource/` imports
  Hono, `@netvark/hono-jsonapi`, and `@netvark/resource-core`, never a runtime, Kysely, or a Node.js
  module, so any runtime of the contract runs behind it, wherever Hono runs (ADR 0013). The three
  are peers, since the application hands the routes values made with its own copies (root ADR 0006):
  never move them to `dependencies`. Its tests drive the routes with `app.request()` over a runtime
  held in memory; a real runtime behind real HTTP runs in `e2e/resource`.

## Repository map

`packages/resource-core/src/` (SPEC 1):

- `declare/` the definer, `declareResource`, the declaration types and their checks
- `catalog/` type-level and runtime lookups into the public catalog
- `names/` derived names and codes, reverse maps, and their type-level twins and checks
- `wire/` and `schema/` the wire forms, exact decimals, value and object schemas, rules, issues, and
  the Standard Schema wrappers
- `codecs/` `defineCodec`, `defineValidator`, `StorageCodecs`
- `meta/`, `errors/`, `messages/` field metadata, codes, `errorCatalog`, messages and localization
- `registry/` the checks every list of resources runs (types, codes, targets) and their type-level
  twin
- `jsonapi/` the `@netvark/jsonapi-core` and `@netvark/keyset-core` definitions
- `server/`, `openapi/`, `testing/` the three other entry points

`packages/kysely-resource/src/` (SPEC 18.1):

- `storage/` `createKyselyStorage`: its options, the transaction protocol, names and casts, `list`,
  and the scope predicate
- `boot/` the boot checks and their report; `runtime/` `createResourceRuntime`, the domain, and the
  lifecycle of each operation; `outbox/` `relayOutbox`

`packages/hono-resource/src/` (SPEC 19.1):

- `routes.ts` `jsonApiRoutes` and its options; `paths.ts` and `methods.ts` where each resource is
  served, and the 405 of any other method
- `actor.ts` the request's actor, resolved once; `context.ts` what every route reads
- `collection.ts` and `member.ts` the routes of each operation

`e2e/resource/`: the end-to-end suite, a private workspace package that consumes the built packages
through `workspace:*` and never imports from `src/`: its fixture migrations and their extracted
catalogs, declarations over them, `fails/` declarations that must not compile, the oracle, the
reference storage adapter that proves the contract suite, and the runtime smoke test.

- `docs/resource/DESIGN.md` what we are building and why; `docs/resource/SPEC.md` the normative
  contract; `docs/resource/adr/` decisions
