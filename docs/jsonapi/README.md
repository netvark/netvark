# jsonapi: JSON:API 1.1 for JavaScript

[JSON:API 1.1](https://jsonapi.org/format/1.1/) for JavaScript, as three packages:

| Package                                                    | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@netvark/jsonapi-core`](../../packages/jsonapi-core)     | The framework-free core: resource definitions, document building, typed query parsing, request document validation, content negotiation, the [Cursor Pagination](https://jsonapi.org/profiles/ethanresnick/cursor-pagination/) profile, and the [Atomic Operations](https://jsonapi.org/ext/atomic/) extension. Functions over plain values; runs on Node, Bun, Deno, and Cloudflare Workers; errors are [@netvark/ban-core](https://github.com/netvark/netvark) errors, its one dependency. |
| [`@netvark/hono-jsonapi`](../../packages/hono-jsonapi)     | The [Hono](https://hono.dev) adapter: content negotiation middleware, validators typed for `c.req.valid()`, response helpers, error handlers on [@netvark/hono-ban](https://github.com/netvark/netvark), and the operations endpoint as a handler. Re-exports the core in full, so a Hono application imports from one package.                                                                                                                                                              |
| [`@netvark/jsonapi-client`](../../packages/jsonapi-client) | A typed client of a server built on the core: queries typed by the definitions the server is built from and serialized as `parseQuery` reads them, with nothing generated. Web standards only, so it runs in browsers, workers, Node, Bun, and Deno; `@netvark/jsonapi-core` is its one dependency.                                                                                                                                                                                          |

Declare a resource once; everything else reads from the definition. Every rule is a cited clause of
the specification; where the specification leaves a choice to the server, the choice is written down
in [`docs/jsonapi/SPEC.md`](SPEC.md).

## Install

```bash
pnpm add @netvark/hono-jsonapi hono @netvark/hono-ban   # Hono applications (pulls in @netvark/jsonapi-core and @netvark/ban-core)
pnpm add @netvark/jsonapi-core                  # anything else: a fetch handler, another framework
pnpm add @netvark/jsonapi-client                # a client of a server built on either
```

Node 22.12+, Bun, Deno, and Cloudflare Workers are supported. CI runs the unit and end-to-end suites
on Node 22 and 24 and a smoke test of both packages on Bun, Deno, and workerd. Validators are
accepted through [Standard Schema](https://standardschema.dev) (Zod 4, Valibot, ArkType, and others)
without importing any of them.

## Quick start with Hono

```ts
import type { JsonApiEnv } from '@netvark/hono-jsonapi';

import { Hono } from 'hono';

import {
  defineResource,
  errorHandler,
  jsonApi,
  jsonApiError,
  notFoundHandler,
  queryValidator,
  resourceDocument,
  respond,
} from '@netvark/hono-jsonapi';

const Articles = defineResource({
  type: 'articles',
  attributes: ['title', 'body'],
  serialize: (row: ArticleRow) => ({
    id: row.id,
    attributes: { title: row.title, body: row.body },
  }),
  links: { base: 'https://api.example.com' },
});

const app = new Hono<JsonApiEnv>();
app.use(jsonApi());
app.onError(errorHandler());
app.notFound(notFoundHandler());

app.get('/articles/:id', queryValidator(Articles), async (c) => {
  const row = await articles.find(c.req.param('id'));
  if (row === undefined) {
    throw jsonApiError('NOT_FOUND', { detail: 'The article does not exist' });
  }
  return respond(c, resourceDocument(Articles, row, { query: c.req.valid('query') }));
});
```

## Quick start anywhere else

The core is the same library without the framework glue: you read the headers and the body, it
parses, checks, and builds; you send the document it hands back.

```ts
import {
  JSON_API_MEDIA_TYPE,
  errorDocument,
  formatJsonApiMediaType,
  isBanError,
  jsonApiError,
  negotiate,
  parseQuery,
  resourceDocument,
} from '@netvark/jsonapi-core';

function send(document: object, status = 200, contentType = JSON_API_MEDIA_TYPE): Response {
  return Response.json(document, {
    status,
    headers: { 'Content-Type': contentType, Vary: 'Accept' },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const negotiation = negotiate({
      contentType: request.headers.get('Content-Type') ?? undefined,
      accept: request.headers.get('Accept') ?? undefined,
    });
    if (!negotiation.ok) {
      return send(errorDocument(negotiation.error), negotiation.error.status);
    }
    try {
      const url = new URL(request.url);
      const id = url.pathname.slice('/articles/'.length);
      const query = parseQuery(Articles, url.search.slice(1));
      const row = await articles.find(id);
      if (row === undefined) {
        throw jsonApiError('NOT_FOUND', { detail: 'The article does not exist' });
      }
      const document = resourceDocument(Articles, row, { query });
      return send(document, 200, formatJsonApiMediaType({ profile: document.jsonapi?.profile }));
    } catch (error) {
      if (isBanError(error)) {
        return send(errorDocument(error), error.status);
      }
      throw error;
    }
  },
};
```

Both quick starts answer the same way:

```http
HTTP/1.1 200 OK
Content-Type: application/vnd.api+json
Vary: Accept

{
  "jsonapi": { "version": "1.1" },
  "data": {
    "type": "articles",
    "id": "1",
    "attributes": { "title": "JSON:API paints my bikeshed!", "body": "..." },
    "links": { "self": "https://api.example.com/articles/1" }
  }
}
```

A request with `?fields[articles]=title` gets only `title`; `?sort=title` or `?bogus=1` gets a 400
listing every parameter the endpoint does not support, because the definition declared none.

## What you get

- **One definition per resource type.** `defineResource` fixes the type, attribute and relationship
  names, links, what the query may ask for, and the Standard Schema validators for writes. Parsers,
  builders, and validators all read from it; a mistake in it is a `TypeError` at startup. Links
  derive from a `base` by the recommended URL design, stated once for every resource.
- **Documents the specification accepts.** Sparse fieldsets, compound documents with full linkage
  and no orphans, string ids, and pagination links that reproduce the client's query.
- **Parsers that reject what the specification rejects.** Every problem reported at once, located by
  a JSON Pointer, a parameter name, or a header name; nothing dropped silently.
- **Content negotiation, cursor pagination, atomic operations**, each implemented from its text.
- **Hostile input handled.** Member names, parameter names, and `lid` values never become prototype
  keys; server internals never reach a response.
- **One error model.** Every error is a [@netvark/ban-core](https://github.com/netvark/netvark)
  error from a closed catalog, and the Hono handler is @netvark/hono-ban's: an error id in the
  header and the body, a report hook, and one handler for this library's errors, the application's
  own catalog, and any other library on @netvark/ban-core.

The package READMEs walk through each area:
[`@netvark/jsonapi-core`](../../packages/jsonapi-core/README.md) for the core API,
[`@netvark/hono-jsonapi`](../../packages/hono-jsonapi/README.md) for the Hono routes, validators,
handlers, and the operations endpoint, and
[`@netvark/jsonapi-client`](../../packages/jsonapi-client/README.md) for the typed client.

## Documentation

- [`docs/jsonapi/DESIGN.md`](DESIGN.md): what the packages are, the principles, and the API by
  example
- [`docs/jsonapi/SPEC.md`](SPEC.md): the normative contract, section by section, with the tests that
  prove it
- [`docs/jsonapi/adr/`](adr): the decisions, including every choice the specification leaves to the
  server
- [`CONTRIBUTING.md`](CONTRIBUTING.md): the family's contribution guide; setup, gates, and releases
  are in the root [`CONTRIBUTING.md`](../../CONTRIBUTING.md)

## Why

JSON:API is precise about documents, query parameters, media types, and status codes, and most
servers get a dozen of those clauses wrong in ways clients only discover in production: unknown
parameters silently ignored, `self` links that drop the client's query, compound documents with
orphaned resources, ids that are sometimes numbers, 406s sent as `application/json`.
@netvark/jsonapi-core takes the position that the definition is the contract and the specification
is the test plan: every clause is cited where it is implemented and pinned by a test, every document
a builder produces is validated against the JSON:API JSON Schema in the test suite, and the e2e
suite drives the published packages over real HTTP on Node, Bun, Deno, and workerd.

## License

MIT
