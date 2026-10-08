# hono-jsonapi: design

This document describes what hono-jsonapi is, the API it exposes, and how it is built.

Architecture decisions referenced as ADR-NNNN live in `docs/adr/`. The normative, clause-by-clause
specification that implementers work from is `docs/SPEC.md`; this document explains the intent
behind it. When the two disagree, fix one in the same PR.

## 1. Purpose

hono-jsonapi is the JSON:API layer for Hono applications. It gives an application:

1. one resource definition per type, from which field names, relationships, query capabilities,
   links, and validation all derive, so a response, a request check, and a query parser cannot
   disagree about what a resource is;
2. builders that produce documents the specification accepts: string ids, sparse fieldsets, full
   linkage in compound documents, pagination links that reproduce the client's query;
3. parsers that reject what the specification says to reject, with every problem reported at once
   and located by a JSON Pointer, a parameter name, or a header name;
4. the server side of content negotiation, the Cursor Pagination profile, and the Atomic Operations
   extension, each implemented from its text.

It is a library for teams who treat their JSON:API surface as a contract.

### Who it is for

- API teams on Hono who want JSON:API 1.1 without re-reading the specification per endpoint.
- Teams whose clients are JSON:API clients (Ember Data, JSON:API resources, generated SDKs) and who
  have been burned by servers that are "mostly" JSON:API.
- Teams who paginate with keysets and want the one published cursor profile, with its links, meta,
  and error objects, rather than a house format.

### Non-goals

- Running queries. The package parses `sort`, `filter`, `page`, and `include` into a typed
  structure; the application turns that into SQL (or anything else). A keyset pagination engine for
  Kysely is a separate package.
- OpenAPI generation. Definitions carry enough to generate schemas, and a future subpath may; this
  line does not.
- Client-side serialization and deserialization. The request document types are exported so a typed
  client can be written against them, but no client ships here.
- Supporting CommonJS-only consumers or Node older than 22.12 (ADR-0004).

## 2. Principles

1. **The definition is the single source.** `defineResource` validates it once, at startup, with a
   `TypeError` naming the option (ADR-0012). Every parser and builder reads from it; nothing is
   declared twice.
2. **Spec-driven.** Each behavior is a cited clause, and the test names the clause. Where the
   specification leaves a choice to the server, the choice is an ADR (ADR-0007, ADR-0008, ADR-0009,
   ADR-0010).
3. **Report everything, drop nothing.** A parser accumulates error objects and throws once. A
   parameter or member the endpoint does not know is a 400, never ignored.
4. **A document that would violate the specification never leaves the server.** Builders throw a
   `TypeError` for a non-string id, an undeclared relationship, an empty relationship object, or an
   included resource without full linkage.
5. **Nothing about the server reaches a client unless a factory put it there.** Unexpected errors
   render as a constant 500; the thrown value stays on `cause` for `report` (ADR-0006).
6. **Web standards only. No ambient environment.** `URL`, `URLSearchParams`, `Response`, `btoa`;
   nothing reads `process` (ADR-0003).
7. **`hono` is the only peer dependency.** Validators arrive through Standard Schema; the types are
   vendored (ADR-0002).
8. **Headers follow the body.** `Content-Type` parameters are derived from the document's `jsonapi`
   object; `Location` from the created resource's `self` link (ADR-0005).
9. **Client input is hostile.** Prototype keys are rejected wherever a name becomes a key; lookups
   into client-shaped objects are own-property lookups.
10. **Every non-obvious decision cites its source** with `@ref` in code and an ADR in docs.

## 3. The API by example

### 3.1 Minimal

```ts
const app = new Hono<JsonApiEnv>();
app.use(jsonApi());
app.onError(errorHandler());
app.notFound(notFoundHandler());

app.get('/articles/:id', queryValidator(Articles), async (c) => {
  const row = await articles.find(c.req.param('id'));
  if (row === undefined) throw JsonApiError.notFound();
  return respond(c, resourceDocument(Articles, row, { query: c.req.valid('query') }));
});
```

Three Hono hooks, one validator, one builder, one response helper. `jsonApi()` negotiates and adds
`Vary`; `errorHandler()` renders thrown errors; the validator answers its own 400s (section 4.6).

### 3.2 The definition

