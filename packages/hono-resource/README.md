# @netvark/hono-resource

[Hono](https://hono.dev) routes for a runtime of
[`@netvark/resource-core`](https://github.com/netvark/netvark/tree/main/packages/resource-core)
declarations. `jsonApiRoutes` serves every declared operation at the path its JSON:API links name,
with no handler written per resource:
[`@netvark/hono-jsonapi`](https://github.com/netvark/netvark/tree/main/packages/hono-jsonapi)
negotiates, validates, and builds documents, the runtime authorizes and runs, and your error handler
renders every error. Every choice is written down in
[`docs/resource/SPEC.md`](https://github.com/netvark/netvark/blob/main/docs/resource/SPEC.md),
section 19, and the decisions behind it in
[ADR 0013](https://github.com/netvark/netvark/blob/main/docs/resource/adr/0013-hosts-take-the-runtime-contract-and-mount-where-the-links-point.md).

Status: in development and unreleased. The collection and resource routes, includes, and the 405 of
every other method are served. The relationship routes, the Atomic Operations endpoint, the OpenAPI
document's route, and `resourceTypeOf` for localized errors follow in the 0.x line.

## Install

```bash
pnpm add @netvark/hono-resource @netvark/hono-jsonapi @netvark/hono-ban @netvark/resource-core hono zod
```

`hono >= 4.12.34`, `@netvark/hono-jsonapi`, and `@netvark/resource-core` are peer dependencies: your
application declares the resources and mounts `jsonApi()` with its own copies, and the routes must
work with those same copies
([ADR 0006](https://github.com/netvark/netvark/blob/main/docs/adr/0006-a-binding-takes-the-packages-the-application-hands-it-values-from-as-peers.md)).
The routes import no runtime: any runtime of the contract runs behind them, such as
[`@netvark/kysely-resource`](https://github.com/netvark/netvark/tree/main/packages/kysely-resource)'s.
They run wherever Hono runs: Node 22.12+, Bun, Deno, and Cloudflare Workers.

## Quick start

Link the declarations under the base you serve them at, once, in the definer:

```ts
// src/resources/declare-resource.ts
export const declareResource = createDeclareResource({
  catalog: publicCatalog,
  codecs,
  scopes: { organization: { column: 'organization_id' } },
  links: { base: '/api' },
});
```

Then mount the routes of the runtime at `/`, behind `jsonApi()` and your error handlers:

```ts
// src/server/app.ts
import type { JsonApiVariables } from '@netvark/hono-jsonapi';

import { Hono } from 'hono';

import {
  CURSOR_PAGINATION_PROFILE,
  errorHandler,
  jsonApi,
  notFoundHandler,
} from '@netvark/hono-jsonapi';
import { jsonApiRoutes } from '@netvark/hono-resource';

import { runtime } from './runtime'; // what createResourceRuntime resolved to
import { sessionActor } from './session';

export interface AppEnv {
  readonly Variables: JsonApiVariables;
}

export const app = new Hono<AppEnv>();
app.use(jsonApi({ profiles: [CURSOR_PAGINATION_PROFILE] }));
app.onError(errorHandler());
app.notFound(notFoundHandler());
app.route('/', jsonApiRoutes({ runtime, actor: sessionActor }));
```

```ts
// src/server/session.ts
import type { Context } from 'hono';

import type { AppEnv } from './app';

import { jsonApiError } from '@netvark/hono-jsonapi';

export async function sessionActor(c: Context<AppEnv>): Promise<AppActor> {
  const session = await sessions.verify(c.req.header('Authorization'));
  if (session === undefined) {
    throw jsonApiError('UNAUTHORIZED', { detail: 'The request carries no valid session' });
  }
  return { id: session.userId, organization: session.organization, can: session.can };
}
```

## Routes

Each route exists only when the declaration declares its operation:

| Route                      | Runs                                                      | Answers                                                    |
| -------------------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| `GET /api/contacts`        | `list(keysetRequest(Contacts, query))`, then each include | 200, the page with the Cursor Pagination links and meta    |
| `POST /api/contacts`       | `create(document)`                                        | 201, the resource document, with `Location` from its links |
| `GET /api/contacts/:id`    | `get(id)`, then each include                              | 200, the resource document with `included`                 |
| `PATCH /api/contacts/:id`  | `update(id, document)`                                    | 200, the resource document                                 |
| `DELETE /api/contacts/:id` | `remove(id)`                                              | 204                                                        |

- **The paths are the links'.** `resourcePaths` reads them from each resource's JSON:API links, the
  function the OpenAPI document reads, so the routes, the links, and the document name the same
  URLs. A type outside ASCII is served at the percent-encoded path its links spell.
- **Every other method answers 405** with an `Allow` header listing the path's methods, `HEAD`
  beside `GET`, since Hono answers `HEAD` with the `GET` route.
- **The query and the document are validated before the runtime runs**: an undeclared sort is a 400,
  a member the operation does not write a 403 at its pointer, an update whose `id` is not the path's
  a 409.
- **Includes run through the resource's `include`**, so its policy for the relationship decides, and
  the rows join `included` once each.
- **What the runtime throws is the response**, such as `NOT_FOUND` for a row the actor does not see.

`jsonApiRoutes` throws `TypeError` before it serves anything when an option is wrong, when the
runtime runs no resource, when a resource's links give no paths, when the links have different
origins or bases, when two resources name one path, or when an includable relationship's target is
not among the runtime's resources.

## Best practices

**Mount at `/` and keep the prefix in `links.base`.** `app.route('/api', routes)` would serve the
routes at `/api/api/...` while the links and the document still name `/api/...`. The definer's
`links.base` is the one place the prefix lives.

**Resolve the actor from the request's credentials alone.** `actor` runs once per request, before
the query or the document is read, so a client without a session gets your `UNAUTHORIZED` and learns
nothing about the resource from a 400. Throw the catalog's error, never return a guest actor you did
not mean to have, and leave the body to the validators. A 405 answers without the actor: the OpenAPI
document lists every path's methods to anyone.

**Type the actor with your `Env`.** Pass a function whose parameter is `Context<AppEnv>`, such as
`sessionActor` above, and the routes are a `Hono<AppEnv>`; an inline arrow with an untyped `c` gets
Hono's default `Env`.

**Leave authorization to the runtime.** The routes check no permission: the runtime's policies
decide every operation and every include, for HTTP and for workers alike.

**Put `jsonApi()` first, and CORS before it.** `jsonApi()` negotiates every request (415 and 406)
before a route runs. A browser's preflight `OPTIONS` would otherwise reach the 405, so mount
`hono/cors` before both when browsers call the API from another origin.

**Serve one runtime with one set of routes.** Its resources must share the links' origin and base;
mounting a second `jsonApiRoutes` of the same runtime would register every route twice.

## Documentation

- [SPEC section 19](https://github.com/netvark/netvark/blob/main/docs/resource/SPEC.md): the routes'
  contract, and section 12.10 the runtime contract they take
- [DESIGN](https://github.com/netvark/netvark/blob/main/docs/resource/DESIGN.md): what the resource
  family builds and why
- [ADR 0013](https://github.com/netvark/netvark/blob/main/docs/resource/adr/0013-hosts-take-the-runtime-contract-and-mount-where-the-links-point.md):
  the routes' decisions

## License

[MIT](./LICENSE)
