# netvark

TypeScript libraries for HTTP APIs, published under the `@netvark` scope. Each family is a
framework-free core plus bindings for a host (Hono, Kysely), written from the specification or the
manual it implements: every rule is cited where it is implemented and pinned by a test, and every
choice the specification leaves open is written down.

| Family                  | Package                                                   | What it is                                                                                                                                                                                                         |
| ----------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [ban](docs/ban)         | [`@netvark/ban-core`](packages/ban-core#readme)           | Structured HTTP errors: one typed catalog, one handler that turns anything thrown into a well-formed response, and pluggable wire formats (RFC 9457 Problem Details, JSON:API, Google AIP-193, Stripe, yours).     |
|                         | [`@netvark/hono-ban`](packages/hono-ban#readme)           | The [Hono](https://hono.dev) binding: `app.onError()` wiring and `HTTPException` adoption, every core subpath re-exported.                                                                                         |
| [catalog](docs/catalog) | [`@netvark/catalog-core`](packages/catalog-core#readme)   | The PostgreSQL catalog model as TypeScript types: tables, columns, constraints, indexes, row security, enums, and domains, with the browser-safe slice (`toPublicCatalog`) and a structural diff (`diffCatalogs`). |
|                         | [`@netvark/pg-catalog`](packages/pg-catalog#readme)       | The extractor: replays your SQL migrations into PGlite or a throwaway database on a server, reads `pg_catalog`, and writes the catalog as a deterministic `as const` module, checked current in CI.                |
| [jsonapi](docs/jsonapi) | [`@netvark/jsonapi-core`](packages/jsonapi-core#readme)   | [JSON:API 1.1](https://jsonapi.org/format/1.1/): resource definitions, documents, query parsing, request validation, content negotiation, the Cursor Pagination profile, the Atomic Operations extension.          |
|                         | [`@netvark/hono-jsonapi`](packages/hono-jsonapi#readme)   | The Hono binding: negotiation middleware, validators typed for `c.req.valid()`, response helpers, error handlers on `@netvark/hono-ban`, the operations endpoint.                                                  |
| [keyset](docs/keyset)   | [`@netvark/keyset-core`](packages/keyset-core#readme)     | Keyset pagination: a definition of what a collection can sort, filter, and search on, a planner, HMAC-signed cursors bound to the request, page assembly with `prev` and `next`.                                   |
|                         | [`@netvark/kysely-keyset`](packages/kysely-keyset#readme) | The [Kysely](https://kysely.dev) binding for PostgreSQL: a definer checked against your `DB` interface and `paginate` rendered onto your own select query.                                                         |

Every package is ESM only and runs on Node 22.12+, Bun, and Deno. Every package but
`@netvark/pg-catalog`, a build-time tool that reads files and drives PostgreSQL, also runs on
Cloudflare Workers and reads nothing from the environment. The cores have no dependencies apart from
each other (`@netvark/jsonapi-core` is built on `@netvark/ban-core`); a binding has its host as its
only peer dependency, except `@netvark/pg-catalog`, which depends on `pg` and takes PGlite as an
optional peer.

## Install

```bash
pnpm add @netvark/hono-ban hono                       # errors on Hono
pnpm add @netvark/hono-jsonapi hono @netvark/hono-ban  # JSON:API on Hono
pnpm add @netvark/kysely-keyset kysely                 # keyset pagination on Kysely
pnpm add -D @netvark/pg-catalog @electric-sql/pglite   # your PostgreSQL schema as a typed catalog
pnpm add @netvark/ban-core                             # a core on its own: a fetch handler, a worker, another framework
```

## Naming

Package names are predictable, in the manner of `@tanstack/*`:

| Shape                      | Meaning                                            | Examples                                                             |
| -------------------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| `@netvark/<thing>-core`    | the framework-free, database-free core of a family | `@netvark/ban-core`, `@netvark/catalog-core`, `@netvark/keyset-core` |
| `@netvark/<host>-<thing>`  | the binding of a family to a host library          | `@netvark/hono-ban`, `@netvark/kysely-keyset`, `@netvark/pg-catalog` |
| `@netvark/<thing>-<facet>` | a companion of a family that binds to no host      | `@netvark/jsonapi-client` (planned)                                  |

`<thing>` is the family name (`ban`, `catalog`, `jsonapi`, `keyset`), `<host>` the npm name of the
host library (`hono`, `kysely`, `pg`, `drizzle`, `react`). The directory under `packages/` is the
package name without the scope. [ADR 0003](docs/adr/0003-package-naming.md) records the rule; new
packages are tracked as epics in the
[issues](https://github.com/netvark/netvark/issues?q=is%3Aissue+label%3Aepic).

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
