# @netvark/jsonapi-core

[JSON:API 1.1](https://jsonapi.org/format/1.1/) for any JavaScript runtime, framework-free. Declare
a resource once; get typed query parsing, document building with compound documents and sparse
fieldsets, request document validation with JSON Pointers, content negotiation, the
[Cursor Pagination](https://jsonapi.org/profiles/ethanresnick/cursor-pagination/) profile, and the
[Atomic Operations](https://jsonapi.org/ext/atomic/) extension, all as functions over plain values.
Every rule is a cited clause of the specification; where the specification leaves a choice to the
server, the choice is written down in
[`docs/jsonapi/SPEC.md`](https://github.com/netvark/netvark/blob/main/docs/jsonapi/SPEC.md).

Using [Hono](https://hono.dev)?
[`@netvark/hono-jsonapi`](https://www.npmjs.com/package/hono-jsonapi) wraps this package as
middleware, validators, response helpers, and handlers, and re-exports all of it.

## Install

```bash
pnpm add @netvark/jsonapi-core
```

[`@netvark/ban-core`](https://github.com/netvark/netvark) is the one dependency: every error is a
@netvark/ban-core error, so an application's catalog and this package's share one model (see
Errors). Node 22.12+, Bun, Deno, and Cloudflare Workers are supported; the package uses web
standards only (`URL`, `URLSearchParams`, `JSON`) and never reads the environment. Validators are
accepted through [Standard Schema](https://standardschema.dev) (Zod 4, Valibot, ArkType, and others)
without importing any of them.

## Quick start

A fetch handler, the shape every runtime above shares. You read the headers and the body; the
package parses, checks, and builds; you send what it hands back.

```ts
import {
  JSON_API_MEDIA_TYPE,
  defineResource,
  errorDocument,
  formatJsonApiMediaType,
  isBanError,
  jsonApiError,
  negotiate,
  parseQuery,
  resourceDocument,
} from '@netvark/jsonapi-core';

const Articles = defineResource({
  type: 'articles',
  attributes: ['title', 'body'],
  serialize: (row: ArticleRow) => ({
    id: row.id,
    attributes: { title: row.title, body: row.body },
  }),
  links: { base: 'https://api.example.com' },
});

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
  // The server stamps createdAt.
  writable: {
    create: ['title', 'body', 'author', 'tags'],
    update: ['title', 'body', 'author', 'tags'],
  },
});
```

`writable` lists the fields each write accepts; an operation without a list accepts every declared
field. A field left out stays declared, so it is served, sorted, and filtered, while a create or an
update that carries it is refused with 403 at its pointer, as JSON:API requires of an unsupported
update; `relationshipValidator` and atomic operations refuse it the same way. List the fields rather
than let a validator strip what it does not know: a stripped field answers 201 or 200 for a write
that never happened.

Give the form your keys take as `validate.id`, any Standard Schema that produces a string, with the
spelling your server sends as its output. A create carries a client-generated id only with
`clientIds: true`: an id outside the form is a 422 at `/data/id` rather than a value the database
refuses or stores under another spelling, and the handler receives the output. An update's id
matches the URL's when the texts are equal or both pass with one output, so a client that requests
`/calls/ABC…` and sends back the document it received, with `abc…`, gets no 409. PostgreSQL prints a
`uuid` in lower case, and RFC 9562 lets clients send either:

```ts
const Calls = defineResource({
  type: 'calls',
  attributes: ['minutes'],
  serialize: (row: CallRow) => ({ id: row.id, attributes: { minutes: row.minutes } }),
  clientIds: true,
  validate: { id: z.uuid().transform((id) => id.toLowerCase()) },
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

### Parse the query

`parseQuery(resource, queryString)` parses `include`, `fields`, `sort`, `page`, `filter`, the
declared search parameter, and declared custom parameters against the definition, with `sort` and
`filter` typed by the declared names. A parameter the endpoint cannot process is a 400 that names
every offending parameter in `source.parameter`, as the specification requires. Nothing is dropped
silently.

```ts
const query = parseQuery(Articles, url.search.slice(1));
// query.sort:    Array<{ field: 'title' | 'createdAt'; direction: 'asc' | 'desc' }>
// query.filter:  { conditions: [{ field: 'title', operator: 'like', value: 'rails' }], anyOf: [] }
// query.include: [['author'], ['tags']] | undefined
// query.fields:  { articles: ['title'] } | undefined
// query.page:    { size: 20, after: 'abc', before: undefined, sizeRequested: false, range: false }
```

The filter grammar is the package's choice, since JSON:API leaves it open: `filter[field]=v` is
`eq`, `filter[field][op]=v` a declared operator, and `filter[or][0][field][op]=v` a condition in a
disjunction group. Undeclared fields and operators are 400s.

### Build documents

```ts
const document = collectionDocument(Articles, rows, {
  query,
  included: [include(People, await authorsOf(rows)), include(Tags, await tagsOf(rows))],
});
```

`include(People, rows)` pairs rows with their definition so `included` stays typed. The builder
applies `fields[type]` to primary and included resources, deduplicates by type and id, never repeats
a primary resource in `included`, and throws when an included resource is not reachable from the
primary data through the requested paths: a compound document the specification would reject never
leaves the server. `resourceDocument`, `toOneRelationshipDocument`, and `toManyRelationshipDocument`
cover the other primary data shapes; `serializeResource`, `applyFields`, and `identify` are the
pieces underneath.

### Paginate with cursors

`paginatedDocument` implements the Cursor Pagination profile over whatever keyset query your
database layer runs. Links reproduce every parameter the client sent and swap only the cursors; the
profile URI goes on `jsonapi.profile`, and from there onto `Content-Type` through
`formatJsonApiMediaType`.

```ts
const page = await articles.page(query);
const document = paginatedDocument(
  Articles,
  {
    rows: page.rows,
    next: page.nextCursor,
    prev: page.prevCursor,
    total: page.total,
    cursor: (row) => row.cursor,
  },
  { url: request.url, query },
);
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

### Parse request documents

`parseCreateDocument` and `parseUpdateDocument` check a request document against the definition
(type, client ids, undeclared fields, fields the operation does not write, relationship cardinality
and types), run the Standard Schema validator over the attributes, and return a
`ParsedResourceObject` with `attributes` typed as the validator's output. Every problem carries an
RFC 6901 pointer: `/data/attributes/title`, `/data/relationships/author/data/type`. A validator
issue's `code` and `expected`, when they are strings, appear under `meta`, so a client can tell one
failed rule from another without parsing the `detail`; nothing else of the issue is kept. The
`detail` is the issue's `message`, your validator's text: Zod 4's messages name what was expected,
never the value, but Valibot's defaults quote the received value verbatim (`received "<b>x</b>"`),
so give a Valibot schema messages of your own:

```json
{
  "status": "422",
  "code": "VALIDATION_FAILED",
  "title": "Validation Failed",
  "detail": "Too big: expected string to have <=200 characters",
  "source": { "pointer": "/data/attributes/title" },
  "meta": { "code": "too_big" }
}
```

```ts
const { attributes, relationships } = await parseCreateDocument(Articles, await request.json());
const row = await articles.create({
  title: attributes.title,
  authorId: toOneLinkage(relationships['author'])?.id ?? null,
  tagIds: (toManyLinkage(relationships['tags']) ?? []).map((tag) => tag.id),
});

// An update must identify the resource; data.id is checked against the URL's id (409 otherwise).
const update = await parseUpdateDocument(Articles, await request.json(), id);

// Relationship documents: an identifier or null for to-one, an array for to-many.
const author = parseToOneRelationshipDocument(await request.json(), { type: 'people' });
const tags = parseToManyRelationshipDocument(await request.json(), { type: 'tags' });
```

### Errors

Every error is a [@netvark/ban-core](https://github.com/netvark/netvark) `BanError` built by
`jsonApiBan`, the package's @netvark/ban-core instance: a closed catalog (`ERROR_CATALOG` over
@netvark/ban-core's built-ins) in which each `code` fixes `status` and `title`, rendered by
@netvark/ban-core's JSON:API format. `jsonApiError` builds one error object; a list of `errorItem`s
reports several problems at once, each object with its own identity and the response status the
specification derives from them.

```ts
throw jsonApiError('NOT_FOUND', { detail: 'The article does not exist' });
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
throw jsonApiError('METHOD_NOT_ALLOWED', { detail: 'Use POST', headers: { Allow: 'POST' } });
```

A detail is shown to people and logged as it is, so the package's own details quote what the client
sent only when it is a plain token: letters, digits, `_`, `-`, `.`, and square brackets, at most 64
characters, such as a member name, a parameter name, or an id. Anything else, markup, a line break,
a URL, or 10 kB, is named without its value, and `source` still says where it was. `sort=nme`
answers `Sort field "nme" is not supported by this endpoint`; `sort=<b>nme</b>` answers
`A sort field is not supported by this endpoint`, with `source.parameter` `sort` in both.

Write your own details the same way: say what was wrong and leave the value to `source.pointer` or
`source.parameter`, which JSON:API defines for programs to read
([ADR 0016](https://github.com/netvark/netvark/blob/main/docs/jsonapi/adr/0016-details-quote-request-text-as-plain-tokens.md)).

`isBanError` narrows a caught error; `error.status` is the response status, `error.headers` the
headers it carries (`Allow`, `Vary`), `errorDocument(error)` the document to send, and
`error.getResponse()` a bare `Response`. For a fetch handler, `jsonApiBan.handler()` is
@netvark/ban-core's framework-free handler: it renders anything thrown (a `BanError` as is,
everything else as a constant 500 that reveals nothing), adds `X-Error-Id` and
`Cache-Control: no-store`, reads a W3C `traceparent` into `meta.traceId`, and calls `onReport` once
with the thrown value as `cause`.

```ts
import { fromRequest } from '@netvark/ban-core';

const handle = jsonApiBan.handler({
  onReport: (report) => logger.error({ err: report.cause }, report.error.title),
});
// in fetch(): catch (thrown) { return handle(thrown, fromRequest(request)); }
```

An application with entries of its own builds its own instance with the catalog spread in. Any
instance renders any `BanError`, so this package's errors go through it unchanged, and the
application's errors carry `links.type` under its `docsBaseUrl`:

```ts
import { createBan } from '@netvark/ban-core';
import { jsonApi } from '@netvark/ban-core/formats/json-api';

const ban = createBan({
  errors: { ...ERROR_CATALOG, QUOTA_EXHAUSTED: { status: 429, title: 'Quota Exhausted' } },
  format: jsonApi({ mixedEntries: true }),
  docsBaseUrl: 'https://api.example.com/errors',
});
throw ban.QUOTA_EXHAUSTED('Daily quota exhausted');
```

### Content negotiation

`negotiate(headers, options)` applies the server rules to two header values: a JSON:API
`Content-Type` with parameters other than `ext` and `profile`, or with an extension the endpoint
does not support, is a 415; an `Accept` whose every JSON:API instance is unusable is a 406. The
result says which extensions the response must apply and which requested profiles the endpoint
supports; every JSON:API response should carry `Vary: Accept`.

```ts
const negotiation = negotiate(
  { contentType, accept },
  { extensions: [ATOMIC_OPERATIONS_EXTENSION], profiles: [CURSOR_PAGINATION_PROFILE] },
);
// { ok: true, request: { jsonApi, extensions, profiles }, extensions, profiles }
// { ok: false, error: BanError }  415 or 406, with Vary: Accept in error.headers
```

### Atomic operations

`@netvark/jsonapi-core/atomic` implements the extension over handlers you write per resource, typed
by the definition. You own the transaction; the processor runs the operations in order inside it,
resolves `lid` references to the ids earlier operations produced, builds `atomic:results` in
operation order (or no document, for `204`), and points every error at the operation that failed. A
rejected `run` rolls everything back. Whatever you hand the processor per request (here the
`Request`) reaches `transaction` and every handler as `ctx`.

```ts
import type { ResourceHandlers } from '@netvark/jsonapi-core/atomic';

import { assertOperationsContentType, operationsProcessor } from '@netvark/jsonapi-core/atomic';

const articleHandlers: ResourceHandlers<typeof Articles, Transaction, Request> = {
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

const process = operationsProcessor<Transaction, Request>({
  resources: [articleHandlers, peopleHandlers],
  transaction: (request, run) => db.transaction().execute(run),
});

async function operations(request: Request): Promise<Response> {
  assertOperationsContentType(request.headers.get('Content-Type') ?? undefined);
  const { document } = await process(await request.json(), request);
  return document === undefined
    ? new Response(null, { status: 204 })
    : send(document, 200, formatJsonApiMediaType({ ext: document.jsonapi.ext }));
}
```

A missing handler makes the operation a 403; an unknown type a 404; a structural problem a 400, all
with pointers like `/atomic:operations/1/data/relationships/author/data/lid`. The 405 for other
methods is the host's: the processor never sees the request method.

When your `transaction` turns a failure into the client's error only once the transaction ended,
such as a constraint violation whose names are read on another connection, the processor no longer
sees it. Point it at the operation whose call threw it with
`errorAtOperation(error, '/atomic:operations/<index>')`, the function the processor applies to every
operation's failure.

## Modules

| Subpath                        | What it holds                                                                                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@netvark/jsonapi-core`        | Resource definitions, documents, query parsing, request parsing, errors, content negotiation, cursor pagination, and the constants                    |
| `@netvark/jsonapi-core/atomic` | `operationsProcessor()`, `assertOperationsContentType()`, the operations document parser, and `DEFAULT_MAX_OPERATIONS`, the processor's default limit |

## Documentation

- [`docs/jsonapi/DESIGN.md`](https://github.com/netvark/netvark/blob/main/docs/jsonapi/DESIGN.md):
  what the packages are, the principles, and the API by example
- [`docs/jsonapi/SPEC.md`](https://github.com/netvark/netvark/blob/main/docs/jsonapi/SPEC.md): the
  normative contract, section by section, with the tests that prove it
- [`docs/jsonapi/adr/`](https://github.com/netvark/netvark/tree/main/docs/jsonapi/adr): the
  decisions, including every choice the specification leaves to the server

## License

MIT