```ts
const Articles = defineResource({
  type: 'articles',
  attributes: ['title', 'body'],
  relationships: { author: { type: 'people', cardinality: 'one', resource: () => People } },
  serialize: (row: ArticleRow) => ({
    id: row.id,
    attributes: { title: row.title, body: row.body },
    relationships: { author: row.authorId },
  }),
  links: { self: (id) => `${BASE}/articles/${id}` },
  query: { sort: ['title'], filter: { title: ['eq', 'like'] }, include: ['author'], page: {} },
  validate: { create: CreateArticle, update: UpdateArticle },
});
```

The literal types of `type`, the attribute names, the relationship names, and the sort and filter
names are inferred and carried on the result, so `serialize` cannot return an undeclared field,
`c.req.valid('query').sort[0].field` is `'title'`, and
`relationshipValidator(Articles, 'editor', 'one')` is a type error. `resource` is a thunk so
definitions can reference each other.

### 3.3 Queries

`parseQuery(Articles, 'include=author&fields[people]=name&sort=-title&filter[title][like]=rails')`
returns a `ParsedQuery` with `include` as segment arrays, `fields` by type, `sort` with directions,
`filter` as conditions and disjunction groups, `page` resolved with the definition's default size,
and `params` for links. Or it throws one 400 with every problem:

```json
{
  "errors": [
    {
      "status": "400",
      "code": "UNSUPPORTED_SORT",
      "title": "Unsupported Sort",
      "source": { "parameter": "sort" },
      "links": {
        "type": "https://jsonapi.org/profiles/ethanresnick/cursor-pagination/unsupported-sort"
      }
    },
    {
      "status": "400",
      "code": "UNKNOWN_QUERY_PARAMETER",
      "title": "Unknown Query Parameter",
      "source": { "parameter": "bogus" }
    }
  ]
}
```

### 3.4 Request documents

`parseCreateDocument(Articles, body)` checks `data.type` against the definition (409), rejects a
client-generated `id` unless the definition accepts them (403), reports undeclared attributes and
relationships with pointers (400), enforces each relationship's cardinality and related type, runs
the create validator over the attributes (422, one error per issue, pointer per path), and returns
the resource object with `attributes` typed as the validator's output. `parseUpdateDocument` does
the same with the URL's id (409 on mismatch).

### 3.5 Atomic operations

```ts
app.post(
  '/operations',
  atomicOperations({
    resources: [articleHandlers, peopleHandlers],
    transaction: (c, run) => db.transaction().execute(run),
  }),
);
```

The processor parses the whole document first (every structural error in one 400), then runs the
operations in order inside `run`, parsing each operation's `data` against the targeted definition
with `lid` allowed, resolving `lid` references from earlier `add`s, and collecting results. A
`JsonApiError` from a handler is given the operation's pointer and rendered; anything else
propagates after the rollback. No data in any result means `204`.

## 4. Architecture

### 4.1 Modules

```
media-type   RFC 9110 parsing and serialization; the JSON:API media type and its parameters
negotiate    the server negotiation rules as a pure function of two header values
errors       JsonApiError, the closed catalog, the registered status table
document     types, member names, serialization, builders, full linkage
resource     defineResource and query capability resolution
query        parseQuery and the family parsers
pagination   the Cursor Pagination profile
request      identifiers, resource documents, relationship documents
hono         middleware, respond, body, validators, handlers
atomic       the extension: handler, document parser, lids, executors
```

Imports form a DAG from `internal` outward; `hono` and `atomic` are the only modules that import
from Hono. `import/no-cycle` is enforced.

### 4.2 Data flow for a read

```
request ──jsonApi()──▶ negotiation stored, 415/406 answered
        ──queryValidator()──▶ parseQuery(definition, query string) ──▶ ParsedQuery | 400
        ──handler──▶ rows ──▶ resourceDocument / collectionDocument / paginatedDocument
                              serialize ▶ sparse fieldsets ▶ included (dedupe, full linkage)
        ──respond()──▶ Content-Type from document.jsonapi, Location on 201
        ──jsonApi()──▶ Vary: Accept
```

### 4.3 Data flow for a write

