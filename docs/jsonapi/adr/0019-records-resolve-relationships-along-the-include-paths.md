# ADR 0019: Records are flat and resolve relationships along the requested include paths

- Status: accepted
- Date: 2026-10-12

## Context

A JSON:API document keeps a resource's fields in `attributes` and `relationships`, and related
resources once, in `included`, found by type and id. Applications read records: a list shows
`article.title` and `article.author.name`, a form edits `contact.name`. Every client that turns
documents into records answers three questions.

- **Where related resources go.** Resolving every relationship into the related record builds a
  cyclic graph whenever the data is cyclic (an article's author lists the article). jsona and kitsu
  do so, one shared object per type and id, and their users hit the cycles: `JSON.stringify` and
  React Query failed (jsona #62, #65), and a cyclic include froze browser tabs (kitsu #133). A
  cache's structural sharing walks the graph: TanStack Query's `replaceEqualDeep` recurses through
  plain objects and arrays until a depth of 500, over every member at every level. Normalized stores
  (Orbit, json-api-normalizer) avoid cycles by keeping linkage and leaving resolution to the
  application.
- **Where a resource object's `links` and `meta` go.** `links` and `meta` are legal field names, so
  a flat record that keeps them under those names, as jsona and kitsu do, loses a field named so.
  `type` and `id` cannot be field names (`#document-resource-object-fields`), and `$` is a reserved
  character no member name may contain (`#document-member-names-reserved-characters`).
- **What a linked resource that is not included becomes.** Full linkage requires every included
  resource to be linked, not every linked resource to be included (`#document-compound-documents`),
  so a conforming document may link a resource on a requested path without including it. jsona and
  kitsu put a `{ type, id }` stub in the record's place, which a type for the record does not
  describe; WarpDrive asserts that "some of the associated records were not loaded".

@ref https://github.com/olosegres/jsona/issues/62 @ref https://github.com/wopian/kitsu/issues/133
@ref https://github.com/olosegres/jsona/blob/v1.14.0/src/builders/JsonDeserializer.ts#L195 @ref
https://jsonapi.org/format/1.1/#document-compound-documents @ref
https://jsonapi.org/format/1.1/#document-member-names-reserved-characters @ref
https://github.com/TanStack/query/blob/main/packages/query-core/src/utils.ts (replaceEqualDeep)

## Decision

- A record is a plain object: `type`, `id`, each attribute, each relationship, and `$links`,
  `$meta`, and `$relationships` (the relationship objects as sent) when the resource object has
  them. @-Members are skipped, as JSON:API asks of processors.
- A relationship is resolved into the included record, or records, only on a path the request's
  `include` names; every other relationship is its linkage. The include paths are finite, so the
  records form a tree and every result is plain data: it serializes, clones, and caches.
- A resource linked on a requested path but not included is left out of the resolved value (a to-one
  is `undefined`, a to-many skips it); its identifier stays in `$relationships`.
- The types follow the same rule: `RecordOf` resolves a relationship on an include path of the query
  it is given and types every other one as linkage, and `fields` narrows the fields.

## Consequences

`article.author.name` reads as it would in the application's own model, typed, after
`include: ['author']`, and the same record without the include is `{ type: 'people', id }`. A server
that includes resources by default, without an `include` parameter, gets linkage on every record and
its resources in `included`, which the application resolves by hand. One resource reached on two
paths is two objects, each resolved as far as its own path. A record never holds a function or a
cycle, so TanStack Query's structural sharing, a JSON persister, and a server-rendered page's
serialization take it as it is.
