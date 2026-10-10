# ADR 0008: Cursor pagination: bounds, defaults, link rebuilding, the profile URI

- Status: accepted
- Date: 2026-10-08

## Context

The Cursor Pagination profile fixes `page[size]`, `page[after]`, `page[before]`, the links, the
`meta.page` members, and three error objects, but leaves the default and maximum page size to the
server and does not say how links are built. JSON:API requires the top-level `self` link to be the
link that generated the document, so it must carry every parameter the client sent. The profile's
page names its URI with `http` and a trailing slash, while its error `type` links use `https`. @ref
https://jsonapi.org/profiles/ethanresnick/cursor-pagination/ @ref
https://jsonapi.org/format/1.1/#document-top-level @ref
https://jsonapi.org/format/1.1/#appendix-query-details-square-brackets

## Decision

- `page.max` defaults to 100 and `page.default` to `min(20, max)`; the profile's implicit "no
  maximum" is not offered, so an endpoint never returns an unbounded page by omission. Both are
  positive integers with `default <= max`, checked at definition time.
- Range requests are off unless `page.range` is set; when on, the used size on a range request is
  `max`, as the profile says it SHOULD be.
- Links are rebuilt from the request URL: `self` is the URL, `first` drops both cursors, `prev` and
  `next` set one cursor and drop the other, `last` is emitted only when the engine knows it. The
  query is re-serialized through `URLSearchParams` so bare square brackets come out percent-encoded,
  as the specification's serialization rules prescribe.
- `meta.page` carries only the members the profile recognizes (`total`, `estimatedTotal.bestGuess`,
  `rangeTruncated` when true); an item's cursor goes under its `meta.page.cursor`.
- `CURSOR_PAGINATION_PROFILE` is the URI exactly as the page states it (`http`, trailing slash); the
  error `type` links are built under the `https` base, both copied verbatim.
- An unsupported `sort` field is reported with the profile's `unsupported-sort` error object rather
  than a generic 400, so clients can key on its `type` link.

## Consequences

Pagination engines supply cursors, `total` or an estimate, and a cursor per row; everything on the
wire is produced here. Changing a bound is a definition change, not a request-time surprise.
