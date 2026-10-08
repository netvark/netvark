---
'jsonapi-kit': minor
---

First release: JSON:API 1.1 for any JavaScript runtime, framework-free.

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
- `negotiate` applies the server content negotiation rules (415, 406) over two header values;
  `JsonApiError` carries error objects with a closed catalog of codes and registered statuses.
- `jsonapi-kit/atomic` implements the Atomic Operations extension as `operationsProcessor`, with a
  caller-owned transaction, local ids across operations, and a host-supplied context for handlers.
