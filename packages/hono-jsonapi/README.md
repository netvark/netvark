# @netvark/hono-jsonapi

[JSON:API 1.1](https://jsonapi.org/format/1.1/) for [Hono](https://hono.dev). Declare a resource
once; get typed query parsing, document building with compound documents and sparse fieldsets,
request document validation with JSON Pointers, content negotiation, the
[Cursor Pagination](https://jsonapi.org/profiles/ethanresnick/cursor-pagination/) profile, and the
[Atomic Operations](https://jsonapi.org/ext/atomic/) extension. Every rule is a cited clause of the
specification; where the specification leaves a choice to the server, the choice is written down in
[`docs/jsonapi/SPEC.md`](https://github.com/netvark/netvark/blob/main/docs/jsonapi/SPEC.md).

This is the Hono adapter of [`@netvark/jsonapi-core`](https://www.npmjs.com/package/jsonapi-kit),
the framework-free core. Everything the core exports is re-exported here, so a Hono application
imports from one package; what this package adds is the glue: the `jsonApi()` middleware, validators
typed for `c.req.valid()`, `respond`, `readDocument`, `errorHandler` and `notFoundHandler`, and the
operations endpoint as a handler.

## Install

```bash
pnpm add @netvark/hono-jsonapi hono @netvark/hono-ban
```

Node 22.12+, Bun, Deno, and Cloudflare Workers are supported. CI runs the unit and end-to-end suites
on Node 22 and 24 and a smoke test of both subpaths on Bun, Deno, and workerd. `hono` and
[`@netvark/hono-ban`](https://github.com/netvark/netvark) are the peer dependencies: every error is
a @netvark/ban-core error and `errorHandler()` is a @netvark/hono-ban handler (see Errors).
Validators are accepted through [Standard Schema](https://standardschema.dev) (Zod 4, Valibot,
ArkType, and others) without importing any of them.

## Quick start

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
    throw jsonApiError('NOT_FOUND', { detail: `Article ${c.req.param('id')} does not exist` });
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

// resources/define.ts: the one place the application states its link base.
export const defineResource = createDefineResource({ links: { base: '/api/v1' } });

const People = defineResource({
  type: 'people',
  attributes: ['name', 'twitter'],
  serialize: (row: PersonRow) => ({
    id: row.id,
    attributes: { name: row.name, twitter: row.twitter },
  }),
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

### Links

`links: { base }` derives every link from the type by the URL design the
[specification recommends](https://jsonapi.org/recommendations/#urls): `self` is
`/api/v1/articles/1`, and each relationship gets `self: /api/v1/articles/1/relationships/author` and
`related: /api/v1/articles/1/author`. Ids and names are percent-encoded. `respond` takes the 201
`Location` from `self`. A link is a URI-reference, so a root-relative base is valid and stays
correct behind any host or proxy; use an absolute base only when clients are on another origin.

Best practices:

- **State the base once.** Export a configured definer from one module and define every resource
  with it. The raw `defineResource` from the package derives nothing, so a file that imports it by
  mistake silently ships a resource without links; ban that import where the configured one exists:

  ```jsonc
  // .oxlintrc.json or an ESLint config
  "no-restricted-imports": ["error", { "paths": [{ "name": "@netvark/jsonapi-core", "importNames": ["defineResource"], "message": "Import defineResource from resources/define.ts" }] }]
  ```

- **Override only what deviates.** A builder written out wins over the derived one and the rest
  stays derived; a definition's `base` replaces the default's:

  ```ts
  const Users = defineResource({
    type: 'users',
    // People live under /accounts; relationship links keep the convention.
    links: { self: (id) => `/api/v1/accounts/${id}` },
    ...
  });
  ```

- **Links are promises.** A derived `related` link names `/api/v1/articles/1/author`; serve that
  route, or override `relationship` to return only `self`.
- **No base, no links.** The convention is opt-in. A definition without `base` and without builders
  emits no `links` at all, which the specification allows, and then the 201 carries no `Location`
  unless the handler sets one.

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
import { bodyValidator, toManyLinkage, toOneLinkage } from '@netvark/hono-jsonapi';

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

Every error is a [@netvark/ban-core](https://github.com/netvark/netvark) `BanError` from a closed
catalog (`ERROR_CATALOG` over @netvark/ban-core's built-ins) in which each `code` fixes `status` and
`title`; `detail` and `source` vary per occurrence. `jsonApiError` builds one error object; a list
of `errorItem`s reports several problems at once, each object with its own identity and the response
status the specification derives from them.

```ts
throw jsonApiError('NOT_FOUND', { detail: `Article ${id} does not exist` });
throw jsonApiError('CONFLICT', {
  detail: 'The article was modified by another request',
  source: { pointer: '/data' },
});
throw jsonApiError([
  errorItem('VALIDATION_FAILED', {
    detail: 'Required',
    source: { pointer: '/data/attributes/title' },
  }),
  errorItem('INVALID_DOCUMENT', {
    detail: 'Not an attribute',
    source: { pointer: '/data/attributes/x' },
  }),
]); // 400, two error objects
```

`errorHandler()` is [@netvark/hono-ban](https://github.com/netvark/netvark)'s handler over the same
catalog. It renders anything thrown: a `BanError` as is (this package's, the rejections the
validators and `jsonApi()` throw, your own instance's, any other library's on @netvark/ban-core),
Hono's `HTTPException` by status, and everything else as a constant 500 that reveals nothing. Every
response carries the error id in `X-Error-Id` and in each error object's `id`,
`Cache-Control: no-store`, and `meta.traceId` from a W3C `traceparent`; the thrown value reaches
`onReport` as `report.cause`. `notFoundHandler()` gives unmatched routes the same shape.

```ts
app.onError(
  errorHandler({
    onReport: (report, c) =>
      logger.error({ err: report.cause, path: c.req.path }, report.error.title),
    document: { jsonapi: { version: '1.1' } },
    format: { typeLinkBaseUrl: 'https://api.example.com/errors' },
  }),
);
```

`onReport`, `headers`, `map`, `transform`, `includeStack`, and the id and trace options are
@netvark/hono-ban's; `document` adds top-level members to every error document and `format` is the
JSON:API format's own options. An application with entries of its own builds the instance itself
with the catalog spread in and installs its `onError`; this package's errors render through it
unchanged:

```ts
import { createBan } from '@netvark/hono-ban';
import { jsonApi as jsonApiFormat } from '@netvark/hono-ban/formats/json-api';

const ban = createBan({
  errors: { ...ERROR_CATALOG, QUOTA_EXHAUSTED: { status: 429, title: 'Quota Exhausted' } },
  format: jsonApiFormat({ mixedEntries: true }),
  docsBaseUrl: 'https://api.example.com/errors',
});
app.onError(ban.onError());
throw ban.QUOTA_EXHAUSTED('Daily quota exhausted');
```

Without `errorHandler()`, Hono's default handler still answers a thrown `BanError` through its
`getResponse()`: the same document, without the id header and the report.

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

`@netvark/hono-jsonapi/atomic` implements the extension over handlers you write per resource, typed
by the definition. You own the transaction; the processor runs the operations in order inside it,
resolves `lid` references to the ids earlier operations produced, answers with `atomic:results` in
operation order (or `204` when no operation returned data), and points every error at the operation
that failed. A rejected `run` rolls everything back. The Hono `Context` reaches `transaction` and
every handler as `ctx`, so a handler can read the request, the bindings, or a variable another
middleware set.

```ts
import type { Context } from 'hono';

import type { ResourceHandlers } from '@netvark/hono-jsonapi/atomic';

import { atomicOperations } from '@netvark/hono-jsonapi/atomic';

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

Everything that is not a Hono hook comes from `@netvark/jsonapi-core` and is re-exported unchanged:
`parseQuery`, `parseCreateDocument`, `parseUpdateDocument`, the relationship document parsers,
`negotiate`, `paginationLinks`, the document builders, and `operationsProcessor` are pure functions
over plain values, usable from a non-Hono handler, a worker, or a client that wants the same checks
before sending. See the [`@netvark/jsonapi-core` README](https://www.npmjs.com/package/jsonapi-kit).

## Modules

| Subpath                        | What it holds                                                                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@netvark/hono-jsonapi`        | All of `@netvark/jsonapi-core`, plus `jsonApi()`, `respond`, `respondError`, `readDocument`, `queryValidator`, `bodyValidator`, `relationshipValidator`, `errorHandler`, `notFoundHandler` |
| `@netvark/hono-jsonapi/atomic` | All of `@netvark/jsonapi-core/atomic`, plus `atomicOperations()`                                                                                                                           |

## Documentation

- [`docs/jsonapi/DESIGN.md`](https://github.com/netvark/netvark/blob/main/docs/jsonapi/DESIGN.md):
  what the packages are, the principles, and the API by example
- [`docs/jsonapi/SPEC.md`](https://github.com/netvark/netvark/blob/main/docs/jsonapi/SPEC.md): the
  normative contract, section by section, with the tests that prove it
- [`docs/jsonapi/adr/`](https://github.com/netvark/netvark/tree/main/docs/jsonapi/adr): the
  decisions, including every choice the specification leaves to the server

## License

MIT
