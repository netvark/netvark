# ADR 0011: Conformance tests against the vendored JSON:API 1.0 schema with 1.1 deltas

- Status: accepted
- Date: 2026-10-08

## Context

Unit tests pin individual clauses, but a document builder can still assemble a shape the
specification rejects (a relationship object with no members, a link object without `href`, an
`included` member without `data`). JSON:API publishes a JSON Schema for 1.0 only
(`_schemas/1.0/schema.json`); there is no official 1.1 schema, and 1.1 adds `jsonapi.ext`,
`jsonapi.profile`, link object members (`rel`, `describedby`, `title`, `type`, `hreflang`), the
top-level `describedby` link, and the error `links.type` member. @ref
https://github.com/json-api/json-api/blob/gh-pages/_schemas/1.0/schema.json @ref
https://jsonapi.org/format/1.1/#document-jsonapi-object @ref
https://jsonapi.org/format/1.1/#document-links-link-object

## Decision

The official 1.0 schema is vendored in `src/test-support/jsonapi-schema-1-0.ts` and extended in
`src/test-support/conformance.ts` with the 1.1 members listed above, compiled with Ajv 2020 in
non-strict mode plus `ajv-formats` for `uri`. `src/document/conformance.test.ts` validates every
document shape the builders produce (resource, collection, compound, relationship, paginated, error)
against it. The atomic results document is outside the base schema (its primary member is an
extension member) and is pinned by the extension's examples in `src/atomic/handler.test.ts`. The
schema and the helper are test support only, never published.

## Consequences

A builder change that produces an invalid document fails the suite even when no unit test
anticipated the shape. The `uri` format check caught the bare-bracket `self` link, which led to the
link serialization rule in ADR 0008. When JSON:API publishes a 1.1 schema the vendored copy is
replaced and the deltas removed.
