# ADR 0005: `Content-Type` parameters and `Location` are derived from the document

- Status: accepted
- Date: 2026-10-08

## Context

JSON:API requires a response that applies extensions or profiles to say so on `Content-Type` (`ext`
and `profile` parameters), and a 201 whose resource has a `self` link to carry a matching
`Location`. Both are easy to get wrong when the header is set by hand next to the body: the previous
toolkit sent 406 and 415 documents as `application/json` and paginated documents without the profile
parameter. @ref https://jsonapi.org/format/1.1/#content-negotiation-servers @ref
https://jsonapi.org/format/1.1/#crud-creating-responses-201

## Decision

`respond(c, document, status?, headers?)` computes `Content-Type` from `document.jsonapi.ext` and
`document.jsonapi.profile`, and `Location` on a 201 from `data.links.self` (a string or a link
object's `href`) unless the caller passes one. Caller headers whose names match these
case-insensitively are dropped, because Hono applies header records in key order and a lowercase
`content-type` would otherwise override the derived one. `respondError` always uses the bare media
type: no extension or profile applies to an error document. `paginatedDocument` adds the cursor
profile to `jsonapi.profile`, and the atomic handler adds the extension to `jsonapi.ext`, so the
header follows automatically.

## Consequences

The header and the body cannot disagree, and a caller never spells the media type. An application
that applies its own profile sets `jsonapi.profile` on the document and gets the header for free.
Setting `Content-Type` directly through `respond`'s `headers` is silently ignored; the SPEC says so.