```
request ──jsonApi()──▶ 415 on bad parameters or unsupported ext
        ──bodyValidator()──▶ readDocument (415 unless JSON:API, 400 unless JSON)
                              parseCreateDocument / parseUpdateDocument (400/403/409/422)
        ──handler──▶ row ──▶ resourceDocument ──▶ respond(c, document, 201)
```

### 4.4 Error rendering

Hono's dispatcher catches a thrown error at every level of the middleware chain and hands it to
`app.onError` directly; middleware cannot observe it. So thrown `JsonApiError`s are rendered by
`errorHandler()`, validators render their own rejections so they work without it, and `jsonApi()`
renders only its own 415 and 406 (ADR-0006).

### 4.5 Types

Eight type parameters ride on `ResourceDefinition`: type, attribute names, relationship names, row,
sort names, filter names, create output, update output. Consumers never spell them: `AnyResource`
erases them for registries, and helper types (`RowOf`, `RelationshipNameOf`, `CreateAttributesOf`,
`UpdateAttributesOf`) recover them where a signature needs one. Handler objects for the atomic
extension are typed with `ResourceHandlers<typeof Articles, Tx, Env>` and accepted by the erased
`AnyResourceHandlers` through bivariant method signatures.

### 4.6 What the previous implementation got wrong

This package replaces an internal JSON:API toolkit whose review found the defects below; each is now
a cited clause with a test.

- Unknown query parameters and undeclared `filter` members were silently dropped; now every one is a
  400 (`#query-parameters`).
- A bracket-notation query parser assigned into existing objects, so `__proto__[x]=y` polluted
  `Object.prototype`; now names are checked against the member grammar and prototype keys before
  they become keys, and `filter[constructor]` is an ordinary 400.
- Sparse fieldsets re-injected fields and rejected the empty value; now an empty `fields[type]`
  means no fields and only the named ones survive (`#fetching-sparse-fieldsets`).
- Ids were sometimes numbers; now `serialize` must return a string id or the builder throws.
- `self` and `first` links stripped the client's `page` parameters and dropped operator filters; now
  links are rebuilt from the request URL and only the cursors change.
- Compound documents could include resources the primary data never linked to; now full linkage is
  asserted before a document is returned (`#document-compound-documents`).
- Negotiation checks were gated on a non-empty extension list, counted `application/json` as a
  JSON:API instance, read profiles from `Content-Type`, and sent 406 and 415 as `application/json`;
  now the rules run unconditionally, profiles come from `Accept`, and every error document is
  `application/vnd.api+json`.
- `page[size]` accepted `0x10`, `1e2`, ` 5`, and `0`, and range requests defaulted to the normal
  page size; now the profile's `^[0-9]+$` rule and its max-size default apply.
- Unrecognized members were written into `meta.page`; the profile's error types were never wired;
  now only recognized members are emitted and the three error objects carry their `type` links.
- Atomic operations required UUID ids, rejected `href`, ignored `lid` on update and remove,
  discarded `data.relationships`, returned `{ data: null }` where no data is allowed, never answered
  `204`, and pinned transaction failures to operation 0; now each clause is implemented and errors
  point at the operation that failed.
- Driver and policy error text reached clients as `detail`; now unexpected errors are a
  constant 500.
- Node-only `crypto` and `Buffer` imports; now web standards only, verified on Bun, Deno, and
  workerd.

## 5. Decisions

| ADR  | Decision                                                                              |
| ---- | ------------------------------------------------------------------------------------- |
| 0001 | Record architecture decisions                                                         |
| 0002 | `hono` is the only peer dependency; validators through vendored Standard Schema types |
| 0003 | Web standards only; no ambient environment reads                                      |
| 0004 | ESM only, TypeScript 7 `isolatedDeclarations`, erasable syntax                        |
| 0005 | `Content-Type` parameters and `Location` are derived from the document                |
| 0006 | Thrown errors render in `errorHandler`; validators and `jsonApi()` answer their own   |
| 0007 | The `filter` grammar                                                                  |
| 0008 | Cursor pagination: bounds, defaults, link rebuilding, the profile URI                 |
| 0009 | A closed error catalog over registered status codes                                   |
| 0010 | Atomic operations: caller-owned transaction, lid scope, two-phase processing          |
| 0011 | Conformance tests against the vendored JSON:API 1.0 schema with 1.1 deltas            |
| 0012 | Definitions are validated at definition time, never at request time                   |
