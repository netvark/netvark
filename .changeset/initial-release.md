---
'hono-jsonapi': minor
---

First release: JSON:API 1.1 for Hono.

- `defineResource` declares a resource's type, fields, relationships, links, query capabilities, and
  Standard Schema validators once; every parser and builder reads from it.
- `resourceDocument`, `collectionDocument`, `toOneRelationshipDocument`,
  `toManyRelationshipDocument`, and `include` build documents with sparse fieldsets applied and full
  linkage enforced.
- `parseQuery` parses `include`, `fields`, `sort`, `page`, `filter`, a search parameter, and
  declared custom parameters, reporting every problem in one 400.
- `paginatedDocument` and `paginationLinks` implement the Cursor Pagination profile.
- `parseCreateDocument`, `parseUpdateDocument`, and the relationship document parsers check request
  documents against the definition with RFC 6901 pointers on every error.
- `negotiate` and the `jsonApi()` middleware apply the server content negotiation rules (415, 406,
  `Vary: Accept`); `respond` derives `ext` and `profile` on `Content-Type` from the document.
- `queryValidator`, `bodyValidator`, and `relationshipValidator` are Hono validators typed for
  `c.req.valid()`; `errorHandler` and `notFoundHandler` render every failure as an error document.
- `hono-jsonapi/atomic` implements the Atomic Operations extension with a caller-owned transaction
  and local ids across operations.
