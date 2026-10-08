# hono-jsonapi

[JSON:API 1.1](https://jsonapi.org/format/1.1/) for [Hono](https://hono.dev). Declare a resource
once; get typed query parsing, document building with compound documents and sparse fieldsets,
request document validation with JSON Pointers, content negotiation, the
[Cursor Pagination](https://jsonapi.org/profiles/ethanresnick/cursor-pagination/) profile, and the
[Atomic Operations](https://jsonapi.org/ext/atomic/) extension. Every rule is a cited clause of the
specification; where the specification leaves a choice to the server, the choice is written down in
[`docs/SPEC.md`](https://github.com/ali-issa/jsonapi-kit/blob/main/docs/SPEC.md).

This is the Hono adapter of [`jsonapi-kit`](https://www.npmjs.com/package/jsonapi-kit), the
framework-free core. Everything the core exports is re-exported here, so a Hono application imports
from one package; what this package adds is the glue: the `jsonApi()` middleware, validators typed
for `c.req.valid()`, `respond`, `readDocument`, `errorHandler` and `notFoundHandler`, and the
operations endpoint as a handler.

## Install

```bash
pnpm add hono-jsonapi hono
```

Node 22.12+, Bun, Deno, and Cloudflare Workers are supported. CI runs the unit and end-to-end suites
on Node 22 and 24 and a smoke test of both subpaths on Bun, Deno, and workerd. `hono` is the only
peer dependency; validators are accepted through [Standard Schema](https://standardschema.dev) (Zod
4, Valibot, ArkType, and others) without importing any of them.

## Quick start

```ts
import { Hono } from 'hono';
import type { JsonApiEnv } from 'hono-jsonapi';
import {
  JsonApiError,
  defineResource,
  errorHandler,
  jsonApi,
  notFoundHandler,
  queryValidator,
  resourceDocument,
  respond,
} from 'hono-jsonapi';

const Articles = defineResource({
  type: 'articles',
  attributes: ['title', 'body'],
  serialize: (row: ArticleRow) => ({
    id: row.id,
    attributes: { title: row.title, body: row.body },
  }),
  links: { self: (id) => `https://api.example.com/articles/${id}` },
});

const app = new Hono<JsonApiEnv>();
app.use(jsonApi());
app.onError(errorHandler());
app.notFound(notFoundHandler());

app.get('/articles/:id', queryValidator(Articles), async (c) => {
  const row = await articles.find(c.req.param('id'));
  if (row === undefined) {
    throw JsonApiError.notFound(`Article ${c.req.param('id')} does not exist`);
  }
  return respond(c, resourceDocument(Articles, row, { query: c.req.valid('query') }));
});
```

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

### Define resources

The definition is the single source: field names, relationships, links, what the query may ask for,
and how attributes are validated on write. Everything else reads from it, and a mistake in it throws
a `TypeError` at startup rather than a 400 at request time.

```ts
import { z } from 'zod';

const People = defineResource({
  type: 'people',
  attributes: ['name', 'twitter'],
  serialize: (row: PersonRow) => ({
    id: row.id,
    attributes: { name: row.name, twitter: row.twitter },
  }),
  links: { self: (id) => `${BASE}/people/${id}` },
});

const Articles = defineResource({
  type: 'articles',
  attributes: ['title', 'body', 'createdAt'],
  relationships: {
    author: { type: 'people', cardinality: 'one', resource: () => People },
    tags: { type: 'tags', cardinality: 'many', resource: () => Tags },
  },
  serialize: (row: ArticleRow) => ({
    id: row.id,
    attributes: { title: row.title, body: row.body, createdAt: row.createdAt },
    relationships: { author: row.authorId, tags: row.tagIds },
  }),
  links: {
    self: (id) => `${BASE}/articles/${id}`,
    relationship: (id, name) => ({
      self: `${BASE}/articles/${id}/relationships/${name}`,
      related: `${BASE}/articles/${id}/${name}`,
    }),
  },
  query: {
    sort: ['title', 'createdAt'],
    filter: { title: ['eq', 'like'], author: ['eq'] },
    include: ['author', 'author.articles', 'tags'],
    page: { default: 20, max: 100 },
  },
  validate: {
    create: z.object({ title: z.string().min(1), body: z.string().default('') }),
    update: z.object({ title: z.string().min(1).optional(), body: z.string().optional() }),
  },
});
```

`serialize` returns ids for relationships and the package builds the identifier objects with the
declared type; identifier objects pass through for polymorphic relationships. The attribute and
relationship names it may return are the declared ones: a typo is a type error.

### Fetch: include, sparse fieldsets, sort, filter

`queryValidator(Articles)` parses the query string against the definition and stores a `ParsedQuery`
under `c.req.valid('query')`, with `sort` and `filter` typed by the declared names. A request with a
parameter the endpoint cannot process is a 400 that names every offending parameter in
`source.parameter`, as the specification requires. Nothing is dropped silently.

```ts
app.get('/articles', queryValidator(Articles), async (c) => {
  const query = c.req.valid('query');
  // query.sort:   Array<{ field: 'title' | 'createdAt'; direction: 'asc' | 'desc' }>
  // query.filter: { conditions: [{ field: 'title', operator: 'like', value: 'rails' }], anyOf: [] }
  // query.include: [['author'], ['tags']] | undefined
  const rows = await articles.list(query);
  return respond(
    c,
    collectionDocument(Articles, rows, {
      query,
      included: [include(People, await authorsOf(rows)), include(Tags, await tagsOf(rows))],
    }),
  );
});
```

`include(People, rows)` pairs rows with their definition so `included` stays typed. The builder
applies `fields[type]` to primary and included resources, deduplicates by type and id, never repeats
a primary resource in `included`, and throws when an included resource is not reachable from the
primary data through the requested paths: a compound document the specification would reject never
leaves the server.

The filter grammar is the package's choice, since JSON:API leaves it open: `filter[field]=v` is
`eq`, `filter[field][op]=v` a declared operator, and `filter[or][0][field][op]=v` a condition in a
disjunction group. Undeclared fields and operators are 400s.

### Paginate with cursors

`paginatedDocument` implements the Cursor Pagination profile over whatever keyset query your
database layer runs. Links reproduce every parameter the client sent and swap only the cursors; the
profile URI goes on `jsonapi.profile`, and from there onto `Content-Type`.

```ts
app.get('/articles', queryValidator(Articles), async (c) => {
  const query = c.req.valid('query');
  // query.page: { size: 20, after: 'abc', before: undefined, sizeRequested: false, range: false }
  const page = await articles.page(query);
  return respond(
    c,
    paginatedDocument(
      Articles,
      {
        rows: page.rows,
        next: page.nextCursor,
        prev: page.prevCursor,
        total: page.total,
        cursor: (row) => row.cursor,
      },
      { url: c.req.url, query },
    ),
  );
});
```

```http
Content-Type: application/vnd.api+json; profile="http://jsonapi.org/profiles/ethanresnick/cursor-pagination/"

{
  "jsonapi": { "version": "1.1", "profile": ["http://jsonapi.org/profiles/ethanresnick/cursor-pagination/"] },
  "links": {
    "self": "https://api.example.com/articles?sort=-createdAt",
    "first": "https://api.example.com/articles?sort=-createdAt",
    "prev": null,
    "next": "https://api.example.com/articles?sort=-createdAt&page%5Bafter%5D=abc"
  },
  "meta": { "page": { "total": 42 } },
  "data": [{ "type": "articles", "id": "9", "meta": { "page": { "cursor": "abc" } }, ... }]
}
```

`page[size]` above the declared `max`, a range request (`page[after]` with `page[before]`) on an
endpoint that does not allow it, and an unsupported sort field answer with the profile's error
objects and their `type` links. A cursor your decoder rejects is reported with
`invalidCursor('page[after]')`.

### Create, update, delete

`bodyValidator` reads the request document, checks it against the definition (type, client ids,
undeclared fields, relationship cardinality and types), runs the Standard Schema validator over the
attributes, and stores the result under `c.req.valid('json')` with `attributes` typed as the
validator's output. Every problem carries an RFC 6901 pointer: `/data/attributes/title`,
`/data/relationships/author/data/type`.

```ts
import { bodyValidator, toManyLinkage, toOneLinkage } from 'hono-jsonapi';

app.post('/articles', bodyValidator(Articles, { operation: 'create' }), async (c) => {
  const { attributes, relationships } = c.req.valid('json');
  const row = await articles.create({
    title: attributes.title,
    authorId: toOneLinkage(relationships['author'])?.id ?? null,
    tagIds: (toManyLinkage(relationships['tags']) ?? []).map((tag) => tag.id),
  });
  return respond(c, resourceDocument(Articles, row), 201);
});

app.patch('/articles/:id', bodyValidator(Articles, { operation: 'update' }), async (c) => {
  const { attributes } = c.req.valid('json'); // data.id was checked against :id (409 otherwise)
  return respond(
    c,
    resourceDocument(Articles, await articles.update(c.req.param('id'), attributes)),
  );
});
```

A `201` carries a `Location` header equal to the resource's `self` link, as the specification
requires when both are present. Relationship endpoints use `relationshipValidator`, whose stored
value is an identifier or `null` for to-one and an array of identifiers for to-many:

```ts
app.patch(
  '/articles/:id/relationships/author',
  relationshipValidator(Articles, 'author', 'one'),
  async (c) => {
    await articles.setAuthor(c.req.param('id'), c.req.valid('json')?.id ?? null);
    return c.body(null, 204);
  },
);

app.post(
  '/articles/:id/relationships/tags',
  relationshipValidator(Articles, 'tags', 'many'),
  async (c) => {
    await articles.addTags(
      c.req.param('id'),
      c.req.valid('json').map((tag) => tag.id),
    );
    return c.body(null, 204);
  },
);
```

### Errors

`JsonApiError` carries one or more error objects and the status the specification derives from them.
The catalog is closed: each `code` fixes `status` and `title`, while `detail` and `source` vary per
occurrence.

```ts
throw JsonApiError.notFound(`Article ${id} does not exist`);
throw JsonApiError.conflict('The article was modified by another request', { pointer: '/data' });
throw JsonApiError.validationFailed([{ pointer: '/data/attributes/title', detail: 'Required' }]);
throw new JsonApiError([errorObject('FORBIDDEN', { detail: 'Read-only' })], { status: 403 });
```

`errorHandler()` renders anything thrown: a `JsonApiError` as is, Hono's `HTTPException` by status
with the RFC 9110 reason phrase as `title`, and everything else as a constant 500 that reveals
nothing. The thrown value reaches `report` for logging, `cause` included. `notFoundHandler()` gives
unmatched routes the same shape.

```ts
app.onError(
  errorHandler({
    report: (error, c) => logger.error({ error, path: c.req.path }),
    headers: { 'Cache-Control': 'no-store' },
  }),
);
```

### Content negotiation

`jsonApi()` applies the server rules: a JSON:API `Content-Type` with parameters other than `ext` and
`profile`, or with an extension the endpoint does not support, is a 415; an `Accept` whose every
JSON:API instance is unusable is a 406; `Vary: Accept` goes on every JSON:API response. The
negotiation result (`c.get('jsonApi')`) says which extensions the response must apply and which
requested profiles the endpoint supports.

```ts
app.use(
  jsonApi({
    extensions: [ATOMIC_OPERATIONS_EXTENSION],
    profiles: [CURSOR_PAGINATION_PROFILE],
  }),
);
```

`respond` derives the `ext` and `profile` parameters of `Content-Type` from the document's own
`jsonapi` object, so the header and the body cannot disagree.

### Atomic operations

`hono-jsonapi/atomic` implements the extension over handlers you write per resource, typed by the
definition. You own the transaction; the processor runs the operations in order inside it, resolves
`lid` references to the ids earlier operations produced, answers with `atomic:results` in operation
order (or `204` when no operation returned data), and points every error at the operation that
failed. A rejected `run` rolls everything back. The Hono `Context` reaches `transaction` and every
handler as `ctx`, so a handler can read the request, the bindings, or a variable another middleware
set.

```ts
import type { Context } from 'hono';
import type { ResourceHandlers } from 'hono-jsonapi/atomic';
import { atomicOperations } from 'hono-jsonapi/atomic';

const articleHandlers: ResourceHandlers<typeof Articles, Transaction, Context<JsonApiEnv>> = {
  resource: Articles,
  create: ({ data }, { tx }) => tx.articles.insert({ title: data.attributes.title }),
  update: ({ id, data }, { tx }) => tx.articles.update(id, data.attributes),
  remove: ({ id }, { tx }) => tx.articles.delete(id),
  relationships: {
    tags: {
      add: ({ id, data }, { tx }) =>
        tx.articles.addTags(
          id,
          data.map((tag) => tag.id),
        ),
      remove: ({ id, data }, { tx }) =>
        tx.articles.removeTags(
          id,
          data.map((tag) => tag.id),
        ),
      update: ({ id, data }, { tx }) =>
        tx.articles.setTags(
          id,
          data.map((tag) => tag.id),
        ),
    },
  },
};

app.post(
  '/operations',
  atomicOperations({
    resources: [articleHandlers, peopleHandlers],
    transaction: (c, run) => db.transaction().execute(run),
  }),
);
```

A missing handler makes the operation a 403; an unknown type a 404; a structural problem a 400, all
with pointers like `/atomic:operations/1/data/relationships/author/data/lid`; a method other than
`POST` a 405 with `Allow: POST`; a `Content-Type` without the extension a 415.

### The core on its own

Everything that is not a Hono hook comes from `jsonapi-kit` and is re-exported unchanged:
`parseQuery`, `parseCreateDocument`, `parseUpdateDocument`, the relationship document parsers,
`negotiate`, `paginationLinks`, the document builders, and `operationsProcessor` are pure functions
over plain values, usable from a non-Hono handler, a worker, or a client that wants the same checks
before sending. See the [`jsonapi-kit` README](https://www.npmjs.com/package/jsonapi-kit).

## Modules

| Subpath               | What it holds                                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hono-jsonapi`        | All of `jsonapi-kit`, plus `jsonApi()`, `respond`, `respondError`, `readDocument`, `queryValidator`, `bodyValidator`, `relationshipValidator`, `errorHandler`, `notFoundHandler` |
| `hono-jsonapi/atomic` | All of `jsonapi-kit/atomic`, plus `atomicOperations()`                                                                                                                           |

## Documentation

- [`docs/DESIGN.md`](https://github.com/ali-issa/jsonapi-kit/blob/main/docs/DESIGN.md): what the
  packages are, the principles, and the API by example
- [`docs/SPEC.md`](https://github.com/ali-issa/jsonapi-kit/blob/main/docs/SPEC.md): the normative
  contract, section by section, with the tests that prove it
- [`docs/adr/`](https://github.com/ali-issa/jsonapi-kit/tree/main/docs/adr): the decisions,
  including every choice the specification leaves to the server

## License

MIT
