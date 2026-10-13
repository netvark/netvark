# netvark

TypeScript libraries for HTTP APIs and the applications built on them, published under the
`@netvark` scope. Each family is a framework-free core plus bindings for a host (Hono, Kysely),
written from the specification or the manual it implements: every rule is cited where it is
implemented and pinned by a test, and every choice the specification leaves open is written down.

| Family                    | Package                                                       | What it is                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ban](docs/ban)           | [`@netvark/ban-core`](packages/ban-core#readme)               | Structured HTTP errors: one typed catalog, one handler that turns anything thrown into a well-formed response, and pluggable wire formats (RFC 9457 Problem Details, JSON:API, Google AIP-193, Stripe, yours).                                                                                              |
|                           | [`@netvark/hono-ban`](packages/hono-ban#readme)               | The [Hono](https://hono.dev) binding: `app.onError()` wiring and `HTTPException` adoption, every core subpath re-exported.                                                                                                                                                                                  |
| [catalog](docs/catalog)   | [`@netvark/catalog-core`](packages/catalog-core#readme)       | The PostgreSQL catalog model as TypeScript types: tables, columns, constraints, indexes, row security, enums, and domains, with the browser-safe slice (`toPublicCatalog`) and a structural diff (`diffCatalogs`).                                                                                          |
|                           | [`@netvark/pg-catalog`](packages/pg-catalog#readme)           | The extractor: replays your SQL migrations into PGlite or a throwaway database on a server, reads `pg_catalog`, and writes the catalog as a deterministic `as const` module, checked current in CI.                                                                                                         |
| [intl](docs/intl)         | [`@netvark/intl-core`](packages/intl-core#readme)             | Formatters that read the locale and the reader's time zone on every call, through cached `Intl` objects built for formatting tags that name their calendar and digits, so a server render and its hydration agree; the reader's time zone from a cookie; Unicode bidi isolation. In development.            |
|                           | [`@netvark/paraglide-intl`](packages/paraglide-intl#readme)   | The [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) compile step, run once or on every change, with every interpolated value isolated and every message that formats a value refused. In development.                                                                              |
| [jsonapi](docs/jsonapi)   | [`@netvark/jsonapi-core`](packages/jsonapi-core#readme)       | [JSON:API 1.1](https://jsonapi.org/format/1.1/): resource definitions, documents, query parsing, request validation, content negotiation, the Cursor Pagination profile, the Atomic Operations extension.                                                                                                   |
|                           | [`@netvark/hono-jsonapi`](packages/hono-jsonapi#readme)       | The Hono binding: negotiation middleware, validators typed for `c.req.valid()`, response helpers, error handlers on `@netvark/hono-ban`, the operations endpoint.                                                                                                                                           |
|                           | [`@netvark/jsonapi-client`](packages/jsonapi-client#readme)   | A typed client for those servers: calls, queries, and records typed by the definitions the server is built from, with nothing generated; runs wherever `fetch` does.                                                                                                                                        |
| [keyset](docs/keyset)     | [`@netvark/keyset-core`](packages/keyset-core#readme)         | Keyset pagination: a definition of what a collection can sort, filter, and search on, a planner, HMAC-signed cursors bound to the request, page assembly with `prev` and `next`.                                                                                                                            |
|                           | [`@netvark/kysely-keyset`](packages/kysely-keyset#readme)     | The [Kysely](https://kysely.dev) binding for PostgreSQL: a definer checked against your `DB` interface and `paginate` rendered onto your own select query.                                                                                                                                                  |
|                           | [`@netvark/drizzle-keyset`](packages/drizzle-keyset#readme)   | The [Drizzle](https://orm.drizzle.team) binding for PostgreSQL: a definer checked against your Drizzle schema, in the types and at startup, and `paginate` building the select over your table.                                                                                                             |
| [resource](docs/resource) | [`@netvark/resource-core`](packages/resource-core#readme)     | One declaration per PostgreSQL table, keyed by its database names and typed by the public catalog, so a wrong name fails `tsc` at the option that holds it. In development: names, schemas, error codes, messages, and OpenAPI follow.                                                                      |
|                           | [`@netvark/kysely-resource`](packages/kysely-resource#readme) | The Kysely runtime on PostgreSQL: every operation in one transaction scoped to the actor's tenant, for row security policies and its own scope predicate alike. In development.                                                                                                                             |
|                           | [`@netvark/hono-resource`](packages/hono-resource#readme)     | The Hono routes: every operation a runtime runs, each relationship's links, the Atomic Operations endpoint, and the OpenAPI document, served where the declarations' links point, with JSON:API negotiation, validation, includes, localized errors, and the request's actor resolved once. In development. |
|                           | [`@netvark/resource-ui`](packages/resource-ui#readme)         | Forms and lists from those declarations, for any framework: labels and options from your messages, validation in the server's words, the write a form sends, refusals on their fields, and list state as TanStack Table v9 holds it. In development.                                                        |
|                           | [`@netvark/react-resource`](packages/react-resource#readme)   | TanStack Form and TanStack Query bindings for React over those forms and the client's calls. In development.                                                                                                                                                                                                |

Every package is ESM only and runs on Node 22.12+, Bun, and Deno. Every package but
`@netvark/pg-catalog`, a build-time tool that reads files and drives PostgreSQL, and
`@netvark/paraglide-intl`, a build-time tool that compiles messages, also runs on Cloudflare Workers
and reads nothing from the environment. The cores have no dependencies apart from each other
(`@netvark/jsonapi-core` is built on `@netvark/ban-core`, and `@netvark/resource-core` on the
catalog, jsonapi, and keyset cores). `@netvark/jsonapi-client` depends on `@netvark/jsonapi-core`
alone and also runs in browsers, as do `@netvark/intl-core` and `@netvark/resource-ui`. A binding
takes its host as a peer dependency, and also each `@netvark` package whose values the application
hands it
([ADR 0006](docs/adr/0006-a-binding-takes-the-packages-the-application-hands-it-values-from-as-peers.md)):
`@netvark/hono-jsonapi` takes `@netvark/hono-ban`, `@netvark/kysely-resource` takes
`@netvark/resource-core` and `@netvark/keyset-core`, `@netvark/hono-resource` takes
`@netvark/hono-jsonapi` and `@netvark/resource-core`, `@netvark/resource-ui` takes
`@netvark/resource-core` and `@netvark/jsonapi-client`, and `@netvark/react-resource` takes those
and `@netvark/resource-ui`. `@netvark/pg-catalog` depends on `pg` and takes PGlite and
`@netvark/resource-core` as optional peers. `@netvark/paraglide-intl` takes `@inlang/paraglide-js`
and loads projects with the inlang SDK that Paraglide itself depends on
([ADR 0009](docs/adr/0009-a-binding-makes-what-it-hands-its-host-with-the-hosts-own-dependency.md)).
A peer range on a package outside the workspace starts past that package's published advisories, so
an affected release in your application is an unmet peer dependency, and CI runs the binding's tests
on the range's floor
([ADR 0007](docs/adr/0007-a-peer-range-starts-past-published-advisories-and-ci-tests-its-floor.md)).

## Install

```bash
pnpm add @netvark/hono-ban hono                                # errors on Hono
pnpm add @netvark/hono-jsonapi hono @netvark/hono-ban          # JSON:API on Hono
pnpm add @netvark/jsonapi-client                               # a typed client of a JSON:API server
pnpm add @netvark/kysely-keyset kysely                         # keyset pagination on Kysely
pnpm add @netvark/drizzle-keyset drizzle-orm                   # keyset pagination on Drizzle
pnpm add -D @netvark/pg-catalog @electric-sql/pglite           # your PostgreSQL schema as a typed catalog
pnpm add @netvark/resource-core                                # resources declared over that catalog
pnpm add @netvark/kysely-resource @netvark/keyset-core kysely  # those resources run on PostgreSQL through Kysely
pnpm add @netvark/hono-resource @netvark/hono-jsonapi hono     # and served on Hono
pnpm add @netvark/resource-ui @netvark/jsonapi-client          # and their forms and lists, in any framework
pnpm add @netvark/react-resource                               # bound to TanStack Form and Query in React
pnpm add @netvark/intl-core                                    # formatting and time zones for Paraglide apps
pnpm add -D @netvark/paraglide-intl @inlang/paraglide-js       # Paraglide's compile, values isolated
pnpm add @netvark/ban-core                                     # a core on its own: a fetch handler, a worker, another framework
```

## Naming

Package names are predictable, in the manner of `@tanstack/*`:

| Shape                      | Meaning                                            | Examples                                                             |
| -------------------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| `@netvark/<thing>-core`    | the framework-free, database-free core of a family | `@netvark/ban-core`, `@netvark/catalog-core`, `@netvark/keyset-core` |
| `@netvark/<host>-<thing>`  | the binding of a family to a host library          | `@netvark/hono-ban`, `@netvark/kysely-keyset`, `@netvark/pg-catalog` |
| `@netvark/<thing>-<facet>` | a companion of a family that binds to no host      | `@netvark/jsonapi-client`                                            |

`<thing>` is the family name (`ban`, `catalog`, `intl`, `jsonapi`, `keyset`), `<host>` the npm name
of the host library (`hono`, `kysely`, `pg`, `drizzle`, `react`, `paraglide`), or the library's own
name where it is published as a framework-free core plus framework adapters (`tanstack-query`,
`tanstack-form`,
[ADR 0010](docs/adr/0010-a-binding-to-a-library-with-a-framework-free-core-binds-the-core.md)). The
directory under `packages/` is the package name without the scope.
[ADR 0003](docs/adr/0003-package-naming.md) records the rule; new packages are tracked as epics in
the [issues](https://github.com/netvark/netvark/issues?q=is%3Aissue+label%3Aepic).

## Repository

A pnpm workspace ([ADR 0002](docs/adr/0002-one-repository-for-every-package.md)):

- `packages/<name>`: one directory per published package
- `e2e/<family>`: a private package per family that consumes the built packages over real HTTP or a
  real database, plus the Bun, Deno, and workerd smoke test
- `docs/<family>`: the family's `README.md`, `DESIGN.md` (intent), `SPEC.md` (the normative
  contract), `adr/` (decisions), `CONTRIBUTING.md` and `AGENTS.md` (family-specific rules)
- `docs/adr`: decisions about the repository itself

[`CONTRIBUTING.md`](CONTRIBUTING.md) covers setup, the quality gates, and releases;
[`SECURITY.md`](SECURITY.md) how to report a vulnerability.

## License

[MIT](LICENSE)
